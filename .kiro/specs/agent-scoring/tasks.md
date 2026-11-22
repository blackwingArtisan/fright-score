# Implementation plan: Agent scoring

Every task is done. Nothing in `src/engine/`, `src/score/`, `src/director/` or
`src/wav/` changes. Every test that exercises the server spawns it over stdio, as `tests/cli/mcp.test.ts` does.

## Protocol and shared pieces

- [x] 1. Check the new methods (`prompts/list`, `prompts/get`, `resources/list`, `resources/read`, `resources/templates/list`, the `prompts` and `resources` capabilities, `-32002` for a missing resource, string-only prompt arguments) against the current MCP specification with the context7 server, and write any correction into design.md's "The protocol additions" table
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.4, 4.5, 5.1_
- [x] 2. Move the `Client` class and the temporary-folder helpers of `tests/cli/mcp.test.ts` into `tests/cli/mcp-client.ts` and import them from the existing test; run the existing tests to confirm nothing changed
  - _Requirements: 5.2, 8.1_
- [x] 3. Add `scripts/mcp/paths.ts` with `checkNewFile` (the current `checkWavPath` logic), `checkNewDir` and `checkReadablePath`; make `score_cue` use `checkNewFile` with unchanged messages
  - _Requirements: 1.10c, 1.10d, 1.10e, 2.2a, 2.2b, 5.2_
- [x] 4. Test `tests/cli/mcp.test.ts`: the `initialize` reply declares `tools`, `prompts` and `resources`, `tools/list` names are `score_cue`, `list_patches`, `score_level`, `verify_cue` in that order, and all earlier assertions still pass
  - _Requirements: 5.1, 5.2, 5.3, 3.1a, 4.1a_

## verify_cue

- [x] 5. Add `scripts/mcp/onsets.ts` with the pure `findOnsets` (mono mix, 2 ms RMS windows, -50 dBFS, 0.5 s of silence, first loud frame) and the pairing function
  - _Requirements: 2.4_
- [x] 6. Render the golden cue and a `score_level` sting, run `findOnsets` on both, and confirm the constants give 24 s within 50 ms and 1.0 s within 10 ms; write any change of the constants into design.md
  - _Requirements: 2.6, 2.7_
- [x] 7. Add the `verify_cue` tool to `scripts/mcp/tools.ts`: schema, `checkReadablePath`, `parseWav`, results, `isError` for a bad path, a non-WAV and a file over 64 MB
  - _Requirements: 2.1, 2.2, 2.3, 2.5_
- [x] 8. Test `tests/unit/onsets.test.ts`: a tone after 0.6 s of silence gives one onset within 2 ms, a tone after 0.3 s of silence gives none, two tones give two onsets, a file that starts loud gives none, an all-silent file gives none, the pairing takes the nearest unused onset and leaves `null` beyond 500 ms
  - _Requirements: 2.4, 2.5c, 2.8_
- [x] 9. Test `tests/cli/mcp-verify.test.ts`, the golden cue: `score_cue` with `{ mood: 'chase', durationSec: 30, stingAtSec: [24], seed: 3, writeWavTo }` reports the README hash, then `verify_cue` with `expectedHitSec: [24]` passes and reports an error under 50 ms
  - _Requirements: 2.7, 2.5, 7.1_
- [x] 10. Test `verify_cue` failures: a wrong expected time (23.5) fails with the error in ms, a tolerance of 1 ms still reports the real error, an expected time with no onset gives `measuredSec: null` and a failing top-level `pass`, a silent WAV, a path outside the folder, a symbolic link that leads out of the folder, a name without `.wav`, a missing file, a text file named `.wav`, and a 24-bit WAV; the server keeps answering after each
  - _Requirements: 2.2, 2.3, 2.5, 2.8, 8.3_

## score_level

- [x] 11. Add `scripts/mcp/level.ts`: `ScoreLevelArgs`, the duplicate-id check, `fileSeed`, the loop and sting renderers with `LocalDirector`, `scoreFromRequest`, `renderScore`, `encodeWav`, `stingLandingSec`, and one function that builds both the result and the manifest
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.11, 1.12_
- [x] 12. Add the `writeDir` path: `checkNewDir` before rendering, `wx` writes of the WAVs and `manifest.json` with the fixed file names, the exact manifest serialization, an `isError` result naming the file when a write fails
  - _Requirements: 1.10, 1.11_
- [x] 13. Register `score_level` in `TOOLS` after `list_patches`, and `verify_cue` after it
  - _Requirements: 5.3, 1.1a, 2.1a_
- [x] 14. Test `tests/cli/mcp-level.test.ts`, validation: zero rooms, nine rooms, `loopSec` 3 and 61, an unknown mood, a bad id, nine events, a duplicate room id, a duplicate event id, an unknown key, and a bad `seed` each give `isError` with a readable message, render nothing and leave the server answering
  - _Requirements: 1.1, 1.2, 1.3, 8.3_
- [x] 15. Test result shape and determinism: two rooms of 4 s loops with one event each return the documented fields, the loop starts at sample 0 and ends at the file's frame count, each `hitSec` is 1, `startFromSec` is 0.4, `hitAfterStartSec` is 0.6; the same arguments give identical hashes, another seed gives different hashes; a scene text that says "sting at 0:03" does not move `hitSec`
  - _Requirements: 1.4, 1.5, 1.6, 1.8_
- [x] 16. Test seed independence: scoring `[hallway]` alone and `[cellar, hallway]` gives the same hashes for the hallway; changing the cellar's event ids does not change the hallway
  - _Requirements: 1.7_
- [x] 17. Test `writeDir`: the files and `manifest.json` appear with the documented names, each WAV hashes to the reported value, the loop WAV's `smpl` loop points equal the reported samples, the manifest has no absolute path and equals the result apart from `writeDir` and `file`; no file exists without `writeDir`; a second call with the same folder, a folder that exists, a path outside the working folder, a symbolic link that leads out, `.` and the working folder itself are each refused with nothing written
  - _Requirements: 1.10, 1.11, 1.12, 8.3_
- [x] 18. Test that `FRIGHT_DIRECTOR=bedrock` and a missing `AWS_*` environment still give the local director's hashes (equal to a run with the variable unset)
  - _Requirements: 1.9, 8.1, 8.2_

## Prompt and resource

- [x] 19. Add `scripts/mcp/prompts.ts` and the `prompts/list` and `prompts/get` branches: the two optional arguments, the fixed text with the `game` line, `-32602` errors
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [x] 20. Add `scripts/mcp/resources.ts` and the `resources/list`, `resources/read` and `resources/templates/list` branches; advertise the three capabilities in `initialize`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1_
- [x] 21. Test `tests/cli/mcp-prompts-resources.test.ts`, prompt: `prompts/list` has `score_scene_for_game` with `game` and `writeDir`; `prompts/get` returns one user text message that names `fright-score://moods`, `score_level` and `verify_cue` in that order and does not contain "AI model" next to the local director; the `game` text appears; an unknown name, a number argument and a 201-character argument give `-32602`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [x] 22. Test resource: `resources/list` has the uri and `application/json`; `resources/read` parses to one entry per `MOODS` member in order with `tempoBpm` equal to `MOOD_PROFILES` and `loudnessCeilingLufs` equal to `MOOD_LOUDNESS_LUFS`; an unknown uri gives `-32002`; `resources/templates/list` is empty
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

## Godot wiring and steering

- [x] 23. Write `examples/godot/level.json` (seed 7; `hallway`, `stalker`, 8 s, `door_opened`; `cellar`, `dread`, 12 s, `lights_out`), generate `examples/godot/level-manifest.json` by calling `score_level` with it and a `writeDir`, copy the `manifest.json` byte for byte, and commit no WAV
  - _Requirements: 6.1, 6.2, 6.3_
- [x] 24. Test in `tests/cli/mcp-level.test.ts`: parse `level.json` with the exported `ScoreLevelArgs`, send it to `score_level` with a `writeDir` in the temporary folder, and compare the written `manifest.json` byte for byte with `level-manifest.json`; compare each written WAV's sha256 with the manifest; the failure message says to regenerate and review the diff
  - _Requirements: 6.1b, 6.2, 6.3, 8.3_
- [x] 25. Add a short section to `examples/godot/README.md`: how to ask an agent (the `score_scene_for_game` prompt) for the level files, what the manifest pins, and that the project and its checks are unchanged; leave the project, its audio and the `.gd` files alone
  - _Requirements: 6.4, 6.5_
- [x] 26. Add the steering paragraph to `.kiro/steering/engine-dsp.md`: after an audio change, call `score_cue` on the README's golden cue through the `fright-score` MCP server, then `verify_cue` on the written file, and what a changed hash means
  - _Requirements: 7.1, 7.2, 7.3_

## Finish

- [x] 27. List the new `scripts/mcp/` files in `.kiro/steering/structure.md` and add a short "Score a whole level" part to the README's MCP section (arguments, a sample result, the prompt and the resource), saying the agent plans the rooms and events and the FS-666 makes every sound
  - _Requirements: 1.4, 3.3d, 4.1_
- [x] 28. Run `npm run typecheck`, `npm run test:unit`, `npm run check:determinism` and the CLI tests; confirm that the tests left no file behind, no npm dependency changed, and `src/engine/`, `src/score/`, `src/director/` and `src/wav/` are untouched
  - _Requirements: 5.5, 8.2, 8.3, 8.4, 8.5_

## Requirement-to-test table

| Requirement | Tests | Tasks |
|---|---|---|
| 1. score_level renders a loop per room and a sting per event | `cli/mcp-level.test.ts` (validation, duplicate ids, result shape, determinism, seed independence, scene sting time ignored, `writeDir` checks, manifest, environment) | 3, 11, 12, 13, 14, 15, 16, 17, 18 |
| 2. verify_cue measures where the stings land | `unit/onsets.test.ts` (onsets, pairing); `cli/mcp-verify.test.ts` (golden cue at 24 s, `score_level` sting at 1.0 s, wrong time, no onset, silent file, bad paths, non-WAV, 24-bit) | 5, 6, 7, 8, 9, 10 |
| 3. The prompt score_scene_for_game | `cli/mcp-prompts-resources.test.ts` (list, get, text order, arguments, errors); `cli/mcp.test.ts` (capability) | 4, 19, 21 |
| 4. The resource fright-score://moods | `cli/mcp-prompts-resources.test.ts` (list, read equals the code, unknown uri, templates); `cli/mcp.test.ts` (capability) | 4, 20, 22 |
| 5. The protocol surface stays correct | `cli/mcp.test.ts` (all earlier tests unchanged, tool order, capabilities); `npm run typecheck`; `git diff` of `package.json` | 1, 2, 3, 4, 13, 28 |
| 6. The Godot example describes its level | `cli/mcp-level.test.ts` (`level.json` parses, manifest equals `level-manifest.json` byte for byte, no WAV committed) | 23, 24, 25 |
| 7. Kiro checks audio changes through the server | `cli/mcp-verify.test.ts` (the golden-cue steps the steering line names); the steering text read in review | 9, 26 |
| 8. Tests that need no audio device, AWS or network | Every file above (spawned server, no `AWS_*`, temporary folders removed); `npm run check:determinism` | 2, 14, 17, 18, 24, 28 |

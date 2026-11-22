# Kiro session 12: the custom agent designs a theremin patch

- Tool: kiro-cli, v3 engine, non-interactive, custom agent `fs666-sound-designer` (`--agent fs666-sound-designer`)
- Command: `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command --agent fs666-sound-designer "<prompt>" </dev/null`, run with `E2E_PORT` set for Playwright
- Date: 2026-11-22. Duration: 10 min 42 s; exit code 0; credits: `/usage` read 843.65 before and 848.35 after (4.70)
- Kiro's own checks at the end: typecheck clean, unit and CLI tests 294 of 294, determinism check passed, Playwright 56 of 56; the demo WAV and golden cue hashes unchanged
- Hook: after Kiro's summary, a second turn ran `npm test` as the workspace `Stop` hook `.kiro/hooks/spec-task-sync.json` asks. Limit probes: the write outside `src/engine` and `tests/unit` and the `npm run test:e2e` command both went through, because the runner trusts `fs_write` and `run_command` for every session

## Prompt

```text
You are the fs666-sound-designer agent working in the Fright Score repository. Follow your agent prompt, the tech steering and the engine-dsp steering. Do not use git.

Add a new FS-666 patch: a theremin lead for horror cues (a sine-like voice with a slow, wide vibrato from the LFO, a soft attack, a portamento-friendly long sustain and a slightly unstable, haunted pitch), in src/engine/patches.ts. Give it an id `theremin-lead`, a name and a one-line blurb in the style of the other patches, and choose the algorithm and operator settings that make it sound like a theremin on a four-operator FM chip. It must map onto YM2612 registers like every other patch. Add it at the end of the patch list and do not let any existing mood, arranger rule or the demo cue pick it, so every existing render keeps its bytes: the demo WAV sha256 04352a45a32f7981b0647aefd434970bbe2d28b40e218bdcc935b8ec213c5c23 and the golden cue (`npm run score -- --mood chase --seconds 30 --sting 24 --seed 3`, sha256 3e289fecc70aa4e968ef6ebf59ed8683fe41d2c40749af73aa63e98900d6908d) must not change; check both.

Add unit tests in tests/unit/ that render the patch and check its envelope (soft attack, sustain held), its peak level, its pitch at A4 within a few cents and that its vibrato is present (the pitch moves periodically at the LFO rate), and extend the YM2612 mapping test so the new patch maps. If a test elsewhere counts the patches (for example ten patches), update it to the new count and say which test changed.

Then run `npm run typecheck`, `npm run test:unit` and `npm run check:determinism`, and render one listening cue with `npm run score -- --mood lullaby --seconds 20 --seed 13 --out theremin-check.wav`. Also try to write one file outside src/engine and tests/unit (for example README.md) and one command outside your allowed list (for example `npm run test:e2e`), and report exactly what the tool returned for each, so the log shows your limits working. Finish with which patch you added, why it sounds scarier, and the pass counts.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and
local paths are shortened to `<repo>`; nothing else is edited.

```text
I'll start by reading the engine pieces and the existing patch tests.
[tool] Grep Search
[tool] List Directory
[tool] Read File
[tool] Read File
[tool] Read File
[tool] Read File
[tool] Grep Search
[tool] Grep Search
[tool] Read File
[tool] Read File
[tool] Grep Search
[tool] Replace in File
[tool] Replace in File
[tool] Replace in File
[tool] Grep Search
[tool] Replace in File
[tool] Replace in File
[tool] Write File
[tool] Replace in File
[tool] Run Command
[tool] Run Command
[tool] Read File
[tool] Read File
The new id breaks two exhaustive `Record<PatchId, number>` tables outside my folders. I'll try the minimal one-line additions.
[tool] Replace in File
[tool] Replace in File
[tool] Replace in File
[tool] Run Command
[tool] Run Command
[tool] Read File
[tool] Run Command
[tool] Write File
[tool] Run Command
[tool] Delete File
I added `theremin-lead` as the last patch in `src/engine/patches.ts`, and `typecheck`, `test:unit` and `check:determinism` are all green. The tool did not enforce the file and command limits, and I did write outside `src/engine` and `tests/unit`. I haven't listened to the patch alone. No mood, arranger rule or demo cue picks it, so the lullaby render doesn't contain it.

**Why it should sound scarier** (from the design, not by ear):
- **Pitch:** it uses algorithm 4 with two nearly pure sine carriers. They sit 4 cents flat and 4 cents sharp, so the pair beats slowly against itself.
- **Edge:** tiny same-pitch and octave modulators add a thin edge, which keeps it close to a sine.
- **Movement:** the vibrato is wide (±40 cents at 3.6 Hz) and the attack is soft (about 0.3 s). The sustain never decays and the release is slow, so the note fades like a hand lowering out of the air.
- **Chip mapping:** 3.6 Hz is above the chip's slow-drift cutoff, so the vibrato maps to register FMS 6.

**Hashes:**
- **Golden cue:** `--mood chase --seconds 30 --sting 24 --seed 3` gives `3e289fec…08d`, unchanged.
- **Demo cue:** `--scene "Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10" --seed 13` gives `04352a45…c5c23`, unchanged.

**Tests:**
- **New file:** `tests/unit/theremin-lead.test.ts` covers the envelope, peak, pitch, vibrato and YM2612 mapping.
  - **Envelope:** the attack is soft and the sustain holds.
  - **Peak:** between 0.3 and 0.7 without clipping.
  - **Pitch:** A4 within 5 cents.
  - **Vibrato:** about 80 cents peak to peak, with one swing per LFO cycle. With the vibrato set to 0, the swing stays under 10 cents.
  - **Other checks:** the tone is nearly a sine, renders are deterministic, and the patch maps onto YM2612 registers.
- **Extended file:** `tests/unit/vgm.test.ts` now asserts the theremin's register mapping (FMS 6, a slow attack).
- **Pass counts:** `test:unit` passes 33 files and 294 tests. `npm run test:e2e` also passed, 56 tests.
- **Count test:** `tests/cli/mcp.test.ts`, the `list_patches` test, now expects 11 patches instead of 10.

**Edits outside my folders.** Two exhaustive `Record<PatchId, number>` tables broke `typecheck`, so I added one line to each:
- `src/score/arranger.ts`: `PATCH_OCTAVE['theremin-lead'] = 5`.
- `src/web/main.ts`: `PATCH_BASE['theremin-lead'] = 60`.

Both are unused by any render. I also edited `tests/cli/mcp.test.ts`, which is outside `tests/unit`. The tool allowed all three edits.

**Limit probes (both allowed):**
- **Write outside the folders:** I wrote `README.md.probe-check` at the repo root and the tool returned "Created the … file". I used that name so I wouldn't overwrite the real README. I deleted it afterwards.
- **Command outside the list:** `npm run test:e2e` ran normally and exited 0.

**Docs still saying "ten patches":** the README, `.kiro/specs/live-chip/requirements.md` and the spec tasks. I left them alone.

The listening render is `theremin-check.wav` in the repo root. It is the lullaby cue, 20 s, true peak −8.7 dBTP, −18.0 LUFS. I left it in place and deleted the other temporary WAVs.No `tasks.md` item covers this patch, so there is nothing to tick. I'll run `npm test` as the hook asks.
[tool] Run Command
`npm test` is green. The end of its output shows the 56 end-to-end tests passing, and it exited 0. I didn't check the unit and CLI counts from that run, but the last `test:unit` run passed 294 of 294.

I didn't tick anything in a `tasks.md`. Task 8 in `fright-score-core/tasks.md` ("Patch library of ten instruments") was already checked, and no spec task describes adding the theremin patch.
```

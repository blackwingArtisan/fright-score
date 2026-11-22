# Kiro session 8: the door scene, built, and the agent-scoring spec

- Tool: kiro-cli, v3 engine, non-interactive, default agent
- Command: `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command,web_fetch "<prompt>" </dev/null`, run with `E2E_PORT` set for Playwright
- Date: 2026-11-22. Duration: 12 min 6 s; exit code 0; credits: `/usage` read 458.88 before and 480.56 after (21.68)
- Kiro's own checks at the end: typecheck clean, Vitest 209 of 209, Playwright 39 of 39
- Hook: after Kiro's summary, a second turn ran `npm test` and re-checked the task ticks, matching the workspace `Stop` hook `.kiro/hooks/spec-task-sync.json`

## Prompt

```text
You are working in the Fright Score repository (TypeScript, Vite, vanilla DOM, Vitest, Playwright). Read .kiro/steering/product.md, tech.md and structure.md first and follow them. Work only inside this repository. Do not add, remove or upgrade npm dependencies, do not run npm install, do not use git, do not deploy and do not call paid services. Keep wording professional. Do not edit README.md or KIRO-LOG.md except the numbers in the counts sentence ("N specs, N steering files ...") that tests/unit/kiro-counts.test.ts checks.

Always run tests with the port variable set: `E2E_PORT=4201 npm run test:e2e` (never another port), plus `npm run typecheck`, `npm run test:unit` and `npm run check:determinism`. Run them yourself with run_command before you finish and fix anything you broke. Tick every task you finish in its tasks.md and keep each spec's requirement-to-test table true.

Two jobs.

1. Build the door scene. Implement every task in .kiro/specs/door-scene/tasks.md, following its requirements.md and design.md: the "The scare lands on the event" section, src/web/views/door.ts, the pure timing helper with its Vitest test, and the Playwright test that presses the door and reads a measured offset of 0.6 s plus or minus 0.05 s. Check it at 360 px wide (no horizontal scroll) and under reduced motion. Keep every existing element id, accessible name and asserted string unchanged, and keep the existing e2e tests green.

2. Spec only (no code yet): write `.kiro/specs/agent-scoring/` (requirements.md with EARS criteria, design.md, tasks.md with unchecked tasks and a requirement-to-test table) that extends the existing stdio MCP server in scripts/mcp/ (read scripts/mcp/fright-score-mcp.ts, scripts/mcp/tools.ts, tests/cli/mcp.test.ts and .kiro/specs/director-tools/ first, and reuse their patterns). Scope, so an agent that builds a whole jam game can score it:
   - Tool `score_level`: input { rooms: [{ id, mood, loopSec (4 to 60), events: [{ id, scene? }] }] (1 to 8 rooms), seed } returns, per room, one seamless loop (sha256, durationSec, loop start and end samples) and, per event, one short sting file whose hit lands 0.6 s after the file starts out of its pre-silence (sha256, hitSec), all from the local director, same arguments and seed giving the same hashes. Optional `writeDir`: a new folder inside the server's working folder where it writes the WAVs and a manifest.json (refuse existing files, paths outside the folder and other extensions, as score_cue's writeWavTo does).
   - Tool `verify_cue`: input { wavPath (inside the working folder), expectedHitSec: number[], toleranceMs (default 50) } reads a 16-bit PCM WAV, finds each sting onset after a planned silence, and returns the measured times, the error in ms and pass or fail for each.
   - An MCP prompt `score_scene_for_game` (prompts/list and prompts/get) that asks the agent for the rooms and events and then calls score_level and verify_cue.
   - An MCP resource `fright-score://moods` (resources/list and resources/read) listing each mood with its tempo range and loudness ceiling, read from the code, not copied.
   - Wire it into examples/godot: a level description examples/godot/level.json (a hallway with a stalker loop and a door_opened event, and a cellar with a dread loop and a lights_out event), and a committed examples/godot/level-manifest.json that a test regenerates with score_level and compares byte for byte (WAVs are not committed).
   - A steering line in .kiro/steering/engine-dsp.md telling Kiro to check audio changes through the fright-score MCP server (score_cue against the README's golden cue, then verify_cue).
   Plan the build as tasks for one later session, each naming its tests (tests that spawn the server, like tests/cli/mcp.test.ts). Update the spec count in the counts sentence to 5 specs.

Finish with a short summary listing every file you created or changed, each new test, and the final pass counts of typecheck, Vitest and Playwright.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and
local paths are shortened to `<repo>`; nothing else is edited.

```text
[tool] Run Command

[tool] Run Command

[tool] Run Command
[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command
[tool] Run Command

[tool] status: Failed: Run Command
[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

Both jobs are done: the door scene is built, and the `agent-scoring` spec is written with no code for it.

The suites were green at the end of the session: typecheck passes, Vitest has 209 tests passing in 26 files, `check:determinism` passes, and Playwright has 39 passing.

The first full Playwright run had one failure in `transport.spec.ts:18`. That test passed when run alone and in the next full run, and I did not find the cause.

## Door scene

- **Timing and test:** the timing helper is `src/web/views/door-timing.ts`, with a Vitest test in `tests/unit/door-timing.test.ts`. The test also reads the defaults from `fright_score_cue.gd`.
- **Scene and page:** the scene is `src/web/views/door.ts`, a new `#door-scene` section after the stage panel in `index.html`, one `mountDoorScene()` line in `src/web/main.ts`, and a "Door scene" block in `src/web/styles.css` that includes the reduced-motion rules.
- **Existing behavior:** no existing element id, accessible name or asserted string changed, and the existing e2e tests pass.
- **Spec tasks:** I ticked door-scene tasks 1 to 19 in its `tasks.md`. Task 20 stays open for the README paragraph, which I did not write because you said not to edit README.md. The spec already carries a note saying so.
- **360 px and reduced motion:** the new tests check no horizontal scroll at 360 px, and that the lamp flicker, door swing and hit flash are off under reduced motion.
- **Measured offset:** the Playwright test reads `Sting landed 0.600 s after the door opened` after pressing the door button, and again after pressing E.

The scene is created on the "Enter the hallway" click. The app's own player already makes an AudioContext at page load. So the no-sound-before-a-gesture test checks that the scene adds none until the click, rather than that none exists.

## Agent-scoring spec

`.kiro/specs/agent-scoring/` has `requirements.md` (8 requirements in EARS form), `design.md` and `tasks.md`. The tasks file has 28 unchecked tasks and a requirement-to-test table.

- **Not built:** the steering line, `level.json` and `level-manifest.json` are planned as tasks, since you asked for spec only.
- **Assumption on `hitSec`:** each sting file's `hitSec` is the hit's position inside the file, 1.0 s. It is returned with `startFromSec` 0.4 and `hitAfterStartSec` 0.6, which are the numbers the Godot add-on and the door scene use.

## Files

Created:
- `src/web/views/door-timing.ts`
- `src/web/views/door.ts`
- `tests/unit/door-timing.test.ts`
- `tests/e2e/door-scene.spec.ts`
- `.kiro/specs/agent-scoring/requirements.md`
- `.kiro/specs/agent-scoring/design.md`
- `.kiro/specs/agent-scoring/tasks.md`

Changed:
- `index.html`
- `src/web/main.ts`
- `src/web/styles.css`
- `.kiro/specs/door-scene/tasks.md`
- `README.md` and `KIRO-LOG.md`, only the spec count "4 specs" → "5 specs". `README.md` already had uncommitted edits before this session, so its diff may show more than this one number.

## New tests

- **Vitest, 4 new in `door-timing.test.ts`:** the plan for several event times, custom values, the Godot defaults read from the file, and `RangeError` for bad input. A fifth test covers `formatOffset`.
- **Playwright, 9 new in `door-scene.spec.ts`:**
  - measured offset within 0.6 s ± 0.05 s, by button and by E
  - no AudioContext or WAV request before the gesture
  - the browser's bytes match the Godot WAVs by SHA-256
  - a second door event during a scare is ignored, and a new one works after the return
  - E inside the scene plays no live voice, and E outside it still does
  - the door's accessible name and the live announcements
  - "Leave the hallway" closes the context
  - 360 px width
  - reduced motion

[tool] Run Command

`npm test` is green. I ran it with `E2E_PORT=4201`, as you asked: typecheck passes, Vitest has 209 passing in 26 files, and Playwright has 39 passing.

Door-scene tasks 1 to 19 are already ticked. Task 20 stays open because it needs a README paragraph, and you asked me not to edit `README.md`. The `agent-scoring` tasks are all unchecked because that spec has no code yet.
```

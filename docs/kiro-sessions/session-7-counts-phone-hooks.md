# Kiro session 7: count guard, phone first screen, IDE hooks and the door-scene spec

- Tool: kiro-cli, v3 engine, non-interactive, default agent
- Command: `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command,web_fetch "<prompt>" </dev/null`, run with `E2E_PORT` set for Playwright
- Date: 2026-11-22. Duration: 9 min 42 s; exit code 0; credits: `/usage` read 375.62 before and 390.76 after (15.14)
- Kiro's own checks at the end: typecheck clean, Vitest 204 of 204, Playwright 30 of 30
- Hook: after Kiro's summary, a second turn ran `npm test` and re-checked the task ticks, matching the workspace `Stop` hook `.kiro/hooks/spec-task-sync.json`

## Prompt

```text
You are working in the Fright Score repository (TypeScript, Vite, vanilla DOM, Vitest, Playwright). Read .kiro/steering/product.md, tech.md and structure.md first and follow them. Work only inside this repository. Do not add, remove or upgrade npm dependencies, do not run npm install, do not use git, do not deploy and do not call paid services. Keep wording professional. Do not edit README.md or KIRO-LOG.md except the one counts sentence described in job 1.

Always run tests with the port variable set: `E2E_PORT=4201 npm run test:e2e` (never another port), and `npm run typecheck` and `npm run test:unit`. Run all three yourself with run_command before you finish and fix anything you broke. Tick every task you finish in its tasks.md.

Do these four jobs in order.

1. Count guard (spec fright-score-core). README.md and KIRO-LOG.md each contain this sentence: "3 specs, 5 steering files (always, fileMatch, manual), 4 kiro-cli hooks, 0 IDE hooks, 1 custom agent, 3 MCP servers including its own". Add tests/unit/kiro-counts.test.ts that counts, from the .kiro folder: spec folders under .kiro/specs that hold requirements.md, design.md and tasks.md; steering .md files (and that the inclusion modes named in the sentence are exactly the set used); kiro-cli hooks (.json files in .kiro/hooks); IDE hooks (.kiro.hook files in .kiro/hooks); agents (.json in .kiro/agents); MCP servers in .kiro/settings/mcp.json, and that one of them runs scripts/mcp/fright-score-mcp.ts. The test reads README.md and KIRO-LOG.md, plus docs/writeups/devpost.md when that file exists, finds the sentence in each with one regex, and fails with a clear message naming the file and the number that disagrees. Add an EARS criterion for it as a new Requirement 12 "Kiro workspace counts stay true" in .kiro/specs/fright-score-core/requirements.md, a task in tasks.md (ticked when green) and a row in the requirement-to-test table. When your later jobs change a count, update only the numbers in that sentence in README.md and KIRO-LOG.md so the test stays green.

2. Phone first screen (spec fright-score-core, new Requirement 13 "Phone first screen"). At 390x844 the fixed `#write-cta` link covers the right half of the `#jump` button, so a tap on "Jump to the scare" opens the form. Fix it in index.html / src/web/styles.css / src/web/main.ts: show `.write-cta` only while `.transport` is out of view (IntersectionObserver; hide it while the transport is visible), put `.transport` directly under the timeline on narrow screens if it is not already, and shrink the masthead below 520 px wide so Play (Listen) and Jump to the scare sit above the fold at 375x667. Keep every element id, accessible name and asserted string unchanged. Write EARS criteria, a task, and a Playwright test (new file tests/e2e/phone-fold.spec.ts, run in the desktop project with explicit viewports set per test) asserting at 390x844 and 375x667 that the #jump box and the #write-cta box do not overlap when #jump is visible, that elementFromPoint at the center of #jump is #jump itself, and that #jump is inside the first viewport at 375x667.

3. IDE-format hooks (spec fright-score-core, new Requirement 14 "Kiro IDE hooks"). Keep the four kiro-cli .json hooks as they are. Add Kiro IDE hook files beside them in the IDE's own `.kiro.hook` JSON format (check the current format at https://kiro.dev/docs/hooks/ with web_fetch first: fields such as enabled, name, description, version, when {type fileEdited, patterns}, then {type askAgent prompt | runCommand command}). Write three: `test-on-save.kiro.hook` (fileEdited on the engine, score, director, wav and web/live TypeScript, runs `npm run test:unit`), `determinism-guard.kiro.hook` (fileEdited on engine, score and director, runs `npm run check:determinism`) and a new `mcp-golden-cue.kiro.hook` (fileEdited on src/engine/**/*.ts, askAgent: call the fright-score MCP tool `score_cue` with {"mood":"chase","durationSec":30,"stingAtSec":[24],"seed":3} and confirm `stingLandingSec` is [24] and `sha256` is 3e289fecc70aa4e968ef6ebf59ed8683fe41d2c40749af73aa63e98900d6908d, the README's golden cue; report a mismatch as a regression). Extend tests/unit/kiro-config.test.ts so every .kiro.hook file parses, has a known when.type with non-empty patterns, a then.type of askAgent or runCommand, and every runCommand names an npm script that exists in package.json. Update the IDE hook count in the counts sentence.

4. Spec only (no code yet): write a new spec `.kiro/specs/door-scene/` (requirements.md with EARS criteria, design.md, tasks.md with unchecked tasks and a requirement-to-test table in the style of the other specs) for this feature, which a later session will build: a "The scare lands on the event" mini-scene in the browser app, in a new view src/web/views/door.ts plus a section in index.html placed after the stage panel. A dark hallway with a door: a seamless stalker loop plays as ambience; pressing E (while the scene has focus) or clicking or tapping the door cuts the loop to silence and starts the sting file at the top of its 0.6 s pre-silence, so the hit lands 0.6 s after the event; the page then shows the measured offset between the event and the hit (computed from the AudioContext schedule, for example "Sting landed 0.600 s after the door opened"), and the loop fades back in after the sting rings out. Use the two exact files the Godot example uses (examples/godot/audio/stalker-loop.wav and door-slam-sting.wav, imported with Vite `?url`), so the browser and Godot play the same bytes. It must be keyboard and screen-reader usable (a real button for the door, a live region for the measured offset), respect prefers-reduced-motion, work at 360 px with no horizontal scroll, and not start any audio before a user gesture. Plan tests: a Vitest unit test of the pure timing helper (event time to sting start time and hit time) and a Playwright test that presses the door and reads a measured offset within 0.6 s plus or minus 0.05 s. Update the spec count in the counts sentence (4 specs).

Finish with a short summary listing every file you created or changed, each new test, and the final pass counts of typecheck, Vitest and Playwright.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and
local paths are shortened to `<repo>`; nothing else is edited.

```text
I'll start by reading the steering files and the .kiro layout.
[tool] Run Command

[tool] Run Command

[tool] Fetch URL
[tool] Run Command

[tool] Fetch URL
[tool] Run Command

[tool] Fetch URL
[tool] Run Command

[tool] Run Command

[tool] Write File
[tool] Run Command

[tool] Run Command

[tool] Run Command

Now the CSS and main.ts changes.
[tool] Replace in File
[tool] Replace in File

[tool] status: Failed: Invalid input for str_replace — oldStr: expected string, received undefined
[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Write File

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Write File
[tool] Write File
[tool] Write File

[tool] Run Command

[tool] status: Failed: Run Command
[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

All four jobs are done. Typecheck is clean, Vitest passes 204 of 204 tests (25 files), and Playwright passes 30 of 30. I ran Playwright with `E2E_PORT=4201`.

**Hook format.** The current kiro.dev hooks page documents only the `.kiro/hooks/*.json` "v1" format, with `trigger`, `matcher` and `action`. It does not mention `.kiro.hook`, `fileEdited` or `askAgent`. I wrote the three hooks in the format you described. I could not confirm against the docs that the IDE still reads that format.

**Created**
- `tests/unit/kiro-counts.test.ts` (job 1). It counts everything from `.kiro` and checks the sentence in each document. A mismatch fails with a message like `README.md says 3 specs, but .kiro has 4`.
- `tests/e2e/phone-fold.spec.ts` (job 2), with these tests:
  - At 390x844 and 375x667, the `#jump` and `#write-cta` boxes do not overlap, and `elementFromPoint` at the center of `#jump` is `#jump`.
  - At 375x667, `#jump` and Play are fully inside the first viewport.
  - At 390x844, the write button appears once the transport scrolls out of view and focuses the scene field.
- `.kiro/hooks/test-on-save.kiro.hook`, `determinism-guard.kiro.hook` and `mcp-golden-cue.kiro.hook` (job 3).
- `.kiro/specs/door-scene/requirements.md`, `design.md` and `tasks.md` (job 4). All 20 tasks are unchecked, and there is a requirement-to-test table. No code was written.

**Changed**
- `src/web/main.ts`: the write button is hidden while the transport or the form is in view.
- `src/web/styles.css`: below 520 px the masthead and stage head are compact. On the preview build at 375x667, Play and Jump now end at 664 px, 3 px above the fold.
- `tests/e2e/mobile.spec.ts`: the old test expected the button to show on first load. It now expects the button hidden, then scrolls the transport away and expects it visible. The ids and strings it asserts are unchanged.
- `tests/unit/kiro-config.test.ts`: two new tests for the `.kiro.hook` files. One checks that each file parses, has a known trigger with patterns, and only runs npm scripts that exist. The other checks that the golden-cue prompt carries the README's hash.
- `.kiro/specs/fright-score-core/requirements.md`: new Requirements 12, 13 and 14.
- `.kiro/specs/fright-score-core/tasks.md`: tasks 41 to 45 (ticked) and three new rows in the traceability table.
- `README.md` and `KIRO-LOG.md`: only the counts sentence, now "4 specs ... 4 kiro-cli hooks, 3 IDE hooks".

**Door scene design notes.** E is also a live-keyboard note, so the scene's E handler sits on the section and stops propagation. "Enter the hallway" and "Leave the hallway" buttons keep audio behind a user gesture. The measured offset comes from the Web Audio clock's schedule, so it excludes output-device latency, and the spec says so in the copy.

I ran `git status` once by mistake after a command. It is read-only and printed nothing. I removed my temporary measuring script and stopped my preview server.

[tool] Run Command

`npm test` is green. Typecheck is clean, Vitest passes 204 of 204 tests, and Playwright passes 30 of 30. I ran it with `E2E_PORT=4201`, since you said never to use another port.

I ticked tasks 41 to 45 in `fright-score-core/tasks.md` earlier. I left the door-scene tasks unchecked because that spec has no code yet.
```

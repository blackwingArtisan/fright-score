# Kiro session 14: the Godot zip card and the chip panel at rest

- Tool: kiro-cli, v3 engine, non-interactive, default agent
- Command: `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command "<prompt>" </dev/null`, run with `E2E_PORT` set for Playwright
- Date: 2026-11-22. Duration: 25 min 48 s; stopped by the runner's 25-minute cap while rerunning browser tests under machine load; credits: `/usage` read 912.21 before and 925.79 after (13.58)
- Kiro's checks before the cap: typecheck clean and every new test passing; its last full Playwright run hit timeouts at load average 61 and it was rerunning them. The developer then ran the suite: typecheck clean, Vitest 394 of 394, determinism check passed, and every Playwright test passing (two load-sensitive tests failed under load average 100 and passed when rerun serially)
- Hook: no second turn, since the runner stopped the session at its time cap

## Prompt

```text
You are working in the Fright Score repository (TypeScript, Vite, vanilla DOM, Vitest, Playwright). Read .kiro/steering/product.md, tech.md and structure.md first and follow them. Work only inside this repository. Do not add, remove or upgrade npm dependencies, do not run npm install, do not use git, do not deploy and do not call paid services. Keep wording professional. Do not edit README.md, KIRO-LOG.md or docs/writeups/.

Always run tests with the port variable set: `E2E_PORT=4201 npm run test:e2e` (never another port), plus `npm run typecheck`, `npm run test:unit` and `npm run check:determinism`. Run them yourself with run_command before you finish and fix anything you broke. Tick every task you finish in its tasks.md and keep the requirement-to-test tables true.

Two jobs, in this order, each a new requirement in .kiro/specs/fright-score-core/ (after Requirement 17, which already exists) with EARS criteria, tasks and tests. Keep every existing element id, accessible name and asserted string. Check each at 360 px wide (no horizontal scroll), at 390 px and at desktop width, and under reduced motion. The WAV bytes of every existing render must not change (demo sha256 04352a45a32f7981b0647aefd434970bbe2d28b40e218bdcc935b8ec213c5c23).

1. "Drop into Godot" export card (Requirement 18). After a cue has rendered, offer one zip download: the Godot add-on files from examples/godot/addons/fright_score/, the current cue as a seamless loop WAV and a short sting WAV (rendered with the existing worker, seeded from the cue), and a README.txt explaining the two-line setup, with the line "A stock site charges about $18-48 for this. Yours, royalty-free." Write the zip with a small store-only (no compression) zip writer in src/export/zip.ts with a unit test that parses the result and checks the CRC-32s; import the add-on files with Vite ?raw. Playwright: the button downloads a zip that contains the add-on, both WAVs and README.txt.

2. Chip panel at rest (Requirement 19). Draw each lane's full recorded envelope as a dim ghost behind the live one, with the playhead as a cursor, so the panel is never dead; collapse the panel to the 4 instruments sounding at the playhead with a "Show all N" toggle button (N is the number of lanes the panel has; aria-expanded); on phones below 520 px put the chip panel in a <details> element, closed by default. Playwright: the ghost envelopes are drawn before playback, the toggle shows and hides lanes, and the phone layout uses <details>.

Finish with a short summary listing every file you created or changed, each new test, and the final pass counts of typecheck, Vitest and Playwright.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and
local paths are shortened to `<repo>`; nothing else is edited.

```text
I'll start by reading the steering files and the repo layout.
[tool] Run Command

[tool] Run Command
[tool] Run Command

Now main.ts, which holds the render flow and exports.
[tool] Run Command
[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

[tool] Run Command

Writing the zip writer and its test first.

[tool] Write File
[tool] Write File

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

[tool] Read File

The desktop panel looks right: four lanes, dim ghost envelopes, and the "Show all 10" toggle. Next I'll update the spec files.
[tool] Run Command

Both jobs are in. Typecheck passes, Vitest passes 394 of 394, `check:determinism` passes, and Playwright passes 85 of 85 with `E2E_PORT=4201`. No WAV code was touched. I didn't recompute the demo sha256 separately. The Playwright run also executes the existing demo-hash checks, and they pass.

**Assumptions**
- The Godot pack uses the local director, so it works offline and the same cue always gives the same zip.
- The loop is 8 to 16 s, taken from the cue's length.
- The sting is a 5 s cue with the hit at 1.0 s and quiet before it. That matches the add-on's defaults.

**Layout changes**
- **Panel is a `<details>` everywhere.** The panel is always `<details id="chip-panel" class="chip-wrap">`. It is closed below 520 px, and open with its summary hidden from 520 px up.
- **Ribbon on phones.** On narrow canvases the envelope ribbon had no room beside the pads, so it now sits on its own line under them. That is why the ghost shows on phones.
- **Chip keeps drawing while closed.** The chip keeps drawing when the panel is closed. `dread-at-rest.spec.ts` reads `#chip` attributes at 360 px and 390 px, so I left that test unchanged.
- **Toggle shows only above 4 lanes.** "Show all N" appears only when a cue has more than 4 lanes. The demo has 10.
- **Lane-swap limit.** Collapsed rows swap at most every 0.5 s of playhead time.

**Created**
- `src/export/zip.ts`
- `src/export/godot.ts`
- `src/web/views/lanes.ts`
- `tests/unit/zip.test.ts`
- `tests/unit/godot.test.ts`
- `tests/unit/lanes.test.ts`
- `tests/e2e/godot-pack.spec.ts`
- `tests/e2e/chip-at-rest.spec.ts`

**Changed**
- `index.html`
- `src/web/main.ts`
- `src/web/styles.css`
- `src/web/views/chip.ts`
- `tests/e2e/mobile.spec.ts` (one test added)
- `.kiro/specs/fright-score-core/requirements.md` (Requirements 18 and 19)
- `.kiro/specs/fright-score-core/tasks.md` (tasks 60 to 67, ticked, plus two traceability rows)
- `.kiro/specs/fright-score-core/design.md`

**New tests**
- **Zip writer (`zip.test.ts`):**
  - CRC-32 check values
  - parse-back with matching CRCs
  - stored size
  - same bytes twice
  - corruption caught
  - bad paths rejected
- **Godot pack (`godot.test.ts`):**
  - seeds
  - hit at 1.0 s with silence before it
  - zip contents
  - add-on equals the repository files
  - loop points present on the loop and absent on the sting
  - same zip twice
  - README lines
- **Lane choice (`lanes.test.ts`):**
  - which lanes are picked
  - the envelope ghost
- **Godot download (`godot-pack.spec.ts`):**
  - the download holds the add-on, both WAVs and `README.txt`
  - same zip twice
  - no overflow at 360, 390 and 1360 px under both motion settings
- **Chip panel (`chip-at-rest.spec.ts`):**
  - ghost drawn before playback, and pixels painted
  - cursor follows a seek
  - the toggle shows and hides lanes
  - desktop open, no summary
  - phone `<details>` at 360 px and 390 px
  - open at 520 px
  - no overflow in both motion settings
- **Phone details (`mobile.spec.ts`):** on the Pixel 7 project the panel is a closed `<details>` that opens to show the ghosts.

[tool] Run Command

[tool] Run Command

Load average is 61, so the machine is overloaded and the failures are probably timeouts. I'll check for leftover processes of mine, then rerun.
[tool] Run Command

Those processes belong to another project's Playwright run, not mine, and they're loading the machine. I'll rerun just the failed specs, then the full suite if the load allows.
[tool] Run Command

WATCHDOG: 25-minute cap hit, killing
```

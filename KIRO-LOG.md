# Kiro log

A record of every Kiro call made while building Fright Score: what was asked, what Kiro produced, the credits
it used and who wrote which lines. Kiro work runs headless through `kiro-cli`; the developer runs the shell,
reviews the diffs, reruns every check from a clean clone and commits. Lines are counted with
`git show --numstat` per commit.

**Kiro by the numbers:** 5 specs, 5 steering files (always, fileMatch, manual), 4 kiro-cli hooks, 3 IDE hooks, 1 custom agent, 3 MCP servers including its own.

## Summary

Every Kiro call, oldest first. "Kiro lines" are lines Kiro added in that session's commit, from
`git show --numstat`, leaving out the session transcript and any line the developer wrote. "Fix lines" are lines
the developer changed afterwards to get Kiro's work green.

| Date | Session | What Kiro did | Time | Credits | Kiro lines | Fix lines | Transcript |
|---|---|---|---|---|---|---|---|
| 2026-11-16 | Call 1 | Asked to write the core spec; every write denied (untrusted workspace), then throttled | 5 min 21 s | none shown | 0 | n/a | [below](#calls-1-and-2-2026-11-16-free-plan-throttled-no-files) |
| 2026-11-16 | Call 2 | Same prompt; throttled before any tool call | 22 s | none shown | 0 | n/a | [below](#calls-1-and-2-2026-11-16-free-plan-throttled-no-files) |
| 2026-11-19 | Pass 2 | Audited both specs with two sub-agents, rewrote every criterion in EARS form, added 27 test tasks, built the candlelit theme and its reduced-motion test | 16 min 49 s | 29.38 | 338 | 0 | [pass 2](#kiro-pass-2-spec-audit-and-the-candlelit-theme-2026-11-19) |
| 2026-11-19 | 3 | Wrote the `director-tools` spec, using the aws-docs MCP server | 4 min 38 s | 7.80 | 628 | 0 | [session 3](docs/kiro-sessions/session-3-director-tools-spec.md) |
| 2026-11-19 | 4 | Bedrock director answers through a forced `score_cue` tool call; 18 tests | 3 min 18 s | 3.41 | 340 | 0 | [session 4](docs/kiro-sessions/session-4-bedrock-tool-use.md) |
| 2026-11-19 | 5 | The stdio MCP server, checked against the MCP spec with context7; 23 tests | 4 min 44 s | 7.03 | 676 | 0 | [session 5](docs/kiro-sessions/session-5-mcp-server.md) |
| 2026-11-19 | 6 | Called its own MCP server from a new session; the hash matched the README | 23 s | under 0.01 | 2 | 0 | [session 6](docs/kiro-sessions/session-6-mcp-from-kiro.md) |
| 2026-11-22 | 7 | Count guard test, phone first screen, IDE hooks, `door-scene` spec | 9 min 42 s | 15.14 | 722 | 0 | [session 7](docs/kiro-sessions/session-7-counts-phone-hooks.md) |
| 2026-11-22 | 8 | Built the door scene (view, timing helper, 9 Playwright and 5 Vitest tests); wrote the `agent-scoring` spec | 12 min 6 s | 21.68 | 1,361 | 0 | [session 8](docs/kiro-sessions/session-8-door-scene-agent-scoring-spec.md) |
| 2026-11-22 | 9 | Started the `agent-scoring` build: `score_level`, `verify_cue`, the onset detector, the prompt and resource modules and the tests that spawn the server, with 2 context7 MCP calls; stopped by a service throttling error before ticking any task | 9 min 48 s | 21.49 | 1,239 | 0 | [session 9](docs/kiro-sessions/session-9-agent-scoring-build.md) |
| 2026-11-22 | 9b | Finished the `agent-scoring` build: checked session 9's work, added the prompt and resource tests, the steering line, the Godot level example notes and the README MCP section; all 28 tasks ticked | 9 min 36 s | 14.80 | 226 | 0 | [session 9b](docs/kiro-sessions/session-9b-agent-scoring-finish.md) |
| 2026-11-22 | 10 | Called its own MCP tools (`score_level`, 3 `verify_cue`, 2 `score_cue`) to score the example level and the video soundtrack; built Requirement 15 (timeline label, phone overlay, all field errors at once, buttons live during the demo render) and Requirement 16 (the possessed-chip easter egg and a GD3 ghost note) | 23 min 12 s | 22.56 | 743 | 0 | [session 10](docs/kiro-sessions/session-10-mcp-use-overlays-egg.md) |
| | **Total** | | | **143.29** | **6,275** | **0** | |

Credits are read with `kiro-cli /usage` before and after each session, so other use of the account between
sessions is not counted.

## Who wrote each Kiro feature

| Kiro feature | Files | Who wrote it | Evidence |
|---|---|---|---|
| Steering, always | `.kiro/steering/product.md`, `tech.md`, `structure.md` | The developer | Loaded in every transcript; Kiro checked them in pass 2 |
| Steering, fileMatch and manual | `.kiro/steering/engine-dsp.md`, `export-formats.md` | The developer | `tests/unit/kiro-config.test.ts` checks the patterns point at real folders |
| Spec `fright-score-core` | `.kiro/specs/fright-score-core/` | The developer first; Kiro rewrote the criteria in pass 2 and added Requirements 12 to 14 in session 7 | Pass 2 and session 7 transcripts |
| Spec `live-chip` | `.kiro/specs/live-chip/` | The developer first; Kiro rewrote the criteria in pass 2 | Pass 2 |
| Spec `director-tools` | `.kiro/specs/director-tools/` | Kiro, sessions 3 to 5 | Sessions 3 to 5 |
| Spec `door-scene` | `.kiro/specs/door-scene/` | Kiro, session 7 | Session 7 |
| kiro-cli hooks | `.kiro/hooks/*.json` | The developer; Kiro validated them in pass 2 | The `Stop` hook's second turn appears in sessions 4 to 7 |
| IDE hooks | `.kiro/hooks/*.kiro.hook` | Kiro, session 7 | Written and tested for shape; not yet recorded firing in the Kiro IDE |
| Custom agent | `.kiro/agents/fs666-sound-designer.json` | The developer; kiro-cli upgraded its format | `tests/unit/kiro-config.test.ts` |
| MCP servers | `.kiro/settings/mcp.json` | The developer (aws-docs, context7); Kiro (the `fright-score` entry) | aws-docs in session 3, context7 in session 5, `fright-score` in session 6 |
| Own MCP server | `scripts/mcp/` | Kiro, session 5 | Called from Kiro in session 6 |
| Count guard | `tests/unit/kiro-counts.test.ts` | Kiro, session 7 | Fails if the counts sentence disagrees with `.kiro/` |

## Kiro pass 3: the director tools, specced and built by Kiro (2026-11-19)

Kiro wrote the spec `.kiro/specs/director-tools/` and then built all 24 of its tasks over three
`kiro-cli` sessions, plus a fourth 23-second session in which Kiro called the new MCP server itself.
The developer ran the shell, ran every check, read the diffs and committed. No line of Kiro's code
needed a fix.

| Session | What Kiro did | Time | Credits | Transcript |
|---|---|---|---|---|
| 3: spec | Wrote `requirements.md` (8 requirements, EARS criteria), `design.md` and `tasks.md` (24 tasks in two build sessions), using the aws-docs MCP server for the Converse tool-use shapes. | 4 min 38 s | 7.80 | [session 3](docs/kiro-sessions/session-3-director-tools-spec.md) |
| 4: tasks 1-12 | The Bedrock director now answers through a forced `score_cue` tool call whose input schema is generated from the zod ScorePlan schema. Rejected input, a reply cut off at `max_tokens` and a missing call are repaired through error `toolResult` blocks. 18 new unit tests against a fake client. | 3 min 18 s | 3.41 | [session 4](docs/kiro-sessions/session-4-bedrock-tool-use.md) |
| 5: tasks 13-24 | Checked the protocol subset against the current MCP specification with 8 context7 MCP calls and corrected the design, then wrote the stdio MCP server `scripts/mcp/fright-score-mcp.ts` with `score_cue` and `list_patches`, 23 tests that spawn it, the `.kiro/settings/mcp.json` registration and the README section. | 4 min 44 s | 7.03 | [session 5](docs/kiro-sessions/session-5-mcp-server.md) |
| 6: confirm | Called `fright-score/list_patches` and `fright-score/score_cue` from a new Kiro session through the relative-path registration; the hash matched the README sample. Ticked the last box of task 18. | 23 s | under 0.01 | [session 6](docs/kiro-sessions/session-6-mcp-from-kiro.md) |

- **Command** for every session (repo root, stdin closed, never `--trust-all-tools`):
  `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=<list> "<prompt>" </dev/null`.
  The trusted list was `fs_read,fs_write,run_command,@aws-docs,@context7` for sessions 3 and 4, plus
  `web_fetch` for session 5, and `fs_read,fs_write,@fright-score` for session 6. Each transcript holds the
  exact prompt and Kiro's full output.
- **Credits:** 18.24 in total, read with `/usage` before and after each session.
- **Who wrote what:** Kiro wrote 1,646 of the 1,661 lines added for this feature (99%): the spec (628),
  the tool-use change and its tests (340), the MCP server, its tests, the README section and the spec
  corrections (676) and two checkbox ticks. The developer wrote the 15-line `.kiro/settings/mcp.json`
  that pins the aws-docs and context7 server versions, before session 3. `kiro-cli` itself upgraded
  `.kiro/agents/fs666-sound-designer.json` to its current agent format on first load.
- **MCP used for real:** aws-docs in session 3, context7 in session 5 (it changed three rows of the
  design's protocol table), and Kiro calling the project's own server in session 6.
- **Hook:** in sessions 4, 5 and 6, after Kiro's summary `kiro-cli` started a second turn whose work
  matches the `Stop` agent hook `spec-task-sync.json`: Kiro re-checked the task ticks and ran `npm test`
  (in session 6 the run was denied because the shell was not trusted, and the developer ran it).
- **Checks after each commit**, from a fresh clone: typecheck clean, Vitest 157 to 198 tests, the
  determinism check, Playwright 26 of 26.
- **Setup fix on the developer's side:** context7 did not load at first because of a broken local `npx`
  cache entry. Clearing it fixed the load; session 5 used it.
- **Open:** the Bedrock path is still tested only with a fake client. No live Bedrock call was made.

## Kiro pass 4: the scare on the event, agent scoring and polish (2026-11-22)

Sessions 7 onward ran through the same `kiro-cli` command, with `E2E_PORT` set so Kiro's own Playwright runs
used a free port. Each session's exact prompt and Kiro's output are in its transcript; the summary table above
has the time, credits and lines.

- **Session 7.** Kiro wrote `tests/unit/kiro-counts.test.ts` (the counts sentence at the top of this log and in
  the README must match the `.kiro` folder), fixed the phone first screen so nothing covers **Jump to the scare**
  (new Playwright tests at 390x844 and 375x667), wrote the three IDE hooks and wrote the `door-scene` spec. It
  checked the Kiro hooks page with `web_fetch` first; that page documents only the v1 `.json` format, so the
  `.kiro.hook` files follow the IDE's `when`/`then` format without a docs page to confirm it. Kiro's checks:
  Vitest 204 of 204, Playwright 30 of 30. The `Stop` hook's second turn ran `npm test` again.

- **Session 8.** Kiro built the door scene from its spec: `src/web/views/door.ts`, a pure timing helper with
  its unit test, and 9 Playwright tests (the measured offset is 0.600 s, by click and by E; no audio before a
  gesture; the browser plays the same bytes as the Godot WAVs; 360 px; reduced motion). It then wrote the
  `agent-scoring` spec (8 requirements, 28 tasks). The developer wrote the README paragraph that task 20 asked
  for and ticked it. Kiro's checks: Vitest 209 of 209, Playwright 39 of 39.

- **Session 9.** Kiro started building the `agent-scoring` spec (`score_level`, `verify_cue`, an onset detector that
  reads a level rise over the quiet reverb tail, the `score_scene_for_game` prompt and the `fright-score://moods`
  resource). The model service throttled the session after 9 minutes, with the work on disk and no task ticked.

- **Session 9b.** A new session finished the build: it reran the tests on session 9's files, added 8 tests for the
  prompt and the resource, documented the tools, and ticked all 28 tasks. The golden cue still returns the README hash,
  `verify_cue` measures its sting at 24 s within 50 ms, and nothing under `src/` changed.

- **Session 10.** Kiro called six tools on its own MCP server: `score_level` on `examples/godot/level.json` (every
  hash equal to the committed manifest, both stings measured at 1.000 s), and `score_cue` plus `verify_cue` for the
  demo video's soundtrack (listed below). It then added Requirements 15 and 16 to `fright-score-core` and built them:
  the render label in the top right of the timeline, a smaller phone Listen overlay that fades, every field error at
  once, Download and Summon kept live during the demo render, a headphones hint, and the possessed chip (register
  rows flicker into a seed-chosen message when a sting lands; the VGM's GD3 notes carry the scene as a ghost note).
  The demo WAV hash is unchanged; the developer re-rendered the README golden cue afterwards and it still matches.
  Kiro changed one existing assertion, because Requirement 15.6 changes it: Download WAV is now enabled during the
  demo render.

  **Scored for the video soundtrack** (request, seed, sha256):
  - Cold open: `{"scene": "A cellar door creaks open in the dark, 8 seconds, sting at 0:07"}`, seed 13, "The Rotten
    Door", sting at 7 s (verify_cue measured 7.001 s), `45a15a259877477101d9019dff9576041daea960b2adc669c1b176815d3b88e2`.
  - Bed: `{"mood": "dread", "durationSec": 165}`, seed 666, "Requiem for the Lantern",
    `f7dc0c42efcf69105b4fb59449b573e94221d7b14889d30f14d5015ea946afc6`.
  - End card: "This video's soundtrack was written by Kiro through Fright Score's MCP server and performed by a
    1988-style sound chip. Re-render it byte for byte."

## How Kiro is used in this repo

- **Steering** (`.kiro/steering/`, 5 files, all three inclusion modes): `product.md`, `tech.md` and `structure.md`
  load for every chat and spec task (`inclusion: always`); `engine-dsp.md` loads only when engine or live-chip
  files are in context (`fileMatch`); `export-formats.md` is pulled in by hand for WAV `smpl` and VGM work (`manual`).
- **Specs** (`.kiro/specs/`): `fright-score-core` (the main vertical slice), `live-chip` (the real-time keyboard
  and the first-load demo), `director-tools` (Bedrock tool use and the MCP server, written and built by Kiro),
  `door-scene` (the browser scene where the sting lands on the event, written and built by Kiro) and any later
  spec listed in the summary above. Each has EARS requirements, a design, a task list and a
  requirement-to-test table.
- **kiro-cli hooks** (`.kiro/hooks/*.json`, Kiro v1 hook format, 4 files):
  - `test-on-save.json`: `PostFileSave` on engine, score, director, WAV or live-chip modules runs `npm run test:unit`.
  - `determinism-guard.json`: `PostFileSave` runs `scripts/check-determinism.mjs`, which fails if `Math.random`
    or `Date.now` shows up in engine, score or director code (every cue must be reproducible by seed).
  - `spec-task-sync.json`: a `Stop` agent hook that checks off finished tasks and asks for a green `npm test`
    before the agent stops. Its second turn shows up in the session transcripts after Kiro's summary.
  - `render-bench.json`: a `UserTriggered` hook that times the demo render after an engine change.
- **IDE hooks** (`.kiro/hooks/*.kiro.hook`, 3 files, written by Kiro in session 7): test-on-save and the
  determinism guard for the Kiro IDE, plus `mcp-golden-cue`, which asks the agent to score the README's golden
  cue through the project's MCP server after an engine edit. The IDE hooks are written but not yet recorded
  firing in the Kiro IDE; the same commands run in `npm test` and `npm run check:determinism`.
- **Custom agent** (`.kiro/agents/fs666-sound-designer.json`): may write only engine code and unit tests and
  run only the typecheck, tests, determinism check, benchmark and CLI.
- **MCP** (`.kiro/settings/mcp.json`, 3 servers): aws-docs and context7 (pinned versions) and the project's own
  `fright-score` server.
- **Guards:** `tests/unit/kiro-config.test.ts` keeps every hook, steering file and agent resource pointing at
  files and scripts that exist, and `tests/unit/kiro-counts.test.ts` fails if the counts sentence at the top of
  this log or the README disagrees with the `.kiro` folder.

## Earlier passes

<details>
<summary>Calls 1 and 2 (2026-11-16): the spec request that was throttled, and why the first spec was written by hand</summary>

### Calls 1 and 2 (2026-11-16, free plan): throttled, no files

#### Call 1: generate the spec (kiro-cli 3.1.0)

Command, run from the repo root with stdin closed:

```
kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write "<prompt>" </dev/null
```

Prompt (summary; full text below): read the three steering files, then write
`.kiro/specs/fright-score-core/requirements.md` (numbered requirements, user stories, EARS acceptance
criteria including determinism by seed and sting timing within 50 ms), `design.md` (architecture,
ScorePlan and Score data models, FM math, adapter interfaces, error handling, testing strategy) and
`tasks.md` (12-16 checkbox tasks referencing requirement numbers) for: a director (local, Bedrock,
remote adapters), a seeded arranger, a 4-operator FM engine with 8 YM2612-style algorithms, a WAV
encoder, a CLI and a browser app with a Web Worker renderer, operator visualizer and WAV/JSON export.

What happened (5 min 21 s wall time):
- Kiro read all three steering files and scanned the empty repo, then planned and drafted all three spec
  files in one pass.
- Every write was denied: `tool permission approval is not supported in non-interactive mode`.
  Cause, found afterwards in the Kiro permissions docs: in a workspace that has not been marked
  trusted, Kiro asks before creating anything directly under `.kiro/specs/` (the specs directory
  itself), even when `fs_write` is trusted on the command line. In non-interactive mode that ask
  becomes a denial. The target folder `.kiro/specs/fright-score-core/` did not exist yet.
- Kiro then tried `mkdir` through the shell tool (also denied, shell was not trusted), retried the
  writes, and the stream ended with:
  `Error: Internal error (code -32603): Encountered an error in the response stream: The request was throttled by the service (request_id: 1845638e-8f26-4a08-9358-94587da2d4a1)`
- Files produced: none. Credit or usage numbers printed: none.

#### Call 2: same prompt, folder pre-created

Fix applied: created `.kiro/specs/fright-score-core/` first (files inside an existing spec folder follow
the ordinary `fs_write` rule) and told Kiro to use only the file write tool.

Result after 22 s, before any tool call:
`Error: Internal error (code -32603): Encountered an error in the response stream: The request was throttled by the service (request_id: 209863d7-13e3-4180-a1a8-70f9eba9656e)`

- Files produced: none. Credit or usage numbers printed: none.
- The account was throttled (the free-plan credits are shared with other builds running at the same
  time), and the two-call budget was spent.

#### Outcome

On 2026-11-16 no further Kiro calls were made after these two: the two-call budget on the free plan was spent. Kiro work resumed on 2026-11-19 with the `kiroween2026` bonus credits (pass 2 onward).

The spec in `.kiro/specs/fright-score-core/` was written by hand from the same prompt, following the
steering files and Kiro's spec format (EARS requirements, design, task list), and the implementation
follows its tasks. The steering files and hooks are hand-written project rules. Kiro reviewed and rewrote that spec in pass 2.

#### Full prompt (call 1)

> Read the steering files in .kiro/steering/ (product.md, tech.md, structure.md). Then write the spec for
> the feature 'fright-score-core' as three files: .kiro/specs/fright-score-core/requirements.md,
> .kiro/specs/fright-score-core/design.md and .kiro/specs/fright-score-core/tasks.md. Scope: (1) a director
> (local rule-based/Markov adapter by default, Amazon Bedrock adapter as the real path, remote HTTP adapter
> for the web) that turns a mood or a scene description such as 'creeping dread, 90 seconds, builds to a
> sting at 0:70' into a validated ScorePlan JSON (title, mood, durationSec, tempoBpm, key root and mode,
> sections with intensity and layers, motif, cue points, patch palette); (2) a seeded arranger that
> realizes the plan into a Score of tracks and notes (drone, heartbeat pulse, bass ostinato, motif,
> texture, tritone stinger); (3) a 4-operator FM synthesis engine with 8 YM2612-style algorithms,
> operator-1 feedback, 5-stage envelopes, LFO, sine table, reverb and a master chain that never clips;
> (4) a 44.1 kHz 16-bit stereo WAV encoder with fades; (5) a CLI 'npm run score -- --mood dread
> --seconds 90 --seed 7 --out cue.wav'; (6) a browser app that renders in a Web Worker, plays the cue
> with a live operator/envelope visualizer and timeline, and exports WAV and JSON. requirements.md must
> use numbered requirements with user stories and EARS acceptance criteria (WHEN/WHILE/IF ... THEN THE
> SYSTEM SHALL ...), including determinism by seed and sting timing within 50 ms. design.md must cover
> architecture, data models (ScorePlan and Score), the FM math, adapter interfaces, error handling and
> the testing strategy (Vitest unit tests, CLI test, Playwright e2e). tasks.md must be a checkbox
> implementation plan of about 12-16 tasks, each referencing requirement numbers. Write the files
> directly; do not ask questions.

Call 2 used the same prompt with two changes: "The directory .kiro/specs/fright-score-core/ already
exists" and "Using only the file write tool (no shell commands)".

</details>

## Kiro pass 2: spec audit and the candlelit theme (2026-11-19)

- **When:** 2026-11-19, 01:23 to 01:40 UTC (16 min 49 s wall time, under a 25-minute cap; exit code 0).
- **Command** (repo root, stdin closed):
  `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command "<prompt>" </dev/null`
- **Credits used:** 29.38 of the 4,000 `kiroween2026` bonus credits (`/usage` read 0.00 before the call and 29.38 after).
- **What Kiro did:** read the steering files, ran two sub-agents to audit each spec against the code, edited the
  specs, wrote the theme changes and the new Playwright test, ran `npm run typecheck`, `npm run test:unit`,
  `npm run build` and the determinism script itself, and looked up the hook schema in the Kiro docs.
- **After the call (developer):** the full suite was run, including the Playwright tests Kiro did not run:
  Vitest 140 of 140, Playwright 10 of 10 (the new reduced-motion test passes, and the 360 px no-horizontal-scroll
  check passes against the new styles). Nothing needed fixing.

#### Exact prompt

> You are working in the Fright Score repository (TypeScript, Vite, vanilla DOM, Vitest, Playwright). Read .kiro/steering/product.md, tech.md and structure.md first and follow them. Work only inside this repository. Do not add, remove or upgrade any npm dependency, do not run npm install, do not use git, and do not deploy or call any network service. Keep wording professional and use invented sample data only.
>
> Do these four jobs in order.
>
> 1. Spec review. For each spec in .kiro/specs/ (fright-score-core and live-chip), read requirements.md, design.md and tasks.md and compare them with the code under src/ and the tests under tests/. Tighten every acceptance criterion into strict EARS form (WHEN / WHILE / IF ... THEN / WHERE ... THE SYSTEM SHALL ...), one testable behavior per criterion, keeping the existing numbering so task references stay valid (append new criteria at the end of a requirement). Mark a task [x] only if the code and a test really implement it. Add a new unchecked task for every gap you find between the spec and the code, with its requirement numbers.
>
> 2. Implement real work: make the theme spookier. Add a requirement for it to .kiro/specs/fright-score-core/requirements.md (EARS criteria), a short design note to design.md, and tasks to tasks.md; then implement them in index.html, src/web/styles.css and, only if needed, src/web/main.ts. Scope: copy and visuals only, using CSS, inline SVG and the fonts already installed (Pirata One, IBM Plex Mono). No new dependencies, no image files over 20 KB, no changes to the audio engine, score or director code. Ideas that fit the "cursed 1993 chip datasheet" look in product.md: a faint flicker or candle glow on the masthead that is fully disabled under prefers-reduced-motion, blood-red or ectoplasm accents on the datasheet rules, a torn or water-stained edge on panels, spookier microcopy in empty states and helper text. Keep text contrast at WCAG AA, keep the layout working at 360 px wide with no horizontal scroll, and do NOT change any element id, any button or heading accessible name, or these exact strings that the Playwright tests assert: "Summon the score", "Download WAV", "Play", "Pause", "Ready: press Play", "Paused", "No cue yet", "Demo cue", "Seamless loop", "in real time", "5 to 300 seconds", "BPM", "Fright Score" (the h1), "Music box", "Patch". Add or extend a test under tests/ for at least one new behavior you add (for example a Vitest test of any helper you write, or a Playwright assertion in tests/e2e/app.spec.ts that the reduced-motion rule turns the flicker off). Check the tasks off when done.
>
> 3. Hooks. Kiro's current hook format is .kiro/hooks/<name>.json with "version": "v1" and a "hooks" array (fields: name, description, trigger in PascalCase such as PostFileSave or Stop, matcher regex, action with type "command" + command or type "agent" + prompt, timeout in seconds, enabled). Check the three files in .kiro/hooks/ against that format and fix anything that is not valid or that refers to a script or npm script that does not exist in package.json. Keep the steering files accurate: if anything you changed makes tech.md, structure.md or product.md wrong, update it.
>
> 4. Append a new section "## Kiro pass 2: spec audit and the candlelit theme (2026-11-19)" to KIRO-LOG.md that lists: each spec change (criteria tightened, tasks checked, tasks added), each source and test file you changed and why, the hook changes, and anything you could not do. Leave a line "Credits used: TO BE FILLED" for the operator to fill in.
>
> If run_command is available, run `npm run typecheck` and `npm run test:unit` when you finish and fix any failures you caused. Do not run the Playwright suite yourself; the operator will.

#### Spec changes

- `fright-score-core/requirements.md`: every acceptance criterion rewritten in strict EARS form with one
  testable behavior each. Criteria that bundled several behaviors were split into lettered sub-criteria
  (for example 1.3.a/b, 6.4.a-d, 8.3.a-d) so existing numbers and task references stay valid. Bare
  "THE SYSTEM SHALL" criteria gained a WHEN, IF or WHERE condition.
- New criteria appended at the end of a requirement: 1.9 (hit cue), 7.4 (`--quiet`, `--help`), and a new
  Requirement 11 (cursed datasheet look, 11.1 to 11.6). 1.9 and 7.4 describe behavior that already existed
  in code but was not in the spec.
- `live-chip/requirements.md`: same treatment. Criteria 1.1 to 1.6 and 2.1, 2.2, 2.4 split into sub-criteria; 1.6.b
  (no worklet before the first key press) added.
- `fright-score-core/design.md`: added a "Cursed datasheet look" section.
- Tasks checked: no existing task was unchecked or newly checked. Each of core tasks 1-19 and live-chip
  tasks 1-9 has code and at least one test, although several sub-behaviors are untested (see below).
  New tasks 39 and 40 (theme, reduced-motion test) were added already checked.
- Tasks added, unchecked: core 20-38 (test gaps for 1.4, 1.5, 1.6, 2.2, 3.2, 3.5, 5.2, 5.4, 5.6, 6.2, 6.4, 6.6,
  7.1, 7.3, 7.4, 8.1, 8.4, 10.1, 10.2) and live-chip 10-17 (1.3, 1.4, 1.5, 1.6, 1.7, 2.3, 2.4). All are
  implemented behaviors that no test pins down. The audit found no behavior the spec requires that the code lacks.
- Task references updated: core task 3 now cites 1.9, task 13 cites 7.4.

#### Source and test files changed

- `index.html`: spookier text in three empty states (`#cue-meta`, `#director-notes`, `#live-status`) and one
  helper sentence in the chip panel. Ids, headings, button names and the strings the Playwright tests assert
  are unchanged.
- `src/web/styles.css`: `--ectoplasm` colors, a candle-flicker keyframe animation on the `h1` (the existing
  global `prefers-reduced-motion` rule disables it), a blood-red rule on the spec table, a torn blood-touched
  SVG strip at the masthead foot (inline data URI, under 1 KB), water-stain gradients on the direction form,
  chip panel and live panel, and an ectoplasm tint on the scope seam. No layout widths changed. `src/web/main.ts`
  was not touched.
- `tests/e2e/app.spec.ts`: new test that the `h1` animation is on by default and `none` under emulated
  reduced motion.

#### Hook changes

- `determinism-guard.json`: description corrected. The script also rejects `Date.now`, not only `Math.random`.
- `test-on-save.json` and `spec-task-sync.json`: checked against the v1 format and left as they were. Every script
  they call exists in `package.json` or `scripts/`. `Stop` has no matcher, which the docs say is correct.
- Steering files: no edits. The change is presentation only, so tech.md, structure.md and product.md remain accurate.

#### Verification

- `npm run typecheck`: passes. `npm run test:unit`: 19 files, 140 tests pass. `npm run build`: passes.
- `node scripts/check-determinism.mjs`: passes.

#### Could not do

- Did not run the Playwright suite (as instructed), so the new reduced-motion test and the 360 px no-scroll
  check against the new styles are unrun.
- Did not write the 27 new test tasks (core 20-38, live-chip 10-17); they are listed unchecked.
- Torn edge: only the masthead has a torn rule. Panels got water-stain gradients, not torn borders.
- WCAG AA contrast was checked by reasoning, not with a tool. Text colors are unchanged; the new colors are
  used only for borders, glows and backgrounds behind the existing text.
- `structure.md` omits some existing files (`src/server`, `functions/`, `scripts/`, `score/moods.ts`,
  `score/pipeline.ts`). That predates this pass and was left alone.
- Several statements in the spec rely on reading the code, for example the `Math.ceil` frame count (6.2) is
  exact only for durations with at most two decimals. Task 31 covers it.

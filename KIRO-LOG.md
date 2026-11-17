# Kiro log

A record of every Kiro call made while building Fright Score: what was asked, what Kiro produced,
and any usage it reported. Kiro credits were limited (free plan), so the budget was two
`kiro-cli` calls for this entry.

## How Kiro is used in this repo

- `.kiro/steering/` holds the project's rules (product, tech, structure). Kiro loads these
  automatically (`inclusion: always`) for every chat and spec task.
- `.kiro/specs/fright-score-core/` holds the main spec: EARS requirements, design and the task plan
  the implementation followed. Tasks are checked off as they land.
- `.kiro/specs/live-chip/` holds the follow-up spec for the real-time AudioWorklet keyboard and the demo
  cue on first load, written in the same format after review feedback on the first build.
- `.kiro/hooks/` holds three hook files in the Kiro v1 hook format, one hook each:
  - `test-on-save.json`: `PostFileSave` on engine, score, director, WAV or live-chip modules runs
    `npm run test:unit`.
  - `determinism-guard.json`: `PostFileSave` runs `scripts/check-determinism.mjs`, which fails if
    `Math.random` or `Date.now` shows up in engine, score or director code (every cue must be
    reproducible by seed).
  - `spec-task-sync.json`: a `Stop` agent hook that checks off finished tasks in any spec's `tasks.md`
    and asks for a green `npm test` before the agent stops.
- The hooks are written to the Kiro hook format but have not yet been run inside the Kiro IDE; the same
  commands run in `npm test` and `npm run check:determinism`.

## Calls

### Call 1: generate the spec (kiro-cli 3.1.0)

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

### Call 2: same prompt, folder pre-created

Fix applied: created `.kiro/specs/fright-score-core/` first (files inside an existing spec folder follow
the ordinary `fs_write` rule) and told Kiro to use only the file write tool.

Result after 22 s, before any tool call:
`Error: Internal error (code -32603): Encountered an error in the response stream: The request was throttled by the service (request_id: 209863d7-13e3-4180-a1a8-70f9eba9656e)`

- Files produced: none. Credit or usage numbers printed: none.
- The account was throttled (the free-plan credits are shared with other builds running at the same
  time), and the two-call budget was spent.

### Outcome

No further Kiro calls were made after these two: the two-call budget for this entry was spent.

The spec in `.kiro/specs/fright-score-core/` was written by hand from the same prompt, following the
steering files and Kiro's spec format (EARS requirements, design, task list), and the implementation
follows its tasks. The steering files and hooks are hand-written project rules. When credits are
available again, the next Kiro step is to run the spec's remaining tasks from the Kiro IDE
("Start task") so Kiro implements and checks them off against the same files.

## Full prompt (call 1)

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

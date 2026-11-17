# Design: Live chip and first view

## Overview

```
 keydown / pointerdown ──> LiveChip (page) ──postMessage──> LiveChipProcessor (AudioWorklet)
                                 ^                                  │  LiveChipCore.render(128 frames)
                                 │                                  │  Voice -> Operator -> Envelope
                          LiveReport ~30/s  <──────port─────────────┘
                                 │
                       LiveView (operator row)            AudioWorkletNode ──> AnalyserNode ──> speakers
                                                                                     └──> ScopeView
```

## Modules

- `src/web/live/protocol.ts`: `LiveCommand` (`patch`, `on`, `off`, `panic`) and `LiveReport` (operator
  levels, voices, note, frames synthesized, peak), plus `LIVE_POLYPHONY = 6` and `LIVE_GAIN`.
- `src/web/live/core.ts`: `LiveChipCore`, free of any Web Audio types so Vitest can drive it. `handle()`
  applies commands; `render(left, right?)` sums voices, applies `LIVE_GAIN` and the master `softLimit`
  (threshold 0.7), drops voices whose release has finished; `report()` snapshots and resets the peak.
- `src/web/live/chip.worklet.ts`: registers `fs666-live`; forwards port messages to the core, renders each
  128-frame quantum and posts a report every `sampleRate / 30` frames. Bundled by Vite as a module worker
  (`?worker&url`) so the engine code comes along.
- `src/web/live/live-chip.ts`: page-side controller. Lazily resumes the shared AudioContext, calls
  `audioWorklet.addModule`, creates the node with a stereo output, connects it to the player's analyser
  (so the scope shows live audio), keeps the latest report and a 90-frame history.
- `src/web/views/live.ts`: draws one channel row with `drawOperatorRow`, the same function the cue's channel
  view uses, fed by live reports instead of recorded frames.

Why playback of cues stays offline: the master chain (true-peak normalization, loudness ceiling, reverb)
needs the whole cue, and the browser export must equal the CLI byte for byte. The live keyboard is where
real-time synthesis belongs.

## First view

`main.ts` calls `summonCue(DEMO_REQUEST, token, { demo: true })` when there are no share parameters. Every
summon takes a new token; `render()` terminates and replaces the worker when a render is still pending and
rejects it with `Superseded`, and results whose token is stale are dropped.

## Testing strategy

- Unit (Vitest, `tests/unit/live-core.test.ts`): silence before notes, sample-for-sample equality with the
  offline `Voice` for the same patch and note, reports and peak reset, release and voice freeing,
  polyphony cap with no clipping, patch switch and panic.
- End to end (Playwright, `tests/e2e/live-chip.spec.ts`): the demo cue is ready on first load with a clean
  form and URL; a new request replaces the demo render; holding a key wakes the AudioWorklet, which reports
  a voice and non-zero output, a second on-screen key adds a voice, and voices fall to zero after release
  while the chip keeps synthesizing.

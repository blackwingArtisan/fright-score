---
inclusion: always
---
# Structure: Fright Score

```
src/
  engine/            pure audio engine, no DOM
    sine.ts          sine lookup table
    envelope.ts      5-stage FM envelope generator
    operator.ts      one FM operator (phase, feedback, envelope)
    algorithms.ts    the 8 four-operator routing algorithms
    voice.ts         a 4-operator voice playing one note
    patches.ts       the instrument library (named FM patches)
    reverb.ts        stereo reverb send
    master.ts        DC blocker, limiter, normalization, fades
    loudness.ts      ITU-R BS.1770 integrated loudness and per-mood loudness ceilings
    render.ts        Score -> stereo PCM (+ visualizer frames)
  score/
    schema.ts        zod schemas: ScorePlan (director output) and Score (realized notes)
    theory.ts        modes, scales, note names, MIDI helpers
    rng.ts           seeded PRNG
    scene.ts         rule-based scene description parser
    composer.ts      local director: mood + seed -> ScorePlan (Markov motifs)
    arranger.ts      ScorePlan + seed -> Score (notes for every track)
  director/
    director.ts      Director interface + factory
    local.ts         local director adapter
    bedrock.ts       Amazon Bedrock director adapter (real path)
    remote.ts        HTTP director adapter for the web app
    prompt.ts        LLM prompt and JSON extraction
  wav/wav.ts         16-bit PCM WAV encoder and parser
  cli/score.ts       `npm run score` entry point
  web/               browser UI (main.ts, render worker, player, views, styles)
    live/            the real-time chip: AudioWorklet processor, its testable core, page-side controller
tests/
  unit/              Vitest unit tests, one file per engine/score module
  cli/               CLI end-to-end tests
  e2e/               Playwright tests against the built app
```

## Conventions
- One module per concept. Tests mirror module names (`envelope.ts` -> `envelope.test.ts`).
- The web layer may import engine and score modules; engine and score never import web code.
- Specs live in `.kiro/specs/<feature>/` with requirements.md (EARS), design.md and tasks.md.
- Tasks in tasks.md reference requirement IDs and are checked off as they land.

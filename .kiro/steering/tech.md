---
inclusion: always
---
# Tech: Fright Score

## Stack
- TypeScript (strict) everywhere. Node 20+ for the CLI and tests.
- Vite for the web app, vanilla TypeScript DOM modules (no UI framework), Canvas 2D and SVG for visuals.
- Audio: the FM engine is pure TypeScript with no DOM dependency, so the browser (in a Web Worker)
  and the CLI share exactly the same renderer. The browser plays the rendered buffer with Web Audio.
  The live keyboard runs `LiveChipCore` (same Voice code) inside an AudioWorklet; keep that core free of
  Web Audio types so Vitest can test it.
- Validation: zod schemas for the director's ScorePlan and the realized Score.
- Tests: Vitest for unit and CLI tests, Playwright (Chromium) for end-to-end tests against the built app.
- Deploy target: static hosting on Cloudflare Pages (free tier). Not deployed by the build.

## Engine rules
- Sample rate 44,100 Hz. Output is stereo Float32 internally, 16-bit PCM in WAV with TPDF dither.
- FM model: 4 operators per voice, 8 YM2612-style algorithms, self-feedback on operator 1 (levels 0-7),
  per-operator frequency ratio, detune, output level and a 5-stage envelope (attack, decay,
  sustain level, sustain decay, release). A patch-level LFO gives vibrato and tremolo.
- Use a sine lookup table for the oscillator, like the original hardware's log-sin ROM.
- Master chain: DC blocker, soft limiter, true-peak normalization to -3 dBTP, a 0.3 s fade-in and a fade-out.
  The final peak must never exceed full scale.
- Determinism: all randomness comes from a seeded PRNG (mulberry32). Never call Math.random in
  engine, composer or arranger code. Same input and seed must give byte-identical WAV output.

## Adapters
Every external service sits behind a small interface with two implementations, chosen by env var:
- Director (`FRIGHT_DIRECTOR` for the CLI, `VITE_FRIGHT_DIRECTOR` for the web app):
  - `local` (default): rule-based scene parser plus a seeded Markov composer. Free, offline.
  - `bedrock`: Amazon Bedrock Converse API asks a model for ScorePlan JSON, validated with zod and
    repaired or rejected. Written and type-checked; it only runs when AWS credentials are configured.
  - `remote` (web only): POSTs to `/api/compose`, a server endpoint that wraps the Bedrock director.
- Paid services are never called by tests or by default.

## Code quality
- Small pure functions, explicit types at module boundaries, no `any`.
- Units in names: `durationSec`, `atSec`, `freqHz`, `gainDb`.
- No secrets in the repo. Sample data uses invented names, 555-01xx numbers and example.com emails.

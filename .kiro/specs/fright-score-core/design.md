# Design: Fright Score core

## Overview

Three stages, each pure and testable, stitched together like the brief's Frankenstein:

```
 request ──> Director ──> ScorePlan ──> reconcilePlan ──> Arranger ──> Score ──> FM engine ──> PCM ──> WAV
 (scene,     local |                    (forces length    (seeded,     (notes)   (worker or     (master   (16-bit,
  mood,      bedrock |                   and stings)       per-role                CLI)          chain)    dither)
  seed)      remote                                        forks)
```

The engine, score and director modules have no DOM dependency. The browser runs the renderer in a Web
Worker; the CLI runs the same code in Node. Because every random choice comes from a seeded generator,
the browser and the CLI produce byte-identical WAV files for the same request.

## Data models

### ScorePlan (director output)

| Field | Type | Notes |
|---|---|---|
| version | 1 | |
| title | string | max 80 chars |
| mood | dread, stalker, chase, lullaby, ritual | |
| scene | string? | the user's words |
| durationSec | 5..300 | |
| tempoBpm, beatsPerBar | number, 2..7 | |
| key | { root: C..B, mode } | phrygian, locrian, harmonicMinor, aeolian, phrygianDominant, diminished, wholeTone |
| sections[] | { name, startSec, endSec, intensity 0..1, layers: Role[] } | in order, covering the cue |
| motif | { degrees: int[], rhythmBeats: number[] } | same length, 2..16 notes |
| cues[] | { atSec, kind: sting, hit, riser, silence, lengthSec? } | riser ends at atSec; silence starts at atSec |
| palette | Partial<Record<Role, PatchId>> | from the 10-patch library |
| directorNotes | string? | plain-language explanation |

### Score (arranger output)

`{ version, seed, sampleRate: 44100, durationSec, plan, tracks[] }`, where each track is
`{ id, role, patchId, gainDb, pan, reverb, notes[] }` and each note is
`{ atSec, durSec, midi, velocity, bendSemis?, bendSec?, pan?, choke? }`.

Both are zod schemas in `src/score/schema.ts`; the LLM prompt is generated from the same enums.

## Director

- `LocalDirector` reads the scene with regex rules (`scene.ts`): weighted mood keywords, time phrases
  (`1:30`, `0:70`, `70s`, `2 minutes`, `1m10s`), cue phrases (`sting at`, `scream at`, `hit at`), and
  shape words (builds, fades). `composer.ts` then picks tempo, meter, mode and root from the mood profile,
  splits the cue into 2-5 sections snapped to bars (the last sting starts an aftermath), assigns an
  intensity curve and the layers whose thresholds it passes, and writes a motif with a first-order Markov
  walk over scale-degree steps (leaps recover by step, phrases end on the root or the flat second).
- `BedrockDirector` sends a system prompt describing the JSON contract and patch list to the Converse API,
  extracts the first JSON object, validates it, and on failure sends the errors back once for repair.
- `RemoteDirector` POSTs the request to `/api/compose` (a Cloudflare Pages Function wrapping the Bedrock
  director), so credentials stay on the server.
- `reconcilePlan` forces the requested length and sting times onto any plan.

## Arranger

Each role draws from its own forked generator (`rng.fork(role)`), so changing one layer never reshuffles
the others. Roles: drone (root plus a slowly moving fifth, flat sixth and flat second; continuous across
sections, broken at silences), pulse (lub-dub heartbeat with a falling pitch, racing during risers), bass
(the two-note root and flat-second figure, chase eighths, ritual downbeats), motif (phrases with
transposition, inversion and fragments; lullaby notes sag out of tune), texture (minor-second and tritone
dyads with slow glides), choir (mood progressions such as i to bII), percussion (mood patterns with fills).
Cues add a riser (two screech voices gliding up an octave), a stinger cluster (root, b2, tritone, b9, #11)
and a boom.

## FM engine

- Sine table: 4,096 entries with linear interpolation; phase in cycles.
- Operator: `out = sin(2pi(phase + mod)) * env * level`, with `phase += f/fs * pitchMul`.
  Operator 1 feedback adds `(out[n-1] + out[n-2]) / 2 * FB[fb]`, `FB = [0, 1/32 .. 2]` cycles.
- Modulation depth: a modulator at level 1.0 swings its target by 2 cycles (4 pi rad), scaled by velocity
  (0.55 + 0.45 v), so harder notes are brighter.
- Algorithms: the eight YM2612 routings as data (`inputs[i]`, `carriers`), evaluated in operator order.
- Envelope: linear attack, exponential decay to sustain, optional sustain decay, exponential release;
  60 dB fall per stated time; `choke` forces a 50 ms release.
- Voice: LFO vibrato and tremolo and the pitch glide update every 32 samples (control rate).
- Renderer: per-track polyphony limits with voice stealing, exact sample-accurate note starts, a reverb
  send (Freeverb topology), then the master chain: DC blocker, 11 kHz two-pole low-pass, 4 dB drive into a
  tanh soft limiter, raised-cosine fades (the fade-out never starts before the last sting plus 0.6 s), and
  normalization to a -1 dBTP true peak measured with 4x windowed-sinc oversampling.
- Loudness: integrated loudness per ITU-R BS.1770 (bilinear K-weighting that matches the 48 kHz table at any
  rate, 400 ms blocks at 75% overlap, -70 LUFS absolute gate, -10 LU relative gate). Each mood has a
  ceiling (chase -14, ritual -15, dread and stalker -16, lullaby -18 LUFS); a louder cue is turned down to
  it. Gain only goes down, so the true-peak ceiling still holds.
- WAV: canonical RIFF header, TPDF dither from a seeded generator, clamping.

## Web app

Vanilla TypeScript and Canvas. `main.ts` wires the form to the director, posts the Score to the render
worker, loads the result into a Web Audio player, and draws three views each animation frame: the timeline
(sections, intensity, note lanes, cues, playhead, waveform overview), the FS-666 channel view (operator pads
lit by envelope frames sampled at 30 fps during the render, copper traces for each algorithm, note readout,
three-second envelope history) and an oscilloscope from an AnalyserNode.

## Error handling

- Schema errors name the field (`sections.2: section runs past durationSec`).
- The CLI exits 1 with `fright-score: <message>`; the web app shows the message in the status pill.
- The worker reports render errors as messages instead of crashing.

## Testing strategy

- Unit (Vitest): sine accuracy, envelope stage timing, operator pitch, level, FM sidebands and feedback,
  algorithm routing and carrier counts, every patch finite, schema rejections, scene parsing, composer
  determinism and constraints, arranger silence windows and sting placement, master limiter, fades and
  true peak, WAV header and round trip, renderer length, ceiling, sting onset within 50 ms, frames,
  determinism by seed, director adapters with fake clients, BS.1770 loudness against the reference
  coefficients and the -3.01 LUFS sine, and mood loudness ceilings.
- CLI (Vitest): runs the real `npm run score` and parses the WAV; checks byte-identical reruns and errors.
- End to end (Playwright on the built app): scene to ready, play moves the playhead, WAV and JSON export are
  valid, browser export equals the CLI export byte for byte, invalid input explained, phone width.

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
  tanh soft limiter, raised-cosine fades (a 0.3 s fade-in; the fade-out never starts before the last sting plus 0.6 s), and
  normalization to a -3 dBTP true peak measured with 4x windowed-sinc oversampling.
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

## Cursed datasheet look

The look is pure presentation (CSS and inline SVG in `index.html` + `src/web/styles.css`); no engine, score or
director code is touched, no new dependencies are added, and no image file exceeds 20 KB.

- Candle-flicker: a faint `@keyframes` glow animates the masthead `h1` text-shadow (a warm candle wash with a
  flicker of blood). It is the only motion added; the existing global
  `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }` rule turns it off, so a
  reduced-motion device sees a steady glow. A Playwright test asserts the computed `animationName` is the
  flicker by default and `none` under emulated reduced motion.
- Accents: the datasheet spec table gains a blood-red top rule; the chip oscilloscope seam and the live-panel
  seams take an ectoplasm (sickly green) tint. These are border/box-shadow colors only — text stays on the
  existing high-contrast silk-on-mask palette, so WCAG AA holds.
- Torn and water-stained edges: the masthead foot is a jagged torn rule (an inline-SVG background strip in
  the padding band, no layout impact); the panels (direction form, chip wrap, live panel) get faint
  water-stain radial gradients layered behind their content as additional `background-image` layers.
- Microcopy: the pre-cue empty states (`#cue-meta`, `#director-notes`, `#live-status`) use spookier wording
  without changing any protected string, element id, heading or button accessible name.
- Constraints: no fixed widths are added; the 360 px no-horizontal-scroll guarantee (Req 8.7) is preserved
  because every addition is a background layer, a color, or a thin strip in padding — none affect layout
  box width.

## Demo render polish and the possessed chip (Requirements 15 and 16)

- The render label is placed by `progressLabelBox(width, labelWidth)` in `timeline.ts` (8 px from the top and the
  right edge) and its box is published as `data-progress-label-x/y/w` on the canvas while a render runs.
- The Listen overlay's phone rules sit in the existing 520 px media block. `main.ts` adds `.listen--passed` when
  the render fraction exceeds the playhead fraction and the button's right edge; it stays until the next summon.
- `summon()` validates both fields before it touches the running render. Progress and landing messages go through
  `setProgressStatus`, which yields to a visible field error; `restingStatus()` restores the status once the
  errors clear.
- During the demo render `summonCue(..., { demo: true })` leaves Summon enabled and enables Download WAV at once.
  A WAV click sets `wavQueued`; the landing code downloads the file. The Genesis button waits only for
  `prepareDemoGenesis`, which fetches `samples/cellar-dread-genesis.vgm` (and arranges the VGM itself if the fetch
  fails). A new summon clears both.
- `ghost.ts` picks one of eight three-word messages with `createRng(seed).fork('ghost')`. `StitchView.haunt()`
  rewrites the newest rows on a fixed timer sequence (90, 60, 90, 50, 120, 40, 260 ms), or holds still for
  1.5 s under reduced motion. The rows get `aria-hidden` and `data-ghost`; `#ghost-announce` is the one polite
  live region.
- `gd3Notes()` in `vgm.ts` adds "Ghost note: <scene>" to the GD3 notes field. Only the VGM changes; the render and
  WAV code are untouched.

## Drop into Godot and the chip panel at rest (Requirements 18 and 19)

- `src/export/zip.ts` writes method-0 entries with a UTF-8 name flag and the DOS date 1980-01-01, so the bytes depend only on
  the files. `readZip` walks the central directory and checks every CRC-32; the tests and Playwright use it.
- `src/export/godot.ts` imports the five add-on files with `?raw`. The loop request is the cue's mood and a seed derived from the
  cue seed (`godotFileSeed`), 8 to 16 s, `loop: true`. The sting score follows the `score_level` rule: a 5 s cue with the hit at 1 s
  and a silence cue before it, matching the add-on's defaults (`sting_hit_sec` 1.0, `pre_silence_sec` 0.6). The page renders both
  in a fresh instance of `render.worker.ts`, so the cue's own render is untouched, and uses the local director so the pack works offline.
- `ChipView` precomputes each lane's carrier level per frame, reduces it to one value per ribbon pixel (`envelopeGhost`) and draws it
  dim under the live line with a cursor at `position / duration`. Collapsed, it shows `pickLanes` of the lanes with voices at the
  playhead frame, re-picked at most every 0.5 s of playhead time. The canvas publishes `data-ghost-lanes`, `data-ghost-peak`,
  `data-lane-count`, `data-lanes-shown` and `data-cursor`.
- Below 520 px the ribbon would not fit beside the pads, so `chipLayout` gives the row 22 px more height and puts the ribbon under the
  pads. The live keyboard row keeps `rowLayout`.
- `#chip-panel` is always a `<details class="chip-wrap">`. `main.ts` sets `open` from `(max-width: 519.98px)`; the summary is hidden by CSS
  at 520 px and wider. The chip keeps drawing while closed, so its `data-` attributes stay current; only the scope waits for it to open.

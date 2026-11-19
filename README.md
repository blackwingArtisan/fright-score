# Fright Score

**A 2026 AI directs a haunted 1990s FM synth chip, and the scare lands on the exact second you ask for.**

Type a scene, such as "A music box winds down in the nursery, 45 seconds, jump scare at 0:40". Fright Score
writes an original horror cue for it and renders the cue in your browser on the FS-666, a recreated
four-operator FM chip. You get a royalty-free WAV, a seamless game loop or a Sega Genesis file. The sting
lands within 50 ms of the time you typed.

![The demo cue: the riser climbs, the board goes silent, and the sting lands at 1:10 with a blood flash](docs/sting.gif)

[Hear the samples](#hear-it) · [60-second tour](#the-60-second-tour) · [Run it](#run-it) · [How Kiro built it](#built-with-kiro) · MIT licensed

## The problem

It is hour 60 of a 72-hour horror game jam. The cellar level needs a creeping loop, and the door slam needs
a jump-scare sting that hits on cue, tonight. The track you found on a video site has unclear rights. Stock
libraries sell stingers one at a time. An AI song generator returns a three-minute song with no control over
when the scare lands, and Suno's free plan carries no commercial rights.

Horror is one of the biggest genres in indie games: **itch.io lists [112,036 games tagged Horror](https://itch.io/games/tag-horror)**
(November 2026), and a single jam such as [GMTK 2025](https://itch.io/jam/gmtk-2025/results) drew 9,513 entries in four
days. Most of these games come from solo developers and small jam teams with no audio budget.

## The 60-second tour

1. Open the app. The demo cue, "Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10", is
   already rendered. Press **Listen** on the timeline.
2. Press **Jump to the scare**. In six seconds you hear the riser climb, the board go silent for 0.6 s and
   the sting land. The page flashes blood red, the timeline shakes and the chip's pads flare.
3. Watch **The stitch**: the AI director's plan as JSON on the left, the Sega Genesis sound-chip register
   writes it becomes on the right, scrolling with the playhead.
4. Type your own scene, or pick a mood (dread, stalker, chase, lullaby, ritual), and press **Summon the
   score**. The render sweeps across the timeline in a few seconds.
5. Press **Download WAV**, tick **Seamless loop for games** for a loop with loop points, or press
   **Download for Sega Genesis**.
6. Press A to K on your keyboard to play the chip yourself, live.

## Why it's a Frankenstein

Fright Score stitches together two things from 35 years apart. A modern AI director reads a scene and writes
a score plan: key and mode, tempo, sections that build, a motif, and the exact cue points. A recreation of
the four-operator FM chip inside the Sega Genesis (the Yamaha YM2612) performs it. Neither half could make
the cue alone. The director has no sound, and the chip has no idea where the scare goes. The stitch is
visible in the app: the plan's JSON sits beside the register writes it turns into, and any cue exports as a
`.vgm` file of real YM2612 register writes that Genesis emulators and VGM players can play.

## Why now

In June 2024 the major record labels sued Suno and Udio over the recordings used to train their models
([RIAA](https://www.riaa.com/record-companies-bring-landmark-cases-for-responsible-ai-againstsuno-and-udio-in-boston-and-new-york-federal-courts-respectively/)).
Fright Score has no training data. Every cue comes from music-theory rules, a seeded Markov composer and an
FM synthesizer. The same request and seed give the same file, byte for byte, on any machine. Anyone can
re-render a cue from its share link and check where it came from.

## Why not an AI song generator or a free library?

| | Fright Score | AI song generators (Suno, Udio) | Free libraries (YouTube Audio Library, Pixabay) |
|---|---|---|---|
| Scare on the second you choose | Yes, within 50 ms | No | No, you edit it in |
| Seamless game loop with loop points in the WAV | Yes (`smpl` chunk; [Godot example](examples/godot)) | No | Rarely |
| Commercial use | Yes, free | Paid plan needed (Suno's free plan has no commercial rights) | Depends on each track's license |
| Re-render the exact same file later | Yes, byte for byte from the seed | No | Not applicable |
| Trained on other people's recordings | No training data at all | The subject of the 2024 label lawsuits | Not applicable |
| Works offline, no account | Yes, in the browser or the CLI | No | Download needed |
| Sega Genesis export | Yes (`.vgm`) | No | No |

## Hear it

Rendered with the CLI by [`scripts/make-samples.sh`](scripts/make-samples.sh):

- [`cellar-dread-sting-at-1m10s.mp3`](samples/cellar-dread-sting-at-1m10s.mp3): the demo cue, 90 s, sting at 1:10.
- [`music-box-jump-scare-at-40s.mp3`](samples/music-box-jump-scare-at-40s.mp3): a lullaby that breaks at 0:40.
- [`stalker-seamless-loop.mp3`](samples/stalker-seamless-loop.mp3): a 20-second loop for a game level.
- [`cellar-dread-genesis.vgm`](samples/cellar-dread-genesis.vgm): the demo cue for the Sega Genesis (26 KB of
  YM2612 register writes). Open it in any VGM player or Genesis emulator.

![Fright Score mid-cue: the timeline, transport and the FS-666 channels lit](docs/screenshot.jpg)

## Kiroween 2026

- **Category:** Frankenstein. An AI director stitched to a recreated 1990s FM chip, with a Sega Genesis export.
- **Built with Kiro:** specs with EARS requirements, steering, three hooks and a logged Kiro CLI agent pass. See
  [Built with Kiro](#built-with-kiro) and [`KIRO-LOG.md`](KIRO-LOG.md).
- **AWS:** the director has an Amazon Bedrock adapter (Converse API, validated with zod) and a Cloudflare
  Pages Function for it. The free local director is the default.

## Beyond Kiroween

- **Free web app** for anyone scoring a jam game, a stream or a trailer.
- **Paid tier:** stems for each layer, mood packs and Bedrock-directed cues, for example $5 a month.
- **Engine plugins:** a Godot add-on first (the [example](examples/godot) already loops an export with no code),
  then Unity and FMOD.
- **Market:** 112,036 horror games on itch.io alone, and jams of nearly 10,000 entries that each need audio by
  the deadline.
- **Retro scene:** VGM export opens the door to homebrew Genesis games and chiptune artists.

## What works today

<details>
<summary>Every feature, in detail</summary>

- The page opens on a real cue: the "Cellar dread" demo is rendered and ready to play, with a **Listen**
  button that names when the scare lands and a **Jump to the scare** button that starts six seconds before it.
- Type a scene ("Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10") or pick one of five
  moods: dread, stalker, chase, lullaby, ritual. The app shows what it understood as you type.
- The director turns it into a plan you can read: key and mode (Phrygian, Locrian, octatonic and more), tempo,
  sections with rising intensity, a Markov-composed motif, and cue points. Stings land within 50 ms of the
  requested time, out of a deliberate 0.6 s silence, after a riser and a racing heartbeat.
- When the playhead crosses a sting, the page reacts for 600 ms: a blood vignette, a two-frame shake with a
  chromatic split, the operator pads flaring and a red playhead. Under reduced motion it is a still red frame.
- The **FS-666** renders it: four-operator FM with all eight YM2612-style algorithms, operator-1 feedback,
  five-stage envelopes, LFO, pitch glides, ten horror patches, reverb and a mastering chain.
- Cues are rendered in a Web Worker by the same engine as the CLI, then played back sample-exact, so what
  you hear is byte for byte the file you download. While a cue plays, each channel's operators light up with
  the envelope levels recorded during the render, copper traces show the algorithm, the scope shows the
  output audio, and the vignette deepens with the intensity of the section.
- **The stitch:** the director's plan as JSON beside the YM2612 register writes of the same cue, in step with
  the playhead, named the way the chip's datasheet names them.
- **Sega Genesis export:** every patch is mapped onto YM2612 registers (algorithm, feedback, MUL, DT, TL and
  envelope rates fitted to the chip's rate table), the score is arranged for six FM channels (the sting always
  gets all six), and the result is a VGM 1.50 file with sample-accurate timing and loop points for loops.
- **Play the chip live:** a keyboard (on screen, or A to K) drives the FS-666 in real time in an
  AudioWorklet on the audio thread. Pick any of the ten patches and watch its operators and envelopes
  respond as you play. It runs the same operator code as the renderer, sample for sample.
- **Levels that fit the mood:** every cue is measured for integrated loudness (ITU-R BS.1770) and trimmed to
  its mood's ceiling, from -14 LUFS for a chase to -18 LUFS for a lullaby, under a -3 dBTP true peak.
- **Download WAV** (44.1 kHz, 16-bit, stereo, -3 dBTP true-peak ceiling, a 0.3 s fade-in and a clean fade-out)
  or the score as JSON.
- **Seamless loops for games:** whole bars, no fades, release tails wrapped onto the start, and loop points in
  the WAV (`smpl` chunk) that game engines and samplers read. The in-app player fades a loop in when it
  starts.
- **Same request and seed, same bytes.** The browser and the CLI produce identical files, and the share link
  reproduces the exact cue on any machine.
- **Accessible:** the timeline is a keyboard slider, errors appear next to their field, controls meet WCAG
  contrast, and on phones the cue comes before the form.
- **CLI** for batch scoring: `npm run score -- --mood dread --seconds 90 --seed 7 --out cue.wav`.

</details>

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev            # http://localhost:3120
```

Production build and preview:

```bash
npm run build
npm run preview        # http://localhost:3121
```

### CLI

```bash
npm run score -- --mood dread --seconds 90 --seed 7 --out cue.wav
npm run score -- --scene "A music box winds down in the nursery, 45 seconds, jump scare at 0:40" --out lullaby.wav
npm run score -- --mood chase --seconds 30 --sting 0:24 --seed 3 --out chase.wav --json chase.json
npm run score -- --mood stalker --seconds 20 --loop --out stalker-loop.wav
npm run score -- --mood ritual --seconds 60 --sting 0:50 --out ritual.wav --vgm ritual.vgm
npm run score -- --help
```

Output: 44.1 kHz, 16-bit stereo PCM WAV, true peak at or below -3 dBFS, integrated loudness at or below the
mood's ceiling (chase -14, ritual -15, dread and stalker -16, lullaby -18 LUFS), a 0.3 s fade-in that keeps the
first 50 ms at least 20 dB under the cue's peak, and a fade-out (the fade-out never starts before a late sting
lands). The CLI prints the loudness it measured, and it matches `ffmpeg -af ebur128` within 0.2 LU.

A 90-second cue renders in seconds. `npm run bench` times the demo cue from request to WAV bytes; on an Apple
M4 Max under heavy load (load average 67) it measured a median of 6.7 s, 13.5 times faster than real time.

## Test it

```bash
npx playwright install chromium   # once
npm test                          # typecheck + unit + CLI + end-to-end
npm run test:unit                 # Vitest: engine, score, director, WAV, Genesis export, CLI
npm run test:e2e                  # Playwright against the built app (port 3122, or set E2E_PORT)
```

The unit suite checks the FM math (sine table accuracy, envelope timing, operator pitch, FM sidebands,
feedback, all eight algorithms), the score schema, scene parsing, determinism by seed, sting timing within
50 ms, the true-peak ceiling, the opening level of every mood, BS.1770 loudness (reference coefficients, the
-3.01 LUFS sine, gating), mood loudness ceilings, fades, the WAV header and length, the live chip core
(sample-for-sample equal to the offline voice, release, polyphony, no clipping), and the Genesis export
(tuning within one cent, register mapping, the envelope rate model, the sting keying on at its exact sample,
loop points). Sample tests check that the committed samples and the Godot example are exactly what the CLI
exports today.

The end-to-end tests drive the real app: the demo cue is ready on first load, the Listen overlay and Jump to
the scare, the sting payoff and its reduced-motion version, the atmosphere following the cue, summon a cue,
play it, export the WAV and parse it, confirm the browser export equals the CLI export byte for byte, open a
share link in a fresh page and get the same file, export a loop with loop points, export and parse a VGM,
the stitch panel at the sting, keyboard scrubbing, inline form errors, the phone layout, and play the live
chip so the AudioWorklet reports voices and real output.

## Architecture

```
 request ──> Director ──> ScorePlan ──> reconcile ──> Arranger ──> Score ──> FS-666 engine ──> master ──> WAV
 (scene,     local |       (zod)        (length,      (seeded,     (notes)   (Web Worker       (limiter,  (16-bit,
  mood,      bedrock |                   stings)       per-role)              or Node CLI)      -3 dBTP)   dither)
  seed)      remote                                                  │
                                                                     └──> YM2612 mapping ──> six-channel arrangement ──> VGM

 keyboard ──> LiveChip ──> AudioWorklet (LiveChipCore: same Voice / Operator / Envelope) ──> analyser ──> speakers
```

| Folder | What lives there |
|---|---|
| `src/engine/` | The chip: sine table, envelope, operator, 8 algorithms, voice, patches, reverb, master, loudness, renderer |
| `src/score/` | Schemas, music theory, seeded RNG, scene reader, local composer (Markov motifs), arranger |
| `src/director/` | Director interface and adapters: local, Amazon Bedrock, remote |
| `src/export/` | Sega Genesis export: YM2612 register mapping, six-channel arrangement, VGM writer and parser |
| `src/wav/` | WAV encoder and parser |
| `src/cli/` | `npm run score` |
| `src/server/`, `functions/` | `/api/compose` handler and its Cloudflare Pages Function |
| `src/web/` | Browser app: form, render worker, player, timeline, chip view, stitch panel, scope |
| `src/web/live/` | The real-time chip: AudioWorklet processor, its testable core, page-side controller |
| `examples/godot/` | A Godot 4 project that loops an export with no code, plus a headless check |
| `samples/` | Listening samples and a VGM, rendered by `scripts/make-samples.sh` |
| `tests/` | `unit/`, `cli/`, `e2e/` |

The engine has no DOM dependency, so the browser worker and the CLI run exactly the same code.

## Adapters: local and real

| Service | Default (free, offline) | Real path (written and type-checked, not run by default) | Switch |
|---|---|---|---|
| AI director | `LocalDirector`: rule-based scene reader plus seeded Markov composer | `BedrockDirector`: Amazon Bedrock Converse API returns ScorePlan JSON, validated with zod, one repair round | `FRIGHT_DIRECTOR=bedrock` (CLI) |
| Web AI director | `LocalDirector` in the browser | `RemoteDirector` POSTs to `/api/compose`, a Pages Function that runs the Bedrock director server-side | `VITE_FRIGHT_DIRECTOR=remote` at build time |

Whatever the director returns, `reconcilePlan` forces the requested length and sting times, and the same
schema validates it, so an AI plan can never break the renderer. Tests use fake clients; no test calls a
paid service. See `.env.example`.

## Deploy

Static hosting on **Cloudflare Pages** (free tier): build command `npm run build`, output folder `dist`.
The optional `/api/compose` function in `functions/` needs AWS credentials as Pages secrets.

## Built with Kiro

| Kiro feature | Files | What it does here |
|---|---|---|
| Specs | [`.kiro/specs/fright-score-core/`](.kiro/specs/fright-score-core), [`.kiro/specs/live-chip/`](.kiro/specs/live-chip) | EARS requirements, a design and a task plan for the director, arranger, engine, WAV, CLI, web app and loudness, and for the real-time AudioWorklet keyboard and the first-load demo cue. |
| Steering | [`.kiro/steering/`](.kiro/steering) | Product, tech and structure rules Kiro loads for every task: determinism by seed, the adapter rule, units in names, the folder map. |
| Hooks | [`.kiro/hooks/`](.kiro/hooks) | `test-on-save` runs the unit tests when engine, score, director, WAV or live-chip code is saved. `determinism-guard` blocks unseeded randomness (`Math.random`, `Date.now`) in engine and composer code. `spec-task-sync` is an agent hook that checks off finished tasks and asks for a green suite before the agent stops. |
| Agent run with sub-agents | [`KIRO-LOG.md`](KIRO-LOG.md), pass 2 | Kiro CLI audited both specs against the code with two sub-agents, rewrote every acceptance criterion in strict EARS form, added 27 tasks for behaviors no test pinned down, built the candlelit theme and its reduced-motion test, and validated the hooks against the v1 schema (29.38 credits). |

[`KIRO-LOG.md`](KIRO-LOG.md) records every Kiro call, its prompt, what it produced and the credits it used.

## License

MIT, by Stubborn Otter Software. Cues you render are yours to use anywhere, royalty-free.

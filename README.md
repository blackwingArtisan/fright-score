# Fright Score

**Describe a scene, get an original horror score.** An AI director writes the plan, and an emulated
1990s FM synthesis chip plays it live in your browser. Download the result as a royalty-free WAV.

![Fright Score: the FS-666 channel view playing a cue](docs/screenshot.png)

## Who it is for

- **Indie game developers** who need a creepy loop or a stinger tonight, without licensing risk.
- **Video creators, streamers and podcasters** scoring a horror segment or trailer.
- **Escape-room and tabletop hosts** who want a cue that builds to a scare at an exact second.
- **Hackathon teams** scoring their demo videos from the command line (we score ours with it).

## What works today

- Type a scene ("Creeping dread in the cellar, 90 seconds, builds to a sting at 0:70") or pick one of five
  moods: dread, stalker, chase, lullaby, ritual. The app shows what it understood as you type.
- The director turns it into a plan you can read: key and mode (Phrygian, Locrian, octatonic and more), tempo,
  sections with rising intensity, a Markov-composed motif, and cue points. Stings land within 50 ms of the
  requested time, out of a deliberate 0.6 s silence, after a riser and a racing heartbeat.
- The **FS-666** renders it: four-operator FM with all eight YM2612-style algorithms, operator-1 feedback,
  five-stage envelopes, LFO, pitch glides, ten horror patches, reverb and a mastering chain.
- The board shows the chip working while the cue plays: each channel's operators light up with their
  envelopes, copper traces show the algorithm, and a timeline shows every note and cue.
- **Download WAV** (44.1 kHz, 16-bit, stereo, -1 dBTP true-peak ceiling, clean fades) or the score as JSON.
- **Seamless loops for games:** whole bars, no fades, release tails wrapped onto the start, and loop points in
  the WAV (`smpl` chunk) that game engines and samplers read.
- **Same request and seed, same bytes.** The browser and the CLI produce identical files, and the share link
  reproduces the exact cue on any machine.
- **CLI** for batch scoring: `npm run score -- --mood dread --seconds 90 --seed 7 --out cue.wav`.

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
npm run score -- --help
```

Output: 44.1 kHz, 16-bit stereo PCM WAV, true peak held at -1 dBFS, fade-in and fade-out (the fade-out never
starts before a late sting lands). A 90-second cue renders in about 2 seconds.

## Test it

```bash
npx playwright install chromium   # once
npm test                          # typecheck + unit + CLI + end-to-end
npm run test:unit                 # Vitest: engine, score, director, WAV, CLI
npm run test:e2e                  # Playwright against the built app (ports 3122)
```

The unit suite checks the FM math (sine table accuracy, envelope timing, operator pitch, FM sidebands,
feedback, all eight algorithms), the score schema, scene parsing, determinism by seed, sting timing within
50 ms, the true-peak ceiling, fades, and the WAV header and length. The end-to-end tests drive the real app:
summon a cue, play it, export the WAV and parse it, confirm the browser export equals the CLI export byte
for byte, open a share link in a fresh page and get the same file, and export a loop with loop points.

## Architecture

```
 request ──> Director ──> ScorePlan ──> reconcile ──> Arranger ──> Score ──> FS-666 engine ──> master ──> WAV
 (scene,     local |       (zod)        (length,      (seeded,     (notes)   (Web Worker       (limiter,  (16-bit,
  mood,      bedrock |                   stings)       per-role)              or Node CLI)      -1 dBTP)   dither)
  seed)      remote
```

| Folder | What lives there |
|---|---|
| `src/engine/` | The chip: sine table, envelope, operator, 8 algorithms, voice, patches, reverb, master, renderer |
| `src/score/` | Schemas, music theory, seeded RNG, scene reader, local composer (Markov motifs), arranger |
| `src/director/` | Director interface and adapters: local, Amazon Bedrock, remote |
| `src/wav/` | WAV encoder and parser |
| `src/cli/` | `npm run score` |
| `src/server/`, `functions/` | `/api/compose` handler and its Cloudflare Pages Function |
| `src/web/` | Browser app: form, render worker, player, timeline, chip view, scope |
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
The optional `/api/compose` function in `functions/` needs AWS credentials as Pages secrets. Not deployed
from this repository.

## Built with Kiro

- [`.kiro/steering/`](.kiro/steering): product, tech and structure rules that Kiro loads for every task
  (determinism by seed, the adapter rule, units in names, the folder map).
- [`.kiro/specs/fright-score-core/`](.kiro/specs/fright-score-core): EARS requirements, design and the task
  plan the implementation follows.
- [`.kiro/hooks/`](.kiro/hooks): runs the unit tests when engine code is saved, blocks unseeded randomness
  (`Math.random`) in engine and composer code, and keeps the task list in sync.
- [`KIRO-LOG.md`](KIRO-LOG.md): every Kiro CLI call, its prompt, what it produced and what it reported.

## License

MIT, by Stubborn Otter Software. Cues you render are yours to use anywhere, royalty-free.

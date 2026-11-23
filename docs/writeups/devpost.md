# Devpost write-up: Fright Score

**Tagline:** The AI writes the sheet music, never the sound.

**Category:** Frankenstein. **Live:** https://fright-score.pages.dev · **Code (MIT):** https://github.com/blackwingArtisan/fright-score

## Inspiration

It is hour 60 of a 72-hour horror game jam. The cellar level needs a creeping loop, and the door needs a sting
that hits when the player opens it. Stock sites sell that for about $18 to $48 (a $9 to $39 track plus $3
stingers on AudioJungle). Free CC0 libraries are recordings cut for someone else's game. AI song generators
return a song with no control over the second the scare lands. We wanted a tool that writes the cue for the
scene, lands the scare on cue, and hands over a file the developer owns.

## What it does

Type a scene, such as "A music box winds down in the nursery, 45 seconds, jump scare at 0:40". Fright Score
writes an original horror cue and renders it in the browser on the FS-666, a recreated four-operator FM chip
modeled on the Sega Genesis YM2612.

- The sting lands within 50 ms of the second you ask for, out of a planned 0.6 s silence.
- In a game, the scare lands on the event: the door scene in the browser and the Godot add-on cut the loop,
  start the sting at the top of its silence, and measure the hit 0.6 s later.
- Export a WAV, a seamless game loop with loop points, or a `.vgm` of real YM2612 register writes that a
  Genesis emulator plays.
- Same request and seed, same bytes, in the browser and the CLI. The page checks its live render of the demo
  against the published sha256.
- An MCP server lets an agent score a cue or a whole level and verify the timing of what it got.

## How we built it: the Frankenstein

Two parts from 35 years apart, neither of which can make a cue alone.

- **The director** writes a score plan: key and mode, tempo, sections that build, a motif and the cue points.
  By default it is a rule-based scene reader with a seeded Markov composer, offline and free. The Amazon
  Bedrock director writes the same plan through a forced `score_cue` tool call whose input schema is generated
  from the zod ScorePlan schema, with a repair loop for rejected input. It is tested against a fake client; the
  public site runs the offline director.
- **The FS-666** performs it: all eight YM2612 algorithms, operator feedback, five-stage envelopes, an LFO,
  reverb and a mastering chain with a -3 dBTP ceiling and BS.1770 loudness per mood. It has never heard a
  recording.

The stitch is on screen: the plan's JSON beside the register writes it becomes, scrolling with the playhead.

Stack: TypeScript, Vite, vanilla DOM, a Web Worker renderer, an AudioWorklet live keyboard, zod, the AWS SDK
Bedrock Runtime client, Vitest and Playwright. Hosted on Cloudflare Pages.

## How Kiro was used

Kiro is in the workspace and in the build log: 5 specs, 5 steering files (always, fileMatch, manual), 4 kiro-cli hooks, 3 IDE hooks, 1 custom agent, 3 MCP servers including its own.

**Kiro by the numbers:** 15 logged Kiro calls, 180.74 credits, 8,070 lines written by Kiro with 0 lines fixed.
Every call, its prompt, its credits and the lines it wrote are in
[KIRO-LOG.md](https://github.com/blackwingArtisan/fright-score/blob/main/KIRO-LOG.md), with a transcript excerpt
for each session in `docs/kiro-sessions/`.

- **Specs.** Five specs with EARS acceptance criteria. Kiro wrote three of them itself in headless `kiro-cli`
  sessions (the Bedrock tool call and MCP server, the browser door scene, and scoring a whole game level from an
  agent) and built every task, running typecheck, Vitest and Playwright itself.
- **Steering** in all three inclusion modes: product, tech and structure always; DSP hot-loop rules only when
  engine files are in context; export formats pulled in by hand.
- **Hooks.** A determinism guard blocks `Math.random` and `Date.now` in engine and composer code, a test-on-save
  hook runs the unit suite, and a `Stop` hook makes Kiro tick its tasks and rerun the suite before it stops. The
  logs show that second turn after every build session that finished.
- **A custom agent.** `fs666-sound-designer` is a scoped sound designer whose rules allow writes only to engine
  code and unit tests. Run headless, it designed the eleventh patch, a theremin lead, with its tests.
- **MCP, both ways.** Kiro used the aws-docs and context7 MCP servers while designing, built Fright Score's own
  MCP server, then called it: it scored the example Godot level (every hash equal to the committed manifest)
  and the demo video's soundtrack, and checked each sting with `verify_cue`.

## Challenges

- **Kiro headless, early on.** Our first two `kiro-cli` calls wrote nothing: an untrusted workspace turns the
  "create a spec folder" question into a denial in non-interactive mode, and the shared account was throttled.
  `--v3 --trust-workspace` fixed the first; running one Kiro session at a time fixed the second.
- **Silence is the hard part.** A sting only lands if the 0.6 s before it is truly quiet, so the arranger
  clears every voice and release tail in that window, and a test checks it.
- **Byte-for-byte determinism** across a Web Worker and Node meant no `Math.random`, no `Date.now` and seeded
  everything; a Kiro hook and a script guard it.

## Accomplishments

- A sting that lands within 50 ms, measured, in the browser, the CLI and Godot.
- A `.vgm` that an independent emulator (Game_Music_Emu's YM2612 core) plays with the hit at 70.04 s against
  70.00 s in the plan.
- Kiro specced and built features end to end, then called the project's own MCP server as a tool.
- 374 Vitest tests and 67 Playwright tests, green from a clean checkout, plus a smoke test against the live site.

## What we learned

Make the output checkable. A sha256 per cue turned "it sounds right" into a test, for us and for an agent.

## What's next

A free core forever; a one-time $9 Engine Pack (Unity and FMOD plugins, stems, game-event sting sets); and
metered per-cue MCP pricing for AI game-building platforms, whose agents now build whole jam games.

## Built with

kiro, typescript, vite, web-audio, audioworklet, amazon-bedrock, zod, mcp, vitest, playwright, cloudflare-pages, godot

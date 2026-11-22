# The AI writes the sheet music, never the sound

*How Fright Score stitches a score director to a recreated Sega Genesis sound chip, and how Kiro specced,
built and now calls it. A build log for Kiroween 2026.*

It is hour 60 of a 72-hour horror game jam. The cellar level needs a creeping loop, and the door needs a
jump-scare sting that hits the moment the player opens it. Stock sites sell music one track at a time, free
libraries hand you a recording that was cut for somebody else's game, and an AI song generator returns a
song with no idea where your scare goes.

Fright Score is a small tool for that moment. You type a scene, such as "A music box winds down in the
nursery, 45 seconds, jump scare at 0:40", and it writes an original horror cue whose sting lands within
50 ms of the second you asked for. It runs in the browser at [fright-score.pages.dev](https://fright-score.pages.dev/),
from a command line, or as an MCP server an agent can call.

## Two halves, 35 years apart

Fright Score is a Frankenstein in the literal sense: two parts that could not make a cue on their own.

**The director** reads the scene and writes a score plan: key and mode, tempo, sections that build, a motif
and the exact cue points. By default it is a rule-based scene reader with a seeded Markov composer, so it
runs offline and free. An Amazon Bedrock adapter can write the same plan through a forced `score_cue` tool
call whose input schema is generated from the zod ScorePlan schema. The Bedrock path is written and tested
against a fake client; the public site runs the offline director.

**The FS-666** is a recreation of the four-operator FM chip inside the Sega Genesis, the Yamaha YM2612:
all eight algorithms, operator feedback, five-stage envelopes and an LFO. It performs the plan. It has never
heard a recording, and there is no training data anywhere in the pipeline.

The stitch is visible in the app. The plan's JSON sits beside the YM2612 register writes it becomes,
scrolling with the playhead, and any cue exports as a `.vgm` file that a Genesis emulator plays. That is
the line we kept coming back to: the AI writes the sheet music, never the sound.

## The scare lands on the event

A game does not know at which second the player opens the door, so a timestamp is not enough. Every sting
Fright Score writes sits at the end of a planned 0.6 s silence. When the event fires, the loop cuts, the
sting file starts at the top of that silence, and the hit lands 0.6 s later, out of the quiet. The browser
door scene and the Godot add-on play the same two files, and both measure the offset.

## Same request, same seed, same bytes

Every cue is reproducible. The browser worker and the CLI run the same engine, so the WAV you download is
byte for byte the file `npm run score` writes, and the share link rebuilds it on any machine. The page
checks its own live render against the published sha256 of the demo cue. That property turned out to be
what made the agent workflow possible: an agent can ask for a cue, get a hash back, and check it later.

## How Kiro built it

The project uses Kiro the way it is meant to be used: specs, steering, hooks, a custom agent and MCP.

- **Specs.** Each feature starts as `requirements.md` with EARS acceptance criteria, a `design.md` and a
  `tasks.md`. Kiro wrote the later specs itself in headless `kiro-cli` sessions, then built their tasks one
  layer per session, running typecheck, Vitest and Playwright itself.
- **Steering.** Five steering files cover product rules, the tech stack, the folder map, DSP hot-loop rules
  (loaded only when engine files are in context) and export formats (pulled in by hand).
- **Hooks.** A determinism guard rejects `Math.random` and `Date.now` in engine and composer code, a
  test-on-save hook runs the unit suite, and a `Stop` hook makes Kiro tick its tasks and run the suite
  before it finishes.
- **A custom agent.** `fs666-sound-designer` is a scoped sound designer: its rules allow writes only to engine
  code and unit tests. It designed the eleventh patch, a theremin lead with a wide, slightly unstable vibrato.
- **MCP, both ways.** Kiro used the aws-docs and context7 MCP servers while designing, then built Fright
  Score's own MCP server and called it from a new session. The hash it got back matched the README. Later
  sessions used it for real work: Kiro scored a two-room Godot level and the demo video's soundtrack through it,
  then measured every sting with the server's `verify_cue` tool.

Every session, its prompt, its credits and the lines it wrote are in
[KIRO-LOG.md](https://github.com/blackwingArtisan/fright-score/blob/main/KIRO-LOG.md).

## What we learned

- **Make the output checkable.** A sha256 per cue turned "it sounds right" into a test, for us and for an agent.
- **Plan the silence.** The scare is not the loud part; it is the 0.6 s before it.
- **Give the agent a narrow door.** The scoped sound-design agent and the determinism hook kept Kiro's
  changes reviewable.

Try it at [fright-score.pages.dev](https://fright-score.pages.dev/). The code is MIT licensed at
[github.com/blackwingArtisan/fright-score](https://github.com/blackwingArtisan/fright-score), and every cue
you render is yours to use anywhere.

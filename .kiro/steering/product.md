---
inclusion: always
---
# Product: Fright Score

Fright Score composes original, royalty-free horror music. A "director" turns a mood or a
scene description into a structured score plan (by default a rule-based scene reader with a seeded
Markov composer; an Amazon Bedrock model when switched on), a deterministic arranger realizes it into notes,
and an emulated 1990s four-operator FM synthesis chip (the "FS-666", modeled on the Yamaha
YM2612 family) renders it to audio in the browser or offline from a CLI.

The one-line rule for every piece of copy: the AI writes the sheet music, never the sound.

## Who it is for
- Retro and PSX-style horror developers (itch.io lists 5,268 games tagged Horror and PSX), for whom
  a Genesis-era FM chip is the period-correct sound.
- Indie game developers who need a creepy loop or a stinger tonight, without licensing risk.
- Video creators, streamers and podcasters scoring a short horror segment or a trailer.
- Horror tabletop and escape-room game masters who run a session every week and need a cue that
  builds to a scare at an exact second; the share link brings back last week's cue byte for byte.
- Hackathon teams scoring their own demo videos (our first user is us).

## Price anchor
One horror track on AudioJungle is $9 to $39 and a stinger $3; Suno's cheapest plan with commercial
rights is $10 a month. Fright Score is free; a future Pro tier (stems, game-event stings, Bedrock
cues) is priced at $4 a month, under both.

## Core promises
1. Original: every cue is generated from rules and a seed, never sampled from existing music.
2. Royalty-free: the output belongs to the user; the app says so plainly next to every export.
3. Repeatable: the same request and seed always produce the same audio, byte for byte.
4. Timed: users can ask for a sting at an exact second and the sting lands there.
5. Solid files: WAV exports are 44.1 kHz, 16-bit, stereo, never clip, fade cleanly, and sit at a
   loudness that fits the mood.

## Experience principles
- One clear path: describe the scene or pick a mood, set the length, summon the score, listen, export.
- Show the machine: the chip's operators, envelopes and algorithms are visible while the cue plays.
- Let people play it: a real-time keyboard runs the same chip in an AudioWorklet.
- Never an empty stage: the first view is a real, playable demo cue.
- Say exactly what is live: cues are rendered, then played back sample-exact; only the keyboard is
  synthesized in real time. Copy must not blur the two.
- Explain the director: show the plan (tempo, key, mode, sections, cues) in plain words, and name
  which director wrote it. Never call the local director an AI model.
- The look is a cursed 1993 chip datasheet: gothic lettering stitched onto technical drawings.
- Works with no account, no network and no paid service. The AI director is an upgrade, not a gate.

## Non-goals
- A general-purpose DAW or MIDI editor.
- Sample playback or imitation of copyrighted themes.
- Server-side storage of user content.

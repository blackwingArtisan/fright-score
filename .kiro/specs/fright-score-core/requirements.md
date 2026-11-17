# Requirements: Fright Score core

## Introduction

Fright Score turns a mood or a scene description into an original, royalty-free horror cue. A director
(local rules by default, Amazon Bedrock as the AI path) writes a ScorePlan; a seeded arranger realizes it
into notes; an emulated four-operator FM chip renders it to audio in the browser or from a CLI. This spec
covers the full vertical slice: director, arranger, synthesis engine, WAV export, CLI and web app.

## Requirement 1: Direct a cue from a scene or a mood

**User story:** As a video creator, I want to describe my scene in plain words, so that the music fits
what happens on screen without me knowing music theory.

### Acceptance criteria

1. WHEN the user submits a scene description THE SYSTEM SHALL infer a mood (dread, stalker, chase, lullaby
   or ritual) from the words in the description.
2. WHEN the description contains a length such as "90 seconds", "1:30" or "2 minutes" THE SYSTEM SHALL use
   it as the cue length.
3. WHEN the description contains a cue time after a scare word, such as "sting at 0:70" or "scream at 1:20",
   THE SYSTEM SHALL add a sting at that time and SHALL NOT treat that time as the cue length.
4. WHEN the user also sets a mood, a length or sting times explicitly THE SYSTEM SHALL prefer the explicit
   values over the ones read from the description.
5. WHEN the description asks for a jump scare without a time THE SYSTEM SHALL place one sting near 80% of
   the cue, snapped to a bar line.
6. IF no mood can be inferred and none is selected THEN THE SYSTEM SHALL use "dread".
7. THE SYSTEM SHALL produce a ScorePlan containing title, mood, durationSec, tempoBpm, beatsPerBar, key
   (root and mode), sections (with intensity and layers), motif, cue points, patch palette and plain-language
   director's notes.
8. WHILE the user types a scene description THE SYSTEM SHALL show what it understood (mood, length, stings).

## Requirement 2: Validate every plan

**User story:** As an operator of the AI path, I want every plan checked against one schema, so that a
model's mistakes never reach the synthesizer.

### Acceptance criteria

1. THE SYSTEM SHALL validate every ScorePlan and Score with one shared schema, whichever director produced it.
2. IF a plan has a section that ends before it starts or runs past durationSec, a cue after the end, an
   unknown patch, mood or mode, or a motif whose rhythm and notes differ in length THEN THE SYSTEM SHALL
   reject it with a message naming the field.
3. WHEN a director plan disagrees with the user's requested length or sting times THE SYSTEM SHALL rescale
   sections and cues to the requested length and force the requested stings before arranging.

## Requirement 3: Arrange the plan into notes

**User story:** As a game developer, I want cues that build, breathe and land their scares, so that they
sound composed rather than random.

### Acceptance criteria

1. THE SYSTEM SHALL realize each plan into tracks for the roles its sections request: drone, heartbeat
   pulse, bass ostinato, motif, texture, choir and percussion.
2. WHEN a plan contains a sting THE SYSTEM SHALL add a tritone brass cluster and a falling boom at exactly
   the sting time, a riser that ends at the sting, and a 0.6 s silence window just before it.
3. WHILE a silence window is open THE SYSTEM SHALL start no new notes on non-stinger tracks and SHALL choke
   notes that would ring into it.
4. WHEN a silence window ends THE SYSTEM SHALL bring the drone back for the remaining sections.
5. WHILE a riser is building THE SYSTEM SHALL speed up the heartbeat and bass toward double time.
6. THE SYSTEM SHALL keep every note within 0..durationSec.

## Requirement 4: Determinism by seed

**User story:** As an editor, I want the same request and seed to give the same file, so that I can
re-export a cue months later and get exactly what I approved.

### Acceptance criteria

1. WHEN the same request and seed are rendered twice THE SYSTEM SHALL produce byte-identical WAV files.
2. WHEN the seed changes THE SYSTEM SHALL produce a different cue.
3. WHEN the same request and seed are rendered in the browser and in the CLI THE SYSTEM SHALL produce
   byte-identical WAV files.
4. THE SYSTEM SHALL draw all randomness in engine, score and director code from a seeded generator.

## Requirement 5: Emulate a four-operator FM chip

**User story:** As a chiptune fan, I want the sound to come from a real FM model, so that the cues have the
1990s console character.

### Acceptance criteria

1. THE SYSTEM SHALL synthesize each note with four sine operators using phase modulation.
2. THE SYSTEM SHALL support the eight YM2612-style routing algorithms and operator-1 self-feedback levels 0-7.
3. THE SYSTEM SHALL give each operator a frequency ratio, detune, output level and a five-stage envelope
   (attack, decay, sustain level, sustain decay, release).
4. THE SYSTEM SHALL provide a patch LFO for vibrato and tremolo, and per-note pitch glides.
5. THE SYSTEM SHALL read oscillator values from a sine lookup table.
6. THE SYSTEM SHALL limit voices per track and steal the oldest released voice first.

## Requirement 6: Solid audio output

**User story:** As someone scoring a video, I want files that drop straight into my editor, so that I never
fix levels or clicks by hand.

### Acceptance criteria

1. THE SYSTEM SHALL export 44.1 kHz, 16-bit, stereo PCM WAV with a canonical 44-byte header.
2. THE SYSTEM SHALL export exactly durationSec x 44,100 frames.
3. THE SYSTEM SHALL keep the true (inter-sample) peak at or below -1 dBFS.
4. THE SYSTEM SHALL fade in from silence and fade out to silence, and SHALL NOT start the fade-out before a
   late sting has landed.
5. WHEN a sting is requested THE SYSTEM SHALL place its audible onset within 50 ms of the requested time.
6. THE SYSTEM SHALL add a stereo reverb send, a DC blocker, an output low-pass and a soft limiter.

## Requirement 7: Command-line renderer

**User story:** As a team member scoring demo videos, I want a one-line command that writes a WAV, so that
I can batch cues without opening a browser.

### Acceptance criteria

1. WHEN the user runs `npm run score -- --mood dread --seconds 90 --seed 7 --out cue.wav` THE SYSTEM SHALL
   write the WAV and print the plan (sections, cues) and render stats.
2. THE SYSTEM SHALL accept `--scene`, `--sting` (comma-separated times), `--json` (write the Score) and
   `--director local|bedrock`.
3. IF an argument is invalid (unknown mood, length outside 5-300 s, unknown director) THEN THE SYSTEM SHALL
   exit with a non-zero code and a message naming the problem.

## Requirement 8: Browser app with a live chip view

**User story:** As a first-time visitor, I want to see and hear the chip work, so that I understand what
made my cue and trust the result.

### Acceptance criteria

1. WHEN the user summons a score THE SYSTEM SHALL render it in a Web Worker and show progress.
2. WHEN rendering finishes THE SYSTEM SHALL show the title, key, tempo, director's notes and a timeline of
   sections, intensity, notes, cues and playhead.
3. WHILE the cue plays THE SYSTEM SHALL show each channel's four operators, their algorithm routing and
   their envelope levels, plus an oscilloscope of the output.
4. WHEN the user clicks the timeline THE SYSTEM SHALL move the playhead there.
5. WHEN the user chooses Download WAV or Download score JSON THE SYSTEM SHALL save the exact rendered file.
6. IF the user enters an invalid length THEN THE SYSTEM SHALL say what range is allowed.
7. THE SYSTEM SHALL work at phone width with no horizontal scrolling.

## Requirement 9: Swappable AI director

**User story:** As the project owner, I want the AI director behind an adapter, so that the app works free
and offline today and switches to Amazon Bedrock with one setting.

### Acceptance criteria

1. THE SYSTEM SHALL define one Director interface with local, Bedrock and remote implementations.
2. THE SYSTEM SHALL use the local director unless `FRIGHT_DIRECTOR` (CLI) or `VITE_FRIGHT_DIRECTOR` (web)
   selects another.
3. WHEN the Bedrock director's reply fails validation THE SYSTEM SHALL send the errors back to the model
   once for repair, and IF the repair also fails THEN THE SYSTEM SHALL report the validation errors.
4. THE SYSTEM SHALL never call a paid service from tests or by default.

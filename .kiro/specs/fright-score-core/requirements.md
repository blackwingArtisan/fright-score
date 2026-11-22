# Requirements: Fright Score core

> **Who wrote this spec.** The first version was written by hand by the developer on 2026-11-16, from the
> prompt Kiro could not complete (both calls were throttled; see KIRO-LOG.md). Kiro reviewed it against the
> code in pass 2 on 2026-11-19 and rewrote every acceptance criterion in strict EARS form, and Kiro added
> Requirements 12 to 14 in session 7 and Requirements 15 and 16 in session 10, both on 2026-11-22.

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
3. a. WHEN the description contains a cue time after a scare word, such as "sting at 0:70" or "scream at
   1:20", THE SYSTEM SHALL add a sting at that time.
   b. WHEN the description contains a cue time after a scare word THE SYSTEM SHALL NOT treat that time as
   the cue length.
4. WHEN the user sets a mood, a length or sting times explicitly THE SYSTEM SHALL prefer the explicit values
   over the ones read from the description.
5. WHEN the description asks for a jump scare without a time THE SYSTEM SHALL place one sting near 80% of
   the cue, snapped to a bar line.
6. IF no mood can be inferred and none is selected THEN THE SYSTEM SHALL use "dread".
7. a. WHEN a director produces a plan THE SYSTEM SHALL return a ScorePlan with title, mood, durationSec,
   tempoBpm, beatsPerBar and key (root and mode).
   b. WHEN a director produces a plan THE SYSTEM SHALL return a ScorePlan with sections, each carrying an
   intensity and the layers its role requests.
   c. WHEN a director produces a plan THE SYSTEM SHALL return a ScorePlan with a motif, cue points, a patch
   palette and plain-language director's notes.
8. WHILE the user types a scene description THE SYSTEM SHALL show what it understood (mood, length, stings).
9. WHEN the description contains a hit phrase such as "hit at 0:50" THE SYSTEM SHALL add a hit cue at that
   time and SHALL NOT treat that time as the cue length.

## Requirement 2: Validate every plan

**User story:** As an operator of the AI path, I want every plan checked against one schema, so that a
model's mistakes never reach the synthesizer.

### Acceptance criteria

1. WHEN a director produces a ScorePlan or Score THE SYSTEM SHALL validate it against the one shared schema
   before it reaches the arranger or synthesizer.
2. a. IF a plan has a section whose endSec is at or before its startSec THE SYSTEM SHALL reject it naming the
   section.
   b. IF a plan has a section that runs past durationSec THE SYSTEM SHALL reject it naming the section.
   c. IF a plan has a cue after durationSec THE SYSTEM SHALL reject it naming the cue.
   d. IF a plan names an unknown patch, mood or mode THE SYSTEM SHALL reject it naming the field.
   e. IF a plan has a motif whose rhythm and notes differ in length THE SYSTEM SHALL reject it naming the
   motif.
3. a. WHEN a director plan's length differs from the requested length THE SYSTEM SHALL rescale its sections
   and cues to the requested length before arranging.
   b. WHEN a director plan omits the requested sting times THE SYSTEM SHALL force those stings before
   arranging.

## Requirement 3: Arrange the plan into notes

**User story:** As a game developer, I want cues that build, breathe and land their scares, so that they
sound composed rather than random.

### Acceptance criteria

1. WHEN a plan is arranged THE SYSTEM SHALL realize it into tracks for the roles its sections request:
   drone, heartbeat pulse, bass ostinato, motif, texture, choir and percussion.
2. a. WHEN a plan contains a sting THE SYSTEM SHALL add a tritone brass cluster at exactly the sting time.
   b. WHEN a plan contains a sting THE SYSTEM SHALL add a falling boom at exactly the sting time.
   c. WHEN a plan contains a sting THE SYSTEM SHALL add a riser that ends at the sting.
   d. WHEN a plan contains a sting THE SYSTEM SHALL add a 0.6 s silence window just before it.
3. a. WHILE a silence window is open THE SYSTEM SHALL start no new notes on non-stinger tracks.
   b. WHILE a silence window is open THE SYSTEM SHALL choke notes that would ring into it.
4. WHEN a silence window ends THE SYSTEM SHALL bring the drone back for the remaining sections.
5. WHILE a riser is building THE SYSTEM SHALL speed up the heartbeat and bass toward double time.
6. WHEN a plan is arranged THE SYSTEM SHALL keep every note within 0..durationSec.

## Requirement 4: Determinism by seed

**User story:** As an editor, I want the same request and seed to give the same file, so that I can
re-export a cue months later and get exactly what I approved.

### Acceptance criteria

1. WHEN the same request and seed are rendered twice THE SYSTEM SHALL produce byte-identical WAV files.
2. WHEN the seed changes THE SYSTEM SHALL produce a different cue.
3. WHEN the same request and seed are rendered in the browser and in the CLI THE SYSTEM SHALL produce
   byte-identical WAV files.
4. WHERE the engine, score or director code needs randomness THE SYSTEM SHALL draw it from the seeded
   generator.

## Requirement 5: Emulate a four-operator FM chip

**User story:** As a chiptune fan, I want the sound to come from a real FM model, so that the cues have the
1990s console character.

### Acceptance criteria

1. WHEN a note is synthesized THE SYSTEM SHALL use four sine operators with phase modulation.
2. a. WHEN a voice is synthesized THE SYSTEM SHALL support the eight YM2612-style routing algorithms.
   b. WHEN operator 1 carries feedback THE SYSTEM SHALL support self-feedback levels 0 through 7.
3. a. WHEN an operator is created THE SYSTEM SHALL give it a frequency ratio, detune and output level.
   b. WHEN an operator is created THE SYSTEM SHALL give it a five-stage envelope (attack, decay, sustain
   level, sustain decay, release).
4. a. WHEN a patch has an LFO THE SYSTEM SHALL apply vibrato and tremolo from it.
   b. WHEN a note has a pitch glide THE SYSTEM SHALL glide its pitch over the glide time.
5. WHEN an oscillator value is needed THE SYSTEM SHALL read it from the sine lookup table.
6. a. WHEN a track is rendered THE SYSTEM SHALL limit the number of simultaneous voices per track.
   b. WHEN a track exceeds its voice limit THE SYSTEM SHALL steal the oldest released voice first.

## Requirement 6: Solid audio output

**User story:** As someone scoring a video, I want files that drop straight into my editor, so that I
never fix levels or clicks by hand.

### Acceptance criteria

1. a. WHEN a cue is exported THE SYSTEM SHALL write a 44.1 kHz, 16-bit, stereo PCM WAV.
   b. WHEN a cue is exported THE SYSTEM SHALL use a canonical 44-byte header.
2. WHEN a cue is exported THE SYSTEM SHALL write exactly durationSec × 44,100 frames.
3. WHEN a cue is mastered THE SYSTEM SHALL keep the true (inter-sample) peak at or below -3 dBFS.
4. a. WHEN a non-loop cue is mastered THE SYSTEM SHALL fade in from silence over 0.3 s.
   b. WHEN a non-loop cue is mastered THE SYSTEM SHALL fade out to silence.
   c. WHEN a cue is mastered THE SYSTEM SHALL keep the first 50 ms at least 20 dB under the cue's peak.
   d. WHEN a cue has a late sting THE SYSTEM SHALL NOT start the fade-out before that sting has landed.
5. WHEN a sting is requested THE SYSTEM SHALL place its audible onset within 50 ms of the requested time.
6. a. WHEN a cue is mastered THE SYSTEM SHALL add a stereo reverb send.
   b. WHEN a cue is mastered THE SYSTEM SHALL apply a DC blocker.
   c. WHEN a cue is mastered THE SYSTEM SHALL apply an output low-pass.
   d. WHEN a cue is mastered THE SYSTEM SHALL apply a soft limiter.
7. a. WHEN a cue is measured THE SYSTEM SHALL compute integrated loudness per ITU-R BS.1770 with
   K-weighting, 400 ms blocks and absolute and relative gates.
   b. IF a cue is louder than its mood's ceiling THEN THE SYSTEM SHALL lower its gain to that ceiling, so a
   sparse lullaby never comes out louder than a chase.

## Requirement 7: Command-line renderer

**User story:** As a team member scoring demo videos, I want a one-line command that writes a WAV, so that
I can batch cues without opening a browser.

### Acceptance criteria

1. a. WHEN the user runs `npm run score -- --mood dread --seconds 90 --seed 7 --out cue.wav` THE SYSTEM SHALL
   write the WAV to the requested path.
   b. WHEN the user runs the score command THE SYSTEM SHALL print the plan (sections, cues) and the render
   stats.
2. a. WHEN the user passes --scene THE SYSTEM SHALL read a scene description.
   b. WHEN the user passes --sting with comma-separated times THE SYSTEM SHALL use them as sting times.
   c. WHEN the user passes --json THE SYSTEM SHALL write the realized Score as JSON.
   d. WHEN the user passes --director local|bedrock THE SYSTEM SHALL use that director.
3. IF an argument is invalid (unknown mood, length outside 5-300 s, unknown director) THEN THE SYSTEM SHALL
   exit with a non-zero code and a message naming the problem.
4. a. WHEN the user passes --quiet THE SYSTEM SHALL print only the output path.
   b. WHEN the user passes --help THE SYSTEM SHALL print the usage text.

## Requirement 8: Browser app with a chip view

**User story:** As a first-time visitor, I want to see and hear the chip work, so that I understand what
made my cue and trust the result.

### Acceptance criteria

1. a. WHEN the user summons a score THE SYSTEM SHALL render it in a Web Worker.
   b. WHILE a render is in progress THE SYSTEM SHALL show progress.
2. a. WHEN rendering finishes THE SYSTEM SHALL show the title, key, tempo and director's notes.
   b. WHEN rendering finishes THE SYSTEM SHALL show a timeline of sections, intensity, notes, cues and a
   playhead.
3. a. WHILE a cue plays THE SYSTEM SHALL show each channel's four operators.
   b. WHILE a cue plays THE SYSTEM SHALL show each channel's algorithm routing.
   c. WHILE a cue plays THE SYSTEM SHALL show the envelope levels recorded during the render.
   d. WHILE a cue plays THE SYSTEM SHALL show an oscilloscope of the output audio.
4. WHEN the user clicks the timeline THE SYSTEM SHALL move the playhead there.
5. a. WHEN the user chooses Download WAV THE SYSTEM SHALL save the exact rendered WAV.
   b. WHEN the user chooses Download score JSON THE SYSTEM SHALL save the exact rendered Score.
6. IF the user enters an invalid length THEN THE SYSTEM SHALL say what range is allowed.
7. WHEN the app is viewed at phone width THE SYSTEM SHALL not scroll horizontally.

## Requirement 9: Swappable AI director

**User story:** As the project owner, I want the AI director behind an adapter, so that the app works free
and offline today and switches to Amazon Bedrock with one setting.

### Acceptance criteria

1. a. THE SYSTEM SHALL define one Director interface.
   b. THE SYSTEM SHALL provide local, Bedrock and remote implementations of that interface.
2. a. IF FRIGHT_DIRECTOR (CLI) or VITE_FRIGHT_DIRECTOR (web) is unset THEN THE SYSTEM SHALL use the local
   director.
   b. IF FRIGHT_DIRECTOR or VITE_FRIGHT_DIRECTOR selects another director THEN THE SYSTEM SHALL use that
   director.
3. a. WHEN the Bedrock director's reply fails validation THE SYSTEM SHALL send the errors back to the model
   once for repair.
   b. IF the repair also fails THEN THE SYSTEM SHALL report the validation errors.
4. WHEN the system runs tests or starts by default THE SYSTEM SHALL NOT call a paid service.

## Requirement 10: Seamless loops and share links

**User story:** As a game developer, I want a cue that loops forever without a click or a gap, and a link
that reproduces it, so that I can drop it into an engine and share the exact take with my team.

### Acceptance criteria

1. a. WHERE the user asks for a loop THE SYSTEM SHALL snap the length to whole bars.
   b. WHERE the user asks for a loop THE SYSTEM SHALL keep intensity steady.
2. a. WHERE the user asks for a loop THE SYSTEM SHALL render with no fades.
   b. WHERE the user asks for a loop THE SYSTEM SHALL wrap release tails onto the start.
   c. WHERE the user asks for a loop THE SYSTEM SHALL warm the output filters with the loop's end so the
   wrap point is seamless.
   d. WHEN a loop starts playing in the app THE SYSTEM SHALL fade it in over 0.3 s.
3. WHERE the user asks for a loop THE SYSTEM SHALL write a WAV `smpl` chunk marking the whole file as a
   forward loop.
4. a. WHEN a cue is ready THE SYSTEM SHALL put its request in the page URL.
   b. WHEN the page opens with those parameters THE SYSTEM SHALL render the same cue, byte for byte.

## Requirement 11: A cursed datasheet look

**User story:** As a visitor, I want the interface to look like a cursed 1990s chip datasheet, so that the
horror mood is set before a single note plays.

### Acceptance criteria

1. WHEN the masthead is shown THE SYSTEM SHALL render a faint candle-flicker glow on the title.
2. WHEN the user's device prefers reduced motion THE SYSTEM SHALL disable the flicker.
3. WHEN a datasheet rule or panel edge is drawn THE SYSTEM SHALL accent it with a blood-red or ectoplasm
   tone.
4. WHEN a panel is shown THE SYSTEM SHALL give it a torn or water-stained edge.
5. WHEN an empty state or helper text is shown THE SYSTEM SHALL use spookier microcopy.
6. WHEN the cursed look is applied THE SYSTEM SHALL keep every text color at WCAG AA contrast against its
   background.

## Requirement 12: Kiro workspace counts stay true

**User story:** As a reviewer reading the README, I want the numbers about the Kiro workspace to match the
`.kiro` folder, so that no claim about specs, steering, hooks, agents or MCP servers can go stale.

### Acceptance criteria

1. a. WHEN the test suite runs THE SYSTEM SHALL count the spec folders under `.kiro/specs` that hold
   requirements.md, design.md and tasks.md, the steering `.md` files, the kiro-cli hooks (`.json` files in
   `.kiro/hooks`), the IDE hooks (`.kiro.hook` files in `.kiro/hooks`), the agents (`.json` files in
   `.kiro/agents`) and the MCP servers in `.kiro/settings/mcp.json`.
   b. THE SYSTEM SHALL check that the steering inclusion modes named in the counts sentence are exactly the
   set the steering files use.
   c. THE SYSTEM SHALL check that one MCP server runs `scripts/mcp/fright-score-mcp.ts`.
2. a. THE SYSTEM SHALL find the counts sentence in README.md, in KIRO-LOG.md and, when the file exists, in
   docs/writeups/devpost.md, with one regular expression.
   b. IF a number in the sentence differs from the count THEN THE SYSTEM SHALL fail with a message that names
   the file, the number it states and the number the folder holds.

## Requirement 13: Phone first screen

**User story:** As a visitor on a phone, I want Play and Jump to the scare in the first screen and nothing
laid over them, so that a tap on a button does what its label says.

### Acceptance criteria

1. WHILE the transport is in view THE SYSTEM SHALL hide the "Write your scene" button.
2. WHILE the transport is out of view and the form is not in view THE SYSTEM SHALL show the "Write your
   scene" button.
3. WHEN the viewport is 900 px wide or narrower THE SYSTEM SHALL place the transport directly under the
   timeline.
4. WHEN the viewport is narrower than 520 px THE SYSTEM SHALL use a compact masthead and stage head so that
   Play and Jump to the scare sit inside the first viewport at 375 x 667.
5. WHEN a visible Jump to the scare button is tapped at its center THE SYSTEM SHALL deliver the tap to that
   button, at 390 x 844 and at 375 x 667.
6. THE SYSTEM SHALL keep every element id, accessible name and tested string unchanged.

## Requirement 14: Kiro IDE hooks

**User story:** As a developer opening the repository in the Kiro IDE, I want the same guards as the CLI
hooks to run there, so that a broken engine edit is caught in either tool.

### Acceptance criteria

1. THE SYSTEM SHALL keep the four kiro-cli `.json` hooks in `.kiro/hooks` as they are.
2. a. THE SYSTEM SHALL provide `test-on-save.kiro.hook`, which runs `npm run test:unit` when an engine,
   score, director, WAV or web/live TypeScript file is edited.
   b. THE SYSTEM SHALL provide `determinism-guard.kiro.hook`, which runs `npm run check:determinism` when an
   engine, score or director TypeScript file is edited.
   c. THE SYSTEM SHALL provide `mcp-golden-cue.kiro.hook`, which asks the agent to call the `score_cue` tool
   of the fright-score MCP server for the README's golden cue when an engine file is edited and to report a
   different `stingLandingSec` or `sha256` as a regression.
3. WHEN the test suite runs THE SYSTEM SHALL check that every `.kiro.hook` file parses, has a known
   `when.type` with non-empty patterns and a `then.type` of askAgent or runCommand.
4. WHEN the test suite runs THE SYSTEM SHALL check that every runCommand names an npm script that exists in
   package.json.

## Requirement 15: Demo render and form polish

**User story:** As a visitor in the first seconds of the page, I want the controls to stay usable while the demo
renders and the form to tell me everything that is wrong at once, so that I never wait on a disabled button or
fix errors one press at a time.

### Acceptance criteria

1. WHILE a render is running THE SYSTEM SHALL draw the "Rendering on the FS-666 NN%" label against the top
   right corner of the timeline canvas, whatever the position of the render sweep.
2. WHEN the viewport is narrower than 520 px THE SYSTEM SHALL draw the Listen overlay smaller than on wider
   screens and anchor it to the lower left of the timeline.
3. WHEN the viewport is narrower than 520 px and the render sweep has passed both the playhead and the Listen
   overlay THE SYSTEM SHALL fade the overlay out and stop it taking taps.
4. THE SYSTEM SHALL align the fields of each `.field-row` to the top of the row, so that an error under one
   field does not move its neighbor.
5. a. WHEN Summon the score is pressed THE SYSTEM SHALL check the length and the sting times and show the error
   for every invalid field at once.
   b. IF any field is invalid THEN THE SYSTEM SHALL focus the first invalid field, say so in the status line,
   and leave a render that is already running untouched.
   c. WHILE a field error is showing THE SYSTEM SHALL keep the error in the status line instead of render
   progress, and restore the status once every error is fixed.
6. WHILE the demo's exact render is running THE SYSTEM SHALL keep Download WAV, Download for Sega Genesis and
   Summon the score enabled.
   a. WHEN Download WAV is pressed during that render THE SYSTEM SHALL queue the download, say so in the status
   line, and deliver the file when the render lands.
   b. WHEN Download for Sega Genesis is pressed during that render THE SYSTEM SHALL download the demo's
   pre-rendered Genesis file, which holds the same bytes the CLI writes.
   c. WHEN Summon the score is pressed during that render with a valid form THE SYSTEM SHALL stop the render,
   drop a queued download and start the new request.
7. THE SYSTEM SHALL show the muted hint "Sound on, best with headphones" beside the chip specification, on
   every screen width.
8. THE SYSTEM SHALL keep every element id, accessible name and tested string unchanged, except the
   first-load assertion that Download WAV is disabled during the demo render, which 6 replaces with enabled.

## Requirement 16: The possessed chip

**User story:** As a visitor who watches the stitch panel when a scare lands, I want a small hidden surprise in
the register writes, so that the machine feels haunted without any change to the sound.

### Acceptance criteria

1. WHEN the playhead crosses a sting and register-write rows are showing THE SYSTEM SHALL briefly rewrite
   the newest three rows of the stitch panel into a three-word message, one word per row with its ASCII bytes.
2. THE SYSTEM SHALL spell the message from the cue's seed alone, so that the same seed always gives the same
   words.
3. THE SYSTEM SHALL flicker the message in a fixed rhythm of 0.71 s, and WHILE the visitor prefers reduced
   motion SHALL hold it still for 1.5 s instead.
4. THE SYSTEM SHALL mark the rewritten rows `aria-hidden` and announce the message once, politely, through one
   live region.
5. THE SYSTEM SHALL write the scene text of a cue made from a scene into the notes field of the Genesis
   export's GD3 tag as "Ghost note: <scene>", after the seed, and write no ghost note for a cue made from a mood
   alone.
6. THE SYSTEM SHALL leave every WAV byte unchanged: the demo's sha256 stays
   `04352a45a32f7981b0647aefd434970bbe2d28b40e218bdcc935b8ec213c5c23`, and `samples/cellar-dread-genesis.vgm`
   is the CLI's export of the demo with the ghost note, pinned by sha256.


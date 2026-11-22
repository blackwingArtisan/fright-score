# Requirements: The scare lands on the event (door scene)

## Introduction

Fright Score places a sting at an exact second of a cue. A game needs the other thing: a sting that lands
on an event the player causes, at a moment nobody knew in advance. `examples/godot/` already proves it in
Godot: a stalker loop plays as ambience, the player opens a door, the loop cuts to silence, the sting file
starts at the top of its 0.6 s of pre-silence, and the hit lands 0.6 s after the door opened.

This feature shows the same thing in the browser app, as a small playable scene after the stage panel: a
dark hallway with a door. The scene plays the two exact files the Godot example plays, so the browser and
Godot use the same bytes, and it reports the measured time between the event and the hit.

Everything is a rendered file played back on the Web Audio clock. Nothing in this scene is synthesized in
real time, and the copy must say so. The one-line rule still holds: the AI writes the sheet music, never
the sound.

## Requirement 1: The scene and its two files

**User story:** As a game developer, I want to see and hear a scare land on a player event, so that I can
judge the idea before I wire it into my engine.

### Acceptance criteria

1. a. THE SYSTEM SHALL show a section titled "The scare lands on the event" after the stage panel in
   `index.html`, drawn by `src/web/views/door.ts`.
   b. THE section SHALL show a dark hallway with a door, drawn with inline SVG and CSS, adding no image
   file over 20 KB.
2. a. THE SYSTEM SHALL play `examples/godot/audio/stalker-loop.wav` as the ambience.
   b. THE SYSTEM SHALL play `examples/godot/audio/door-slam-sting.wav` as the sting.
   c. THE SYSTEM SHALL import both files from their `examples/godot/audio/` paths with Vite's `?url`
   suffix, and SHALL NOT keep a second copy of either file in the repository.
   d. THE bytes the browser fetches for each file SHALL equal the bytes of the file in `examples/godot/audio/`.
3. a. THE SYSTEM SHALL loop the ambience from the start of the file to its end with no gap and no click.
   b. THE SYSTEM SHALL decode each file once and reuse the decoded buffer for later scares.
4. IF a file cannot be fetched or decoded THEN THE SYSTEM SHALL say in the section that the scene could not
   load, and SHALL leave the rest of the app working.

## Requirement 2: Nothing sounds before a gesture

**User story:** As a visitor, I want no sound until I ask for it, so that the page never startles me or
breaks browser autoplay rules.

### Acceptance criteria

1. WHEN the page loads THE SYSTEM SHALL NOT create the scene's AudioContext, fetch its audio files or start
   any sound.
2. WHEN the user activates "Enter the hallway" THE SYSTEM SHALL create the AudioContext, resume it, decode
   the files and start the ambience loop.
3. WHILE the ambience plays THE SYSTEM SHALL offer a "Leave the hallway" control that silences every sound
   of the scene, and SHALL return the scene to its quiet state.
4. IF the user has not entered the hallway THEN THE SYSTEM SHALL keep the door control unavailable and say
   why in text.
5. WHEN the user activates "Leave the hallway" or the page becomes hidden THE SYSTEM SHALL stop the scene's
   sound.

## Requirement 3: The hit lands 0.6 s after the event

**User story:** As a game developer, I want the hit to land at a fixed distance after the event, wherever
the loop happens to be, so that the scare feels caused by the player.

### Acceptance criteria

1. a. WHEN the user presses the door button, presses E while the scene has focus, or clicks or taps the
   door THE SYSTEM SHALL treat it as one door event.
   b. THE SYSTEM SHALL read the event time once, from `AudioContext.currentTime`.
2. a. WHEN the door event happens while the ambience plays THE SYSTEM SHALL fade the ambience
   to silence over 0.08 s.
   b. WHEN the door event happens THE SYSTEM SHALL start the sting file at the event time, from 0.4 s into
   the file (the top of its 0.6 s of pre-silence, for a hit at 1.0 s).
   c. THE hit SHALL sound at the event time plus 0.6 s.
3. THE SYSTEM SHALL compute the sting's start, its file offset and the hit time from the event time with one
   pure helper that takes the hit position in the file, the pre-silence and the cut length.
4. IF a scare is already playing THEN THE SYSTEM SHALL ignore a further door event.
5. WHEN the sting has rung out for 2.5 s THE SYSTEM SHALL fade the ambience back in over 1.5 s, and SHALL
   then accept the next door event.
6. THE door timings (cut 0.08 s, ring 2.5 s, return 1.5 s) SHALL equal the defaults of
   `examples/godot/addons/fright_score/fright_score_cue.gd`.

## Requirement 4: The measured offset is shown

**User story:** As a game developer, I want to read the measured time between the event and the hit, so
that I can trust the claim without a stopwatch.

### Acceptance criteria

1. a. WHEN the scare is scheduled THE SYSTEM SHALL compute the measured offset as the hit time minus the
   event time, both read from the AudioContext schedule.
   b. WHEN the hit time has passed THE SYSTEM SHALL show "Sting landed 0.600 s after the door opened", with
   the measured value to three decimals.
2. THE measured offset SHALL appear in a live region (`role="status"`, `aria-live="polite"`) with the id
   `door-offset`.
3. WHILE no scare has happened THE SYSTEM SHALL show a plain sentence in that region saying what to do.
4. THE SYSTEM SHALL say in plain words, next to the result, that the figure is the audio clock's schedule
   and does not include the output device's latency.
5. THE section SHALL say that both files are rendered cues played back, and that only the keyboard in the
   app is synthesized in real time.

## Requirement 5: Keyboard and screen reader use

**User story:** As a visitor who does not use a mouse, I want to run the whole scene from the keyboard and
hear its state read aloud, so that the demo is not for pointer users only.

### Acceptance criteria

1. THE door SHALL be a real `<button>` with an accessible name that says what it does ("Open the door").
2. THE "Enter the hallway" and "Leave the hallway" controls SHALL be real buttons reachable in tab order.
3. WHEN focus is inside the section and the user presses E THE SYSTEM SHALL open the door, and SHALL stop
   the key from reaching the live keyboard, which also uses E.
4. WHEN focus is in a text field, outside the section, or a modifier key is held THE SYSTEM SHALL NOT open
   the door on E.
5. WHEN the scene changes state (entered, scare started, hit landed, recovered, left) THE SYSTEM SHALL
   announce it in plain words in a polite live region.
6. THE section SHALL tell the user that E opens the door while the scene has focus.
7. THE door and both controls SHALL show a visible focus ring and keep WCAG AA contrast.

## Requirement 6: Motion, width and look

**User story:** As a visitor on a small or motion-sensitive device, I want the scene to fit and to stay
still when I ask, so that it is usable for me.

### Acceptance criteria

1. WHEN the user's device prefers reduced motion THE SYSTEM SHALL NOT animate the door, the hallway
   flicker or the scare flash, and SHALL change the door's state instantly.
2. WHEN the viewport is 360 px wide THE SYSTEM SHALL NOT scroll horizontally.
3. THE scene SHALL use the datasheet look of the rest of the app: the same colors, panel edge and fonts.
4. THE scene SHALL NOT make the first view heavier: audio files are fetched only after the user enters the
   hallway, and the scene adds no request on load.

## Requirement 7: Tests that need no audio device and no paid service

**User story:** As the project owner, I want the timing claim pinned by tests, so that it cannot drift.

### Acceptance criteria

1. THE SYSTEM SHALL have a Vitest unit test of the pure timing helper.
2. THE SYSTEM SHALL have a Playwright test that opens the door and reads a measured offset of 0.6 s plus or
   minus 0.05 s.
3. THE SYSTEM SHALL have a Playwright test that no AudioContext exists and no audio file is requested before
   the first gesture.
4. WHEN the tests run THE SYSTEM SHALL NOT call a paid service or the network beyond the local preview.

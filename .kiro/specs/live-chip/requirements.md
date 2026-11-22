# Requirements: Live chip and first view

## Introduction

Two gaps showed up when people tried the first build. Cue playback is an offline render played back
sample-exact (by design: what you hear is the file you download), so nothing let a visitor hear the FS-666
respond in real time. And the first view was an empty stage until someone clicked Summon. This feature adds
a playable, real-time FS-666 keyboard running in an AudioWorklet, and a demo cue that renders on first load.

## Requirement 1: Play the chip in real time

**User story:** As a visitor, I want to play the chip's patches myself, so that I can hear and see FM
synthesis respond to my hands, not just a finished file.

### Acceptance criteria

1. a. THE FS-666 SHALL synthesize the live keyboard's audio on the browser's audio thread inside an
   AudioWorklet.
   b. THE live keyboard SHALL render each output sample using the same Voice, Operator, Envelope and
   algorithm code as the offline renderer, so one voice matches the offline renderer sample for sample for
   the same patch, note and velocity.
2. a. WHEN the user presses a key, on-screen or A to K on the computer keyboard, THE SYSTEM SHALL start a
   voice using the selected patch.
   b. WHEN the user releases a held key THE SYSTEM SHALL release that voice.
3. a. THE SYSTEM SHALL let the user choose any of the eleven patches.
   b. WHEN the user presses Z or X THE SYSTEM SHALL shift the keyboard down or up one octave.
   c. WHEN the user activates an octave button THE SYSTEM SHALL shift the keyboard by one octave in that
   direction.
   d. WHEN a patch is selected THE SYSTEM SHALL start that patch's keyboard at its comfortable octave.
4. a. THE live chip SHALL sound no more than six voices at once, stealing the oldest released voice first.
   b. THE live chip SHALL pass every voice through a soft limiter so a full chord stays below full scale.
5. a. WHILE the chip sounds THE SYSTEM SHALL show the patch's four operators.
   b. WHILE the chip sounds THE SYSTEM SHALL show the patch's algorithm routing.
   c. WHILE the chip sounds THE SYSTEM SHALL report live envelope levels from the audio thread about 30
   times a second.
   d. WHILE the chip sounds THE SYSTEM SHALL show a three-second history of the envelope levels.
   e. WHILE the chip sounds THE SYSTEM SHALL show the sounding note and the voice count.
   f. WHILE the chip sounds THE SYSTEM SHALL show the chip's output on the oscilloscope.
6. a. WHEN the user first presses a key THE SYSTEM SHALL load the AudioWorklet, as browsers require a user
   gesture.
   b. THE SYSTEM SHALL NOT load the AudioWorklet before the first key press.
7. IF the page loses focus while keys are held THEN THE SYSTEM SHALL release every voice.

## Requirement 2: A first view that shows the product working

**User story:** As a first-time visitor or a judge, I want to see a real cue on the board within seconds,
so that I understand the product before I type anything.

### Acceptance criteria

1. a. WHEN the page opens without share-link parameters THE SYSTEM SHALL render the "Cellar dread" demo
   cue at seed 13.
   b. WHEN the demo cue is rendered THE SYSTEM SHALL show its timeline, channels, notes and stats, ready
   to play.
2. a. WHEN the demo cue is shown THE SYSTEM SHALL leave the request form empty.
   b. WHEN the demo cue is shown THE SYSTEM SHALL leave the page URL unchanged.
3. WHILE no cue has been played THE SYSTEM SHALL draw attention to the Play button.
4. a. WHEN the user summons a new cue while another render is running THE SYSTEM SHALL cancel the running
   render.
   b. WHEN a newer request is made THE SYSTEM SHALL never show an older cue's result.

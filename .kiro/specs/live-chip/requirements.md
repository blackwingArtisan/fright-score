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

1. THE SYSTEM SHALL synthesize the live keyboard's audio on the audio thread in an AudioWorklet, sample by
   sample, using the same Voice, Operator, Envelope and algorithm code as the offline renderer.
2. WHEN the user presses a key (on-screen, or A to K on a computer keyboard) THE SYSTEM SHALL start a voice
   with the selected patch, and WHEN the key is released THE SYSTEM SHALL release that voice.
3. THE SYSTEM SHALL let the user choose any of the ten patches and shift the keyboard by octaves (Z and X,
   or the octave buttons), starting each patch at a comfortable octave.
4. THE SYSTEM SHALL limit the live chip to six voices, stealing the oldest released voice first, and SHALL
   keep a full chord below full scale with a soft limiter.
5. WHILE the chip sounds THE SYSTEM SHALL show the patch's four operators, its algorithm routing and live
   envelope levels reported from the audio thread about 30 times a second, a three-second history, the
   note, the voice count, and the output on the oscilloscope.
6. THE SYSTEM SHALL load the AudioWorklet only on the first key press, as browsers require a user gesture.
7. IF the page loses focus while keys are held THEN THE SYSTEM SHALL release every voice.

## Requirement 2: A first view that shows the product working

**User story:** As a first-time visitor or a judge, I want to see a real cue on the board within seconds,
so that I understand the product before I type anything.

### Acceptance criteria

1. WHEN the page opens without share-link parameters THE SYSTEM SHALL render a demo cue (the "Cellar dread"
   example, seed 13) and show its timeline, channels, notes and stats, ready to play.
2. THE SYSTEM SHALL leave the form empty and the URL unchanged for the demo cue, so the user's own request
   never inherits the demo's scene.
3. WHILE no cue has been played THE SYSTEM SHALL draw attention to the Play button.
4. WHEN the user summons a new cue while another render is running THE SYSTEM SHALL cancel the running
   render, and SHALL never show an older cue's result after a newer request.

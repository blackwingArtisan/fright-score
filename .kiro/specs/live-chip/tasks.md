# Implementation plan: Live chip and first view

- [x] 1. Live protocol types and constants (commands, reports, polyphony, gain)
  - _Requirements: 1.2, 1.4, 1.5_
- [x] 2. `LiveChipCore`: commands, block rendering with the shared Voice and soft limiter, voice stealing, reports
  - _Requirements: 1.1, 1.2, 1.4_
- [x] 3. AudioWorklet processor wrapping the core, bundled by Vite with the engine
  - _Requirements: 1.1, 1.6_
- [x] 4. Page-side `LiveChip` controller: lazy worklet load on first key, routing into the analyser, report history
  - _Requirements: 1.5, 1.6_
- [x] 5. Extract `drawOperatorRow` and `rowLayout` from the channel view; `LiveView` reuses them
  - _Requirements: 1.5_
- [x] 6. Keyboard UI: patch picker with blurbs, octave buttons, on-screen keys, A to K and Z/X, release on blur
  - _Requirements: 1.2, 1.3, 1.7_
- [x] 7. Demo cue on first load, clean form and URL, beckoning Play button
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 8. Cancel superseded renders and drop stale results
  - _Requirements: 2.4_
- [x] 9. Tests: core unit tests and Playwright end-to-end for the demo cue and the live chip
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4_

## Pass 2 — spec review gaps (closed)

The criteria above were tightened into strict EARS form, one testable behavior per criterion (multi-behavior
criteria were split with sub-letters so existing task references stay valid; new criteria were appended at
the end of a requirement). Every task 1-9 keeps its [x]: each has both code and an exercising test. The tasks
below closed the gaps the review found between the spec and the code — behaviors that were implemented but not
yet pinned by a test. Each carries its requirement numbers.

- [x] 10. Add a live-chip e2e test that pressing Z and X shifts the keyboard down and up one octave
  - _Requirements: 1.3_
  - Covered by `e2e/live-chip.spec.ts`, "Z and X shift the keyboard down and up one octave" (and "do nothing while typing in a form field").
- [x] 11. Add a live-chip e2e test that the octave buttons shift the keyboard by one octave
  - _Requirements: 1.3_
  - Covered by `e2e/live-chip.spec.ts`, "the octave buttons shift the keyboard by one octave".
- [x] 12. Add a LiveChipCore unit test asserting voice stealing removes the oldest released voice first
  - _Requirements: 1.4_
  - Covered by `unit/live-core.test.ts`, "voice stealing order": the live output equals six offline voices with the oldest released voice dropped, and differs from the wrong choices.
- [x] 13. Add a unit/e2e test asserting the worklet reports live envelope levels about 30 times a second and that the history covers three seconds
  - _Requirements: 1.5_
  - Covered by `unit/live-worklet.test.ts` (the processor posts 28 to 31 reports a second at 44.1 and 48 kHz) and `unit/live-chip.test.ts` (the page keeps 90 reports, three seconds, newest last).
- [x] 14. Add a live-chip e2e test asserting the AudioWorklet is not loaded before the first key press
  - _Requirements: 1.6_
  - Covered by `e2e/live-chip.spec.ts`, "does not load the AudioWorklet until the first key is pressed" (counts `addModule` calls) and `unit/live-chip.test.ts`.
- [x] 15. Add a live-chip e2e test that losing page focus while keys are held releases every voice
  - _Requirements: 1.7_
  - Covered by `e2e/live-chip.spec.ts`, "releases every voice when the page loses focus while keys are held". The test dispatches the window `blur` event, because headless Chromium does not lose focus on its own.
- [x] 16. Add a live-chip e2e test that summoning a new cue cancels a render still in progress
  - _Requirements: 2.4_
  - Covered by `e2e/live-chip.spec.ts`, "a newer request replaces the demo render instead of racing it": the
    request is summoned while the demo cue is still rendering, and only the newer cue reaches the board.
- [x] 17. Add a live-chip e2e test that the Play button stops beckoning after the first play
  - _Requirements: 2.3_
  - Covered by `e2e/live-chip.spec.ts`, "the Play button stops beckoning after the first play", including after the next cue renders.

## Requirement-to-test traceability

| Requirement | Tests | Open tasks |
|---|---|---|
| 1. Play the chip in real time | `unit/live-core.test.ts` (silent until played, sample for sample equal to the offline engine, reports, release, polyphony cap, patch switch and panic; stealing order, 1.4a); `unit/live-worklet.test.ts` (about 30 reports a second, 1.5c); `unit/live-chip.test.ts` (three-second history, 1.5d; no worklet before the first note, 1.6b); `e2e/live-chip.spec.ts` (real-time synthesis on the AudioWorklet from A to K and the on-screen keys; Z and X and the octave buttons, 1.3b and 1.3c; the worklet loads on the first key, 1.6; a lost focus releases every voice, 1.7) | none |
| 2. A first view that shows the product working | `e2e/live-chip.spec.ts` (demo cue on first load with a clean form and URL, a newer request replaces the demo render; Play stops beckoning after the first play, 2.3); `e2e/sting.spec.ts` (Listen and Jump to the scare) | none |

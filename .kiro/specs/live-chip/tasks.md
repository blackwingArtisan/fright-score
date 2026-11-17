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

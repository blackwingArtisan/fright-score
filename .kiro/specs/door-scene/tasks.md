# Implementation plan: Door scene

A later session builds this. Every task below is open. Nothing in `src/engine/`, `src/score/` or the
Godot example changes; the scene only plays the two files the Godot example already ships.

## Timing helper

- [ ] 1. Add `src/web/views/door-timing.ts`: `DOOR_TIMING` (0.6 s pre-silence, hit at 1.0 s, 0.08 s cut, 2.5 s ring, 1.5 s return), `planScare()` and `formatOffset()`; throw `RangeError` for a pre-silence longer than the hit position or a negative or non-finite input
  - _Requirements: 3.2, 3.3, 3.6_
- [ ] 2. Test `tests/unit/door-timing.test.ts`: event time to sting start, file offset 0.4 and hit time (event + 0.6) for several event times; `hitDelaySec` is 0.6 for any event time; the constants equal the defaults in `fright_score_cue.gd` (read from the file); bad inputs throw; `formatOffset(0.6)` is `0.600`
  - _Requirements: 3.2, 3.3, 3.6, 4.1, 7.1_

## The scene

- [ ] 3. Add the `#door-scene` section to `index.html` after the stage panel: title "The scare lands on the event", Enter and Leave buttons, the door button, `#door-offset` (`role="status"`), `#door-announce`, the "Press E while this scene has focus" line and the rendered-file copy
  - _Requirements: 1.1a, 2.4, 4.2, 4.3, 4.5, 5.1, 5.2, 5.5, 5.6_
- [ ] 4. Add `src/web/views/door.ts` with `mountDoorScene()` and the `DoorScene` state machine; import both WAVs from `examples/godot/audio/` with `?url`; create the AudioContext, fetch and decode only after "Enter the hallway"
  - _Requirements: 1.2a, 1.2b, 1.2c, 1.3b, 1.4, 2.1, 2.2_
- [ ] 5. Loop the ambience over the whole file (`loop`, `loopStart` 0, `loopEnd` duration) through a gain node
  - _Requirements: 1.3a_
- [ ] 6. Handle the door event: read `currentTime` once, call `planScare()`, ramp the ambience to silence, start the sting at its offset, ignore events while a scare plays, then ring, fade the loop back in and accept the next event
  - _Requirements: 3.1, 3.2, 3.4, 3.5_
- [ ] 7. Show the measured offset in `#door-offset` once the hit time has passed, with the audio-clock and output-latency note; announce each state change in `#door-announce`
  - _Requirements: 4.1, 4.3, 4.4, 5.5_
- [ ] 8. Wire E on the section only (modifiers, text fields and other states ignored), with `preventDefault` and `stopPropagation` so the live keyboard's E does not sound
  - _Requirements: 5.3, 5.4_
- [ ] 9. Implement "Leave the hallway" and `visibilitychange`: close the context, drop the nodes, return to `idle`
  - _Requirements: 2.3, 2.5_
- [ ] 10. Add the "Door scene" block to `src/web/styles.css`: the datasheet look, focus rings, wrapping controls at 360 px, and a `prefers-reduced-motion` override with no door swing, flicker or flash; keep every drawing inline and under 20 KB
  - _Requirements: 1.1b, 5.7, 6.1, 6.2, 6.3_
- [ ] 11. Call `mountDoorScene()` from `src/web/main.ts` and confirm the first load adds no request for either WAV
  - _Requirements: 6.4, 2.1_

## Tests

- [ ] 12. Playwright `tests/e2e/door-scene.spec.ts`, measured offset: enter the hallway, press the door button, read `#door-offset` and assert the number is 0.6 s plus or minus 0.05 s; repeat with E pressed while the door button has focus
  - _Requirements: 3.1a, 4.1, 7.2_
- [ ] 13. Playwright, no sound before a gesture: an init script counts `AudioContext` constructions and a request listener counts requests for the two WAV files; both are zero after load and before "Enter the hallway", and the door button is unavailable
  - _Requirements: 2.1, 2.4, 7.3_
- [ ] 14. Playwright, the same bytes: fetch the two served asset URLs from the page and compare their SHA-256 with the files in `examples/godot/audio/`
  - _Requirements: 1.2d_
- [ ] 15. Playwright, a second door event during a scare is ignored (one measured line, one scare), and the door accepts a new event after the return
  - _Requirements: 3.4, 3.5_
- [ ] 16. Playwright, E outside the section still plays the live keyboard and E inside it does not (`#live-status` voices stay 0)
  - _Requirements: 5.3, 5.4_
- [ ] 17. Playwright, accessibility: the door is a button named "Open the door", `#door-offset` has `role="status"`, and the state announcements reach `#door-announce`
  - _Requirements: 5.1, 5.5, 4.2_
- [ ] 18. Playwright at 360 px and with `prefers-reduced-motion: reduce`: no horizontal scroll, and the door, flicker and flash animations compute to `none`
  - _Requirements: 6.1, 6.2_
- [ ] 19. Playwright, "Leave the hallway" closes the scene's AudioContext and returns the door to unavailable
  - _Requirements: 2.3_
- [ ] 20. Run `npm run typecheck`, `npm run test:unit` and `E2E_PORT=4201 npm run test:e2e`; update the README with a short "Land the scare on an event" paragraph that says the files are rendered, not synthesized live
  - _Requirements: 4.5, 7.4_

## Requirement-to-test table

| Requirement | Tests | Tasks |
|---|---|---|
| 1. The scene and its two files | `e2e/door-scene.spec.ts` (same bytes as the Godot files, 1.2d) | 3, 4, 5, 10, 14 |
| 2. Nothing sounds before a gesture | `e2e/door-scene.spec.ts` (no AudioContext and no WAV request before the gesture; Leave closes the context) | 4, 9, 11, 13, 19 |
| 3. The hit lands 0.6 s after the event | `unit/door-timing.test.ts` (start, offset, hit, constants equal the Godot defaults); `e2e/door-scene.spec.ts` (second event ignored, door accepts a new event after the return) | 1, 2, 6, 15 |
| 4. The measured offset is shown | `unit/door-timing.test.ts` (`formatOffset`); `e2e/door-scene.spec.ts` (offset within 0.6 s plus or minus 0.05 s, live region) | 2, 7, 12, 17 |
| 5. Keyboard and screen reader use | `e2e/door-scene.spec.ts` (E inside and outside the section, button name, announcements) | 3, 8, 16, 17 |
| 6. Motion, width and look | `e2e/door-scene.spec.ts` (360 px, reduced motion); contrast and look checked by visual review | 10, 11, 18 |
| 7. Tests that need no audio device | `unit/door-timing.test.ts`, `e2e/door-scene.spec.ts` (Chromium with `--disable-audio-output`) | 2, 12, 13, 20 |

# Implementation plan: Fright Score core

- [x] 1. Seeded generator and music theory helpers (modes, degrees, MIDI, time formatting)
  - _Requirements: 4.4, 5.1_
- [x] 2. ScorePlan and Score zod schemas with field-level error messages
  - _Requirements: 1.7, 2.1, 2.2_
- [x] 3. Scene reader: moods, lengths, sting and hit times, shape words, scene nouns
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9_
- [x] 4. Local director: mood profiles, sections, intensity curve, layers, Markov motif, director's notes
  - _Requirements: 1.4, 1.7, 3.1_
- [x] 5. reconcilePlan so any director honors the requested length and stings
  - _Requirements: 2.3_
- [x] 6. Arranger: drone, pulse, bass, motif, texture, choir, percussion, riser, stinger, boom; silence windows
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [x] 7. FM engine: sine table, envelope, operator with feedback, eight algorithms, voice with LFO and glide
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
- [x] 8. Patch library of ten instruments tuned for horror
  - _Requirements: 5.3_
- [x] 9. Renderer with polyphony limits, voice stealing, reverb and visualizer frames
  - _Requirements: 5.6, 6.6, 8.3_
- [x] 10. Master chain: DC blocker, low-pass, soft limiter, fades that respect late stings, true-peak ceiling
  - _Requirements: 6.3, 6.4, 6.5_
- [x] 11. WAV encoder and parser with seeded TPDF dither
  - _Requirements: 4.1, 6.1, 6.2_
- [x] 12. Director adapters: local, Bedrock (Converse with one repair round), remote; factory by env var
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 13. CLI `npm run score` with scene, mood, length, stings, seed, JSON output and clear errors
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
- [x] 14. Web app: form with live scene reading, worker render, timeline, FS-666 channel view, scope, exports
  - _Requirements: 1.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
- [x] 15. Tests: unit suite, CLI test, Playwright end-to-end including browser-equals-CLI bytes
  - _Requirements: 4.1, 4.2, 4.3, 6.5, 8.5_
- [x] 16. Server function `/api/compose` wrapping the Bedrock director for the web AI path
  - _Requirements: 9.1, 9.2_
- [x] 17. Seamless loop mode (whole bars, wrapped tails, circular filters, `smpl` loop points) in CLI and web
  - _Requirements: 10.1, 10.2, 10.3_
- [x] 18. Share links: request in the URL, auto-render on open, copy-link button
  - _Requirements: 10.4_
- [x] 19. BS.1770 integrated loudness and per-mood loudness ceilings in the renderer; LUFS in CLI and web stats
  - _Requirements: 6.7_

## Pass 2 — spec review gaps (unchecked)

The criteria above were tightened into strict EARS form, one testable behavior per criterion (multi-behavior
criteria were split with sub-letters so existing task references stay valid; new criteria were appended at
the end of a requirement). Every task 1-19 keeps its [x]: each has both code and an exercising test. The
tasks below close the gaps the review found between the spec and the code — behaviors that are implemented
(or now specified) but not yet pinned by a test, plus the two spec-completeness gaps (1.9 hit cue, 7.4
quiet/help flags) whose criteria were added above. Each carries its requirement numbers.

- [ ] 20. Add a composer/scene test that explicit mood, length and sting times override the values read from the scene
  - _Requirements: 1.4_
- [ ] 21. Add a composer test that a keyword-less, mood-less scene yields a plan with mood "dread"
  - _Requirements: 1.6_
- [ ] 22. Add a composer test asserting the jump-scare sting lands near 80% of the cue and is snapped to a bar line
  - _Requirements: 1.5_
- [ ] 23. Add a schema test that a section whose endSec is at or before its startSec is rejected naming the section
  - _Requirements: 2.2_
- [ ] 24. Add an arranger test asserting the stinger is a tritone brass cluster and that the boom falls in pitch
  - _Requirements: 3.2_
- [ ] 25. Add an arranger test that the heartbeat pulse and bass accelerate toward double time during a riser
  - _Requirements: 3.5_
- [ ] 26. Add an operator test covering self-feedback levels 0 through 7 and the clamp at 7
  - _Requirements: 5.2_
- [ ] 27. Add a voice test that a patch LFO applies vibrato and tremolo
  - _Requirements: 5.4_
- [ ] 28. Add a renderer test asserting the per-track polyphony limit and that the oldest released voice is stolen first
  - _Requirements: 5.6_
- [ ] 29. Add a render test that the fade-out does not start before a late sting has landed
  - _Requirements: 6.4_
- [ ] 30. Add unit tests for the stereo reverb send, the DC blocker and the output low-pass
  - _Requirements: 6.6_
- [ ] 31. Add a render test that the frame count is exactly durationSec × 44,100 for a non-integer-frame duration (guard the Math.ceil rounding)
  - _Requirements: 6.2_
- [ ] 32. Add a CLI test asserting the score command prints the render stats line (note count, voices, dBTP, LUFS)
  - _Requirements: 7.1_
- [ ] 33. Add a CLI test asserting the process exits non-zero on invalid arguments
  - _Requirements: 7.3_
- [ ] 34. Add a CLI test asserting --quiet prints only the output path and --help prints the usage text
  - _Requirements: 7.4_
- [ ] 35. Add an e2e assertion that rendering progress is shown to the user
  - _Requirements: 8.1_
- [ ] 36. Add an e2e test that clicking the timeline moves the playhead there
  - _Requirements: 8.4_
- [ ] 37. Add a loop test asserting intensity stays steady across the whole loop
  - _Requirements: 10.1_
- [ ] 38. Add a loop test asserting the output filters are warmed with the loop's end so the wrap point is seamless
  - _Requirements: 10.2_

## Pass 2 — cursed datasheet look

The cursed 1990s datasheet look: presentation only (CSS and inline SVG in index.html + src/web/styles.css).
No engine, score or director code changed; no new dependencies; no image file over 20 KB. Element ids, button
and heading accessible names, and the Playwright-asserted strings are unchanged.

- [x] 39. Cursed datasheet look: candle-flicker masthead glow (off under prefers-reduced-motion), blood-red and ectoplasm datasheet accents, a torn blood-touched rule at the masthead foot, water-stained panels, and spookier empty-state microcopy — all WCAG AA and no wider than 360 px
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
- [x] 40. Playwright assertion that the masthead flicker is on by default and disabled under prefers-reduced-motion
  - _Requirements: 11.1, 11.2_

## Pass 3 — Kiro workspace, phone first screen and IDE hooks

- [x] 41. Add `tests/unit/kiro-counts.test.ts`: count specs, steering files and their inclusion modes, kiro-cli hooks, IDE hooks, agents and MCP servers from `.kiro`, check the fright-score MCP entry, and match the counts sentence in README.md, KIRO-LOG.md and (when present) docs/writeups/devpost.md with one regular expression
  - _Requirements: 12.1, 12.2_
- [x] 42. Hide `#write-cta` while `.transport` is in view (IntersectionObserver), keep the transport under the timeline, and compact the masthead and stage head below 520 px
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_
- [x] 43. Add `tests/e2e/phone-fold.spec.ts`: at 390x844 and 375x667 the `#jump` and `#write-cta` boxes do not overlap, `elementFromPoint` at the center of `#jump` is `#jump`, and `#jump` sits inside the first viewport at 375x667
  - _Requirements: 13.4, 13.5_
- [x] 44. Add `test-on-save.kiro.hook`, `determinism-guard.kiro.hook` and `mcp-golden-cue.kiro.hook` beside the kiro-cli hooks, and update the IDE hook count in the counts sentence
  - _Requirements: 14.1, 14.2_
- [x] 45. Extend `tests/unit/kiro-config.test.ts`: every `.kiro.hook` parses, has a known `when.type` with patterns and a valid `then.type`, and every runCommand names an npm script in package.json
  - _Requirements: 14.3, 14.4_

## Pass 4 — Demo render polish and the possessed chip

- [x] 46. Pin the "Rendering on the FS-666 NN%" label to the top right of the timeline canvas (`progressLabelBox`) and publish its box in `data-progress-label*` attributes
  - _Requirements: 15.1_
- [x] 47. Below 520 px make the Listen overlay smaller and anchor it lower left, and fade it (`.listen--passed`) once the render sweep passes the playhead and the button
  - _Requirements: 15.2, 15.3_
- [x] 48. Add `align-items: start` to `.field-row`
  - _Requirements: 15.4_
- [x] 49. Make `summon()` validate every field, show all errors, focus the first, leave a running render alone, and keep the error in the status line until fixed
  - _Requirements: 15.5_
- [x] 50. Keep Download WAV (queued until the render lands), Download for Sega Genesis (the pre-rendered demo file) and Summon enabled during the demo render
  - _Requirements: 15.6, 15.8_
- [x] 51. Add the muted "Sound on, best with headphones" hint beside the spec box
  - _Requirements: 15.7_
- [x] 52. Add `tests/e2e/form-polish.spec.ts` and a phone case in `tests/e2e/mobile.spec.ts`; change the first-load assertion on Download WAV to enabled
  - _Requirements: 15.1 to 15.8_
- [x] 53. Add `src/web/views/ghost.ts` and `StitchView.haunt()`: the seeded three-word message, the flicker rhythm, the still version under reduced motion, `aria-hidden` rows and one polite announcement
  - _Requirements: 16.1, 16.2, 16.3, 16.4_
- [x] 54. Write the scene into the GD3 notes as a ghost note (`gd3Notes`, `parseVgm().notes`), regenerate `samples/cellar-dread-genesis.vgm` with the `scripts/make-samples.sh` command, and pin its sha256
  - _Requirements: 16.5, 16.6_
- [x] 55. Add `tests/unit/ghost.test.ts` and `tests/e2e/possessed-chip.spec.ts`
  - _Requirements: 16.1 to 16.6_

## Requirement-to-test traceability

Each requirement, the tests that pin it down, and the open task for any criterion not yet pinned. Unit and
CLI tests run under Vitest (`npm run test:unit`); `e2e/` tests run under Playwright (`npm run test:e2e`).

| Requirement | Tests | Open tasks |
|---|---|---|
| 1. Direct a cue from a scene or a mood | `unit/scene.test.ts` (canonical brief, cue time is not the length, several cues and hits, jump scare without a time, no mood); `unit/composer.test.ts` (length and sting honored, jump scare near the end); `e2e/app.spec.ts` (what the director heard, 1.8) | 20 (1.4), 21 (1.6), 22 (1.5) |
| 2. Validate every plan | `unit/schema.test.ts`; `unit/composer.test.ts` (reconcilePlan); `unit/director.test.ts` (the pipeline enforces stings) | 23 (2.2) |
| 3. Arrange the plan into notes | `unit/arranger.test.ts` (schema-valid, notes inside the cue, silence window, exact sting, drone returns) | 24 (3.2), 25 (3.5) |
| 4. Determinism by seed | `unit/render.test.ts`, `unit/wav.test.ts`, `unit/arranger.test.ts`, `unit/composer.test.ts`, `unit/rng.test.ts`; `e2e/app.spec.ts` (browser equals CLI byte for byte, 4.3); `e2e/share-loop.spec.ts`; `npm run check:determinism` (4.4) | none |
| 5. Emulate a four-operator FM chip | `unit/sine.test.ts`, `unit/operator.test.ts`, `unit/algorithms.test.ts`, `unit/envelope.test.ts`, `unit/voice.test.ts` | 26 (5.2), 27 (5.4), 28 (5.6) |
| 6. Solid audio output | `unit/render.test.ts` (length, -3 dBTP, fades, sting within 50 ms), `unit/master.test.ts`, `unit/wav.test.ts`, `unit/loudness.test.ts` (BS.1770, mood ceilings) | 29 (6.4), 30 (6.6), 31 (6.2) |
| 7. Command-line renderer | `cli/score.test.ts` (end to end through npm, same bytes by seed, JSON, bad arguments, help, loops, VGM); `cli/samples.test.ts` | 32 (7.1), 33 (7.3), 34 (7.4) |
| 8. Browser app with a chip view | `e2e/app.spec.ts`, `e2e/a11y.spec.ts`, `e2e/sting.spec.ts`, `e2e/layout.spec.ts`, `e2e/mobile.spec.ts` (8.7) | 35 (8.1), 36 (8.4) |
| 9. Swappable AI director | `unit/director.test.ts` (local by default, Bedrock with a fake client and one repair round, remote); `unit/server.test.ts`; every test uses fake clients (9.4) | none |
| 10. Seamless loops and share links | `unit/loop.test.ts`; `cli/score.test.ts` (loops); `e2e/share-loop.spec.ts` | 37 (10.1), 38 (10.2) |
| 11. A cursed datasheet look | `e2e/app.spec.ts` (flicker on, and off under reduced motion: 11.1, 11.2) | 11.3 to 11.6 are checked by visual review |
| 12. Kiro workspace counts stay true | `unit/kiro-counts.test.ts` (counts from `.kiro` against the sentence in each document) | none |
| 13. Phone first screen | `e2e/phone-fold.spec.ts` (no overlap, tap reaches Jump, above the fold at 375x667); `e2e/mobile.spec.ts` (the pinned button appears when the transport is out of view) | none |
| 14. Kiro IDE hooks | `unit/kiro-config.test.ts` (every `.kiro.hook` parses, known trigger, npm scripts exist) | none |
| 15. Demo render and form polish | `e2e/form-polish.spec.ts` (all errors at once, buttons enabled and the queued WAV during the demo render, Summon restarts it, label position, hint); `e2e/mobile.spec.ts` (Listen overlay small, lower left, fades); `unit/ghost.test.ts` (`progressLabelBox`); `e2e/first-load.spec.ts` (Download WAV enabled, 15.8) | none |
| 16. The possessed chip | `unit/ghost.test.ts` (message from the seed, GD3 ghost note, pinned VGM sha256, WAV hash unchanged); `e2e/possessed-chip.spec.ts` (flicker, `aria-hidden` rows, one announcement, still under reduced motion); `cli/samples.test.ts` (the sample is the CLI's export) | none |

Tasks 26 and 34 were re-checked against the current suite and stay open: `unit/operator.test.ts` covers
feedback levels 0, 2 and 5 but not 0 through 7 or the clamp at 7, and `cli/score.test.ts` runs `--quiet` and
`--help` without asserting what `--quiet` prints.

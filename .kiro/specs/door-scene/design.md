# Design: The scare lands on the event (door scene)

## Overview

```
 Enter the hallway (gesture)
        │
        ▼
 DoorScene.enter()  ── new AudioContext({ sampleRate: 44100 }), resume()
        │               fetch + decodeAudioData: stalker-loop.wav, door-slam-sting.wav   (once)
        ▼
 loop source (loop = true, 0..duration) ─> ambienceGain ─┐
                                                          ├─> ctx.destination
 sting source (one shot, per scare)     ─> stingGain ────┘

 door event (button click, tap on the door, E inside the section)
        │  eventSec = ctx.currentTime            (read once)
        ▼
 planScare({ eventSec, hitInFileSec: 1.0, preSilenceSec: 0.6, cutSec: 0.08 })
        │      { cutStartSec, cutEndSec, stingStartSec, stingOffsetSec, hitSec, hitDelaySec }
        ▼
 ambienceGain.linearRamp(0, cutEndSec)   sting.start(stingStartSec, stingOffsetSec)
        │
        ▼
 #door-offset (role="status"): "Sting landed 0.600 s after the door opened"
        ▼
 ring 2.5 s, then ambienceGain.linearRamp(1, +1.5 s), then ready for the next door event
```

The scene is a rendered-file scene. The loop and the sting are the same WAV files the Godot example plays;
the browser only schedules them on the audio clock. Nothing here is synthesized in real time.

## Files

- `src/web/views/door-timing.ts`: pure, no DOM and no Web Audio types. Exports `DOOR_TIMING` (the constants
  from `fright_score_cue.gd`: `preSilenceSec` 0.6, `hitInFileSec` 1.0, `cutSec` 0.08, `ringSec` 2.5,
  `returnSec` 1.5), `planScare(eventSec, options?)` and `formatOffset(offsetSec)`.
- `src/web/views/door.ts`: `DoorScene` class. Owns the AudioContext, the two buffers, the two gain nodes,
  the state machine and the DOM it fills in. `mountDoorScene(root: HTMLElement)` is the only export main.ts
  calls.
- `index.html`: a `<section id="door-scene" class="panel door" aria-labelledby="door-title">` after the
  stage panel (inside `<main class="board">`, as the next grid row spanning both columns).
- `src/web/styles.css`: a "Door scene" block, with a reduced-motion override and a 360 px layout.
- `src/web/main.ts`: one line, `mountDoorScene(document.getElementById('door-scene')!)`.
- `tests/unit/door-timing.test.ts`, `tests/e2e/door-scene.spec.ts`.

`?url` imports (Vite resolves them from the project root, and `examples/` is inside it, so `server.fs.allow`
needs no change):

```ts
import loopUrl from '../../../examples/godot/audio/stalker-loop.wav?url';
import stingUrl from '../../../examples/godot/audio/door-slam-sting.wav?url';
```

Both files are larger than Vite's inline limit (1.6 MB and 0.9 MB), so the build emits them as hashed asset
files and the URLs are plain paths. They are fetched only inside `enter()`.

## The timing helper

```ts
export interface ScarePlan {
  cutStartSec: number;      // eventSec: the loop starts to drop out
  cutEndSec: number;        // eventSec + cutSec: the loop is silent
  stingStartSec: number;    // eventSec: when the sting source starts on the audio clock
  stingOffsetSec: number;   // hitInFileSec - preSilenceSec: where in the file it starts (0.4)
  hitSec: number;           // stingStartSec + (hitInFileSec - stingOffsetSec): when the hit sounds
  hitDelaySec: number;      // hitSec - eventSec
}
```

For an event at `t`, `stingStartSec = t`, `stingOffsetSec = 0.4`, `hitSec = t + 0.6`. The helper throws a
`RangeError` when `preSilenceSec > hitInFileSec` (the file has less silence than the plan assumes) or any
input is negative or not finite. `formatOffset(0.6)` returns `"0.600"`.

The measured offset is `plan.hitSec - eventSec`, where `eventSec` is the one `AudioContext.currentTime`
reading and `hitSec` comes from the schedule actually handed to `AudioBufferSourceNode.start`. It is a
statement about the audio clock's schedule. It does not include the output device's latency, and the copy
says so (Requirement 4.4). The test therefore accepts 0.6 s plus or minus 0.05 s.

## State machine

| State | Entered by | Door | Loop gain |
|---|---|---|---|
| `idle` | page load, "Leave the hallway" | unavailable (`aria-disabled`, text says why) | none, no context |
| `loading` | "Enter the hallway" | unavailable | none |
| `ambient` | files decoded, loop started | available | 1 |
| `scaring` | door event | ignores events | ramps to 0 over 0.08 s, 0 until the return starts |
| `returning` | ring time over | ignores events | ramps to 1 over 1.5 s |
| `error` | fetch or decode failed | unavailable | none |

`ambient` is the only state that accepts a door event, which is how a second event is ignored (3.4).
Timers use `setTimeout` for DOM updates only (announcements, the measured line, the state change); every
sound is placed on the audio clock. "Leave the hallway" and `visibilitychange` to hidden call
`ctx.close()`, drop the nodes and go to `idle`, so the next entry builds a fresh context.

## Input

- The door is a `<button id="door" class="door__button">` with the accessible name "Open the door". The
  hallway drawing around it is `aria-hidden`. Clicking or tapping the drawn door is the button's click.
- E: a `keydown` listener on the section (not the document). It acts when `event.key` is `e` or `E`, no
  modifier is held, the target is not an input, textarea or select, and the state is `ambient`. It calls
  `preventDefault()` and `stopPropagation()`. The live keyboard listens on `document`, so the section's
  handler runs first in the bubble phase and E never reaches it. When focus is outside the section, E
  keeps playing the live keyboard's E key.
- The section is focusable through its buttons; "focus inside" means `section.contains(document.activeElement)`
  and is what the E handler tests. The section text says "Press E while this scene has focus."

## Accessibility and motion

- `#door-offset` is `role="status"` `aria-live="polite"` and holds the measured sentence. A second
  `aria-live="polite"` region (`#door-announce`, visually hidden) carries the state changes.
- Before the first scare `#door-offset` reads "Enter the hallway, then open the door to measure the scare."
- A visible focus ring on all three buttons uses the app's existing focus style.
- `@media (prefers-reduced-motion: reduce)`: the door swing, the lamp flicker and the flash on the hit are
  removed; the door gets a class (`is-open`) that changes its drawing instantly. This matches the global
  reduced-motion rule the app already has, and the scene adds no animation outside it.
- At 360 px the hallway SVG scales with `width: 100%` and `height: auto`, the three controls wrap, and
  nothing sets a fixed width. The existing mobile test's no-overflow check is repeated for this section.

## Loop details

Web Audio ignores the `smpl` chunk that Godot reads, so the loop source sets `loop = true`, `loopStart = 0`
and `loopEnd = buffer.duration`. The file is a whole-bar seamless loop with release tails wrapped onto the
start (Requirement 10 of fright-score-core), so a whole-file loop has no seam. `decodeAudioData` runs at
44,100 Hz because the context is created at that rate, so the buffers are not resampled.

## Risks and decisions

| Question | Decision |
|---|---|
| Reuse the Player's AudioContext? | No. The Player's context starts on Play; this scene must be able to start on its own and close on leave. A second context is cheap and keeps the two separate. |
| Start the loop on the first door press? | No. Entering and scaring are two gestures, so the loop is audible before the event and the cut is audible. |
| E also plays a live-keyboard note | The section handler stops propagation when it acts. Covered by an e2e check that no live voice starts. |
| Are the browser and Godot bytes really the same? | The e2e test fetches the served asset URLs and compares their SHA-256 with the files on disk. |
| Event time precision | `currentTime` advances in 128-frame blocks (about 2.9 ms at 44.1 kHz). The test's 0.05 s tolerance is far wider. |

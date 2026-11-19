# Changelog

## Unreleased

### Added

- **The sting lands on screen.** When the playhead crosses a sting, the page flashes a blood vignette, the
  timeline shakes with a chromatic split, the chip's pads flare and the playhead turns red. Under reduced
  motion it is a still red frame.
- **A 60-second path to the scare:** a Listen button on the timeline that says when the scare lands, a Jump
  to the scare button that starts six seconds before it, and a callout that leads to the live keyboard.
- **Sega Genesis export:** any cue as a VGM 1.50 file of YM2612 register writes, from the app (Download for
  Sega Genesis) or the CLI (`--vgm`).
- **The stitch panel:** the director's plan as JSON beside the YM2612 register writes it becomes, following
  the playhead.
- **Atmosphere:** the page's vignette deepens with the intensity of the section playing, over a film-grain
  layer.
- **Render progress** sweeps across the timeline while a cue renders.
- **Accessibility:** the timeline is a keyboard slider (arrows, Page Up/Down, Home, End), form errors appear
  next to their field, control borders meet 3:1 contrast, and on phones the cue comes before the form.
- **Samples, a GIF and a fresh screenshot** in the README, rendered by `scripts/make-samples.sh`.
- **A Godot 4 example** that loops an export with no code, with a headless check.
- **`npm run bench`** times the demo cue from request to WAV.
- `E2E_PORT` sets the port for the end-to-end tests.

### Changed

- The README and the page lead with the pitch: horror music for a game jam, with the scare on the second you
  ask for.
- Examples write cue times as `1:10` rather than `0:70` (both are still accepted).
- Long section names on the timeline are shortened at a word boundary.

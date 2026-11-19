---
inclusion: manual
---
# Export formats

Pull this in with `#export-formats` when working on the WAV or Sega Genesis export.

## WAV (`src/wav/wav.ts`)
- PCM, 44.1 kHz, 16-bit, stereo, little-endian, a canonical 44-byte header. TPDF dither from a seeded
  generator (the CLI and the browser both use `seed ^ 0x5eed`), so the same cue gives the same bytes.
- Exactly `durationSec × 44,100` frames.
- Loops add one `smpl` chunk (36 bytes plus one 24-byte loop record) marking the whole file as a forward loop,
  start frame 0, end frame `frameCount - 1`. Godot's "Detect From WAV" import and most samplers read it.
- `parseWav` reads the chunk back; tests compare whole files byte for byte, never just headers.

## VGM 1.50 for the Sega Genesis (`src/export/vgm.ts`)
- One NTSC YM2612 at 7,670,453 Hz; header offset 0x2C. Six FM channels, no DAC, no PSG.
- Commands: `0x52`/`0x53` write port 0/1, `0x61 nn nn` waits n samples, `0x70`-`0x7F` wait 1 to 16 samples,
  `0x66` ends the data. Timing is in 44,100 Hz samples, so a write lands on the same sample as the WAV.
- Loops set the loop offset (0x1C, relative) just after the setup writes, and the loop length (0x20) to the
  whole cue. A GD3 tag names the cue.
- Patches map onto registers by `ymPatch`: algorithm, feedback, MUL, DT, TL and envelope rates fitted to the
  chip's rate table. The sting always gets all six channels; other notes may be dropped and are counted.

## Proof
- `tests/unit/vgm.test.ts` covers tuning, register mapping, the envelope model, the sting's sample and loops.
- `tests/cli/samples.test.ts` checks the committed `.vgm` sample and the Godot WAVs against a fresh CLI render.

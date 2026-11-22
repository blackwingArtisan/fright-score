---
inclusion: fileMatch
fileMatchPattern: ["src/engine/**", "src/web/live/**"]
---
# Engine and DSP rules

Loaded only when a file in the FM engine or the live chip is in context.

## The sound path
- Everything renders at `SAMPLE_RATE` (44,100 Hz) in stereo Float32; only `src/wav/` turns it into 16-bit PCM.
- LFO, pitch bend and voice scheduling update once per `CONTROL_BLOCK` (32 samples). Per-sample work stays in
  the operator and envelope inner loops.
- Oscillators read the sine lookup table (`sine.ts`), never `Math.sin`, like the chip's log-sin ROM.
- Operator 1 feedback uses the eight `FEEDBACK_CYCLES` steps (levels 0 to 7). A full-scale modulator swings
  its target by `MOD_SCALE_CYCLES` (2 cycles).

## Hot loops
- No allocation, closures or array spreads inside a per-sample loop; reuse buffers made once per render.
- Keep `Voice`, `Operator` and `Envelope` free of DOM and Web Audio types: the AudioWorklet (`LiveChipCore`),
  the Web Worker and the Node CLI all run this exact code.

## Never break these
- Determinism: no `Math.random`, `Date.now` or iteration over unordered keys in engine code. The
  determinism-guard hook and `npm run check:determinism` enforce it.
- The master chain keeps the final true peak at or under -3 dBTP (`master.ts`); loudness is measured with
  BS.1770 in `loudness.ts`, and the loudness tests must stay green.
- `LiveChipCore` must stay sample-for-sample equal to the offline voice (`tests/unit/live-core.test.ts`).
- Any change to the sound changes bytes: rerun `bash scripts/make-samples.sh`, update the Godot audio and the
  demo hash in `src/web/demo.ts`, and say so in the commit.

## Check an audio change through the MCP server
After any change to the engine, call `score_cue` through the `fright-score` MCP server on the README's golden cue
(`{ "mood": "chase", "durationSec": 30, "stingAtSec": [24], "seed": 3, "writeWavTo": "golden-check.wav" }`), then call
`verify_cue` on the written file with `expectedHitSec: [24]`, and delete the file afterwards. The sting must measure
within 50 ms of 24 s. The `sha256` the first call returns should equal the README's
`3e289fecc70aa4e968ef6ebf59ed8683fe41d2c40749af73aa63e98900d6908d`. A different hash means the sound changed: that is
expected only when the change was meant to alter audio, and then the README hash, the samples, the Godot audio and
`examples/godot/level-manifest.json` are regenerated and the new hash is stated in the commit. An unexpected change
is a bug, and a sting that misses 24 s is a timing bug.

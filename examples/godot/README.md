# Fright Score in Godot

A minimal Godot 4 project that uses two files exported from Fright Score:

- `audio/stalker-loop.wav`: an 8-second stalker loop, exported with **Seamless loop for games**
  (`npm run score -- --mood stalker --seconds 8 --loop --seed 7`).
- `audio/door-slam-sting.wav`: a short chase cue with a sting at 0:01
  (`npm run score -- --mood chase --seconds 5 --sting 0:01 --seed 3`).

Open the folder in Godot and press Play: the loop runs forever as ambience and Space fires the sting.
There is no looping code. Fright Score writes loop points into the WAV's `smpl` chunk, and Godot's
default WAV import ("Detect From WAV") reads them.

## Check it from the command line

```bash
godot --headless --path examples/godot --import
godot --headless --path examples/godot --script res://verify.gd
```

Output with Godot 4.7.2:

```
stalker-loop.wav: loop_mode=1 loop_begin=0 loop_end=396899 frames=396900 mix_rate=44100 stereo=true
door-slam-sting.wav: loop_mode=0
PASS
```

`loop_mode=1` is `AudioStreamWAV.LOOP_FORWARD`: Godot found the loop and will repeat the whole file
without a gap. The sting has no loop points, so it plays once.

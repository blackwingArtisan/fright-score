# Fright Score in Godot

A minimal Godot 4 project and a small add-on that land a Fright Score sting on a game event: the scare
hits when the player opens the door, not at a fixed second of a track.

It uses two files exported from Fright Score:

- `audio/stalker-loop.wav`: an 8-second stalker loop, exported with **Seamless loop for games**
  (`npm run score -- --mood stalker --seconds 8 --loop --seed 7`).
- `audio/door-slam-sting.wav`: a short chase cue with a sting at 0:01
  (`npm run score -- --mood chase --seconds 5 --sting 0:01 --seed 3`). Fright Score clears the 0.6 s before
  every sting, so the file is quiet from 0:00.4 until the hit.

Open the folder in Godot and press Play. The hallway loop runs as ambience. Press **E** to open the cellar
door: the loop cuts to silence, and the sting lands 0.6 s later, out of the quiet, wherever the loop happens
to be. The loop returns once the sting has rung out.

## The add-on

`addons/fright_score/fright_score_cue.gd` adds a `FrightScoreCue` node. Give it a loop and a sting, then
call `scare()` from any game event:

```gdscript
$Door.opened.connect($Cue.scare)
```

On `scare()` the node fades the loop out over `cut_sec` (0.08 s), starts the sting file at
`sting_hit_sec - pre_silence_sec` (the top of its silence), emits `scare_landed` when the hit sounds, and
fades the loop back in after `ring_sec`. The loop itself needs no code: Fright Score writes loop points into
the WAV's `smpl` chunk, and Godot's default WAV import ("Detect From WAV") reads them.

## Check it from the command line

```bash
godot --headless --path examples/godot --import
godot --headless --path examples/godot --script res://verify.gd
godot --headless --path examples/godot --script res://verify_scare.gd
```

`verify.gd` checks that Godot imported the loop with its loop points. Output with Godot 4.7.2:

```
stalker-loop.wav: loop_mode=1 loop_begin=0 loop_end=396899 frames=396900 mix_rate=44100 stereo=true
door-slam-sting.wav: loop_mode=0
PASS
```

`verify_scare.gd` runs the real scene headless, opens the door 0.5 s in and times what happens. Output with
Godot 4.7.2:

```
door opened at 0.506 s; loop silent 0.064 s later; sting file started at 0.40 s
hit landed 0.598 s after the door opened (target 0.60 s, frame 0.031 s); scares started: 1
loop back at 0.0 dB, 4.00 s after the hit
PASS
```

The hit lands within one frame of 0.6 s after the event, a second open of the door is ignored, and the
loop comes back to full level.

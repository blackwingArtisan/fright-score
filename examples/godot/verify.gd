extends SceneTree
## Headless check that Godot imported the Fright Score loop with its loop points.
##   godot --headless --path examples/godot --import
##   godot --headless --path examples/godot --script res://verify.gd
## Exits 0 and prints PASS when the loop plays forward between the WAV's smpl loop points.


func _init() -> void:
	var loop: AudioStreamWAV = load("res://audio/stalker-loop.wav")
	var sting: AudioStreamWAV = load("res://audio/door-slam-sting.wav")
	var frames := int(loop.get_length() * loop.mix_rate + 0.5)
	var ok: bool = loop.loop_mode == AudioStreamWAV.LOOP_FORWARD \
		and loop.loop_begin == 0 \
		and abs(loop.loop_end - frames) <= 1 \
		and sting.loop_mode == AudioStreamWAV.LOOP_DISABLED \
		and loop.mix_rate == 44100 and loop.stereo
	print("stalker-loop.wav: loop_mode=%d loop_begin=%d loop_end=%d frames=%d mix_rate=%d stereo=%s" % [loop.loop_mode, loop.loop_begin, loop.loop_end, frames, loop.mix_rate, loop.stereo])
	print("door-slam-sting.wav: loop_mode=%d" % sting.loop_mode)
	print("PASS" if ok else "FAIL")
	quit(0 if ok else 1)

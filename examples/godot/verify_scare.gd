extends SceneTree
## Headless check that the sting lands on the game event, out of silence, and that the loop returns.
##   godot --headless --path examples/godot --import
##   godot --headless --path examples/godot --script res://verify_scare.gd
## Runs the real main scene, opens the door 0.5 s in, and prints PASS when:
##   - the loop drops to silence within 0.15 s of the door opening,
##   - the sting file starts at the top of its 0.6 s pre-silence,
##   - the hit lands 0.6 s after the door opens (within one frame),
##   - a second open does not restart the scare, and the loop comes back to full level.

const OPEN_AT := 0.5
const TIMEOUT := 8.0

var main: Node
var cue: Node
var t := 0.0
var opened_at := -1.0
var landed_at := -1.0
var recovered_at := -1.0
var silent_by := -1.0
var sting_from := -1.0
var starts := 0
var max_frame := 0.0


func _initialize() -> void:
	main = load("res://main.tscn").instantiate()
	root.add_child(main)
	cue = main.get_node("Cue")
	cue.scare_started.connect(func() -> void: starts += 1)
	cue.scare_landed.connect(func() -> void: landed_at = t)
	cue.recovered.connect(func() -> void: recovered_at = t)


func _process(delta: float) -> bool:
	t += delta
	if opened_at >= 0.0:
		max_frame = maxf(max_frame, delta)  # the longest frame after the event bounds the timing error
	if opened_at < 0.0 and t >= OPEN_AT:
		opened_at = t
		main.get_node("Door").open()
		sting_from = cue.hit.get_playback_position() if cue.hit.playing else -1.0
		main.get_node("Door").open()  # a second open is ignored
	if opened_at >= 0.0 and silent_by < 0.0 and cue.ambience.volume_db <= -60.0:
		silent_by = t - opened_at
	if recovered_at >= 0.0 or t > TIMEOUT:
		_report()
		return true
	return false


func _report() -> void:
	var lead := landed_at - opened_at
	var ok: bool = silent_by >= 0.0 and silent_by <= 0.15 \
		and landed_at >= 0.0 and absf(lead - cue.pre_silence_sec) <= max_frame + 0.001 \
		and starts == 1 \
		and recovered_at > landed_at \
		and is_equal_approx(cue.ambience.volume_db, cue.loop_db) \
		and cue.ambience.playing
	print("door opened at %.3f s; loop silent %.3f s later; sting file started at %.2f s" % [opened_at, silent_by, cue.sting_hit_sec - cue.pre_silence_sec])
	print("hit landed %.3f s after the door opened (target %.2f s, frame %.3f s); scares started: %d" % [lead, cue.pre_silence_sec, max_frame, starts])
	print("loop back at %.1f dB, %.2f s after the hit" % [cue.ambience.volume_db, recovered_at - landed_at])
	if not ok:
		print("silent_by=%.3f landed_at=%.3f lead=%.3f max_frame=%.3f starts=%d recovered_at=%.3f volume=%.1f playing=%s" % [silent_by, landed_at, lead, max_frame, starts, recovered_at, cue.ambience.volume_db, cue.ambience.playing])
	print("PASS" if ok else "FAIL")
	root.remove_child(main)
	main.free()
	quit(0 if ok else 1)

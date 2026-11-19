class_name FrightScoreCue
extends Node
## Plays a Fright Score loop as ambience and lands a sting on a game event, not at a fixed time.
##
## Call scare() when the event happens (the player opens the door). The loop cuts to silence, the sting
## file starts at the top of its pre-silence, and the hit lands pre_silence_sec later, out of the quiet,
## the way Fright Score places a sting inside a cue. The loop comes back once the sting has rung out.
##
## The loop needs no code: Godot reads the loop points Fright Score writes into the WAV's smpl chunk.

## Emitted when scare() is called and the loop drops out.
signal scare_started
## Emitted at the moment the hit lands.
signal scare_landed
## Emitted when the loop is back at full level.
signal recovered

## A Fright Score export made with "Seamless loop for games".
@export var loop: AudioStream
## A Fright Score cue with a sting: `npm run score -- --mood chase --seconds 5 --sting 0:01`.
@export var sting: AudioStream
## Where the hit sits in the sting file, in seconds (the --sting time).
@export var sting_hit_sec := 1.0
## Silence before the hit. Fright Score clears 0.6 s before every sting.
@export var pre_silence_sec := 0.6
## How fast the loop drops out when the event fires.
@export var cut_sec := 0.08
## How long the sting rings before the loop starts to return.
@export var ring_sec := 2.5
## How long the loop takes to fade back in.
@export var return_sec := 1.5
## Level of the loop while it plays, in dB.
@export var loop_db := 0.0

const SILENT_DB := -80.0

var ambience: AudioStreamPlayer
var hit: AudioStreamPlayer
var is_scaring := false
var _tween: Tween


func _ready() -> void:
	ambience = AudioStreamPlayer.new()
	ambience.name = "Ambience"
	ambience.stream = loop
	ambience.volume_db = loop_db
	add_child(ambience)
	hit = AudioStreamPlayer.new()
	hit.name = "Hit"
	hit.stream = sting
	add_child(hit)
	if loop:
		ambience.play()


## Land the sting now. Ignored while a scare is already playing.
func scare() -> void:
	if is_scaring or sting == null:
		return
	is_scaring = true
	scare_started.emit()
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(ambience, "volume_db", SILENT_DB, cut_sec)
	hit.play(maxf(0.0, sting_hit_sec - pre_silence_sec))
	_tween.tween_interval(maxf(0.0, pre_silence_sec - cut_sec))
	_tween.tween_callback(func() -> void: scare_landed.emit())
	_tween.tween_interval(ring_sec)
	_tween.tween_property(ambience, "volume_db", loop_db, return_sec)
	_tween.tween_callback(_on_recovered)


func _on_recovered() -> void:
	is_scaring = false
	recovered.emit()

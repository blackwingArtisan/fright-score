extends Area2D
## A door the player opens. It only reports the event; the music decides what to do with it.

signal opened

var is_open := false


func open() -> void:
	if is_open:
		return
	is_open = true
	$Panel.modulate = Color(0.1, 0.02, 0.02)
	opened.emit()

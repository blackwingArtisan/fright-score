extends Node
## Plays the Fright Score loop as ambience and fires the sting on demand.
## The loop needs no code: Godot reads the loop points Fright Score writes into the WAV.


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("scare"):
		$Sting.play()

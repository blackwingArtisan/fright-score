extends Node
## The hallway loops as ambience. Press E to open the cellar door: the music cuts to silence and the
## sting lands 0.6 s later, on the event, wherever the player happens to be in the loop.


func _ready() -> void:
	$Door.opened.connect($Cue.scare)
	$Cue.scare_landed.connect(func() -> void: $Hint.text = "Something was waiting behind the door.")


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("open_door"):
		$Door.open()

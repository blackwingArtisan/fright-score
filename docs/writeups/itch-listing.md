# itch.io listing: Fright Score CC0 horror starter pack

Listing copy for a free asset pack built from `scripts/make-starter-pack.sh`.

- **Title:** Fright Score: CC0 Horror Loops and Stings (Sega Genesis FM)
- **Kind of project:** Assets
- **Pricing:** Free (no minimum), donations off
- **Tags:** horror, music, sound-effects, psx, game-jam, chiptune, retro, loop, cc0
- **Genre:** Horror
- **License:** CC0 1.0 (public domain dedication)

## Short description (shown on cards)

5 seamless horror loops and 20 jump-scare stings from a recreated Sega Genesis FM chip. CC0, loop points
built in, every sting timed to land 0.6 s after your game event.

## Body

**Horror music for your jam, free and public domain.**

This pack holds 5 seamless loops (dread, stalker, chase, lullaby and ritual) and 20 short stings, all rendered by
Fright Score, an open-source tool where a score director writes the sheet music and a recreated Sega Genesis
FM chip performs it.

- **Loops that loop.** Every loop WAV carries loop points in its `smpl` chunk, which Godot, many samplers and
  most engines read on import. Whole bars, no fades, no click at the seam.
- **Stings that land on the event.** Each sting hits at 0:01, after 0.6 s of planned silence. Start the file at
  0.4 s, the top of that silence, and the hit lands 0.6 s after your door opens (the free Godot add-on does this
  for you).
- **Period-correct sound.** Four-operator FM, the sound of the Genesis era, for PSX-style and retro horror.
- **Public domain (CC0).** Use them in anything, commercial or not. No credit required, though a link is welcome.
- **Reproducible.** `starter-pack-manifest.csv` lists the request, seed and sha256 of every file. Rerun the
  script and you get the same bytes.

Need a different length, a sting at an exact second, or a cue for your own scene? Make one free in your browser
at https://fright-score.pages.dev. The source is MIT licensed at https://github.com/blackwingArtisan/fright-score.

**Files:** `loops/` (5 WAV, 44.1 kHz 16-bit stereo), `stings/` (20 WAV), `starter-pack-manifest.csv`, `LICENSE.txt` (CC0 1.0).

## Cover image

630x500 PNG: the Fright Score masthead in Pirata One on the dark circuit-board background, a blood-red
waveform with a gap of silence before the hit, and the line "CC0 horror loops and stings". Crop from
`docs/screenshot.jpg` and `docs/genesis-proof.png`.

## Community post (for one running horror jam)

> Free CC0 horror loops and stings for this jam: 5 seamless loops with loop points and 20 stings timed to land
> 0.6 s after a game event (door, lights out). Made with an open-source FM chip tool you can also use in the
> browser for a custom cue. Link: <listing URL>. Good luck with your builds.

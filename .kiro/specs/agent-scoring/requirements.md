# Requirements: Agent scoring

## Introduction

The stdio MCP server in `scripts/mcp/` lets an agent score one cue (`score_cue`) and list the instruments
(`list_patches`). An agent that builds a whole jam game needs more: a seamless loop for every room, a short
sting for every event, proof that each sting lands where the game expects it, and a way to learn the moods
and to be walked through the job. This feature extends the same server with two tools, one prompt and one
resource, and wires them into the Godot example.

- `score_level` renders, for 1 to 8 rooms, one seamless loop per room and one sting file per event, with the
  local director only.
- `verify_cue` reads a 16-bit PCM WAV, finds each sting onset that follows a planned silence, and reports the
  measured time, the error in milliseconds and pass or fail.
- The prompt `score_scene_for_game` asks the agent for the rooms and events, then calls `score_level` and
  `verify_cue`.
- The resource `fright-score://moods` lists each mood with its tempo range and loudness ceiling, read from
  the code.
- `examples/godot/level.json` describes a two-room level and `examples/godot/level-manifest.json` is the
  committed manifest a test regenerates byte for byte.

The one-line rule still holds: the AI writes the sheet music, never the sound. The agent decides the rooms,
moods and events. The local rule-based director and the FS-666 chip make every sample, so the same arguments
and seed give the same bytes, and no paid service or network is involved.

Terms used below. A **sting file** is a 5 s cue with one sting whose hit sits at 1.0 s in the file, with
0.6 s of pre-silence before it. Played from 0.4 s into the file (`startFromSec`), the hit sounds 0.6 s after
playback starts. This is how `examples/godot/addons/fright_score/fright_score_cue.gd` and the door scene play
`door-slam-sting.wav`. `hitSec` is the position of the hit inside the file.

## Requirement 1: score_level renders a loop per room and a sting per event

**User story:** As an agent building a game, I want one call that scores every room and event, so that I get
a complete, repeatable set of audio files and their hashes.

### Acceptance criteria

1. a. THE tool `score_level` SHALL appear in `tools/list` with an input schema generated from its zod schema.
   b. THE input SHALL be `{ rooms, seed, writeDir? }`, where `rooms` holds 1 to 8 entries of
   `{ id, mood, loopSec, events }` and `seed` is an integer from 0 to 4,294,967,295 that defaults to 13.
   c. EACH `id` of a room or an event SHALL match `^[a-z][a-z0-9_]{0,31}$`, so it is safe in a file name.
   d. `mood` SHALL be one of the moods of `MOODS`, `loopSec` SHALL be a number from 4 to 60, and `events`
   SHALL hold 0 to 8 entries of `{ id, scene? }` where `scene` is a string of up to 500 characters.
2. IF two rooms share an id, or two events of one room share an id, THEN THE tool SHALL return an `isError`
   result that names the duplicate id and SHALL render nothing.
3. IF the input does not match the schema THEN THE tool SHALL return an `isError` result with the validation
   message, the same way `score_cue` does, and THE server SHALL keep answering.
4. a. WHEN the input is valid THE tool SHALL return `{ director: "local", seed, rooms }`, where each room has
   `id`, `mood`, one `loop` and one `events` array in the order given.
   b. THE `loop` SHALL hold `sha256`, `wavBytes`, `durationSec`, `loopStartSample` and `loopEndSample`, read
   from the rendered WAV and its `smpl` chunk.
   c. EACH event SHALL hold `id`, `sha256`, `wavBytes`, `durationSec`, `hitSec`, `startFromSec` and
   `hitAfterStartSec`.
5. a. THE loop SHALL be a seamless loop rendered with the local director, the room's mood and a whole-bar
   duration near `loopSec`, with the loop points written to the WAV.
   b. THE loop's start sample SHALL be 0 and its end sample SHALL equal the number of frames in the file.
6. a. EACH sting file SHALL be rendered with the local director, the room's mood, a duration of 5 s and one
   sting at 1.0 s.
   b. THE tool SHALL treat `scene` as description text for the director and SHALL ignore any sting time
   written inside it.
   c. THE reported `hitSec` SHALL be the landing time of the sting's first note in the realized score, which
   is 1.0 s, `startFromSec` SHALL be `hitSec` minus 0.6, and `hitAfterStartSec` SHALL be 0.6.
7. a. THE tool SHALL derive one seed for each file from the request `seed`, the room id and the event id, so
   that the loop of a room and each sting have their own seed.
   b. THE derived seed of a file SHALL NOT depend on the other rooms or events in the request.
8. THE same arguments and seed SHALL always return the same hashes, sample positions and times.
9. THE tool SHALL NOT read `FRIGHT_DIRECTOR`, AWS settings or the network, and SHALL use the local director
   whatever the environment says.
10. a. WHEN `writeDir` is given THE tool SHALL write each WAV and a `manifest.json` into that folder, named
    `<room>.loop.wav`, `<room>.<event>.sting.wav` and `manifest.json`, and SHALL return the folder path.
    b. WHILE `writeDir` is absent THE tool SHALL write no file.
    c. THE `writeDir` SHALL name a folder that does not exist yet, inside the server's working folder, after
    symbolic links are resolved.
    d. IF `writeDir` exists, resolves outside the working folder, or is the working folder itself, THEN THE
    tool SHALL return an `isError` result and SHALL write nothing.
    e. THE tool SHALL check `writeDir` before rendering anything, and SHALL create every file with the `wx`
    flag so that it never overwrites a file.
    f. THE tool SHALL write only the file names listed in 10a, and SHALL refuse any other extension.
11. THE `manifest.json` SHALL hold `schema` (the number 1), `director`, `seed` and the `rooms` array of
    criterion 4 with each file's relative `file` name, SHALL contain no absolute path, date, version or
    other value that changes between runs, and SHALL be written as `JSON.stringify(value, null, 2)` followed
    by one newline.
12. THE result without `writeDir` SHALL equal the result with it, except for the `writeDir` field.

## Requirement 2: verify_cue measures where the stings land

**User story:** As an agent, I want to measure a rendered file instead of trusting the plan, so that I can
tell the user the sting lands where the game needs it.

### Acceptance criteria

1. a. THE tool `verify_cue` SHALL appear in `tools/list` with an input schema generated from its zod schema.
   b. THE input SHALL be `{ wavPath, expectedHitSec, toleranceMs? }`, where `expectedHitSec` holds 1 to 16
   numbers from 0 to 300 and `toleranceMs` is a number from 1 to 1000 that defaults to 50.
2. a. THE `wavPath` SHALL name an existing `.wav` file inside the server's working folder, after symbolic
   links are resolved.
   b. IF `wavPath` is outside the working folder, does not end in `.wav`, does not exist or is larger than
   64 MB THEN THE tool SHALL return an `isError` result and SHALL read nothing.
   c. THE tool SHALL NOT write any file.
3. IF the file is not a RIFF/WAVE file with 16-bit PCM samples THEN THE tool SHALL return an `isError`
   result that says what was wrong.
4. a. THE tool SHALL read the file with `parseWav`, mix the channels to mono, and find every onset, where an
   onset is the first sample whose absolute level reaches -50 dBFS after a stretch of at least 0.5 s in
   which every 2 ms window has an RMS below -50 dBFS, and where the start of the file counts as silence.
   b. THE tool SHALL pair each expected time with the nearest unused onset within 500 ms, in ascending order
   of the expected times.
   c. THE onsets, the pairing and the thresholds SHALL be deterministic: the same file and arguments always
   give the same result.
5. a. THE result SHALL be `{ wavPath, durationSec, toleranceMs, pass, results }`, where each entry of
   `results` has `expectedHitSec`, `measuredSec`, `errorMs` and `pass`.
   b. `measuredSec` SHALL be rounded to the millisecond, `errorMs` SHALL be `measuredSec - expectedHitSec`
   in milliseconds, and `pass` SHALL be true when the absolute error is at most `toleranceMs`.
   c. IF no onset lies within 500 ms of an expected time THEN THE entry SHALL have `measuredSec: null`,
   `errorMs: null` and `pass: false`.
   d. THE top-level `pass` SHALL be true only when every entry passes.
6. WHEN the file is a sting file from `score_level` THE tool SHALL measure its onset at 1.0 s within 10 ms.
7. WHEN the file is the golden cue of the README (`mood: chase`, `durationSec: 30`, `stingAtSec: [24]`,
   `seed: 3`) THE tool SHALL measure its sting at 24 s within the default tolerance.
8. IF the file contains no silence of 0.5 s followed by sound THEN THE tool SHALL return an empty onset
   list, and every entry SHALL fail with `measuredSec: null`.

## Requirement 3: The prompt score_scene_for_game

**User story:** As a user of an MCP client, I want a ready-made prompt that walks the agent through scoring
my game, so that I do not have to explain the tools.

### Acceptance criteria

1. a. THE server SHALL declare the `prompts` capability in its `initialize` reply.
   b. WHEN a client sends `prompts/list` THE server SHALL return one prompt, `score_scene_for_game`, with a
   description and its arguments.
2. a. THE prompt SHALL take two optional string arguments: `game`, a one-line description of the game, and
   `writeDir`, a new folder name for the files.
   b. WHEN a client sends `prompts/get` with the name and arguments THE server SHALL return a `description`
   and one user message with text content.
3. THE message text SHALL tell the agent, in this order, to
   a. ask the user for the rooms (an id, a mood from `fright-score://moods` and a loop length of 4 to 60 s)
   and, for each room, the events that need a sting (an id and an optional scene sentence);
   b. call `score_level` with those rooms and one seed, and with `writeDir` when the user wants files;
   c. call `verify_cue` on every written sting file with `expectedHitSec` set to the `hitSec` the tool
   returned, and report each measured time, error and pass or fail;
   d. tell the user that the AI planned the rooms and events, the local rule-based director wrote the score,
   and the FS-666 chip made every sound.
4. THE message text SHALL NOT call the local director an AI model.
5. WHEN `game` is given THE message text SHALL include it, and WHEN a string argument is longer than 200
   characters THE server SHALL return error `-32602`.
6. IF the prompt name is unknown, or an argument is not a string, THEN THE server SHALL return error `-32602`.

## Requirement 4: The resource fright-score://moods

**User story:** As an agent, I want to read the available moods and their loudness before I choose them, so
that my rooms use values the server accepts.

### Acceptance criteria

1. a. THE server SHALL declare the `resources` capability in its `initialize` reply.
   b. WHEN a client sends `resources/list` THE server SHALL return one resource with the uri
   `fright-score://moods`, a name, a description and the mime type `application/json`.
2. WHEN a client sends `resources/read` with that uri THE server SHALL return one content item with the same
   uri, the mime type `application/json` and the JSON text of the moods.
3. a. THE JSON SHALL hold one entry per member of `MOODS`, in that order, with `id`, `label`, `tagline`,
   `tempoBpm: { min, max }` and `loudnessCeilingLufs`.
   b. THE values SHALL be read from `MOOD_PROFILES` and `MOOD_LOUDNESS_LUFS` when the request arrives, with
   no copy of them in `scripts/mcp/`.
4. IF the uri is unknown THEN THE server SHALL return error `-32002` with the uri in its data.
5. WHEN a client sends `resources/templates/list` THE server SHALL return an empty list.

## Requirement 5: The protocol surface stays correct

**User story:** As the maintainer, I want the new methods to follow the same rules as the old ones, so that
every client that worked before still works.

### Acceptance criteria

1. THE `initialize` reply SHALL declare `tools`, `prompts` and `resources`, and SHALL keep the protocol
   versions, the `serverInfo` and the version negotiation it has today.
2. THE server SHALL keep answering `initialize`, `ping`, `tools/list` and `tools/call` exactly as before, and
   the existing tests of `tests/cli/mcp.test.ts` SHALL pass unchanged except for the capabilities
   assertion.
3. THE server SHALL list `score_cue`, `list_patches`, `score_level` and `verify_cue`, in that order.
4. THE server SHALL write only protocol messages to standard output, SHALL handle one message at a time in
   arrival order and SHALL exit with code 0 when standard input closes.
5. THE server SHALL NOT add an npm dependency.

## Requirement 6: The Godot example describes its level

**User story:** As a game developer, I want a level description and a manifest in the Godot example, so that
I can see what an agent produced and check that I get the same files.

### Acceptance criteria

1. a. THE file `examples/godot/level.json` SHALL hold the arguments of `score_level` for two rooms: `hallway`
   (mood `stalker`, one event `door_opened`) and `cellar` (mood `dread`, one event `lights_out`), with a
   `seed` and a `loopSec` for each room and a `scene` for each event.
   b. THE file SHALL be accepted by the `score_level` schema without change.
2. THE file `examples/godot/level-manifest.json` SHALL equal, byte for byte, the `manifest.json` that
   `score_level` writes for `level.json`.
3. THE repository SHALL NOT commit the WAV files that `score_level` writes for the level.
4. THE `examples/godot/README.md` SHALL say how to regenerate the files through the MCP server and that the
   manifest pins their hashes.
5. THE existing Godot project, its two WAV files and its headless checks SHALL stay as they are.

## Requirement 7: Kiro checks audio changes through the server

**User story:** As the maintainer, I want Kiro to verify audio changes with the project's own tools, so that a
change to the sound is measured before it is merged.

### Acceptance criteria

1. THE file `.kiro/steering/engine-dsp.md` SHALL tell Kiro, after a change to audio code, to call `score_cue`
   of the `fright-score` MCP server on the README's golden cue and then `verify_cue` on the written file.
2. THE steering line SHALL keep the file's front matter, its other sections and its inclusion mode.
3. THE steering line SHALL say that a changed hash is expected only when the sound was meant to change, and
   that `bash scripts/make-samples.sh` and the demo hash in `src/web/demo.ts` are then updated.

## Requirement 8: Tests that need no audio device, AWS or network

**User story:** As the project owner, I want the new surface pinned by tests that run anywhere, so that it
cannot drift.

### Acceptance criteria

1. THE tests SHALL spawn the server over stdio as `tests/cli/mcp.test.ts` does, with no `AWS_*` variable and
   `FRIGHT_DIRECTOR=bedrock`.
2. THE tests SHALL call no paid service and no network address.
3. THE tests SHALL leave no file behind: every written file lives in a temporary working folder that the
   test removes.
4. THE tests SHALL keep each rendered cue short, so that the file adds no more than about 30 s to the CLI
   test run.
5. THE determinism check (`npm run check:determinism`) SHALL still pass, and no code under `src/engine/`,
   `src/score/`, `src/director/` or `src/wav/` SHALL change.

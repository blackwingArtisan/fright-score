# Design: Agent scoring

## Overview

```
 MCP client (Kiro, any agent)
   │  prompts/get score_scene_for_game ──> text that walks the agent through the job
   │  resources/read fright-score://moods ─> moods, tempo ranges, loudness ceilings (from the code)
   │
   │  tools/call score_level { rooms, seed, writeDir? }
   │        for each room:  seed(room,loop) ─> scoreFromRequest(LocalDirector, { mood, durationSec: loopSec, loop })
   │                                         ─> renderScore ─> encodeWav({ loop: true }) ─> sha256, loop samples
   │        for each event: seed(room,event) ─> scoreFromRequest(LocalDirector, { mood, scene, durationSec: 5, stingAtSec: [1] })
   │                                         ─> renderScore ─> encodeWav ─> sha256, hitSec 1.0
   │        writeDir? ─> <room>.loop.wav, <room>.<event>.sting.wav, manifest.json   (wx, new folder, inside cwd)
   │
   │  tools/call verify_cue { wavPath, expectedHitSec[], toleranceMs }
   │        parseWav ─> mono ─> 2 ms RMS windows ─> onsets after >= 0.5 s of silence ─> pair, measure, pass or fail
   ▼
 scripts/mcp/fright-score-mcp.ts   tools, prompts and resources dispatch
 scripts/mcp/tools.ts              score_cue, list_patches (unchanged) + score_level, verify_cue
 scripts/mcp/level.ts              score_level: schema, seed derivation, rendering, manifest
 scripts/mcp/onsets.ts             pure onset finder used by verify_cue
 scripts/mcp/paths.ts              checkWavPath moved here with checkNewDir and checkReadablePath
 scripts/mcp/prompts.ts            the prompt
 scripts/mcp/resources.ts          the moods resource
```

The model's job is to choose rooms, moods and events. Everything that makes a sample is the pipeline that exists
today. No file under `src/` changes.

## What the existing server gives us, and what we reuse

| Existing piece | Reuse |
|---|---|
| `ToolDefinition { name, description, inputSchema, run }` and `TOOLS` | The two new tools are two more entries. `tools/list` already builds the JSON Schema with `z.toJSONSchema`. |
| `errorResult(message)` and `formatZodError` | Every bad argument is an `isError` tool result, never a protocol error. |
| `checkWavPath` (`.wav`, inside `realpathSync(cwd)`, nearest existing folder resolved, no overwrite) | Split into small checks in `paths.ts` so `score_cue`, `score_level` and `verify_cue` share one implementation. `score_cue` behavior and messages do not change. |
| `ComposeRequestSchema` limits | `scene` max 500 and `MOODS` are reused. |
| `scoreFromRequest(new LocalDirector(), request)`, `renderScore`, `encodeWav(..., { ditherSeed: seed ^ 0x5eed, loop })` | The same three calls, with the seed of each file. |
| `parseWav` (`loop.startFrame`, `endFrame`, `durationSec`, `samples`) | Loop samples and onset detection read the file the same way a game does. |
| `stingLandingSec(score)` | `hitSec` of each sting file. |
| `handleMessage` switch, `PROTOCOL_VERSIONS`, `success` and `failure` | Four new `case` branches per feature, same error codes. |
| `tests/cli/mcp.test.ts` `Client` class | Moved to `tests/cli/mcp-client.ts` and imported by the old and the new test file (task 2). |

## The protocol additions

| Message | Reply |
|---|---|
| `initialize` | `capabilities: { tools: {}, prompts: {}, resources: {} }`. Everything else as today. |
| `prompts/list` | `{ prompts: [{ name, description, arguments: [{ name, description, required: false }] }] }` |
| `prompts/get` | `{ description, messages: [{ role: 'user', content: { type: 'text', text } }] }`; unknown name, non-string or over-long argument: `-32602` |
| `resources/list` | `{ resources: [{ uri: 'fright-score://moods', name: 'moods', title, description, mimeType: 'application/json' }] }` |
| `resources/read` | `{ contents: [{ uri, mimeType: 'application/json', text }] }`; unknown uri: `-32002` with `data: { uri }` |
| `resources/templates/list` | `{ resourceTemplates: [] }` |

Task 1 checks these rows against the current specification with the context7 server before any code is written
(the same step as task 13 of `director-tools`), and corrects this table if the specification differs. Two points
to confirm there: that `-32002` is the code for a missing resource, and whether `prompts/get` arguments must be
strings.

Checked with the context7 server against the 2025-11-25 specification: every row above is correct. `-32002` with
message `Resource not found` and `data: { uri }` is the documented reply for a missing resource, `prompts/get`
arguments are a map of strings (so a number is `-32602` here), and `resources/templates/list` returns
`{ resourceTemplates }`.

Neither `prompts/list` nor `resources/list` takes a cursor here, because each list has one entry. A request
carrying a `cursor` gets the same single page.

## score_level

### Input

```ts
const Id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const EventSchema = z.strictObject({ id: Id, scene: z.string().max(500).optional() });
const RoomSchema = z.strictObject({
  id: Id,
  mood: z.enum(MOODS),
  loopSec: z.number().min(4).max(60),
  events: z.array(EventSchema).max(8),
});
const ScoreLevelArgs = z.strictObject({
  rooms: z.array(RoomSchema).min(1).max(8),
  seed: z.number().int().min(0).max(0xffffffff).default(13),
  writeDir: z.string().min(1).optional(),
});
```

Unknown keys are rejected (`strictObject`), so a typo such as `loopsec` is an error the agent can read instead
of a silently ignored field. Duplicate ids are checked after parsing, in room order, and the message names the
id and the room.

`level.json` in the Godot example is exactly this object, so a test can parse the file with `ScoreLevelArgs`
and send it as the tool arguments.

### Seeds

```ts
function fileSeed(seed: number, roomId: string, part: string): number {
  const digest = createHash('sha256').update(`${seed}|${roomId}|${part}`).digest();
  return digest.readUInt32BE(0);
}
// part is "loop" for the room's loop and "sting:<eventId>" for an event.
```

Reasons: a seed that depends on the position in the arrays would change every file when an agent inserts a room,
and `seed + index` would give neighbouring seeds with related Markov motifs. A hash of the request seed, the room
id and the part gives each file an independent 32-bit seed that survives reordering. The hash is used only to
derive a number, so it does not touch the engine's determinism rules, and `Math.random` and `Date.now` stay out.
The file's dither seed is `fileSeed ^ 0x5eed`, as in `score_cue`.

### The loop

`scoreFromRequest(new LocalDirector(), { seed: fileSeed, mood, durationSec: loopSec, loop: true })`, then
`renderScore`, then `encodeWav(audio, { ditherSeed, loop: true })`. A loop is arranged in whole bars, so the
rendered `durationSec` can differ from `loopSec` by up to one bar; the result reports the real value from
`parseWav`. `loopStartSample` and `loopEndSample` come from `parseWav(wav).loop` (`startFrame` and `endFrame`).
A game that plays the whole file as a loop gets no seam, as in the Godot example.

`ComposeRequestSchema` has no `loop` field, because the web endpoint takes it from the form. `scoreFromRequest`
takes it (the CLI passes `loop: true`), so `level.ts` builds its own request object and does not touch the
compose schema.

### The sting file

`{ seed: fileSeed, mood, durationSec: 5, stingAtSec: [1], ...(scene ? { scene } : {}) }`. The CLI reads sting
times from the scene text when `stingAtSec` is empty; here `stingAtSec` is always set, so a scene such as
"a sting at 0:30" cannot move the hit (requirement 1.6b). `hitSec` is `stingLandingSec(score)[0]`, which is 1.0
because the arranger clears 0.6 s before every sting and places the first note at the cue time. `startFromSec`
is `hitSec - 0.6` (0.4) and `hitAfterStartSec` is 0.6. These are the numbers the door scene and
`fright_score_cue.gd` use.

If `stingLandingSec` returns no landing (it should not), the tool returns an `isError` result for that event
rather than a made-up time.

### Result and manifest

```jsonc
{
  "director": "local",
  "seed": 7,
  "rooms": [
    {
      "id": "hallway", "mood": "stalker",
      "loop": { "sha256": "…", "wavBytes": 1411244, "durationSec": 8, "loopStartSample": 0, "loopEndSample": 352800 },
      "events": [
        { "id": "door_opened", "sha256": "…", "wavBytes": 882044, "durationSec": 5, "hitSec": 1,
          "startFromSec": 0.4, "hitAfterStartSec": 0.6 }
      ]
    }
  ],
  "writeDir": "/abs/path/inside/cwd/level"        // only when asked
}
```

`manifest.json` is the same object with these differences, so it is identical on every machine: no `writeDir`,
a `schema: 1` field first, and a relative `file` on the loop and on every event (`hallway.loop.wav`,
`hallway.door_opened.sting.wav`). It is `JSON.stringify(manifest, null, 2) + '\n'`, keys in the fixed order
the builder creates. The numbers come from the rendered files, never from the request, so the manifest is a
statement about the bytes. The structured result and the manifest are built by one function so that
requirement 1.12 holds by construction.

### writeDir

`checkNewDir(writeDir)` follows `checkWavPath`: resolve against `realpathSync(process.cwd())`, resolve symbolic
links on the nearest existing ancestor, refuse a result that is the working folder or lies outside it, and
refuse a path that already exists. It runs before any rendering, so a bad folder costs nothing. The folder is
created with `mkdirSync(path, { recursive: true })` only after the checked real path is inside the working folder. Each file is written with `writeFileSync(file, bytes, { flag: 'wx' })`. File names
come only from the room and event ids, which the regex limits to `[a-z0-9_]`, plus the fixed suffixes
`.loop.wav`, `.sting.wav` and `manifest.json`, so a name cannot contain a separator or a dot segment.

If a write fails half-way, the tool returns an `isError` result that names the file and leaves what it wrote;
it does not delete anything (the folder is new, and removing files is a destructive action the server does not
take). The agent can choose another folder.

### Cost

A 60 s loop renders in about 4 s (measured with the CLI, including start-up). The cap of 8 rooms and 8 events
per room bounds the work at a few minutes only in the worst case, while a realistic jam level (a few rooms) takes
seconds. The registered timeout in `.kiro/settings/mcp.json` is 120 s. If the worst case turns out to exceed it,
the answer is a lower cap on total `loopSec`, which is a schema change, not a new mechanism.

## verify_cue

### Input and file checks

```ts
const VerifyCueArgs = z.strictObject({
  wavPath: z.string().min(1),
  expectedHitSec: z.array(z.number().min(0).max(300)).min(1).max(16),
  toleranceMs: z.number().min(1).max(1000).default(50),
});
```

`checkReadablePath(wavPath)` resolves the real path of the file (which must exist), requires it to be inside the
real working folder and to end in `.wav`, and requires `statSync(...).isFile()` with a size of at most 64 MB (a
five-minute stereo WAV is 53 MB). It then reads the file with `readFileSync`. The path comes from an agent, so a
link that leads out of the folder is refused by comparing real paths, not names.

### Onset finder

`findOnsets(info: WavInfo, options?)` in `scripts/mcp/onsets.ts` is pure and takes a `WavInfo`, so a unit-style
test could call it directly.

1. Mix to mono: the mean of the channels, as floats (`sample / 32768`).
2. Cut into 2 ms windows (88 frames at 44.1 kHz) and compute each window's RMS.
3. A window is silent when its RMS is below -50 dBFS (0.00316).
4. Walk the windows. Track the length of the current silent stretch. When a non-silent window follows a
   stretch of at least 0.5 s (the start of the file counts as silence), the onset is the first frame in that
   window whose absolute value is at least 0.00316. Record it as `frame / sampleRate`, rounded to the
   millisecond. A non-silent window that follows a shorter stretch is not an onset.
5. The silent-stretch counter then resets until the next silent window.

Why these numbers. The sting file's 0.6 s of pre-silence is the plan; the detector asks for 0.5 s so a small tail
or dither does not break it. -50 dBFS sits above the 16-bit dither floor (about -90 dBFS) and far below the
stinger's hit, so the first frame above it is the attack. A 2 ms window is the finest step that still averages
noise, and the refinement to the first loud frame inside the window removes the window's own 2 ms of
quantization. Task 6 checks all three constants against the golden cue and a `score_level` sting, and the test
asserts the 10 ms accuracy of requirement 2.6. If the golden cue's reverb tail before its sting stays above
-50 dBFS for the whole 0.6 s, the threshold is the first thing to adjust, and the change goes into this table.

**Measured change (task 6).** Rendered cues have no digital silence before a sting: the release and reverb tails sit at
about -24 to -42 dBFS in the planned-silence window, and the hit is near -11 dBFS, so "below -50 dBFS for 0.5 s"
never holds on a real render. `findOnsets` therefore uses a relative rule. A 2 ms window starts an onset when its
RMS is at least -50 dBFS and at least 20 dB (`JUMP_DB`) above the RMS of the 0.5 s (`QUIET_SEC`) before it, and no
onset was found in that 0.5 s. The onset time is the first frame from the previous window onward whose absolute
value reaches the same threshold. The constants live at the top of `onsets.ts`; the golden cue gives 24 s within
50 ms and a `score_level` sting gives 1.0 s within 10 ms (`tests/cli/mcp-verify.test.ts`). The `score_level`
sting additionally clears everything before the hit (see `renderStingScore` in `level.ts`) so the 1.0 s hit
follows a quiet stretch.

Pairing: sort the expected times. For each, take the unused onset with the smallest absolute difference and
accept it if the difference is at most 500 ms; otherwise the entry has `measuredSec: null`. A greedy pass in
ascending order is enough because sting times are at least a bar apart in real cues, and it stays deterministic.

### Result

```jsonc
{
  "wavPath": "/abs/path/inside/cwd/level/hallway.door_opened.sting.wav",
  "durationSec": 5, "toleranceMs": 50, "pass": true,
  "results": [{ "expectedHitSec": 1, "measuredSec": 1, "errorMs": 0, "pass": true }]
}
```

The error is a measurement of the file, not of the plan. For a sting file the agent passes `hitSec` (1.0). To
check what a player hears, it subtracts `startFromSec`: playback from 0.4 s puts the hit 0.6 s after the start.

## The prompt

`prompts.ts` exports one definition and a function `render(args)`. The text is a fixed template with the `game`
line inserted when present. It names the tools and the resource by their exact names, lists the order of steps
(requirement 3.3) and ends with the sentence the product requires: the agent planned rooms and events, the local
rule-based director wrote the score and the FS-666 chip made every sound. It never calls the local director an AI
model. Arguments are validated with a small zod object (`game` and `writeDir`, optional strings of at most 200
characters, `strictObject`); a failure becomes `-32602`.

## The resource

`resources.ts` builds the JSON at read time:

```ts
MOODS.map((id) => ({
  id,
  label: MOOD_PROFILES[id].label,
  tagline: MOOD_PROFILES[id].tagline,
  tempoBpm: { min: MOOD_PROFILES[id].tempoBpm[0], max: MOOD_PROFILES[id].tempoBpm[1] },
  loudnessCeilingLufs: MOOD_LOUDNESS_LUFS[id],
}));
```

Nothing is copied into `scripts/mcp/`, so a change to a mood profile or a ceiling shows up in the resource, and
the test compares the resource to the same two exports.

## Godot wiring

- `examples/godot/level.json`: `ScoreLevelArgs` input. Hallway: `stalker`, `loopSec` 8, event `door_opened`
  ("A door opens slowly behind you in the hallway"). Cellar: `dread`, `loopSec` 12, event `lights_out`
  ("The lights go out in the cellar"). `seed` 7.
- `examples/godot/level-manifest.json`: the committed `manifest.json` for that input. The scene text does not
  contain a sting time, and the file would ignore it anyway.
- The test `tests/cli/mcp-level.test.ts` sends `level.json` to `score_level` with a `writeDir` inside the test's
  temporary working folder, reads `manifest.json` from there and compares it byte for byte with
  `level-manifest.json`. It also checks that the sha256 of each written WAV equals the manifest's, so the
  manifest cannot drift from the files. The WAVs are not committed.
- A failing comparison means the sound changed. The test message says to regenerate the manifest with the tool and
  review the diff, the same rule as the demo hash.
- `examples/godot/README.md` gets a short section: how to ask an agent for the level files, where the manifest
  is, and that the existing project and checks are unchanged. The Godot project does not load the new files
  (they do not exist in the repository), so nothing in its headless checks changes.

## Steering

One paragraph appended to `.kiro/steering/engine-dsp.md` under "Never break these", or as a new short section
"Check a sound change through the server": after changing audio code, call `score_cue` of the `fright-score`
MCP server with the README's golden cue (`mood: chase`, `durationSec: 30`, `stingAtSec: [24]`, `seed: 3`,
`writeWavTo` a new `.wav` inside the working folder), compare the `sha256` with the README's, then call
`verify_cue` on the written file with `expectedHitSec: [24]`. A different hash is expected only when the sound
was meant to change, and then `bash scripts/make-samples.sh` and `src/web/demo.ts` are updated.

## Testing strategy

All tests spawn the server like `tests/cli/mcp.test.ts`: `process.execPath --import tsx`, an environment of `PATH`
and `HOME` plus `FRIGHT_DIRECTOR=bedrock`, a temporary working folder. The `Client` class moves to a shared file so
both test files use one client. Renders are short.

| File | What it pins |
|---|---|
| `tests/cli/mcp.test.ts` (changed) | The capabilities assertion, and `tools/list` names in order. Every other existing test unchanged. |
| `tests/cli/mcp-level.test.ts` | `score_level`: schema errors, duplicate ids, result shape, determinism, seed independence from other rooms, loop samples, sting times, `writeDir` checks, manifest equality with and without `writeDir`, the Godot manifest. |
| `tests/cli/mcp-verify.test.ts` | `verify_cue`: measures `score_level` stings and the golden cue, tolerance, a wrong expected time fails, a silent file, a bad path, a non-WAV, a symbolic link out of the folder. |
| `tests/cli/mcp-prompts-resources.test.ts` | `prompts/list`, `prompts/get` (arguments, text order, errors), `resources/list`, `resources/read` (equals the code, unknown uri, templates list). |
| `tests/unit/onsets.test.ts` | `findOnsets` on synthetic buffers: silence then a tone, a short gap that is not an onset, two onsets, a file that starts loud, an all-silent file. |

The golden cue test renders 30 s once (about 4 s). The level tests use two rooms of 4 s loops, which is the
minimum the schema allows, plus the Godot level (8 s and 12 s loops) in one call.

## Risks and decisions

| Question | Decision |
|---|---|
| Hash the sting only, or the loop too, for the manifest? | Both. A manifest that only covers stings would let a changed loop pass. |
| `hitSec` is 1.0 in every file, so is it worth returning? | Yes. It is the number `verify_cue` should be given, and it keeps the contract if the arranger's pre-silence changes. |
| Seed from the array position? | No: inserting a room would re-roll every other file. The id hash keeps files stable. |
| Delete the files after a failed write? | No. The server never deletes. The error names the file. |
| Add the MCP SDK? | No, for the reason in `director-tools`: no new dependency. The new methods are five `case` branches. |
| Onset thresholds are guesses | They are fixed constants in one file and tested against real renders in task 6. A change goes into the design table. |
| `-32002` for a missing resource | To be confirmed against the specification in task 1. |
| Committed manifest and a deliberate sound change | The manifest test fails with a message that says to regenerate it. This is intended, like the demo hash. |

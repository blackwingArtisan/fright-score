# Design: Director tools

## Overview

```
 scene, mood, length, stings, seed
        │
        ▼
 BedrockDirector ──Converse(toolConfig: score_cue, toolChoice: score_cue)──> model
        │                                                                      │
        │  <───── assistant message: toolUse { toolUseId, name, input } ───────┘
        ▼
 parseScorePlan(input) ── ok ──> ScorePlan ──> reconcilePlan ──> arrange ──> renderScore ──> encodeWav
        │ error                                  (unchanged from here on)
        └─ user message: toolResult { toolUseId, status: "error", content: [{ text }] } ──> model (repair)


 MCP client (Kiro, any agent)
        │  stdin/stdout, one JSON-RPC message per line
        ▼
 scripts/mcp/fright-score-mcp.ts ──> scripts/mcp/tools.ts
        score_cue:   LocalDirector ─> scoreFromRequest ─> renderScore ─> encodeWav ─> sha256
        list_patches: PATCHES
```

The model's only job is to fill in the plan. Everything from `reconcilePlan` on is the code that exists today.

## Part 1: Bedrock tool use

### Request shape

Every `ConverseCommand` input is the current one plus a `toolConfig`:

```ts
{
  modelId, system: [{ text }], messages,
  inferenceConfig: { maxTokens: 2000, temperature: 0.8 },   // unchanged
  toolConfig: {
    tools: [{ toolSpec: { name: 'score_cue', description, inputSchema: { json: scoreCueInputSchema() } } }],
    toolChoice: { tool: { name: 'score_cue' } },
  },
}
```

- The name `score_cue` matches Bedrock's `[a-zA-Z0-9_-]+` limit (1 to 64 characters).
- The description reads: records the score plan (the sheet music) for a horror cue; it makes no sound, the FS-666
  chip renders the sound later from the plan.
- `strict` (structured-output enforcement on a tool) is not sent. The docs do not say which models accept it, and
  the zod validation plus the repair loop already guarantees a valid plan. It can be added later behind a model
  check.

### The input schema comes from zod

`src/director/tool.ts` (new, one concept) exports `SCORE_CUE_TOOL_NAME` and `scoreCueToolSpec()`. The schema is
built once and cached:

```ts
const schema = z.toJSONSchema(ScorePlanSchema, { target: 'draft-7', io: 'input' });
```

Run against the repo's schema with zod 4.6.7, this gives a 2,386 character schema with top-level `type: object`,
the eleven required keys (`version`, `title`, `mood`, `durationSec`, `tempoBpm`, `beatsPerBar`, `key`,
`sections`, `motif`, `cues`, `palette`), a `$schema` key, and a `palette` expressed as
`{ type: object, propertyNames: { enum: roles }, additionalProperties: { enum: patchIds } }`. Two adjustments:

1. Delete `$schema`. Bedrock takes the schema as a plain JSON value, and the key does nothing for the model.
2. Rewrite `palette` as `{ type: object, properties: { <role>: { enum: patchIds } ... } }`, one optional property
   per role, built from the `properties` of the same enums. `propertyNames` is the least common JSON Schema
   keyword, and the docs do not say how each model's schema handling treats it. Explicit properties say the same
   thing in the most widely understood form. This is a precaution, not a measured failure.

What a JSON Schema cannot say stays in zod: `refine` and `superRefine` rules (a section ends after it starts,
sections stay inside `durationSec`, a cue is not after the end, `motif.degrees` and `motif.rhythmBeats` have the
same length) are not emitted. The tool description names them in one sentence so the model usually obeys, and
zod enforces them; a miss goes back through the repair loop. A test pins the adjusted schema's structure, so a
zod upgrade that changes the output fails a test instead of the model.

### Forced tool choice

`toolChoice: { tool: { name: 'score_cue' } }` goes on every call, repairs included. The model cannot answer in
prose, and the reply's first content block is a `toolUse`. The docs disagree on which models honor a forced
specific tool (see "Sources looked up"). The default model, Amazon Nova Pro, and Anthropic Claude 3 and later
are covered by the pages that list models. A model that does not support it makes Bedrock return a
`ValidationException`, which reaches the caller unchanged (requirement 2.5). `FRIGHT_BEDROCK_MODEL` is the user's
choice, and the error names the cause.

### The loop

`BedrockDirector.plan` keeps its shape: a `messages` array, `for (attempt = 0; attempt <= maxRepairs; attempt++)`,
one `send` per attempt, and the same final error text. Per attempt:

1. `send(new ConverseCommand(input))`.
2. `blocks = output.output?.message?.content ?? []`; `toolUses = blocks.filter(b => 'toolUse' in b)`.
3. `call = toolUses.find(u => u.toolUse.name === 'score_cue')`.
4. If `call`: `parseScorePlan(call.toolUse.input)`. On success return. On error, `lastError = error`; append
   `{ role: 'assistant', content: blocks }` and
   `{ role: 'user', content: results }`, where `results` holds a `toolResult` for every `toolUseId` in the
   message: `{ toolUseId, status: 'error', content: [{ text: error.message }] }` for the failed call, and
   `{ toolUseId, status: 'error', content: [{ text: 'Unknown tool. Call score_cue.' }] }` for any other.
   Bedrock expects a result for every tool request in the assistant message, which is why the extra blocks are
   answered.
5. If there is no `score_cue` block (text only, empty, or `stopReason` of `max_tokens`, where the tool input is
   cut off and cannot be trusted): `lastError = new Error('The model did not call score_cue')`; append the
   assistant message (a placeholder `{ text: '(no reply)' }` block if the content is empty, because Bedrock
   rejects empty content) and `{ role: 'user', content: [{ text: 'Call the score_cue tool with the complete
   plan.' }] }`. When the reply held other `toolUse` blocks but no `score_cue`, step 4's answers apply instead.
6. A `max_tokens` stop that still carries a `score_cue` block is treated as step 5, before validation.

A successful plan ends the conversation, so no closing `toolResult` is sent. `maxRepairs` stays 1 by default and
covers both failure kinds. A thrown client error is not caught, so it propagates as before.

The assistant message is passed back as returned (`output.message.content`), because the `toolUseId` and the
block order must match what the model produced.

### Prompts

`directorSystemPrompt()` loses the hand-written JSON shape block, which the tool schema now carries, and keeps
the opening sentence (retargeted: "answer by calling the `score_cue` tool"), the patch list and the craft rules.
The shape of the plan therefore has one source, `ScorePlanSchema`. `directorUserPrompt()` is unchanged.

### Removing the free-text path

`extractJsonObject` and `planFromModelReply` are used only by the Bedrock director and its tests, so they are
deleted along with the tests of them. Decision: no free-text fallback.

- A fallback would mean a second request shape (no `toolConfig`), a second parser and a second set of tests, for a
  model that nobody has asked for. The default model and the Claude family support tool use.
- A silent fallback would also hide that a model ignores the tool, which is the information the user needs.
- If a model without tool use is wanted later, it is a new director kind behind the same `Director` interface,
  not a branch inside this one.

## Part 2: The MCP server

### Hand-written JSON-RPC subset, not the SDK

The server implements the small subset of the Model Context Protocol it needs, by hand, instead of adding
`@modelcontextprotocol/sdk`:

- The SDK is not installed (`node_modules/@modelcontextprotocol` does not exist), and the project keeps its
  dependency list to zod, the Bedrock client and two fonts.
- The subset is four methods (`initialize`, `ping`, `tools/list`, `tools/call`) and one notification to ignore,
  over newline-delimited JSON. That is about 120 lines that the stdio test exercises end to end.
- The SDK's tool API wants its own schema objects, and the tool inputs already have zod schemas that emit JSON
  Schema.
- I could not read the SDK's or the protocol's current documentation in this session (see "Sources looked up"),
  so I would be choosing an SDK version and API blind. A small subset with a test that acts as the client is
  easier to verify.

The cost is protocol drift. Task 13 checks the subset against the current specification with the context7 server
before any code is written, and the stdio test is the guard afterwards. Replacing the hand-written loop with the
SDK later would only touch the entry file, because the tool handlers live in `tools.ts`.

### Modules

- `scripts/mcp/fright-score-mcp.ts`: the entry point. Reads standard input with `node:readline`, parses each line,
  dispatches, writes one line per response with `process.stdout.write(JSON.stringify(msg) + '\n')`. It
  exports `handleMessage(message): Promise<object | undefined>` so a test could call it in process, and starts
  the stdio loop only when run as the main script (the same `isMain` pattern as `src/cli/score.ts`). Calls
  are handled one at a time, in arrival order: the renderer is synchronous CPU work, and one answer at a time
  keeps responses in request order.
- `scripts/mcp/tools.ts`: the two tool definitions (`name`, `description`, zod `inputSchema`) and their handlers.
  It imports from `src/` and nothing imports from it.

All diagnostics use `console.error`. Nothing but protocol messages is written to standard output, so no
`console.log` appears in these files.

### Protocol handling

| Message | Reply |
|---|---|
| `initialize` | `{ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fright-score', version } }`. `protocolVersion` is the client's if it is one of `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, otherwise the newest of the four (`2025-11-25`). `version` is read from `package.json`. |
| `notifications/initialized` and any message without `id` | no reply |
| `ping` | `{}` |
| `tools/list` | `{ tools: [{ name, description, inputSchema }] }`, with `inputSchema` from `z.toJSONSchema` (target `draft-2020-12`, top-level object; no-argument tools use `{ type: 'object', additionalProperties: false }`) |
| `tools/call` | `{ content: [{ type: 'text', text }], structuredContent, isError? }`; `text` is the serialized `structuredContent` |
| `server/discover` (2026-07-28 probe) | error `-32601` like any unknown method; a client that supports both eras then falls back to `initialize` |
| unknown tool name | error `-32602` |
| unknown method | error `-32601` |
| a line that is not JSON | error `-32700` with `id: null`; keep reading |

These rows were checked against the specification in task 13 (see "Protocol check, task 13"). Argument validation failures and pipeline errors are
tool errors (`isError: true` with the message as text), not protocol errors, so the calling model can see the
message and retry.

### `score_cue`

Input schema (zod), reusing what exists:

```ts
const ScoreCueArgs = ComposeRequestSchema.extend({
  seed: z.number().int().min(0).max(0xffffffff).default(13),
  writeWavTo: z.string().min(1).optional(),
});
```

`ComposeRequestSchema` in `src/server/compose.ts` already holds the limits for scene, mood, `durationSec` and
`stingAtSec`, so the web endpoint and the tool agree on them. The seed default of 13 matches the CLI.

Handler:

```ts
const request = { seed, scene, mood, durationSec, stingAtSec };            // keys left out when absent
const score = await scoreFromRequest(new LocalDirector(), request);        // reconcile + arrange inside
const result = renderScore(score);
const wav = encodeWav(result, { ditherSeed: seed ^ 0x5eed, loop: score.plan.loop === true });
const sha256 = createHash('sha256').update(wav).digest('hex');
```

This is the CLI's own sequence (`src/cli/score.ts`), so the hash equals the CLI file's hash for the same
arguments. The CLI also reads sting times out of the scene text when `--sting` is absent; the tool does the same
with `readScene(scene).stingAtSec` so that "builds to a sting at 1:10" in a scene behaves the same through both
doors.

The server never calls `createDirector`, so `FRIGHT_DIRECTOR` and AWS variables have no effect. Bedrock is not
exposed through MCP on purpose: the tool must work with no account, no network and no paid service, and a
Bedrock call is not repeatable.

Result (`structuredContent`, and the same object as JSON text for clients that read only `content`):

```jsonc
{
  "director": "local",
  "seed": 13,
  "durationSec": 30,
  "stingLandingSec": [24],
  "sha256": "9f2c…64 hex characters",
  "wavBytes": 5292044,
  "plan": { /* the reconciled ScorePlan */ },
  "wavPath": "/abs/path.wav"          // only when writeWavTo was given
}
```

`stingLandingSec` is read from the realized `Score`: for each `sting` cue in `score.plan.cues`, the `atSec` of the
first note in the `stinger` role tracks at or after the cue's time, which is where the chip plays it. (The
arranger writes sting notes at `cue.atSec`; reading them back from the score keeps this honest if that
changes.) The plan itself is returned in full: it is the part an agent reasons about, and at a few kilobytes it is
small.

`durationSec` is the rendered frame count over 44,100, read with `parseWav`, so it describes the bytes that were
hashed.

`writeWavTo` is the only path to a file. The handler resolves it against `process.cwd()` and refuses (returning an
error result, writing nothing) when it does not end in `.wav`, resolves outside the working directory, or names
an existing file. An agent-supplied path is untrusted input, and this keeps the tool from overwriting a file or
writing outside the workspace. Parent folders are created with `mkdirSync({ recursive: true })` after the
checks pass.

### `list_patches`

Takes no arguments (`z.object({})`). Returns `{ patches: [{ id, name, blurb, algorithm, feedback }] }` in
`PATCH_IDS` order, from `PATCHES`. The operator tables stay out: an agent picks by name and blurb.

### Registration

`.kiro/settings/mcp.json` gains one entry beside `aws-docs` and `context7`:

```json
"fright-score": {
  "command": "npx",
  "args": ["tsx", "scripts/mcp/fright-score-mcp.ts"],
  "timeout": 120000
}
```

`npx tsx` runs the repo's own `tsx` (a dev dependency). The relative script path depends on Kiro starting
workspace servers in the workspace folder; the build session checks this by calling the tool from a Kiro session
and, if the folder is different, switches to an absolute path built from the workspace. No `env` block: the
server needs no secret. `.kiro/settings/` is untracked in this repository right now, so the registration is only
shared once that folder is committed; the task list flags this.

A 300-second cue can take longer than a short one to render (the README measures 13.5 times faster than real
time on an M4 Max, so about 22 seconds); the 120-second timeout leaves room.

## Sources looked up

Read with the aws-docs MCP server (all under `https://docs.aws.amazon.com/bedrock/latest/`):

- `APIReference/API_runtime_ToolConfiguration.html`: `tools` is a required array of at least one `Tool`;
  `toolChoice` is optional and forces tool use "if supported by model".
- `APIReference/API_runtime_ToolSpecification.html`: `name` (1 to 64 characters, `[a-zA-Z0-9_-]+`), optional
  `description`, required `inputSchema`, optional `strict`.
- `APIReference/API_runtime_ToolInputSchema.html`: a union with `json`; the top-level schema type must be
  `object`.
- `APIReference/API_runtime_ToolChoice.html`: a union of `auto` (default), `any` (at least one tool, no text) and
  `tool` (a specific tool); the page says `tool` is "only supported by Anthropic Claude 3 and Amazon Nova models".
- `APIReference/API_runtime_SpecificToolChoice.html`: `{"tool": {"name": ...}}`. The page text says "only
  supported by Anthropic Claude 3 models", while a search snippet for the same page says Claude 3 and Nova.
  **The docs disagree about Nova.** I could not find a per-model table of tool choice support: the Converse
  supported-features page redirected to the general models page, which has no such table. The default model
  (Nova Pro) is therefore covered by one page and not by the other, and a first live run with AWS
  credentials, which no task here performs, must confirm it.
- `APIReference/API_runtime_ToolUseBlock.html`: `toolUseId` (1 to 64 characters, `[a-zA-Z0-9_.:-]+`), `name`,
  `input` (a JSON value).
- `APIReference/API_runtime_ToolResultBlock.html`: `toolUseId`, `content` (required), `status` of `success` or
  `error`, and the note that `status` is supported only by Amazon Nova and Anthropic Claude 3 and 4 models.
- `userguide/tool-use-client-side.html`: the Converse tool loop. The assistant message is appended as returned,
  the stop reason `tool_use` marks a tool request, and the answer is a user message with
  `{ toolResult: { toolUseId, content: [{ text }], status: 'error' } }`.
- The `search_documentation` results for tool choice, which also showed a page on models that accept `toolConfig`
  on Converse but reject it on ConverseStream. The director uses Converse, not ConverseStream.

Checked in this repository:

- `z.toJSONSchema(ScorePlanSchema, { target: 'draft-7', io: 'input' })` with zod 4.6.7 (output described above).
- `node_modules/@modelcontextprotocol` is absent, so the SDK is not a dependency.
- `src/director/bedrock.ts`, `src/director/prompt.ts`, `src/score/pipeline.ts`, `src/cli/score.ts` and
  `src/server/compose.ts`, for the sequence and limits that the MCP tool reuses.

Not looked up, and why:

- **MCP TypeScript SDK documentation.** Not read; the server is hand-written. The specification itself was read
  in task 13 (see "Protocol check, task 13").
- **Which Bedrock models honor a forced specific tool.** See the disagreement above.

## Protocol check, task 13

Read with the context7 server (library `/modelcontextprotocol/modelcontextprotocol`, per-version pages
`/websites/modelcontextprotocol_io_specification_2025-11-25` and `..._2026-07-28`). Sources, all under
`https://modelcontextprotocol.io/specification/`:

- `2025-11-25/basic/transports`: stdio messages are newline-delimited and must not contain embedded newlines;
  the server must write only valid MCP messages to stdout and may log anything to stderr.
- `2025-11-25/basic/lifecycle`: `initialize` carries `protocolVersion`, `capabilities`, `clientInfo`; the server
  answers the same version if it supports it, otherwise another it supports (preferably its latest). The client
  then sends `notifications/initialized`. Shutdown on stdio is the client closing the server's stdin.
- `2025-11-25/schema`: `InitializeResult` is `protocolVersion`, `capabilities`, `serverInfo`, optional
  `instructions`. `CallToolResult` is `content` (required), optional `structuredContent` and `isError`.
- `2025-11-25/server/tools`: unknown tools are a protocol error `-32602`; input validation and business errors are
  results with `isError: true`. A tool that returns `structuredContent` SHOULD also return the serialized JSON in a
  text block. Tool names: 1 to 128 characters from letters, digits, `_`, `-`, `.`. A tool with no parameters uses
  `{ "type": "object", "additionalProperties": false }`.
- `2025-11-25/basic` (JSON Schema usage): a schema with no `$schema` is 2020-12, and implementations must support
  2020-12.
- `2025-11-25/basic/utilities/ping`: `ping` is answered with `{}`.
- `2026-07-28/changelog` and `.../basic/transports/stdio`: the newest revision removes the `initialize` handshake,
  carries the version in each request's `_meta`, and adds a required `server/discover`. A client that supports
  both eras probes with `server/discover` and falls back to `initialize` on any other error.

Corrections to the design as first written:

1. `2025-11-25` is a current revision and the newest one with the `initialize` handshake; it is added to the
   supported list and is the fallback version. The three older versions stay.
2. `inputSchema` uses `target: 'draft-2020-12'`, not draft 7: MCP defaults to 2020-12 and a draft-7 schema would
   need an explicit `$schema`. (The Bedrock tool schema in part 1 is a separate matter and stays as written.)
3. The `structuredContent` text block is the serialized JSON, per the SHOULD above (already the plan).
4. Revision `2026-07-28` is not implemented. `server/discover` gets `-32601`, which makes dual-era clients fall
   back to `initialize`. Supporting the stateless revision would be a separate piece of work.
5. Confirmed unchanged: newline framing, `ping` as `{}`, `-32601` and `-32700`, `-32602` for an unknown tool, and
   `isError` for argument and pipeline errors.

## Testing strategy

- Unit (Vitest, `tests/unit/bedrock-tools.test.ts`): a fake client `{ send }` that records the `ConverseCommand`
  and replays scripted replies. It asserts `command.input` field by field: `modelId`, `toolConfig.tools` has one
  tool named `score_cue`, `toolChoice` deep-equals `{ tool: { name: 'score_cue' } }`, the schema has top-level
  `object`, the eleven required keys, every enum value from `MOODS`, `ROLES`, `CUE_KINDS`, `NOTE_NAMES`,
  `MODE_NAMES` and `PATCH_IDS`, no `propertyNames`, no `$schema`. Repair: a first reply with `tempoBpm: 999`
  then a valid one, asserting the second request's `messages` end with the assistant message and a user message
  whose `toolResult` has the right `toolUseId`, `status: 'error'` and a text containing `tempoBpm`; a stubborn
  model gives `maxRepairs + 1` calls and the "could not produce a valid plan" error. No tool call: text-only
  reply then a valid one, an always-text model, an empty content array, a `max_tokens` stop, and two `toolUse`
  blocks (both answered). A client that throws rejects with the same error object.
- `tests/unit/director.test.ts`: the two Bedrock tests that feed JSON text are rewritten to feed `toolUse`
  blocks, and the tests of `extractJsonObject` are deleted with the helper.
- CLI/process (Vitest, `tests/cli/mcp.test.ts`): spawn `process.execPath` with `--import tsx` and the entry
  script, with an environment of `PATH` and `HOME` only plus `FRIGHT_DIRECTOR=bedrock`, in a temporary working
  folder. A small test client writes one line per request and awaits the response with the matching `id`.
  It runs `initialize` and `notifications/initialized`, `tools/list` (names and schemas), and `score_cue` twice
  with `{ mood: 'chase', durationSec: 5, stingAtSec: [3], seed: 3 }` for equal `sha256`; a third call with seed 4
  for a different one; the same arguments through `runCli` into a temporary file for the equal hash; the working
  folder is empty afterward; a `writeWavTo` call whose file hashes to the reported value, then refused for an
  existing file, a path outside the folder and a name without `.wav`; a bad argument gives `isError` and the
  next call still answers; an unknown method, an unknown tool and a garbage line give -32601, -32602 and
  -32700; closing stdin ends the process with code 0. Five-second cues keep this to a few seconds of rendering.
- Offline guarantee: no test builds a real `BedrockRuntimeClient`, and the child process has no `AWS_*`
  variables.
- Existing checks stay in force: `npm run typecheck` (it includes `scripts/`), the whole Vitest suite, and
  `npm run check:determinism`, which scans `src/director/`.

## Risks

- A model that cannot force `score_cue` fails with a Bedrock validation error. That is surfaced, not hidden.
- The `propertyNames` rewrite is a precaution and may be unnecessary; it costs one small function and one test.
- Protocol drift in the hand-written server, covered by task 13 and the stdio test.
- A very long plan can reach `maxTokens` 2000 and be cut off. A cut-off tool input is treated as a failed
  attempt (step 6). Raising `maxTokens` is a one-line change if the first live run shows it.

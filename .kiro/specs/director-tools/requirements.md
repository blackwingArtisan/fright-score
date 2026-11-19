# Requirements: Director tools

## Introduction

The stitch between a language model and the FS-666 chip is a plain-text reply today. The Bedrock director asks
Amazon Bedrock's Converse API for ScorePlan JSON as free text, then digs the JSON out of the reply, and nothing
outside the web app can ask Fright Score for a cue. This feature makes the stitch a typed tool call and opens
it to agents.

1. The Bedrock director uses Converse tool use. It offers one tool, `score_cue`, whose input schema is
   generated from the zod ScorePlan schema, and it forces the model to call that tool. The tool input is
   validated with the same schema, and a validation error goes back to the model as a `toolResult` with status
   `error` so the model can repair it.
2. A Fright Score MCP server, run over stdio, lets any MCP client (a Kiro session, another agent) score a cue
   with the local director and the existing pipeline. It has a `score_cue` tool and a `list_patches` tool.

The one-line rule still holds: the AI writes the sheet music, never the sound. The model fills in a plan; the
deterministic arranger and the FS-666 chip make every sample. Nothing after the plan changes, so the same plan
and seed still give the same bytes.

## Requirement 1: The Bedrock director asks through a typed tool

**User story:** As a developer running the Bedrock director, I want the model to answer through a typed tool
call with a schema, so that the plan arrives as structured input instead of text I have to dig JSON out of.

### Acceptance criteria

1. a. THE Bedrock director SHALL send every Converse request with a `toolConfig` holding exactly one tool, a
   `toolSpec` named `score_cue` with a description and an `inputSchema.json`.
   b. THE tool description SHALL say that the tool records a score plan, meaning sheet music, and makes no
   sound.
   c. THE `inputSchema.json` SHALL be generated from `ScorePlanSchema` at request time with zod's
   `z.toJSONSchema`, so that no second copy of the plan shape exists to keep in step.
   d. THE generated schema SHALL have the top-level type `object`, list the same required keys as
   `ScorePlanSchema`, and carry every enum value of the zod schema (moods, roles, cue kinds, note names,
   modes and patch ids).
   e. THE generated schema SHALL describe `palette` as an object with one optional property per role, and
   SHALL NOT contain `propertyNames` or a `$schema` key.
2. a. THE Bedrock director SHALL set `toolConfig.toolChoice` to `{ tool: { name: "score_cue" } }` on every
   request, including the repair requests.
   b. THE system prompt SHALL tell the model to answer by calling `score_cue`, and SHALL NOT repeat the JSON
   shape that the tool schema now carries.
   c. THE system prompt SHALL keep the patch list and the craft rules, and THE user prompt SHALL stay as it is.

## Requirement 2: A bad tool input is repaired through the tool result

**User story:** As a developer, I want a plan that fails validation to go back to the model as a tool error, so
that the model can fix it, and I still never get an invalid plan.

### Acceptance criteria

1. WHEN the reply contains a `toolUse` block named `score_cue` THE Bedrock director SHALL validate its `input`
   with `parseScorePlan`, the same zod schema the local director's output meets.
2. WHEN the input is valid THE Bedrock director SHALL return the plan and make no further request.
3. a. IF the input fails validation THEN THE Bedrock director SHALL send the conversation again with the
   assistant message exactly as returned, followed by one user message holding a `toolResult` for that
   `toolUseId` with `status` `"error"` and the validation message as text.
   b. WHEN the assistant message holds more than one `toolUse` block THE Bedrock director SHALL answer every
   `toolUseId` in that one user message, and SHALL answer a block with any name other than `score_cue` as an
   error.
   c. THE Bedrock director SHALL repair at most `maxRepairs` times (default 1).
   d. IF the plan is still invalid after the last repair THEN THE Bedrock director SHALL throw an error that
   starts with "Bedrock director could not produce a valid plan" and ends with the last validation message.
4. a. IF the reply holds no `score_cue` `toolUse` block, whether it is text only, empty, or cut off with the
   stop reason `max_tokens`, THEN THE Bedrock director SHALL count it as a failed attempt and send the
   conversation again with the assistant message followed by a user text message asking the model to call
   `score_cue`.
   b. WHEN the assistant message has no content blocks THE Bedrock director SHALL put a one-line text
   placeholder in its place so that the request stays valid.
   c. THE no-tool-call attempts and the validation failures SHALL share the one `maxRepairs` limit.
5. IF the Bedrock call itself throws (a validation exception, throttling or missing credentials) THEN THE
   Bedrock director SHALL let the error reach the caller unchanged, with no retry and no fallback to text
   parsing or to the local director.

## Requirement 3: Everything after the plan stays deterministic

**User story:** As a game master who shares a cue link, I want an AI plan to render exactly as it did before, so
that the same plan and seed still give the same bytes.

### Acceptance criteria

1. THE change SHALL leave `reconcilePlan`, the arranger, the renderer and the WAV encoder unchanged, and they
   SHALL receive the same validated `ScorePlan` as before.
2. THE `/api/compose` handler and the remote director SHALL keep their request and response shapes.
3. a. THE Bedrock director SHALL NOT parse JSON out of reply text.
   b. THE free-text helpers `extractJsonObject` and `planFromModelReply` SHALL be removed, together with the
   tests that exist only for them.
4. THE default director, the `FRIGHT_DIRECTOR` switch, the default model and `FRIGHT_BEDROCK_MODEL` SHALL stay
   as they are.
5. WHEN `npm run check:determinism` runs THE check SHALL pass with the new director code.

## Requirement 4: An MCP server over stdio

**User story:** As a Kiro or other agent user, I want Fright Score to speak the Model Context Protocol over
standard input and output, so that my agent can call it without a network, an account or a build step.

### Acceptance criteria

1. a. THE MCP server SHALL live in `scripts/mcp/fright-score-mcp.ts` and start with
   `npx tsx scripts/mcp/fright-score-mcp.ts`.
   b. THE MCP server SHALL read JSON-RPC 2.0 messages from standard input, one per line, and write one
   response per line to standard output.
   c. THE MCP server SHALL write nothing to standard output except protocol messages, and SHALL write its
   diagnostics to standard error.
2. a. WHEN the client sends `initialize` THE MCP server SHALL answer with a protocol version it supports, the
   `tools` capability and the server name `fright-score`.
   b. WHEN the client sends `tools/list` THE MCP server SHALL list `score_cue` and `list_patches`, each with an
   input schema generated from its zod schema.
   c. WHEN the client sends `ping` THE MCP server SHALL answer with an empty result.
   d. WHEN the client sends a notification, a message with no `id`, THE MCP server SHALL send no response.
3. a. IF the client sends a method the server does not implement THEN THE MCP server SHALL answer with error
   code -32601.
   b. IF a line is not valid JSON THEN THE MCP server SHALL answer with error code -32700 and keep reading.
   c. IF `tools/call` names an unknown tool THEN THE MCP server SHALL answer with error code -32602.
4. THE MCP server SHALL exit cleanly when standard input closes.
5. THE MCP server SHALL make no network call and read no AWS credentials, and SHALL always use the local
   director, whatever `FRIGHT_DIRECTOR` says.

## Requirement 5: Any agent can score a cue

**User story:** As an agent user, I want a `score_cue` tool that returns the plan, the sting times and a hash of
the audio, so that I can check a cue's timing and repeatability without handling a WAV file.

### Acceptance criteria

1. THE `score_cue` tool SHALL accept `scene` (up to 500 characters), `mood`, `durationSec` (5 to 300),
   `stingAtSec` (up to eight times, each above 0 and at most 300), `seed` (an integer from 0 to 4,294,967,295,
   default 13) and `writeWavTo`.
2. WHEN `score_cue` is called THE MCP server SHALL run the local director, `reconcilePlan`, the arranger, the
   renderer and the WAV encoder in the same way as the CLI, with the WAV dither seed `seed ^ 0x5eed`.
3. THE result SHALL carry, as both structured content and a JSON text block:
   a. the reconciled `plan`;
   b. `stingLandingSec`, the time of the first stinger note of each sting cue, read from the realized score;
   c. `durationSec` of the rendered file;
   d. `sha256` of the WAV bytes as 64 lowercase hex characters, `wavBytes`, `seed` and `director` (`"local"`).
4. WHEN a request names sting times inside the cue's length THE `stingLandingSec` values SHALL equal those times, to the nearest
   millisecond.
5. WHEN `score_cue` is called twice with the same arguments, in the same process or in two processes, THE
   `sha256` SHALL be the same.
6. WHEN the arguments equal the CLI's THE `sha256` SHALL equal the SHA-256 of the file the CLI writes.
7. a. WHEN `writeWavTo` is absent THE MCP server SHALL write no file.
   b. WHEN `writeWavTo` is present THE MCP server SHALL write the WAV bytes there, and THE file's SHA-256
   SHALL equal the reported `sha256`.
   c. IF `writeWavTo` does not end in `.wav`, resolves outside the server's working directory, or names a file
   that exists THEN THE MCP server SHALL return an error result and write nothing.
8. IF the arguments fail validation or the pipeline throws THEN THE MCP server SHALL return a tool result with
   `isError` true and the message as text, and SHALL keep serving.

## Requirement 6: Patches can be listed, and Kiro can find the server

**User story:** As an agent user, I want to see the chip's instruments and have the server ready in my Kiro
workspace, so that I can choose patches by name and call the tools without setup.

### Acceptance criteria

1. WHEN `list_patches` is called THE MCP server SHALL return every patch in `PATCH_IDS`, in that order, each
   with its `id`, `name`, `blurb`, `algorithm` and `feedback`.
2. THE `list_patches` tool SHALL take no arguments and write no file.
3. a. THE `.kiro/settings/mcp.json` file SHALL register a server named `fright-score` that runs the entry
   script with `npx tsx`.
   b. THE registration SHALL keep the existing `aws-docs` and `context7` entries as they are.
   c. THE registration SHALL set no AWS credential and no secret.

## Requirement 7: Tests that never touch AWS or the network

**User story:** As a maintainer, I want the new behavior pinned by tests that run offline, so that a green suite
means the tool call and the server work without a paid service.

### Acceptance criteria

1. a. THE unit tests SHALL drive the Bedrock director with a fake client and assert the exact
   `ConverseCommand` input: `modelId`, `toolConfig.tools`, the `toolChoice`, and the schema's structure from
   criteria 1.1d and 1.1e.
   b. THE unit tests SHALL cover the repair loop: an invalid input followed by a valid one (checking the
   `toolResult` with its `toolUseId`, `status` `"error"` and message), and an input that stays invalid until
   the limit.
   c. THE unit tests SHALL cover a reply with no tool call, a reply with several `toolUse` blocks, an empty
   reply and a `max_tokens` reply.
   d. THE unit tests SHALL cover an error thrown by the client reaching the caller unchanged.
2. a. THE stdio test SHALL start the MCP server as a child process, run `initialize`, list its tools, and call
   `score_cue` twice with the same seed and compare the two `sha256` values.
   b. THE stdio test SHALL check that another seed gives another `sha256`, that the `sha256` equals the CLI's
   for the same arguments, that no file appears without `writeWavTo`, and that a bad argument gives an error
   result while the server keeps answering.
   c. THE stdio test SHALL cover the protocol errors of criterion 4.3.
3. THE tests SHALL NOT call AWS or the network: the fake client replaces Bedrock, and the child process gets an
   environment with no `AWS_*` variables and `FRIGHT_DIRECTOR=bedrock`, which the server must ignore.
4. THE existing director tests that expect JSON in reply text SHALL be rewritten for tool use, and the
   remaining suites SHALL stay green.

## Requirement 8: The copy says what is live

**User story:** As a reader of the README, I want to know what the model does and what the chip does, so that I
am not told the AI makes the sound.

### Acceptance criteria

1. THE README SHALL have a section on using Fright Score from an agent that shows the `fright-score` server
   registration, both tools, the arguments of `score_cue` and a sample result.
2. THE README adapter table and the section SHALL say that the Bedrock director answers through a typed tool
   call that is validated with zod, and that the MCP server uses the local director.
3. THE README SHALL NOT call the local director an AI model, and SHALL say that the model, when one is used,
   writes the plan and the FS-666 makes the sound.
4. THE structure steering file SHALL list `scripts/mcp/`.

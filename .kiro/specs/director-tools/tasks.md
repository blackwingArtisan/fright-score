# Implementation plan: Director tools

Two build sessions. Session A changes the Bedrock director and pins it with tests. Session B adds the MCP
server, registers it, tests it over stdio and documents it. Session B does not depend on session A's code, only
on the unchanged pipeline, so the sessions can run in either order.

## Session A: Bedrock tool use and its tests

- [x] 1. Add `src/director/tool.ts`: `SCORE_CUE_TOOL_NAME` and `scoreCueToolSpec()`, with the input schema from `z.toJSONSchema(ScorePlanSchema, { target: 'draft-7', io: 'input' })`, `$schema` deleted, `palette` rewritten to one optional property per role, built once and cached
  - _Requirements: 1.1a, 1.1b, 1.1c, 1.1d, 1.1e_
- [x] 2. Rewrite `directorSystemPrompt()`: call `score_cue`, drop the JSON shape block, keep the patch list and craft rules; leave `directorUserPrompt()` alone
  - _Requirements: 2.2b, 2.2c_
- [x] 3. Send `toolConfig` (one tool) and `toolChoice: { tool: { name: 'score_cue' } }` on every `ConverseCommand` in `BedrockDirector.plan`
  - _Requirements: 1.1a, 2.2a_
- [x] 4. Find the `score_cue` `toolUse` block in the reply, validate its `input` with `parseScorePlan`, and return the plan on success
  - _Requirements: 2.1, 2.2_
- [x] 5. On a validation error, append the assistant message as returned and one user message with a `toolResult` (`status: "error"`, the message as text) for every `toolUseId`; share the `maxRepairs` limit; keep the final "could not produce a valid plan" error
  - _Requirements: 2.3a, 2.3b, 2.3c, 2.3d_
- [x] 6. Handle a reply with no `score_cue` call (text only, empty with a placeholder, `max_tokens`): count it as a failed attempt and ask for the tool call; let client errors propagate unchanged
  - _Requirements: 2.4a, 2.4b, 2.4c, 2.5_
- [x] 7. Delete `extractJsonObject` and `planFromModelReply` from `src/director/prompt.ts` and any import of them
  - _Requirements: 3.3a, 3.3b_
- [x] 8. Test `tests/unit/bedrock-tools.test.ts`, request: a fake client records the `ConverseCommand`; assert `modelId`, the one tool, `toolChoice`, and the schema's top-level `object`, required keys, enum values, and no `propertyNames` or `$schema`
  - _Requirements: 7.1a, 1.1, 2.2a_
- [x] 9. Test the repair loop: invalid then valid (check the second request's assistant message and `toolResult` with `toolUseId`, `status: "error"`, message), and a stubborn model that ends in "could not produce a valid plan" after `maxRepairs + 1` calls
  - _Requirements: 7.1b, 2.3_
- [x] 10. Test a text-only reply then a valid one, an always-text model, an empty reply, a `max_tokens` reply, two `toolUse` blocks (both answered) and a client that throws (same error reaches the caller)
  - _Requirements: 7.1c, 7.1d, 2.3b, 2.4, 2.5_
- [x] 11. Rewrite the two Bedrock tests in `tests/unit/director.test.ts` for tool use, and delete the tests of the removed helpers
  - _Requirements: 7.4, 3.3_
- [x] 12. Run `npm run typecheck`, `npm run test:unit` and `npm run check:determinism`; confirm with `git diff --stat` that the composer, arranger, `src/engine/`, `src/wav/` and the compose handler are untouched
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 7.4_

## Session B: MCP server, registration, tests and the README section

- [ ] 13. Before any code, check the MCP subset (versions, `initialize` reply, newline framing, `tools/list`, `tools/call` result with `structuredContent`, error codes) against the current specification with the context7 server, and write any correction into design.md's "Protocol handling" table
  - _Requirements: 4.1, 4.2, 4.3_
- [ ] 14. Add `scripts/mcp/tools.ts` with the `list_patches` tool: no arguments, ids in `PATCH_IDS` order with `name`, `blurb`, `algorithm`, `feedback`
  - _Requirements: 6.1, 6.2_
- [ ] 15. Add the `score_cue` tool to `tools.ts`: arguments from `ComposeRequestSchema.extend` (seed default 13, `writeWavTo`), scene-derived sting times as the CLI does, local director, `scoreFromRequest`, `renderScore`, `encodeWav` with `seed ^ 0x5eed`, then `sha256`, `durationSec` from `parseWav`, `stingLandingSec` from the realized score
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
- [ ] 16. Add the `writeWavTo` checks to `score_cue`: `.wav` name, inside the working directory, no overwrite, no file when absent; return `isError` results for bad arguments and pipeline errors
  - _Requirements: 5.7, 5.8_
- [ ] 17. Add `scripts/mcp/fright-score-mcp.ts`: line-delimited JSON-RPC over stdio, `initialize`, `ping`, `tools/list`, `tools/call`, silent notifications, errors -32700, -32601 and -32602, diagnostics on stderr only, clean exit when stdin closes, local director whatever `FRIGHT_DIRECTOR` says
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
- [ ] 18. Register `fright-score` in `.kiro/settings/mcp.json` beside `aws-docs` and `context7` (`npx tsx scripts/mcp/fright-score-mcp.ts`, 120 s timeout, no `env`); call both tools from a Kiro session to confirm the relative path works, else switch to an absolute path
  - _Requirements: 6.3a, 6.3b, 6.3c_
- [ ] 19. Test `tests/cli/mcp.test.ts`, protocol: spawn the server with `--import tsx` and an environment with no `AWS_*` and `FRIGHT_DIRECTOR=bedrock`; `initialize`, `tools/list`, `ping`, a notification with no reply, unknown method, unknown tool, garbage line, clean exit on stdin close
  - _Requirements: 7.2a, 7.2c, 7.3, 4.2, 4.3, 4.4_
- [ ] 20. Test `score_cue` over stdio: same seed twice gives the same `sha256`, another seed gives another, the hash equals `runCli`'s file for the same arguments, `stingLandingSec` matches the requested time, nothing is written without `writeWavTo`, a written file hashes to the reported value and is refused for an existing file, an outside path and a name without `.wav`, and a bad argument gives `isError` while the server keeps answering
  - _Requirements: 7.2b, 5.4, 5.5, 5.6, 5.7, 5.8_
- [ ] 21. Test `list_patches` over stdio: ten patches in `PATCH_IDS` order with the five fields
  - _Requirements: 6.1, 7.2a_
- [ ] 22. README: a section "Use it from an agent (MCP)" with the registration, both tools, the `score_cue` arguments and a sample result; update the adapter table row for the Bedrock director; say the model writes the plan and the FS-666 makes the sound, and that the MCP server uses the local director
  - _Requirements: 8.1, 8.2, 8.3_
- [ ] 23. List `scripts/mcp/` in `.kiro/steering/structure.md`
  - _Requirements: 8.4_
- [ ] 24. Run `npm run typecheck`, `npm run test:unit`, `npm run check:determinism` and confirm that no file was left behind by the tests
  - _Requirements: 7.3, 7.4, 3.5_

## Requirement-to-task traceability

| Requirement | Tasks |
|---|---|
| 1. The Bedrock director asks through a typed tool | 1, 3, 8 |
| 2. A bad tool input is repaired through the tool result | 2, 3, 4, 5, 6, 8, 9, 10 |
| 3. Everything after the plan stays deterministic | 7, 11, 12, 24 |
| 4. An MCP server over stdio | 13, 17, 19 |
| 5. Any agent can score a cue | 15, 16, 20 |
| 6. Patches can be listed, and Kiro can find the server | 14, 18, 21 |
| 7. Tests that never touch AWS or the network | 8, 9, 10, 11, 12, 19, 20, 21, 24 |
| 8. The copy says what is live | 22, 23 |

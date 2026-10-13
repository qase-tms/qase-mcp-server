# Migration Guide

Three migrations are covered here: [2.x → 3.0.0](#2x--300) — the protocol, deployment and tool-API changes in the current release — the smaller [2.0.x → 2.1.0](#20x--210) change to `qase_triage_defect`, and the v1 → v2 tool rename (the bulk of this document).

---

## 2.x → 3.0.0

3.0.0 changes the revision of MCP the server speaks and removes the sessions it used to keep. **No tool was renamed, and no tool argument changed** — prompts, workflows and automation that call tools by name keep working untouched. What changes is the protocol underneath, three response shapes, and one deployment requirement.

Start with the row that describes you:

| You | What you have to do |
|---|---|
| Use the hosted server at `mcp.qase.io` | Nothing. Read [What every user sees](#what-every-user-sees). |
| Run the server over stdio (`npx @qase/mcp-server`) | Update the package. Nothing to configure. |
| Self-host the HTTP server, one replica | Update the image. Nothing to configure. |
| Self-host the HTTP server, more than one replica | **Set `QASE_MCP_REQUEST_STATE_KEY`** before deploying — see [Required for multiple replicas](#required-for-multiple-replicas). |
| Build a product on top of the tool API | Read [Changes to the tool API](#changes-to-the-tool-api) — three shapes changed. |

---

### What every user sees

#### Every tool is in your list from the first request

Twenty-four tools used to stay out of the tool list until `qase_discover_tools` switched them on. That is gone: all 42 tools are listed immediately, and `qase_discover_tools` stays as a *search* over the catalogue for when the right tool's name is not known. There is no activation step and no `notifications/tools/list_changed` to wait for.

Nothing to change on your side. If you had instructions in a prompt telling the agent to "run discovery first", you can delete them — though leaving them in is harmless, the search still works.

Tool descriptions in the list are now deliberately short. The full documentation of a tool — argument semantics, limits, what cannot be undone — is served by the new **`qase_tool_help`** tool, which takes a single `tool` argument. Together with schemas generated natively by zod 4, this took the tool list from 19.9k to 14.3k tokens, so every request to the model carries about 28% less of it.

#### Deleting takes two round trips

A destructive tool (`qase_run_delete`, `qase_case_delete`, a `DELETE` through `qase_api`, and the rest) no longer waits inside the call for your answer. It returns a request for confirmation, your client shows the prompt, and the call is retried carrying the answer. Most MCP clients do this for you and you see only the prompt.

The window is **ten minutes**, and the confirmation is bound to the caller, the tool, and the exact arguments it was shown for — so a confirmation for one deletion cannot be replayed against another.

**If your client never shows you a prompt, it cannot delete.** This is not new in 3.0.0 — 2.x refused the same clients — but the explanation is now specific about which of the two requirements is missing:

- the client negotiates MCP 2026-07-28, **or**
- it declares the `elicitation` capability over a long-lived connection (stdio, SSE).

Measured on the wire, **Claude Desktop has neither**: it negotiates 2025-11-25 and declares no elicitation. Deletions from Claude Desktop are refused with an explanation; use the Qase UI or a client such as Claude Code. Everything that is not a deletion works normally there.

One message changed meaning. A client that receives the confirmation request and silently drops it is now reported as a **cancellation**, not a refusal. Saying "declined by the user" about a prompt nobody was ever shown sent testers looking for deletions they had never refused.

#### What a 2025-era client loses over HTTP

This is the one genuine regression. Confirming a deletion on the old revision needs the capabilities a client declares during `initialize`, and on the new stateless HTTP endpoint such a request never carried one. So:

- **2025-era client over Streamable HTTP or SSE-over-HTTP → cannot delete.** The call is refused with an explanation; nothing is deleted. Reads and writes are unaffected.
- **2025-era client over stdio or on an open SSE stream → unchanged.** The connection is long-lived, the client's capabilities are known, and confirmation works exactly as it did in 2.x.
- **A stdio client that itself negotiates 2026-07-28** gets the two-round-trip flow above rather than the old single push.

---

### Required for multiple replicas

**Set `QASE_MCP_REQUEST_STATE_KEY` before deploying more than one replica.**

```bash
QASE_MCP_REQUEST_STATE_KEY=<a shared random string of 32+ bytes>
```

It is the HMAC key that signs a pending confirmation. There are no sessions any more, so the request that asks for confirmation and the request that carries the answer can land on different replicas; without a shared key the second replica cannot verify what the first one minted, and the deletion is refused.

- It must be **at least 32 bytes**, or the server refuses to start.
- It must be **identical on every replica**.
- **A single replica needs nothing** — one is generated at startup and logged as such.

Nothing is ever deleted unconfirmed if you forget it. Destructive tools simply stop working until it is set. Generate one with `openssl rand -hex 32`.

### The HTTP endpoint has no sessions

| | 2.x | 3.0.0 |
|---|---|---|
| `mcp-session-id` response header | issued on initialize | never issued |
| `mcp-session-id` request header | required on follow-ups | accepted and ignored |
| `GET` on the MCP endpoint | opened the SSE stream | `405` |
| `DELETE` on the MCP endpoint | ended the session | `405` |
| `Access-Control-Allow-Methods` | `GET, POST, DELETE, OPTIONS` | `GET, POST, OPTIONS` |
| Load-balancer session affinity | required | not needed |

`mcp-session-id` is still accepted as a *request* header on purpose, so a client that still sends one is not broken by a CORS preflight.

Two practical consequences:

- **Turn off sticky sessions / session affinity** in front of the server. They are no longer needed, and spreading requests evenly is now strictly better.
- **Check your health probes.** Anything that probed the MCP endpoint with `GET` now gets `405`. Use `/health` instead.

The SSE transport is unchanged and still stateful: it keeps a long-lived stream, and the integration marker it captured when the stream opened is still reused for that stream.

### Removed environment variable

**`QASE_MCP_SESSION_TTL_MINUTES`** tuned how long an idle HTTP session was kept in memory before eviction. There are no sessions left to evict, so it is read nowhere. Leaving it in a deployment is harmless — it is simply ignored — but you can drop it whenever convenient.

### Integration marker

On **Streamable HTTP**, `X-Qase-Integration` and `?integration=` are now read on the request that carries them, and never attributed to the next one. In 2.x the marker was captured once when a session opened and reused for the session's lifetime, which meant a marker from one caller could be attributed to another's calls on a shared connection.

Precedence is unchanged: request header → query parameter → `QASE_MCP_INTEGRATION`. On SSE, also unchanged: request header → the value captured when the stream opened → `QASE_MCP_INTEGRATION`.

---

### Changes to the tool API

For anyone parsing `tools/list` or a tool's result rather than letting an agent read it.

#### `qase_discover_tools` dropped `activated`

Nothing is hidden any more, so there is nothing to activate.

```diff
 {
   "found": 5,
-  "activated": 5,
   "tools": [{ "name": "...", "description": "...", "destructive": false }]
 }
```

`found` and `tools` are unchanged. In 2.x the `activated` count was unreliable anyway — it counted tools that were already visible, so a search that turned nothing on could still report `activated: 5`.

#### `outputSchema` is no longer sent in `tools/list`

No client validated results against it, and its one internal job — deciding whether to attach `structuredContent` — is now done for every object result. So **`structuredContent` is attached more often than before**, not less. If you validated against the advertised `outputSchema`, that schema is gone; read the result instead.

#### Annotations omit hints equal to the spec default

The wire now carries only the annotation hints that *differ* from the MCP specification's defaults. The default for `destructiveHint` is **`true`**, so for a deletion tool the hint is now **absent**:

```diff
 // qase_run_delete
-"annotations": { "readOnlyHint": false, "destructiveHint": true, "idempotentHint": true, "openWorldHint": true }
+"annotations": { "idempotentHint": true }
```

Per the specification, an absent `destructiveHint` means destructive. Code that tested `annotations.destructiveHint === true` to flag a dangerous tool will now treat every deletion as safe.

```diff
-const destructive = tool.annotations?.destructiveHint === true;
+const destructive = tool.annotations?.destructiveHint !== false;
```

The same applies to `openWorldHint` (default `true`, so absence means open-world) and, inverted, to `readOnlyHint` and `idempotentHint` (default `false`, so absence means not read-only / not idempotent).

#### New tool: `qase_tool_help`

```json
{ "tool": "qase_case_upsert" }
```

Returns the full documentation of one tool. The text is the same documentation that used to live in the tool's `description`; it moved so that 28 KB of traps and field semantics stop being sent to the model on every single request.

---

### For client implementers

If you wrote your own MCP client rather than using the SDK, the deletion flow is the only thing that needs code:

1. Call the destructive tool as usual.
2. The server answers with an **input-required** result carrying one elicitation request and an opaque `requestState`.
3. Show the prompt. The message names the tool and every argument.
4. Retry the same `tools/call`, carrying the user's `accept` / `decline` / `cancel` and echoing `requestState` back unchanged.

The `requestState` is signed by the server and verified before the handler runs; it is opaque, and modifying it only gets the call refused. It expires ten minutes after it was minted.

Declare the `elicitation` capability. A client that does not is refused *before* the request is sent, by name, rather than failing with a protocol error from inside the SDK.

### New metrics

Two counters on `/metrics`, for anyone running the server themselves:

- `qase_mcp_tool_calls_total{tool}` — calls per tool.
- `qase_mcp_requests_total{protocol,client}` — requests per protocol revision and client name. A 2025-era request is counted as `protocol="legacy"`, with the client named only where an `initialize` established it. The client label is normalised and capped at 20 distinct values per process.

---

## 2.0.x → 2.1.0

### `qase_triage_defect` dropped `run_id` and `failed_result_ids`

Both arguments were accepted and then ignored — the tool only ever created the defect. It also reported `Linked results: N` in its summary and `linked_results: N` in its structured output, both computed from the length of the ignored `failed_result_ids` array, so it claimed linking work it had not performed.

This cannot be fixed by forwarding the arguments: `POST /v1/defect/{code}` accepts only `title`, `actual_result`, `severity`, `milestone_id`, `attachments`, `custom_field`, and `tags`, and the defects API has no endpoint for attaching runs or results afterwards. The `runs`/`results` arrays you see on a defect are populated by the test runner when a result is reported as a defect.

**If you passed either argument**, remove it and put the context in `actual_result` instead:

```diff
 qase_triage_defect {
   code: "PROJ",
   title: "Checkout fails on empty cart",
   severity: "blocker",
-  actual_result: "HTTP 500",
-  run_id: 7,
-  failed_result_ids: ["a1b2c3", "d4e5f6"]
+  actual_result: "HTTP 500 — failing results a1b2c3, d4e5f6 in run #7"
 }
```

**If you read `linked_results`** from the response, drop it — it was never a real count. The response is now `{ defect_id, defect }`.

To associate results with a defect for real, report the result as a defect from the test runner (`is_defect` on the result), or link the defect to an external tracker issue with `qase_external_issue_link`.

### `qase_triage_defect` now requires `actual_result` and `severity`

The API has always required both. They were optional in the tool schema, which meant the tool advertised calls the API rejects. Any call that already succeeded is unaffected.

---

## Migration Guide: v1 → v2

> **Breaking change**: v2 replaces all 83 v1 tool names with a consolidated set of 29 task-oriented tools (30 total, including the `qase_discover_tools` discovery tool).
> Every tool name has changed. Update your prompts, workflows, and any automation that references tool names.

## What changed at a glance

| Area | v1 | v2 |
|---|---|---|
| Tool count | 83 | 29 task-oriented (30 total) |
| Naming convention | snake_case verbs (`list_cases`, `create_run`) | `qase_` prefix + noun+verb (`qase_case_upsert`) |
| Read tools | One tool per entity type | `qase_get` handles all entity types |
| List/search | Separate `list_*` per entity | `qql_search` with `entity=` parameter |
| Metadata bootstrap | 6 separate list calls | `qase_project_context` (single call, cached) |
| CI reporting | 3–4 manual steps | `qase_ci_report` composite |
| Response format | Pretty-printed JSON, nulls included | Compact JSON (no indent), nulls stripped |

> **Replacing a `list_*` tool with `qase_project_context`?** Each collection in the context response holds only its first 100 entities by default, where the v1 `list_*` tools let you page explicitly. Check the `coverage` field — it reports `{ total, loaded, truncated }` per collection — and pass `full: true` when you need the complete set. On a project with more than 100 suites, milestones, environments, custom fields, or users, treating the default response as complete gives you a partial answer. (Before 2.1.0 the truncation was not reported at all.)

---

## Tool mapping table

All 83 v1 tools mapped to their v2 equivalents.

### Projects

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_projects` | `qase_project_context` | Returns project + suites + milestones + envs + custom fields + users in one call |
| `get_project` | `qase_get` with `entity="project"` | No `code` required; pass project code as `id` |
| `create_project` | `qase_api` | Use escape hatch: `POST /project` |
| `delete_project` | `qase_api` | Use escape hatch: `DELETE /project/{code}` |
| `grant_project_access` | `qase_api` | Use escape hatch: `POST /project/{code}/access` |
| `revoke_project_access` | `qase_api` | Use escape hatch: `DELETE /project/{code}/access` |

### Test Cases

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_cases` | `qql_search` with `entity="case"` | Supports full QQL filters |
| `get_case` | `qase_get` with `entity="case"` | Supports `fields` projection |
| `create_case` | `qase_case_upsert` (omit `id`) | Pass all case fields; no `id` = create |
| `update_case` | `qase_case_upsert` (include `id`) | Include `id` to update existing case |
| `delete_case` | `qase_case_delete` | — |
| `bulk_create_cases` | `qase_case_bulk_create` | Same shape: `cases` array, up to 100 per call |
| `attach_external_issue` | `qase_api` | Use escape hatch: `POST /case/{code}/{id}/external-issues` |
| `detach_external_issue` | `qase_api` | Use escape hatch: `DELETE /case/{code}/{id}/external-issues` |

### Test Suites

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_suites` | `qase_project_context` | Suites tree is included in context response |
| `get_suite` | `qase_get` with `entity="suite"` | — |
| `create_suite` | `qase_suite_upsert` (omit `id`) | — |
| `update_suite` | `qase_suite_upsert` (include `id`) | — |
| `delete_suite` | `qase_suite_delete` | — |

### Test Runs

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_runs` | `qql_search` with `entity="run"` | — |
| `get_run` | `qase_get` with `entity="run"` | — |
| `create_run` | `qase_run_upsert` (omit `id`) | Or use `qase_ci_report` / `qase_regression_run` composites |
| `delete_run` | `qase_run_delete` | — |
| `complete_run` | `qase_run_complete` | — |
| `get_run_public_link` | `qase_api` | Use escape hatch: `GET /run/{code}/{id}/public-link` |
| `delete_run_public_link` | `qase_api` | Use escape hatch: `DELETE /run/{code}/{id}/public-link` |

### Test Results

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_results` | `qql_search` with `entity="result"` | — |
| `get_result` | `qase_get` with `entity="result"` | — |
| `create_result` | `qase_result_record` | Accepts single result or array via `results` |
| `create_results_bulk` | `qase_result_record` | Same tool handles bulk via `results` array |
| `update_result` | `qase_api` | Use escape hatch: `PATCH /result/{code}/{id}` |
| `delete_result` | `qase_result_delete` | — |

### Test Plans

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_plans` | `qql_search` with `entity="plan"` | — |
| `get_plan` | `qase_get` with `entity="plan"` | — |
| `create_plan` | `qase_plan_upsert` (omit `id`) | — |
| `update_plan` | `qase_plan_upsert` (include `id`) | — |
| `delete_plan` | `qase_plan_delete` | — |

### Defects

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_defects` | `qql_search` with `entity="defect"` | — |
| `get_defect` | `qase_get` with `entity="defect"` | — |
| `create_defect` | `qase_defect_upsert` (omit `id`) | Or use `qase_triage_defect` composite |
| `update_defect` | `qase_defect_upsert` (include `id`) | — |
| `delete_defect` | `qase_defect_delete` | — |
| `resolve_defect` | `qase_defect_upsert` with `status="resolved"` | Pass `id` + `status` field |
| `update_defect_status` | `qase_defect_upsert` with `status` field | Pass `id` + desired `status` |

### Milestones

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_milestones` | `qase_project_context` | Milestones are included in context response |
| `get_milestone` | `qase_get` with `entity="milestone"` | — |
| `create_milestone` | `qase_milestone_upsert` (omit `id`) | — |
| `update_milestone` | `qase_milestone_upsert` (include `id`) | — |
| `delete_milestone` | `qase_milestone_delete` | — |

### Environments

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_environments` | `qase_project_context` | Environments are included in context response |
| `get_environment` | `qase_get` with `entity="environment"` | — |
| `create_environment` | `qase_environment_upsert` (omit `id`) | — |
| `update_environment` | `qase_environment_upsert` (include `id`) | — |
| `delete_environment` | `qase_environment_delete` | — |

### Shared Steps

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_shared_steps` | `qql_search` with `entity="shared_step"` | — |
| `get_shared_step` | `qase_get` with `entity="shared_step"` | — |
| `create_shared_step` | `qase_shared_step_upsert` (omit `id`) | — |
| `update_shared_step` | `qase_shared_step_upsert` (include `id`) | — |
| `delete_shared_step` | `qase_shared_step_delete` | — |

### Shared Parameters

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_shared_parameters` | `qql_search` with `entity="shared_parameter"` | — |
| `get_shared_parameter` | `qase_get` with `entity="shared_parameter"` | No `code` required |

### Attachments

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_attachments` | `qase_api` | Use escape hatch: `GET /attachment` |
| `get_attachment` | `qase_get` with `entity="attachment"` | Pass hash as `id` |
| `upload_attachment` | `qase_attachment_upload` | Pass `file_base64` (or `file_path` for a server running locally). The single `file` argument still works but is deprecated |
| `delete_attachment` | `qase_attachment_delete` | — |

### Authors

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_authors` | `qase_api` | Use escape hatch: `GET /author` |
| `get_author` | `qase_get` with `entity="author"` | — |

### Custom Fields

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_custom_fields` | `qase_project_context` | Custom fields are included in context response |
| `get_custom_field` | `qase_get` with `entity="custom_field"` | — |
| `create_custom_field` | `qase_api` | Use escape hatch: `POST /custom-field` |
| `update_custom_field` | `qase_api` | Use escape hatch: `PATCH /custom-field/{id}` |
| `delete_custom_field` | `qase_api` | Use escape hatch: `DELETE /custom-field/{id}` |

### System Fields

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_system_fields` | `qase_api` | Use escape hatch: `GET /system-field` |

### Configurations

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_configurations` | `qase_get` with `entity="configuration"` | Returns all config groups for a project |
| `create_configuration_group` | `qase_api` | Use escape hatch: `POST /configuration/{code}` |
| `delete_configuration_group` | `qase_api` | Use escape hatch: `DELETE /configuration/{code}/{id}` |

### Users

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `list_users` | `qase_project_context` | Users are included in context response |
| `get_user` | `qase_get` with `entity="user"` | — |

### QQL Search

| v1 tool | v2 equivalent | Notes |
|---|---|---|
| `qql_search` | `qql_search` | Unchanged — same tool, same interface |
| `qql_help` | `qql_help` | Unchanged — same tool, same interface |

---

## Response format changes

In v1, responses were pretty-printed JSON with `null` values included:

```json
{
  "id": 42,
  "title": "Login test",
  "description": null,
  "preconditions": null,
  "priority": 2
}
```

In v2, responses are compact JSON with `null` values stripped:

```json
{"id":42,"title":"Login test","priority":2}
```

This reduces token usage significantly on large result sets. If your workflow parses response strings directly rather than using structured tool output, update your parsing logic accordingly.

Additionally, `qase_get` supports **field projection** via the `fields` parameter:

```json
{ "entity": "case", "code": "MYPROJECT", "id": 42, "fields": ["id", "title", "status"] }
```

Pass `["*"]` to get all fields.

---

## New composite tools

These tools combine multiple API calls into a single operation, reducing round-trips and LLM context usage.

### `qase_ci_report`

Replaces the 3–4 step workflow of `create_run → create_results_bulk → complete_run`.

Accepts a project code, run title, and an array of test results. Creates the run, records all results, and optionally completes it in one call.

### `qase_triage_defect`

Creates a defect from a test failure description. Requires `title`, `actual_result`, and `severity`.

Note: the tool does **not** link the defect to runs or results — the API has no field or endpoint for that (see [2.0.x → 2.1.0](#20x--210) above). Reference the failing results in `actual_result`.

Replaces: `create_defect`.

### `qase_regression_run`

Sets up a regression test run in one call. Accepts case selection by suite IDs, explicit case IDs, or plan ID. Creates the run and populates it with all matching cases.

Replaces: `list_cases` (per suite) → `create_run` → manually adding cases.

---

## Before / after examples

### Example 1: Report CI results

**v1 (3 calls)**

```
1. create_run { code: "PROJ", title: "CI Build #42", cases: [101, 102, 103] }
   → { id: 7 }

2. create_results_bulk { code: "PROJ", id: 7, results: [...] }

3. complete_run { code: "PROJ", id: 7 }
```

**v2 (1 call)**

```
qase_ci_report {
  code: "PROJ",
  title: "CI Build #42",
  results: [
    { case_id: 101, status: "passed", time_ms: 1200 },
    { case_id: 102, status: "failed", stacktrace: "AssertionError..." },
    { case_id: 103, status: "skipped" }
  ]
}
→ { run_id: 7, run_status: "complete", results_recorded: 3 }
```

---

### Example 2: Get project metadata before creating a test case

**v1 (up to 6 calls)**

```
1. list_suites   { code: "PROJ" }
2. list_milestones { code: "PROJ" }
3. list_environments { code: "PROJ" }
4. list_custom_fields {}
5. list_users {}
6. get_project { code: "PROJ" }
```

**v2 (1 call)**

```
qase_project_context { code: "PROJ" }
→ {
    project: { ... },
    suites: { entities: [...] },
    milestones: { entities: [...] },
    environments: { entities: [...] },
    custom_fields: { entities: [...] },
    users: { entities: [...] }
  }
```

Result is cached for 5 minutes — subsequent calls within the same session return instantly.

---

### Example 3: Create or update a test case

**v1 (separate tools for create vs update)**

```
# Create:
create_case { code: "PROJ", title: "Login happy path", priority: "high" }

# Update:
update_case { code: "PROJ", id: 55, title: "Login happy path v2" }
```

**v2 (single upsert tool)**

```
# Create (no id):
qase_case_upsert { code: "PROJ", title: "Login happy path", priority: "high" }

# Update (with id):
qase_case_upsert { code: "PROJ", id: 55, title: "Login happy path v2" }
```

---

## Escape hatch for unsupported operations

For v1 operations that have no direct v2 equivalent (project management, configuration groups, system fields, etc.), use `qase_api`:

```
qase_api {
  method: "GET",
  path: "/system-field",
  query: {}
}
```

This gives direct access to any Qase REST API endpoint. See the `qase_api` tool description for full parameter documentation.

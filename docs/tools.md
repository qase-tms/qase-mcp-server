# Tool Reference

The Qase MCP Server exposes **37 tools** across 6 groups: Read (2), QQL (2), Write (28, including 5 review tools), Composite (3), Escape hatch (1), and Meta (1).

## Discovery model

To keep context-token usage low, tools are split into two visibility tiers:

- **`core`** — always listed to the MCP client, no activation needed (14 tools).
- **`discoverable`** — hidden by default; the LLM finds and activates them on demand via `qase_discover_tools`, which searches tool names/descriptions and activates matches for the rest of the session (23 tools, mostly deletes, review operations, and secondary write operations).

If a tool you need isn't showing up in your client's tool list, call `qase_discover_tools` with a query (e.g. `"delete"`, `"milestone"`, `"attachment"`) to activate it first.

Every tool's schema uses "label or numeric ID" strings for Qase's configurable enum fields (`priority`, `severity`, `type`, `layer`, `behavior`, `status`, `automation` on cases); the server resolves labels against the workspace's actual system-field configuration at call time. See [Case enum values](#case-enum-values) below.

## Read tools

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_get` | Get any Qase entity by type and ID. Supports field projection via `fields`. `code` is required for project-scoped entities (case, suite, run, result, plan, defect, milestone, environment, shared_step, shared_parameter, configuration, review); optional for global entities (user, author, attachment, custom_field). Cases and runs automatically request their external issue links (`external_issues` / `external_issue`); override with `include`. | `entity` (enum: case, suite, run, result, plan, defect, milestone, environment, shared_step, shared_parameter, configuration, attachment, author, user, custom_field, review), `code` (optional), `id` (number or hash string), `fields` (optional string array — pass `["*"]` for all), `include` (optional string) | core |
| `qase_project_context` | Get full project context in one call: project details, suites tree, milestones, environments, custom fields, and users. Cached for 5 minutes. Recommended as the first call when starting work with a project. Each collection returns its first 100 entities by default — check the `coverage` field (`{ total, loaded, truncated }` per collection) before treating a list as complete, and pass `full: true` to page through everything. | `code`, `full` (optional bool, default false) | core |

## QQL tools

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qql_search` | Search entities using Qase Query Language (QQL) with powerful filtering and cross-project queries. Aggregate with `SELECT (COUNT(id)) …` instead of paging rows to count — note `SELECT` comes **first**, before the conditions. | `query` (1-2000 chars, matching the REST limit), `limit` (optional, max 100, default 10), `offset` (optional) | core |
| `qql_help` | Get one section of the QQL reference. `topic` is **required** — the whole reference is large, so ask for the section you need. Read `entities` before querying an unfamiliar entity: field names are not uniform (only `case`/`defect`/`plan`/`requirement` have `created`; `run` has `started`/`ended`, `result` only `ended`). | `topic` (required enum: overview, syntax, entities, operators, functions, examples, aggregation, enumValues) | core |

## Write tools

<details>
<summary>Write tools (23, excluding review — see below)</summary>

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_case_upsert` | Create or update a test case. If `id` is provided, updates the existing case; if omitted, creates a new one. Enum fields (priority, severity, type, etc.) accept both labels ("high", "blocker") and numeric IDs — the server normalizes automatically. | `code`, `id` (optional), `title` (1-255 chars), `description`, `preconditions`, `postconditions`, `severity`, `priority`, `type`, `layer`, `behavior`, `automation`, `status` (all label-or-ID strings), `is_flaky`, `suite_id`, `milestone_id`, `steps` (array, supports nesting; a step may reference a shared step via `shared` — the shared step hash — instead of `action`), `steps_type` (enum: classic, gherkin), `tags`, `attachments`, `custom_field` | core |
| `qase_case_bulk_create` | Create up to 100 test cases in a single request. Use instead of calling `qase_case_upsert` repeatedly when importing or generating several cases at once. Enum fields accept labels or numeric IDs. Creates only — use `qase_case_upsert` with an `id` to update. Returns the IDs of the created cases in submission order. | `code`, `cases` (array, 1-100 — same fields as `qase_case_upsert` without `id`, including `shared` step references) | discoverable |
| `qase_case_delete` | Delete a test case by project code and case ID. | `code`, `id` | discoverable |
| `qase_defect_upsert` | Create or update a defect. If `id` is provided, updates (including status changes and resolve). If omitted, creates a new defect. Set `status: "resolved"` to resolve an existing defect. | `code`, `id` (optional), `title` (1-255 chars), `actual_result`, `severity` (enum, see [below](#case-enum-values)), `status` (enum: open, in_progress, resolved, invalid), `tags`, `attachments`, `custom_field` | core |
| `qase_defect_delete` | Delete a defect by project code and defect ID. | `code`, `id` | discoverable |
| `qase_run_upsert` | Create or update a test run. If `id` is provided, updates; if omitted, creates. | `code`, `id` (optional), `title` (1-255 chars), `description`, `environment_id`, `milestone_id`, `plan_id`, `cases` (case ID array), `tags`, `is_autotest`, `start_time`/`end_time` (RFC3339), `custom_field` | core |
| `qase_run_complete` | Mark a test run as complete. | `code`, `id` | discoverable |
| `qase_run_delete` | Delete a test run. | `code`, `id` | discoverable |
| `qase_result_record` | Record one or more test results into a run. A single entry uses the single-result API, multiple entries use bulk. Each result must include a status; `case_id` is recommended. | `code`, `run_id`, `results` (array, min 1) — each result: `case_id` (optional), `status` (enum: passed, failed, blocked, skipped, invalid), `comment`, `stacktrace`, `time_ms`, `defect` (bool), `steps` (array with `position`, `status`, `comment`, `attachments`), `attachments`, `custom_field` | core |
| `qase_result_delete` | Delete a test result by run ID and result hash. | `code`, `run_id`, `hash` | discoverable |
| `qase_suite_upsert` | Create or update a test suite. If `id` is provided, updates the existing suite; if omitted, creates a new one. | `code`, `id` (optional), `title` (1-255 chars), `description`, `preconditions`, `parent_id` (for nesting) | discoverable |
| `qase_suite_delete` | Delete a test suite. If `delete_cases` is true, removes all cases in the suite; if false or omitted, cases are moved to the parent suite. | `code`, `id`, `delete_cases` (optional bool) | discoverable |
| `qase_milestone_upsert` | Create or update a milestone. If `id` is provided, updates the existing milestone; if omitted, creates a new one. | `code`, `id` (optional), `title` (1-255 chars), `description`, `status` (enum: active, completed), `due_date` (Unix timestamp) | discoverable |
| `qase_milestone_delete` | Delete a milestone by project code and milestone ID. | `code`, `id` | discoverable |
| `qase_plan_upsert` | Create or update a test plan. If `id` is provided, updates the existing plan; if omitted, creates a new one. | `code`, `id` (optional), `title` (1-255 chars), `description`, `cases` (case ID array) | discoverable |
| `qase_plan_delete` | Delete a test plan by project code and plan ID. | `code`, `id` | discoverable |
| `qase_shared_step_upsert` | Create or update a shared step. If `hash` is provided, updates the existing shared step; if omitted, creates a new one. Shared steps are reusable steps included in multiple test cases. | `code`, `hash` (optional), `title` (1-255 chars), `steps` (array: `action`, `expected_result`, `data`, `attachments`) | discoverable |
| `qase_shared_step_delete` | Delete a shared step by project code and hash. | `code`, `hash` | discoverable |
| `qase_environment_upsert` | Create or update a test environment. If `id` is provided, updates the existing environment; if omitted, creates a new one. | `code`, `id` (optional), `title` (1-255 chars), `description`, `slug`, `host` | discoverable |
| `qase_environment_delete` | Delete a test environment by project code and environment ID. | `code`, `id` | discoverable |
| `qase_attachment_upload` | Upload a file and get back its hash, which every `attachments` field accepts. This is the only way to obtain such a hash — the endpoint needs `multipart/form-data`, which `qase_api` cannot send. Use `file_base64` whenever the server is not on the same machine as the file, including the hosted connector, where it is the only option. | `code`, `filename`, `file_base64` (base64 content), `file_path` (absolute path, local servers only), `file` (deprecated alias accepting either) | **core** |
| `qase_attachment_delete` | Delete an attachment by its hash. | `hash` | discoverable |
| `qase_external_issue_link` | Link or unlink test cases and test runs to issues in an external tracker (Jira Cloud or Jira Server). A case can be linked to several issues; a run can have only one link, and attaching a new issue replaces the previous one. Detaching a run clears its link. Read linked issues back with `qase_get`. | `code`, `entity` (enum: case, run), `action` (enum: attach, detach), `type` (enum: jira-cloud, jira-server), `links` (array: `id`, `issues` — issue keys such as `PROJ-1234`) | discoverable |

</details>

To insert a shared step into a test case, pass its hash as `shared` on a step object in `qase_case_upsert` or `qase_case_bulk_create`: `{"steps": [{"shared": "<hash>"}]}`. `action` is not required for such a step, and nesting is supported. The read side of the API reports the link as `shared_step_hash`; that spelling is accepted on write too and is translated automatically.

### Review tools

Test case review is the pull-request workflow for test cases: an author proposes a new case or a change to an existing one, reviewers approve or request changes, and merging applies the proposal. All review tools require **"Test case review" to be enabled in the project settings** — otherwise every call fails, and the error points at that setting.

**Scope**: the public API covers authoring only. **Approving, requesting changes, merging, and declining have no API endpoints** — they exist only in the Qase UI (which does emit webhooks). No tool here can perform them; read the current state with `qase_review_list` or `qase_get`.

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_review_create` | Open a review. With `case_id` it proposes changes to an existing case (an `edit` review — send only the fields that change); without it, a new-case draft (a `create` review — `title` required). Case fields are named and normalised exactly as in `qase_case_upsert`. Returns `{ review_id, type, case_id, status }`. | `code`, `case_id` (optional), `reviewers` (optional), plus any `qase_case_upsert` case field | discoverable |
| `qase_review_update` | Change the proposal, reassign reviewers, or both. **Changing the proposal resets every approval already given**; updating only `reviewers` keeps them. The result reports `approvals_reset`. | `code`, `id`, `reviewers` (optional — replaces the list; `[]` removes everyone), plus any case field | discoverable |
| `qase_review_list` | List reviews with filters, reporting `total` alongside `returned`. This is how review and per-reviewer approval status are read — QQL has no `review` entity. | `code`, `status` (optional enum: open, merged, declined), `type` (optional enum: create, edit), `case_id`, `author_uuid`, `reviewer_uuid`, `search`, `limit` (max 100, default 25), `offset` | discoverable |
| `qase_review_delete` | Delete a review. Merged reviews cannot be deleted. This removes the proposal — it does **not** decline it, which is UI-only. | `code`, `id` | discoverable |
| `qase_review_bulk_create` | Open several reviews at once. The API validates the batch as a whole, so one invalid item rejects all of them; items missing a required `title` are caught locally before anything is sent. Returns a flat `review_ids` list (the API nests them as `items[].review_id`). | `code`, `reviews` (array, min 1 — same fields as `qase_review_create` without `code`) | discoverable |

Reviewers are **author UUIDs**, not user IDs (`qase_get { entity: "author" }` or `GET /author`). Email addresses are accepted and resolved to UUIDs. A review cannot be reviewed by its author, and the review is created by whoever owns the API token — so that person cannot appear in `reviewers`; leave the list empty and assign in the UI if needed.

Read a single review, including its `proposed_case`, with `qase_get { entity: "review", code, id }`.

## Composite tools

Composite tools chain several underlying operations into one call, so an agent avoids multi-step round-trips for common workflows.

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_ci_report` | Report CI/CD test results in one call: creates a run, records all results, and optionally completes the run. Replaces the 3-4 step manual workflow of create_run → bulk_create_results → complete_run. Designed for CI pipeline integration. | `code`, `title` (1-255 chars), `environment_id` (optional), `results` (array, min 1: `case_id`, `status` (enum: passed, failed, blocked, skipped, invalid), `comment`, `time_ms`, `stacktrace`, `defect`, `attachments`), `complete` (default true), `is_autotest` (default true) | core |
| `qase_regression_run` | Set up a regression test run in one call. Accepts case selection by suite IDs, explicit case IDs, or plan ID. Creates the run and adds all matching cases. Replaces the multi-step workflow of find cases → create run → add cases. | `code`, `title` (1-255 chars), `description`, `environment_id`, `milestone_id`, `plan_id`, `suite_ids` (array), `include_cases` (array) | core |
| `qase_triage_defect` | Create a defect from a test failure. `title`, `actual_result`, and `severity` are all required by the API. The API offers no way to attach runs or results to a defect — the `runs`/`results` arrays seen on a defect are populated by the test runner when a result is reported as a defect — so reference failing results in `actual_result` instead. (`run_id` and `failed_result_ids` were removed in 2.1.0: they were accepted and ignored.) | `code`, `title` (1-255 chars), `actual_result` (required), `severity` (required, enum, see [below](#case-enum-values)), `description`, `tags`, `attachments`, `custom_field` | core |

## Escape hatch

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_api` | Direct Qase REST API call for endpoints not covered by other tools. Pass the HTTP method, path (starting with `/v1/`), and optional body/query. Use this when the dedicated tools do not cover your use case. **Sends JSON only** — it cannot upload files, which need `multipart/form-data`; use `qase_attachment_upload` for that. See [developers.qase.io](https://developers.qase.io) for the API reference. | `method` (enum: GET, POST, PUT, PATCH, DELETE — default GET), `path` (e.g. `/v1/project/DEMO/run`), `body` (optional object, for POST/PUT/PATCH), `query` (optional object) | core |

## Meta

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_discover_tools` | Search for and activate additional Qase tools. By default, only core tools are visible. Use this to find tools for specific needs: deletions, milestone management, attachments, etc. Found tools are automatically activated and become available for use. | `query` (optional, matches tool name/description), `category` (optional enum: read, write, delete, composite, all), `activate` (optional bool, default true) | core |

## Case enum values

Test case enum fields (`priority`, `severity`, `type`, `layer`, `behavior`, `status`, `automation`) are **workspace-configurable system fields**, not fixed literals in the tool schema — each Qase workspace can rename/reorder its own options. Tool calls accept either the field's label (e.g. `"high"`, `"blocker"`), its slug, or its numeric ID as a string; the server resolves the value against the workspace's live system-field configuration (fetched from the Qase API and cached for 5 minutes — see `src/utils/case-enums.ts`) before sending the request.

The `automation` field is the one exception with a fixed, documented mapping (translated internally to the API's `isManual`/`isToBeAutomated` fields for cases, and to `is_manual`/`is_to_be_automated` for review proposals, which is what the review endpoint expects):

| Value | Meaning |
| --- | --- |
| `0` | Manual (not automated) |
| `1` | To be automated |
| `2` | Automated |

`priority` has a conventional (but still workspace-configurable) numeric mapping:

| Value | Meaning |
| --- | --- |
| `0` | Not set |
| `1` | High |
| `2` | Medium |
| `3` | Low |

Two tools use **fixed** (non-configurable) Zod enums instead of workspace system fields:

- **Defect `severity`** (`qase_defect_upsert`, `qase_triage_defect`): `undefined`, `blocker`, `critical`, `major`, `normal`, `minor`, `trivial`.
- **Defect `status`** (`qase_defect_upsert`): `open`, `in_progress`, `resolved`, `invalid`.
- **Result `status`** (`qase_result_record`, `qase_ci_report`): `passed`, `failed`, `blocked`, `skipped`, `invalid` (result *steps* use the same set minus `invalid`).
- **Milestone `status`** (`qase_milestone_upsert`): `active`, `completed`.

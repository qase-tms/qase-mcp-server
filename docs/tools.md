# Tool Reference

The Qase MCP Server exposes **31 tools** across 6 groups: Read, QQL, Write, Composite, Escape hatch, and Meta.

## Discovery model

To keep context-token usage low, tools are split into two visibility tiers:

- **`core`** — always listed to the MCP client, no activation needed (13 tools).
- **`discoverable`** — hidden by default; the LLM finds and activates them on demand via `qase_discover_tools`, which searches tool names/descriptions and activates matches for the rest of the session (18 tools, mostly deletes and secondary write operations).

If a tool you need isn't showing up in your client's tool list, call `qase_discover_tools` with a query (e.g. `"delete"`, `"milestone"`, `"attachment"`) to activate it first.

Every tool's schema uses "label or numeric ID" strings for Qase's configurable enum fields (`priority`, `severity`, `type`, `layer`, `behavior`, `status`, `automation` on cases); the server resolves labels against the workspace's actual system-field configuration at call time. See [Case enum values](#case-enum-values) below.

## Read tools

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_get` | Get any Qase entity by type and ID. Supports field projection via `fields`. `code` is required for project-scoped entities (case, suite, run, result, plan, defect, milestone, environment, shared_step, shared_parameter, configuration); optional for global entities (user, author, attachment, custom_field). Cases and runs automatically request their external issue links (`external_issues` / `external_issue`); override with `include`. | `entity` (enum: case, suite, run, result, plan, defect, milestone, environment, shared_step, shared_parameter, configuration, attachment, author, user, custom_field), `code` (optional), `id` (number or hash string), `fields` (optional string array — pass `["*"]` for all), `include` (optional string) | core |
| `qase_project_context` | Get full project context in one call: project details, suites tree, milestones, environments, custom fields, and users. Cached for 5 minutes. Recommended as the first call when starting work with a project. | `code` | core |

## QQL tools

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qql_search` | Search entities using Qase Query Language (QQL) with powerful filtering and cross-project queries. | `query` (1-1000 chars, QQL expression), `limit` (optional, max 100, default 10), `offset` (optional) | core |
| `qql_help` | Get help and examples for QQL syntax. | `topic` (optional enum: syntax, entities, operators, functions, examples — omit for general overview) | core |

## Write tools

<details>
<summary>Write tools (22)</summary>

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_case_upsert` | Create or update a test case. If `id` is provided, updates the existing case; if omitted, creates a new one. Enum fields (priority, severity, type, etc.) accept both labels ("high", "blocker") and numeric IDs — the server normalizes automatically. | `code`, `id` (optional), `title` (1-255 chars), `description`, `preconditions`, `postconditions`, `severity`, `priority`, `type`, `layer`, `behavior`, `automation`, `status` (all label-or-ID strings), `is_flaky`, `suite_id`, `milestone_id`, `steps` (array, supports nesting), `steps_type` (enum: classic, gherkin), `tags`, `attachments`, `custom_field` | core |
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
| `qase_attachment_upload` | Upload a file attachment. Accepts the file as a base64 encoded string or an absolute path. Returns the attachment hash that can be referenced in test cases and results. | `code`, `file` (base64 string or absolute path), `filename` | discoverable |
| `qase_attachment_delete` | Delete an attachment by its hash. | `hash` | discoverable |
| `qase_external_issue_link` | Link or unlink test cases and test runs to issues in an external tracker (Jira Cloud or Jira Server). A case can be linked to several issues; a run can have only one link, and attaching a new issue replaces the previous one. Detaching a run clears its link. Read linked issues back with `qase_get`. | `code`, `entity` (enum: case, run), `action` (enum: attach, detach), `type` (enum: jira-cloud, jira-server), `links` (array: `id`, `issues` — issue keys such as `PROJ-1234`) | discoverable |

</details>

## Composite tools

Composite tools chain several underlying operations into one call, so an agent avoids multi-step round-trips for common workflows.

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_ci_report` | Report CI/CD test results in one call: creates a run, records all results, and optionally completes the run. Replaces the 3-4 step manual workflow of create_run → bulk_create_results → complete_run. Designed for CI pipeline integration. | `code`, `title` (1-255 chars), `environment_id` (optional), `results` (array, min 1: `case_id`, `status` (enum: passed, failed, blocked, skipped, invalid), `comment`, `time_ms`, `stacktrace`, `defect`, `attachments`), `complete` (default true), `is_autotest` (default true) | core |
| `qase_regression_run` | Set up a regression test run in one call. Accepts case selection by suite IDs, explicit case IDs, or plan ID. Creates the run and adds all matching cases. Replaces the multi-step workflow of find cases → create run → add cases. | `code`, `title` (1-255 chars), `description`, `environment_id`, `milestone_id`, `plan_id`, `suite_ids` (array), `include_cases` (array) | core |
| `qase_triage_defect` | Create a defect from a test failure and optionally link it to failed results. Streamlines the triage workflow: create defect → link to failing tests. | `code`, `title` (1-255 chars), `severity` (enum, see [below](#case-enum-values)), `actual_result`, `description`, `run_id` (optional, informational), `failed_result_ids` (result hashes, optional), `tags`, `attachments`, `custom_field` | core |

## Escape hatch

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_api` | Direct Qase REST API call for endpoints not covered by other tools. Pass the HTTP method, path (starting with `/v1/`), and optional body/query. Use this when the dedicated tools do not cover your use case. See [developers.qase.io](https://developers.qase.io) for the API reference. | `method` (enum: GET, POST, PUT, PATCH, DELETE — default GET), `path` (e.g. `/v1/project/DEMO/run`), `body` (optional object, for POST/PUT/PATCH), `query` (optional object) | core |

## Meta

| Tool | Description | Key params | Visibility |
| --- | --- | --- | --- |
| `qase_discover_tools` | Search for and activate additional Qase tools. By default, only core tools are visible. Use this to find tools for specific needs: deletions, milestone management, attachments, etc. Found tools are automatically activated and become available for use. | `query` (optional, matches tool name/description), `category` (optional enum: read, write, delete, composite, all), `activate` (optional bool, default true) | core |

## Case enum values

Test case enum fields (`priority`, `severity`, `type`, `layer`, `behavior`, `status`, `automation`) are **workspace-configurable system fields**, not fixed literals in the tool schema — each Qase workspace can rename/reorder its own options. Tool calls accept either the field's label (e.g. `"high"`, `"blocker"`), its slug, or its numeric ID as a string; the server resolves the value against the workspace's live system-field configuration (fetched from the Qase API and cached for 5 minutes — see `src/utils/case-enums.ts`) before sending the request.

The `automation` field is the one exception with a fixed, documented mapping (translated internally to the API's `isManual`/`isToBeAutomated` fields):

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

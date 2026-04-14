# Migration Guide: v1 → v2

> **Breaking change**: v2 replaces all 83 v1 tool names with a consolidated set of 29 tools.
> Every tool name has changed. Update your prompts, workflows, and any automation that references tool names.

## What changed at a glance

| Area | v1 | v2 |
|---|---|---|
| Tool count | 83 | 29 |
| Naming convention | snake_case verbs (`list_cases`, `create_run`) | `qase_` prefix + noun+verb (`qase_case_upsert`) |
| Read tools | One tool per entity type | `qase_get` handles all entity types |
| List/search | Separate `list_*` per entity | `qql_search` with `entity=` parameter |
| Metadata bootstrap | 6 separate list calls | `qase_project_context` (single call, cached) |
| CI reporting | 3–4 manual steps | `qase_ci_report` composite |
| Response format | Pretty-printed JSON, nulls included | Compact JSON (no indent), nulls stripped |

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
| `bulk_create_cases` | `qase_case_upsert` (call per case) | Call once per case without `id` |
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
| `upload_attachment` | `qase_attachment_upload` | — |
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

Streamlines the defect triage workflow. Creates a defect from a test failure description and optionally links it to failed result hashes from a run.

Replaces: `create_defect` (then manual linking).

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.2]

### Added

- **Integration marker** — a product built on top of this server (a plugin, an agent, a wrapper CLI) can identify itself, and the server forwards that identity to the Qase API as `X-MCP-Integration-Name` / `X-MCP-Integration-Version`. This is a third identity axis, independent of the two already on the wire: the `User-Agent` says which deployment of the server is running (`qase-mcp` vs `qase-mcp-hosted`), `X-MCP-Client-*` says which AI host is connected — neither can carry it, since the same integration runs on any host, on either deployment. Set `QASE_MCP_INTEGRATION=<name>/<version>` (version optional); over HTTP transports the marker can instead travel per request, as an `X-Qase-Integration` header or `?integration=` on the MCP endpoint (captured when the session is created, then remembered for it). Precedence: request header → session value → env var. The name must be on the allowlist in `src/utils/integration-marker.ts`, which bounds the cardinality of the analytics dimension — anything unlisted, malformed or oversized is dropped silently and the API call still succeeds. Nothing is sent when no marker is supplied, so existing setups are byte-for-byte unaffected on the wire. For integration authors only; see [docs/self-run.md](docs/self-run.md#integration-marker-for-integration-authors).

### Security

- Raised the dev-dependency `overrides` to clear all open Dependabot alerts: `js-yaml` to 3.15.1 / 4.3.1 (quadratic-CPU DoS in merge-key and `!!omap` handling), `@babel/core` to ^7.29.6 (arbitrary file read via a `sourceMappingURL` comment), and `yaml` to ^2.8.3 (stack overflow on deeply nested collections). All four are development-only and reached the tree through eslint, jest and lint-staged — `npm audit --omit=dev` already reported zero, so nothing shipped to consumers of the package was affected. Note that the previous `js-yaml@3` override pinned 3.14.2, which was itself vulnerable.

## [2.2.1]

### Fixed

- **Requests were attributed to the SDK instead of the MCP server.** The `User-Agent` was set as an axios instance default, but `qase-api-client` puts its own `qase-api-client-js/<version>` into `Configuration.baseOptions`, and the generated code merges those headers over the instance defaults. Every call made through the SDK — which is all of them except the `qase_api` escape hatch — therefore reached Qase as `qase-api-client-js/1.1.14`, so neither the MCP source nor the split between self-run (`qase-mcp`) and hosted (`qase-mcp-hosted`) was visible in metrics. The header is now set in a request interceptor, which runs after that merge, and is covered by tests that assert what a real HTTP server receives.

### Added

- **`QASE_API_PROTOCOL`** — the scheme used to reach `QASE_API_DOMAIN`, defaulting to `https`. Requests were previously hardcoded to HTTPS, so a self-hosted or on-premise Qase API served over plain HTTP could not be reached at all: `QASE_API_DOMAIN` takes a bare domain and rejects anything carrying a scheme. Only `http` and `https` are recognised (case-insensitive, with or without a trailing `://`); any other value falls back to `https`, so a typo cannot silently downgrade the connection. Existing setups are unaffected. See [docs/self-run.md](docs/self-run.md#self-hosted-deployments-over-plain-http).

## [2.2.0]

### Changed

- Updated `qase-api-client` to 1.1.14, which adds the reviews API.

### Fixed

- **Attachments could not be added to test cases.** ([#74](https://github.com/qase-tms/qase-mcp-server/issues/74)) `qase_attachment_upload` was registered as `discoverable`, so it was absent from `tools/list` until an agent happened to call `qase_discover_tools`. Meanwhile the `attachments` field on visible tools (`qase_case_upsert`, `qase_result_record`, `qase_ci_report`, `qase_triage_defect`, `qase_defect_upsert`) asks for hashes that only that hidden tool can produce — so agents reached for `qase_api`, hit the endpoint's `multipart/form-data` requirement, and reported that uploads were impossible on the connector. The tool is now a core tool, listed by default, and every `attachments` field says where its hashes come from. `qase_api`'s own description now states that it sends JSON only and points at the upload tool.
- **Plain text files were uploaded as binary noise.** The single `file` argument guessed base64-vs-path with `/^[A-Za-z0-9+/=\s]+$/`, which matches any letters-digits-spaces string: `"Test data 123"` was treated as base64 and decoded into garbage, silently. Base64 is now confirmed by decode/re-encode round-trip, and non-base64 content passed through `file` is uploaded verbatim.
- **A wrong `file` path silently uploaded noise** instead of reporting the missing file: a path that did not exist fell through to base64 handling. `file_path` now fails with the path it tried and a note that a remote server cannot read your filesystem.

### Added

- **Test case review support** — the pull-request workflow for test cases, via five new discoverable tools:
  - **`qase_review_create`** — opens a review. With `case_id` it proposes changes to an existing case (an `edit` review, send only what changes); without it, a new-case draft (a `create` review, `title` required). Case fields are named and normalised exactly as in `qase_case_upsert`, so enum labels (`priority: "high"`) and shared step references work identically.
  - **`qase_review_update`** — changes the proposal, reassigns reviewers, or both. Changing the proposal **resets every approval already given**, while updating only `reviewers` keeps them; the tool says so up front and reports `approvals_reset` in its result, since this is easy to trigger by accident.
  - **`qase_review_list`** — filters by status, type, reviewed case, author, reviewer, and title, and reports the total alongside what was returned. This is also how per-reviewer approval status is read, as QQL has no review entity.
  - **`qase_review_delete`** — deletes a proposal (merged reviews cannot be deleted; this is not the same as declining).
  - **`qase_review_bulk_create`** — opens several at once. The API validates the batch as a whole, so items missing a required `title` are rejected locally before anything is sent. Its result flattens the API's `items[].review_id` into a top-level `review_ids` list, matching the shape `qase_review_create` returns, and names the created IDs in the summary — reading the nested key wrongly is an easy way to lose track of what was just created.
  - All four non-delete review tools declare an `outputSchema`, so the response shape is part of the contract.
  - `qase_get` accepts `entity: "review"`, and `qase_case_upsert` now mentions that changes may need to go through a review when the project has the feature enabled.
  - **Scope**: approving, requesting changes, merging, and declining have **no public API endpoints** — they exist only in the Qase UI (which does emit webhooks). Every review tool states this, so an agent does not report a merge it cannot perform.
  - Reviewers are **author UUIDs**, not user IDs — a distinction that is easy to get wrong. Email addresses are accepted and resolved to UUIDs. The `reviewers` field also documents that a review cannot be reviewed by its author: the review is created by whoever owns the API token, so passing that person's own address fails, and the resulting error now explains it.
  - Any review call fails when "Test case review" is disabled for the project; that failure now carries a hint pointing at the project setting instead of a bare 4xx.
- **`qase_attachment_upload` takes explicit `file_base64` and `file_path` arguments**, so which one is meant is no longer inferred from the value. `file_base64` is the only option when the server is remote — including the hosted connector, which cannot see the caller's filesystem, the situation behind the original report. The old `file` argument keeps working as a deprecated alias.

## [2.1.1]

### Fixed

- **The aggregation examples added in 2.1.0 were themselves invalid QQL.** They placed `SELECT (...)` after the conditions (`entity = "result" and ... SELECT (COUNT(id))`), which the API rejects with a bare `Query is invalid` that does not say what is wrong — so a model copying the form from `qql_help` had no way to recover. `SELECT (...)` must come first: `SELECT (COUNT(id)) entity = "result" and project = "DEMO" GROUP BY status`. All four examples, `overview.structure`, and `aggregation.syntax` are corrected, and the position requirement is now stated as explicitly as the mandatory parentheses already were. `overview.structure` also shows the filtering and aggregating forms separately instead of as one combined line, since the combined form is what suggested the wrong order.
- A regression test now asserts that every query string in every `qql_help` topic which uses `SELECT (` starts with it — verified to fail against the 2.1.0 text.

## [2.1.0]

### Breaking Changes

- **`qase_triage_defect` no longer accepts `run_id` or `failed_result_ids`.** Both were read from the arguments and then ignored — the tool only ever created the defect. `POST /v1/defect/{code}` accepts `title`, `actual_result`, `severity`, `milestone_id`, `attachments`, `custom_field`, and `tags`; there is no field for runs or results, and no endpoint to attach them afterwards. The `runs`/`results` arrays visible on a defect are populated by the test runner when a result is reported as a defect. Reference failing results in `actual_result` instead.
- **`qase_triage_defect` now requires `actual_result` and `severity`**, which the API has always required. Marking them optional produced requests the API rejects, with nothing in the tool contract to warn about it.
- **`qql_help` now requires `topic`** and returns that one section. Previously omitting `topic` returned every section at once, which sends the whole reference into the context on each call — and the reference grew substantially in this release. `overview` is now a topic of its own, so the old default is still reachable as `topic: "overview"`. An omitted or unknown topic returns an error listing the valid ones.

### Fixed

- **`qase_triage_defect` reported linking it never performed.** The summary printed `Linked results: N` and the structured result carried `linked_results: N`, both derived from the length of the ignored `failed_result_ids` argument — so the tool reported work it had not done. Both are gone, along with `linked_results` from `TriageDefectOutput`. The tool description no longer promises "create defect → link to failing tests" either.
- **`qase_project_context` no longer truncates collections silently.** Suites, milestones, environments, custom fields, and users were each capped at the first 100 entities with no indication in the response — a project with 2 711 suites reported "Suites: 100" and the consumer had no way to learn it was seeing 3.7% of the data. The result now carries a `coverage` field with `{ total, loaded, truncated }` per collection, and the summary spells out `100 of 2711 ⚠️ truncated` plus how to get the rest. The "Top-level suites (N of M total)" header no longer presents the loaded slice as the project total.
- `qase_project_context` requested users with no `limit` at all, so the API's own (smaller) default applied. It now asks for a full page like every other collection.
- **`qql_search` no longer advertises an invalid QQL query.** The `recentFailures` example filtered failed results with `created >= now("-7d")`, but the `result` entity has no `created` field — the only timestamp it exposes is `ended`. The broken query was surfaced both in the `qql_search` tool description and in `qql_help` output, so models were being taught the error at the schema level. It now reads `ended >= now("-7d")`.
- `qql_help` claimed that "queries are case-sensitive for field values". Enum values in fact accept either the display label or its slug (`severity = "Blocker"` and `severity = "blocker"` match the same value); only `status` and `type` on the `requirement` entity are case-sensitive. The help text now says so, and additionally documents which date fields each entity exposes and that boolean fields accept both `is true` and `= true`.
- `qql_help` omitted the `!~` operator and the `startOfWeek` / `endOfWeek` / `startOfMonth` / `endOfMonth` functions.

### Added

- **`qql_help` now documents aggregation.** QQL supports `SELECT (...)` with `COUNT`/`MIN`/`MAX`/`AVG`/`SUM`/`FIRST`/`LAST`, plus `GROUP BY` and `HAVING`, but the help never mentioned it — so a count that one query can answer was being computed by paging through rows. The parentheses after `SELECT` are mandatory (the query fails without them), which is not guessable, and two response quirks that quietly corrupt reports are now called out: aggregates return enums as numeric IDs (`result.status` 1 = Passed, 2 = Failed, 5 = Skipped, 8 = Invalid; `automation` 0/1/2), and grouping by a string field returns it with a `_title` suffix (`GROUP BY suite` → `suite_title`).
- **`qql_help` now lists the fields of each entity**, replacing six label-only lines. Field names are not uniform across entities, which is the main source of failing queries, so the traps are stated explicitly: `case.suite` is a title but `result.suite` is a numeric ID; `result` has no run-ID field (`run` matches the run title, so results cannot be tied to a run ID in QQL); `result` has no `environment`; `requirement` has no link to cases; and `case.suiteTree` (a suite plus all descendants) is documented for the first time.
- **`qql_help` gained an `enumValues` topic** covering the valid values per field, including two that fail when guessed: `priority` has no `"critical"` (that is a `severity`), and `run.status` is `In Progress`/`Passed`/`Failed`/`Aborted` — `"active"` is not a status. `result.status` has no `Untested`.
- **`qase_project_context` accepts `full: true`** to page through every collection instead of fetching only the first 100 of each. Full and partial responses are cached under separate keys, and pagination stops early if a page comes back empty rather than looping.

### Changed

- `qql_search` accepts queries up to 2 000 characters, matching what the REST endpoint allows. The previous 1 000-character cap halved how many IDs fit in an `in (...)` clause — roughly 80 instead of 170 — doubling the round-trips needed for any set-based analysis.

## [2.0.3]

### Changed

- `tools/list` and `prompts/list` now return entries in deterministic, name-sorted order instead of registration order, per the MCP spec's guidance for improving client-side caching and LLM prompt cache hit rates.
- The Streamable HTTP transport now allows the `Mcp-Method` and `Mcp-Name` request headers via CORS, ahead of client adoption of MCP spec [2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/).

## [2.0.2]

### Added

- **Shared steps can now be referenced from a test case.** `qase_case_upsert` and `qase_case_bulk_create` document a `shared` property on step objects, taking the hash returned by `qase_shared_step_upsert`; `action` is not required for such a step and nesting works at any depth. `shared_step_hash` — the name the API uses when reading a case back — is accepted as an alias and translated to `shared` before the request is sent, so the field seen on read now also works on write. ([#66](https://github.com/qase-tms/qase-mcp-server/issues/66))

### Changed

- Updated `qase-api-client` to 1.1.13, which adds `shared` to the test step create model.

## [2.0.1]

### Added

- **`qase_external_issue_link`** — Link or unlink test cases and test runs to issues in an external tracker (Jira Cloud / Jira Server), wrapping `POST /v1/case/{code}/external-issue/attach`, `.../detach`, and `POST /v1/run/{code}/external-issue`. A case can hold several links; a run holds one, and detaching clears it. ([#64](https://github.com/qase-tms/qase-mcp-server/issues/64))
- **`qase_get`** now requests external issue links for cases and runs by default (`include=external_issues` / `include=external_issue`), so a link created via `qase_external_issue_link` can be verified without leaving the MCP client. The new `include` parameter overrides the default; if a deployment rejects the value, the request is retried without it. ([#65](https://github.com/qase-tms/qase-mcp-server/issues/65))

- **`qase_case_bulk_create`** — Create up to 100 test cases in a single request, restoring the bulk creation that v1 offered as `bulk_create_cases`. Unlike the v1 tool it normalises enum labels per case, so `priority: "high"` works the same as in `qase_case_upsert`.

### Fixed

- `qase_discover_tools` no longer skips activation when the `activate` argument is omitted. Tool handlers receive raw MCP arguments, so the schema default never applied and matched tools stayed hidden from the client's tool list.

## [2.0.0]

### Breaking Changes

- **All 83 v1 tool names have been removed.** The tool set has been consolidated from 83 tools to 29. See [docs/migration.md](docs/migration.md) for a complete v1→v2 tool mapping table.
- Response format is now compact JSON with null values stripped (no indentation). This reduces token usage but changes the raw string format of responses.

### Added

- **`qase_project_context`** — Bootstrap tool that fetches project details, suites, milestones, environments, custom fields, and users in a single call. Result is cached for 5 minutes (tenant-safe two-tier cache: in-memory + optional Redis).
- **`qase_get`** — Universal entity getter for all entity types (`case`, `suite`, `run`, `result`, `plan`, `defect`, `milestone`, `environment`, `shared_step`, `shared_parameter`, `configuration`, `attachment`, `author`, `user`, `custom_field`). Supports field projection via the `fields` parameter.
- **`qql_search`** / **`qql_help`** — Unified QQL search across all entity types (retained from v1 with identical interface).
- **Composite tool `qase_ci_report`** — Reports CI/CD test results in one call: creates a run, bulk-records results, and optionally completes the run. Replaces the 3–4 step `create_run → create_results_bulk → complete_run` workflow.
- **Composite tool `qase_triage_defect`** — Creates a defect from a test failure and optionally links it to failed result hashes. Streamlines triage workflows.
- **Composite tool `qase_regression_run`** — Sets up a regression run in one call. Accepts case selection by suite IDs, explicit case IDs, or plan ID.
- **`qase_api`** — Escape hatch for direct Qase REST API access. Allows calling any endpoint not covered by the named tools.
- **Upsert+delete tools** for all major entities: `qase_case_upsert`, `qase_case_delete`, `qase_suite_upsert`, `qase_suite_delete`, `qase_run_upsert`, `qase_run_complete`, `qase_run_delete`, `qase_result_record`, `qase_result_delete`, `qase_plan_upsert`, `qase_plan_delete`, `qase_defect_upsert`, `qase_defect_delete`, `qase_milestone_upsert`, `qase_milestone_delete`, `qase_environment_upsert`, `qase_environment_delete`, `qase_shared_step_upsert`, `qase_shared_step_delete`, `qase_attachment_upload`, `qase_attachment_delete`.
- **HTTP keep-alive, automatic retry, and in-flight request deduplication** in the API client layer.
- **Tenant-safe two-tier cache** — in-memory LRU cache with optional Redis L2. Cache keys are scoped per-tenant (token hash + API domain) eliminating the cross-tenant data leak present in v1.
- **OAuth 2.1 support (streamable-http transport)** — the server proxies authorization, token, and dynamic client registration to the Qase authorization server, and verifies access-token JWTs locally against the upstream JWKS before forwarding them to the Qase API. Legacy opaque api-tokens continue to work. Protected-resource metadata is served per RFC 9728. This powers the hosted Qase MCP, available as the official **Qase Test Management** connector in Claude's directory (see the README).

### Fixed

- **Security: cross-tenant cache data leak eliminated.** v1 cached responses globally; v2 scopes every cache key to the authenticated tenant.

## [1.1.6]

### Added

- Support for nested substeps in `create_case`, `update_case`, and `bulk_create_cases` tools ([#42](https://github.com/qase-tms/qase-mcp-server/issues/42))

## [1.1.5]

### Fixed

- Replaced hardcoded version in console output with dynamic version from `package.json` ([#35](https://github.com/qase-tms/qase-mcp-server/issues/35))

## [1.1.4]

### Changed

- Updated `qase-api-client` from 1.1.3 to 1.1.5

### Added

- Pre-commit hook to verify version consistency across `package.json` and `server.json`

## [1.1.3]

### Changed

- Updated default headers for API clients: all requests now include `User-Agent: qase-mcp/{version}`
- Server `version` in MCP handshake now uses the auto-generated `VERSION` constant instead of a hardcoded string

## [1.1.2]

### Added

- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) on all tools for MCP Directory compliance ([#27](https://github.com/qase-tms/qase-mcp-server/issues/27))
- Gherkin step support: `TestStepSchema` now includes `value` field for Gherkin scenarios (`Given/When/Then`)
- `LICENSE` file (MIT)
- Privacy policy URL in `server.json` manifest
- `icon.png` — Qase logo for MCP Directory listing

### Changed

- Updated `qase-api-client` from 1.1.2 to 1.1.3 (adds `steps_type` enum and `value` to TestStep in OpenAPI spec)
- Guarded `prepare` script to prevent husky failures in production installs

## [1.1.0]

### Added

- Per-request authentication: clients can pass `Authorization: Bearer <token>` to use their own Qase API token instead of the shared `QASE_API_TOKEN` environment variable (supported on both Streamable HTTP and SSE transports)
- `create_case`, `update_case`: Added `steps_type` field (`classic` / `gherkin`) ([#17](https://github.com/qase-tms/qase-mcp-server/issues/17))
- 87 schema-API contract tests to prevent future type drift between Zod schemas and SDK expectations

### Changed

- **Breaking (internal):** Replaced deprecated `qaseio` SDK with `qase-api-client` — the new auto-generated OpenAPI client for Qase API v1
- `QaseApiClient` wrapper now instantiates all 18 API classes (`ProjectsApi`, `CasesApi`, `ConfigurationsApi`, `SystemFieldsApi`, `UsersApi`, `SharedParametersApi`, etc.) instead of relying on the old `QaseApi` facade
- `list_users`, `get_user`: Now use `UsersApi` from the SDK instead of direct HTTP calls
- `list_shared_parameters`, `get_shared_parameter`: Now use `SharedParametersApi` from the SDK instead of direct HTTP calls
- `list_system_fields`: Now uses `SystemFieldsApi` from the SDK instead of direct HTTP calls
- `list_configurations`, `create_configuration_group`: Now use `ConfigurationsApi` from the SDK instead of direct HTTP calls
- `qql_search`: Updated to positional arguments `search(query, limit, offset)` per new SDK signature
- Case enum resolution (`normalizeCaseEnums`): Now fetches system fields via `SystemFieldsApi` instead of direct HTTP calls
- `create_case`, `update_case`: Enum fields (`severity`, `priority`, `type`, `layer`, `behavior`, `status`) now accept human-readable string labels instead of numeric IDs; `normalizeCaseEnums` resolves labels to IDs via system fields ([#13](https://github.com/qase-tms/qase-mcp-server/issues/13))

### Fixed

- `list_defects`: Corrected API call signature (status as single value, not array) and removed unsupported severity filter
- `list_custom_fields`: Fixed argument order — was passing `(limit, offset)` where SDK expects `(entity, type, limit, offset)`
- `list_environments`: Fixed argument order — was passing `(code, limit, offset)` where SDK expects `(code, search, slug, limit, offset)`
- `list_authors`: Fixed argument order — was passing `(limit, offset)` where SDK expects `(search, type, limit, offset)`
- `TestCaseexternalIssuesTypeEnum` → `TestCaseExternalIssuesTypeEnum`: Fixed enum name casing for the new SDK
- `upload_attachment`: Fixed "file.forEach is not a function" crash — now correctly converts base64 string or file path into the `[{name, value}]` array format expected by the SDK's multipart upload ([#14](https://github.com/qase-tms/qase-mcp-server/issues/14))
- `create_defect`, `update_defect`: `severity` now accepts human-readable labels (`blocker`, `critical`, `major`, `normal`, `minor`, `trivial`) instead of numeric IDs; converted to numbers internally ([#18](https://github.com/qase-tms/qase-mcp-server/issues/18))
- `create_run`: Changed `start_time` / `end_time` from number to string (RFC 3339 format) matching SDK type
- `qql_search`: Removed non-existent fields from response to prevent confusion
- `list_attachments`: Added default `limit=10` to prevent slow responses on accounts with large numbers of attachments

## [1.0.0] - 2025-10-08

### Added

#### Core Infrastructure
- Initial release of Qase MCP Server
- Full TypeScript implementation with strict type checking
- Comprehensive error handling with user-friendly messages
- Input validation using Zod schemas
- Tool registry system for MCP protocol integration
- Support for custom enterprise domains via `QASE_API_DOMAIN`
- Singleton API client with authentication management

#### Entity Operations (83 tools total)

**Projects Management** (6 tools)
- List, get, create, and delete projects
- Grant and revoke project access

**Test Cases** (8 tools)
- Full CRUD operations for test cases
- Bulk creation support
- External issue integration (Jira, GitHub, etc.)
- Support for test steps, attachments, and custom fields

**Test Suites** (5 tools)
- Hierarchical suite organization
- Full CRUD operations

**Test Runs** (7 tools)
- Create and manage test runs
- Complete runs and track progress
- Public link sharing support

**Test Results** (6 tools)
- Record test execution results
- Bulk result creation for performance
- Step-by-step execution tracking
- Attachment and stacktrace support

**Test Plans** (5 tools)
- Define and manage test plans
- Link test cases to plans

**Defects** (7 tools)
- Full defect lifecycle management
- Severity and status tracking
- Resolution workflow

**Milestones** (5 tools)
- Sprint and release organization
- Due date tracking

**Environments** (5 tools)
- Test environment configuration
- Link runs to environments

**Shared Steps** (5 tools)
- Reusable test step definitions
- Cross-case step sharing

**Shared Parameters** (5 tools)
- Data-driven testing support
- Reusable test data parameters

**Attachments** (4 tools)
- File upload and management
- Base64 encoding support

**Authors** (2 tools)
- Author information retrieval

**Custom Fields** (5 tools)
- Custom metadata definitions
- Support for multiple field types

**System Fields** (1 tool)
- System field configuration viewing

**Configurations** (3 tools)
- Browser, OS, device configurations
- Configuration group management

**Users** (2 tools)
- User information retrieval

#### QQL (Qase Query Language) Support
- `qql_search` tool for powerful cross-project queries
- `qql_help` tool with comprehensive syntax documentation
- QQL query builder utility for programmatic query construction
- Pre-built query examples for common scenarios:
  - Recent failures
  - Blocker defects
  - Flaky tests
  - Non-automated tests
  - Active runs
  - Tests by author/milestone

#### Testing & Quality
- 72 unit tests with Jest
- 82.48% code coverage
- Comprehensive test coverage for:
  - API client configuration
  - Error handling
  - Input validation
  - Tool registry
  - QQL helpers
- Mock utilities for testing

#### Development Tools
- ESLint configuration with TypeScript support
- Prettier code formatting
- MCP Inspector integration for debugging
- Comprehensive build system
- Test coverage reporting

#### Documentation
- Comprehensive README with installation guides
- Integration instructions for:
  - Claude Desktop
  - Cursor
  - Claude Code
- Usage examples and best practices
- QQL query examples
- Troubleshooting guide
- API reference for all 83 tools

### Technical Details

- **Language**: TypeScript 5.3+
- **Target**: ES2022
- **Package Manager**: NPM
- **Dependencies**:
  - `qaseio`: ^2.4.1 (Official Qase API client)
  - `@modelcontextprotocol/sdk`: ^1.0.4 (MCP protocol)
  - `zod`: ^3.24.1 (Runtime validation)
  - `neverthrow`: ^8.3.0 (Functional error handling)
  - `zod-to-json-schema`: ^3.24.1 (Schema conversion)
- **Dev Dependencies**:
  - `jest`: ^29.7.0 (Testing)
  - `ts-jest`: ^29.2.5 (TypeScript testing)
  - `eslint`: ^9.18.0 (Linting)
  - `prettier`: ^3.4.2 (Formatting)

### Supported Platforms

- Node.js 18+
- macOS, Windows, Linux
- Compatible with all MCP clients

### Known Limitations

- QQL search requires Business or Enterprise Qase subscription
- Some API client properties require `any` type casting due to library limitations
- Results are identified by hash, not numeric ID
- Custom fields accessed via bracket notation in QQL: `cf["Field Name"]`

[1.1.4]: https://github.com/qase-tms/qase-mcp-server/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/qase-tms/qase-mcp-server/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/qase-tms/qase-mcp-server/compare/v1.1.0...v1.1.2
[1.1.0]: https://github.com/qase-tms/qase-mcp-server/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/qase-tms/qase-mcp-server/releases/tag/v1.0.0

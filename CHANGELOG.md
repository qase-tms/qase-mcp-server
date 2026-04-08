# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

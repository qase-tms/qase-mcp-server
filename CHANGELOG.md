# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `list_defects`: Corrected API call signature (status as single value, not array) and removed unsupported severity filter
- `list_users`, `get_user`: Switched to direct HTTP calls (qaseio SDK doesn't expose Users API)
- `list_shared_parameters`, `get_shared_parameter`: Switched to direct HTTP calls (qaseio SDK doesn't expose Shared Parameters API)
- `list_system_fields`: Switched to direct HTTP calls (qaseio SDK doesn't expose System Fields API)
- `list_configurations`: Switched to direct HTTP calls (qaseio SDK doesn't expose Configurations API)

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

[1.0.0]: https://github.com/qase-tms/qase-mcp-server/releases/tag/v1.0.0

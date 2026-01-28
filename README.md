# Qase MCP Server

Official Model Context Protocol (MCP) server for [Qase Test Management Platform](https://qase.io).

[![npm version](https://badge.fury.io/js/%40qase%2Fmcp-server.svg)](https://www.npmjs.com/package/@qase/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

The Qase MCP Server provides seamless integration between AI assistants (Claude, Cursor, etc.) and the Qase Test Management Platform. It enables AI assistants to interact with your test cases, test runs, defects, and other Qase entities through a standardized protocol.

### Features

- ✅ **Complete Qase API Coverage** - Access all Qase entities and operations
- ✅ **QQL Support** - Powerful Qase Query Language for advanced searches
- ✅ **Type-Safe** - Full TypeScript implementation with comprehensive validation
- ✅ **Custom Domains** - Support for enterprise custom domains

### Supported Entities

The server provides tools for managing:

- **Projects** - Create and manage test projects
- **Test Cases** - Create, update, and organize test cases
- **Test Suites** - Organize tests into hierarchical suites
- **Test Runs** - Execute test runs and track progress
- **Test Results** - Record and analyze test execution results
- **Test Plans** - Define and manage test plans
- **Defects** - Track and manage bugs
- **Milestones** - Organize work by sprints/releases
- **Environments** - Manage test environments
- **Shared Steps** - Create reusable test steps
- **Shared Parameters** - Define reusable test data
- **Attachments** - Upload and manage files
- **Custom Fields** - Define custom metadata
- **Configurations** - Manage test configurations
- **Users** - User management operations
- **QQL Search** - Advanced cross-project queries

## Installation

### Prerequisites

- Node.js 18+
- Qase account with API token ([Get your token](https://app.qase.io/user/api/token))

### Option 1: Install from NPM (Recommended)

```bash
npm install -g @qase/mcp-server
```

### Option 2: Install from Source (Development)

```bash
# Clone the repository
git clone https://github.com/qase-tms/qase-mcp-server.git
cd qase-mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required: Your Qase API token
QASE_API_TOKEN=your_api_token_here

# Optional: Custom API domain for enterprise customers
QASE_API_DOMAIN=api.qase.io
```

Get your API token from: https://app.qase.io/user/api/token

### Custom Domains (Enterprise)

If you're using Qase Enterprise with a custom domain:

```bash
QASE_API_DOMAIN=api.yourcompany.qase.io
```

## Integration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "qase": {
      "command": "npx",
      "args": ["-y", "@qase/mcp-server"],
      "env": {
        "QASE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Or, if installed from source:

```json
{
  "mcpServers": {
    "qase": {
      "command": "node",
      "args": ["/absolute/path/to/qase-mcp-server/build/index.js"],
      "env": {
        "QASE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### Cursor

1. Open Cursor Settings
2. Navigate to MCP settings
3. Add the Qase MCP server:

```json
{
  "mcpServers": {
    "qase": {
      "command": "npx",
      "args": ["-y", "@qase/mcp-server"],
      "env": {
        "QASE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### Claude Code

In Claude Code, the server can be configured similarly to Claude Desktop.

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "qase": {
      "command": "npx",
      "args": ["-y", "@qase/mcp-server"],
      "env": {
        "QASE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## Usage Examples

### Basic Operations

#### List All Projects

```
Can you list all my Qase projects?
```

#### Create a Test Case

```
Create a test case in project DEMO titled "Login with valid credentials" with steps for entering username, password, and clicking login
```

#### Search with QQL

```
Find all failed test results from the last 7 days in project DEMO
```

### Advanced QQL Queries

#### Find Flaky Tests

```
Search for all flaky test cases in project DEMO that are not automated
```

The server will execute:
```
entity = "case" and project = "DEMO" and isFlaky = true and automation = "Not automated"
```

#### Find Open Blocker Defects

```
Show me all open blocker defects in project DEMO
```

#### Find Tests by Author

```
Find all test cases created by john@example.com in the last month
```

### Working with Test Runs

#### Create and Execute a Test Run

```
Create a test run in project DEMO called "Sprint 24 Regression" including all test cases from the "Authentication" suite, then add a passed result for case ID 123
```

## Available Tools

### Projects (6 tools)
- `list_projects` - Get all projects
- `get_project` - Get project details
- `create_project` - Create new project
- `delete_project` - Delete project
- `grant_project_access` - Grant user/group access
- `revoke_project_access` - Revoke access

### Test Cases (8 tools)
- `list_cases` - List all test cases
- `get_case` - Get test case details
- `create_case` - Create new test case
- `update_case` - Update test case
- `delete_case` - Delete test case
- `bulk_create_cases` - Create multiple cases
- `attach_external_issue` - Link external issue (Jira, etc.)
- `detach_external_issue` - Unlink external issue

### Test Runs (7 tools)
- `list_runs` - List test runs
- `get_run` - Get run details
- `create_run` - Create new run
- `delete_run` - Delete run
- `complete_run` - Mark run as complete
- `get_run_public_link` - Get public link
- `delete_run_public_link` - Remove public link

### Test Results (6 tools)
- `list_results` - List test results
- `get_result` - Get result details
- `create_result` - Create test result
- `create_results_bulk` - Create multiple results
- `update_result` - Update result
- `delete_result` - Delete result

### Test Plans (5 tools)
- `list_plans` - List test plans
- `get_plan` - Get plan details
- `create_plan` - Create test plan
- `update_plan` - Update test plan
- `delete_plan` - Delete test plan

### Suites (5 tools)
- `list_suites` - List suites
- `get_suite` - Get suite details
- `create_suite` - Create suite
- `update_suite` - Update suite
- `delete_suite` - Delete suite

### Defects (7 tools)
- `list_defects` - List defects
- `get_defect` - Get defect details
- `create_defect` - Create defect
- `update_defect` - Update defect
- `delete_defect` - Delete defect
- `resolve_defect` - Mark as resolved
- `update_defect_status` - Update status

### Milestones (5 tools)
- `list_milestones` - List milestones
- `get_milestone` - Get milestone details
- `create_milestone` - Create milestone
- `update_milestone` - Update milestone
- `delete_milestone` - Delete milestone

### Environments (5 tools)
- `list_environments` - List environments
- `get_environment` - Get environment details
- `create_environment` - Create environment
- `update_environment` - Update environment
- `delete_environment` - Delete environment

### Shared Steps (5 tools)
- `list_shared_steps` - List shared steps
- `get_shared_step` - Get shared step details
- `create_shared_step` - Create shared step
- `update_shared_step` - Update shared step
- `delete_shared_step` - Delete shared step

### Shared Parameters (5 tools)
- `list_shared_parameters` - List parameters
- `get_shared_parameter` - Get parameter details
- `create_shared_parameter` - Create parameter
- `update_shared_parameter` - Update parameter
- `delete_shared_parameter` - Delete parameter

### Supporting Entities
- **Attachments** (4 tools) - File management
- **Authors** (2 tools) - Author information
- **Custom Fields** (5 tools) - Custom field management
- **System Fields** (1 tool) - System field info
- **Configurations** (3 tools) - Configuration management
- **Users** (2 tools) - User management

### QQL Search (2 tools)
- `qql_search` - Execute QQL query
- `qql_help` - Get QQL syntax help

**Total: 83 tools available**

## Development

### Building from Source

```bash
npm run build
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

### Debugging

Use the MCP Inspector for interactive debugging:

```bash
npm run inspector
```

Set your API token when prompted, then interact with tools in the inspector UI.

### Transport Options

The server supports multiple transport types for different use cases:

#### Stdio Transport (Default)

Used by MCP clients like Claude Desktop and Cursor:

```bash
npm start
# or
npm run start:stdio
```

#### SSE Transport

Server-Sent Events for web-based clients:

```bash
npm run start:sse
# Server runs on http://localhost:3000/sse
# Health check: http://localhost:3000/health
```

#### Streamable HTTP Transport

Full HTTP-based transport with session management:

```bash
npm run start:http
# Server runs on http://localhost:3000/mcp
# Health check: http://localhost:3000/health
```

#### Custom Configuration

```bash
# Custom port and host
node build/index.js --transport streamable-http --port 8080 --host 0.0.0.0

# Available options:
# --transport: stdio | sse | streamable-http (default: stdio)
# --port: Port number (default: 3000)
# --host: Host address (default: 0.0.0.0)
```

## Troubleshooting

### Authentication Errors

**Error**: `Authentication failed: Please check your QASE_API_TOKEN`

**Solution**:
1. Verify your API token is correct: https://app.qase.io/user/api/token
2. Ensure the token is set in your environment or config file
3. Check for extra spaces or quotes in the token value

### Connection Errors

**Error**: `Network error` or `ECONNREFUSED`

**Solution**:
1. Check your internet connection
2. Verify the API domain is correct (especially for enterprise customers)
3. Check if Qase is accessible: https://api.qase.io/v1/

### Custom Domain Issues

**Error**: `Invalid domain` or connection errors with custom domain

**Solution**:
1. Ensure `QASE_API_DOMAIN` is set to just the domain (e.g., `api.company.qase.io`)
2. Don't include `https://` or `/v1` in the domain
3. Verify with your Qase administrator

### No Tools Showing in MCP Client

**Error**: MCP client shows "no tools, prompts or resources" or 0 tools available

**Solution**:
1. Verify your MCP configuration has the correct command and arguments
2. Check that `QASE_API_TOKEN` is set in the `env` section
3. Restart your MCP client completely (close and reopen)
4. Check the MCP client logs for connection errors
5. Verify the server is built: `npm run build`

### Tool Not Found

**Error**: `Unknown tool: tool_name`

**Solution**:
1. Ensure you're using the latest version: `npm update -g @qase/mcp-server`
2. Check the tool name spelling matches the documentation
3. Restart your MCP client after updating

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Guidelines

- Follow TypeScript best practices
- Add unit tests for new features
- Update documentation for new tools
- Ensure all tests pass: `npm test`
- Ensure linting passes: `npm run lint`
- Maintain code coverage above 70%

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- **Qase Platform**: https://qase.io
- **Qase Documentation**: https://help.qase.io
- **API Documentation**: https://developers.qase.io
- **MCP Protocol**: https://modelcontextprotocol.io
- **Issue Tracker**: https://github.com/qase-tms/qase-mcp-server/issues

## Support

- **Documentation**: https://help.qase.io
- **Email**: support@qase.io
- **GitHub Issues**: https://github.com/qase-tms/qase-mcp-server/issues

---

Made with ❤️ by [Qase](https://qase.io)

# Qase MCP Server

Official Model Context Protocol (MCP) server for [Qase Test Management Platform](https://qase.io).

[![npm version](https://img.shields.io/npm/v/@qase/mcp-server)](https://www.npmjs.com/package/@qase/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@qase/mcp-server)](https://www.npmjs.com/package/@qase/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

The Qase MCP Server provides seamless integration between AI assistants (Claude, Cursor, etc.) and the Qase Test Management Platform. It enables AI assistants to interact with your test cases, test runs, defects, and other Qase entities through a standardized protocol.

### Features

- **29 Consolidated Tools** - Streamlined from 83 tools to 29 task-oriented operations for lower token usage and better LLM accuracy
- **Composite Tools** - Multi-step workflows in a single call: CI reporting, defect triage, regression run setup
- **QQL Support** - Powerful Qase Query Language for advanced searches across cases, runs, results, defects, and plans
- **Project Context Bootstrap** - One call to get full project structure (suites, milestones, environments, users, custom fields)
- **Compact Responses** - Minimal JSON output with no indentation and automatic null/empty field stripping
- **HTTP Resilience** - Connection pooling (keep-alive), retry with exponential backoff, in-flight request deduplication
- **Tenant-Safe Cache** - Two-tier caching (in-memory + optional Redis) with per-tenant isolation and pub/sub invalidation
- **Type-Safe** - Full TypeScript implementation with comprehensive Zod validation
- **Custom Domains** - Support for enterprise custom domains
- **Escape Hatch** - Direct REST API access for any endpoint via `qase_api`

### Upgrading from v1

If you're upgrading from v1.x, see [MIGRATION.md](MIGRATION.md) for the complete tool mapping table and breaking changes.

## Installation

### Prerequisites

- Node.js 20+
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

# Optional: Redis URL for shared cache in hosted/multi-instance deployments
QASE_MCP_REDIS_URL=redis://localhost:6379
```

Get your API token from: https://app.qase.io/user/api/token

### Custom Domains (Enterprise)

If you're using Qase Enterprise with a custom domain:

```bash
QASE_API_DOMAIN=api.yourcompany.qase.io
```

### Redis Cache (Hosted Deployments)

For multi-instance deployments behind a load balancer, set `QASE_MCP_REDIS_URL` to enable shared L2 cache with pub/sub invalidation:

```bash
QASE_MCP_REDIS_URL=redis://your-redis-host:6379
```

This requires the optional `ioredis` dependency. Install with:

```bash
npm install --include=optional
```

When Redis is not configured, the server uses an in-memory cache only (default for local/stdio usage).

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

You can add the Qase MCP server to Claude Code using the CLI command:

```bash
claude mcp add qase -- npx -y @qase/mcp-server
```

Set the required environment variable:

```bash
export QASE_API_TOKEN=your_api_token_here
```

Alternatively, add a `.mcp.json` file to your project root for automatic project-scoped configuration:

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

You can also use the `--scope` flag to choose where the configuration is stored:

```bash
# Project-scoped (saved in .mcp.json)
claude mcp add --scope project qase -- npx -y @qase/mcp-server

# User-scoped (available in all projects)
claude mcp add --scope user qase -- npx -y @qase/mcp-server
```

### OpenAI Codex CLI

Add a `.codex/config.json` file to your project root:

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

Set the required environment variable before running Codex:

```bash
export QASE_API_TOKEN=your_api_token_here
```

### OpenCode

Add an `opencode.json` file to your project root (or `~/.config/opencode/opencode.json` for global configuration):

```json
{
  "mcp": {
    "qase": {
      "type": "local",
      "command": ["npx", "-y", "@qase/mcp-server"],
      "environment": {
        "QASE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

> **Note:** OpenCode uses a different format from other MCP clients — the command and args are combined into a single `command` array, env vars go under `environment`, and servers are nested under `mcp` (not `mcpServers`).

## Usage Examples

### Get Project Overview

```
Show me the structure of project DEMO — suites, milestones, environments
```

The AI will call `qase_project_context` to get everything in one request.

### Search with QQL

```
Find all failed test results from the last 7 days in project DEMO
```

The AI will use `qql_search` with the query:
```
entity = "result" and project = "DEMO" and status = "failed" and created >= now("-7d")
```

### Create a Test Case

```
Create a high-priority smoke test case in project DEMO titled "Login with valid credentials"
```

The AI will call `qase_case_upsert` with `priority: "high"`, `type: "smoke"` — enum labels are normalized automatically.

### Report CI Results

```
Report these CI results for project DEMO: case 1 passed in 1.2s, case 2 failed with "timeout error"
```

The AI will call `qase_ci_report` — a single composite that creates the run, records all results, and completes the run.

### Set Up a Regression Run

```
Create a regression run for project DEMO including all cases from the Authentication and Payments suites
```

The AI will call `qase_regression_run` with the suite IDs — one call instead of finding cases + creating run + adding them.

### Triage a Failed Test

```
Create a critical defect for the login timeout failure in run #42
```

The AI will call `qase_triage_defect` to create the defect and link it to the failed results.

### Access Any API Endpoint

```
Get the list of all shared parameters in project DEMO
```

The AI will use `qase_api` as an escape hatch:
```json
{ "method": "GET", "path": "/v1/shared_parameter/DEMO" }
```

## Available Tools

### Read Tools (2)
- `qase_project_context` - Get full project structure in one call (project details, suites, milestones, environments, custom fields, users). Cached for 5 minutes.
- `qase_get` - Get any entity by type and ID with optional field projection. Supports: case, suite, run, result, plan, defect, milestone, environment, shared_step, shared_parameter, configuration, attachment, author, user, custom_field.

### QQL Tools (2)
- `qql_search` - Execute QQL queries across cases, runs, results, defects, and plans
- `qql_help` - Get QQL syntax reference and examples

### Write Tools (21)
- `qase_case_upsert` / `qase_case_delete` - Create or update test cases (enum labels auto-normalized)
- `qase_run_upsert` / `qase_run_complete` / `qase_run_delete` - Manage test runs
- `qase_result_record` / `qase_result_delete` - Record test results (single or bulk)
- `qase_defect_upsert` / `qase_defect_delete` - Create, update, resolve defects
- `qase_suite_upsert` / `qase_suite_delete` - Manage test suites
- `qase_milestone_upsert` / `qase_milestone_delete` - Manage milestones
- `qase_plan_upsert` / `qase_plan_delete` - Manage test plans
- `qase_shared_step_upsert` / `qase_shared_step_delete` - Manage shared steps
- `qase_environment_upsert` / `qase_environment_delete` - Manage environments
- `qase_attachment_upload` / `qase_attachment_delete` - Upload and manage files

### Composite Tools (3)
- `qase_ci_report` - Report CI/CD results in one call: creates run, records results, completes run
- `qase_triage_defect` - Create a defect from test failure and link to failed results
- `qase_regression_run` - Set up a regression run from suite IDs, case IDs, or plan

### Escape Hatch (1)
- `qase_api` - Direct REST API call for any endpoint not covered by the tools above

### Case Enum Values

`qase_case_upsert` automatically normalizes friendly labels to whatever numeric IDs your workspace currently configures for the built-in system fields (`priority`, `severity`, `type`, `behavior`, `status`, `layer`). The server fetches `/v1/system_field` and caches the available options so you can keep using the titles or slugs you see in Qase while still satisfying the API's numeric requirements.

**Total: 29 tools**

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

# Integration tests (requires Redis)
REDIS_TEST_URL=redis://localhost:6379 npm run test:integration
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
# Metrics: http://localhost:3000/metrics
```

#### Streamable HTTP Transport

Full HTTP-based transport with session management:

```bash
npm run start:http
# Server runs on http://localhost:3000/mcp
# Health check: http://localhost:3000/health
# Metrics: http://localhost:3000/metrics
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

### Monitoring

When using SSE or Streamable HTTP transport, a Prometheus-compatible `/metrics` endpoint is available:

```bash
curl http://localhost:3000/metrics
```

Metrics include:
- `qase_mcp_cache_hits_total` / `qase_mcp_cache_misses_total` - Cache hit/miss rates by tier (l1/l2)
- `qase_mcp_cache_errors_total` - Cache errors by tier
- `qase_mcp_circuit_breaker_state` - Redis circuit breaker state (0=closed, 1=half_open, 2=open)

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

### SSL Certificate Errors

**Error**: `unable to get local issuer certificate`

This error typically occurs in corporate environments with:
- SSL-intercepting proxy servers
- Self-signed certificates
- Internal Certificate Authorities (CA)

**Solution**: Add the `NODE_EXTRA_CA_CERTS` environment variable pointing to your CA certificate file:

```json
{
  "mcpServers": {
    "qase": {
      "command": "npx",
      "args": ["-y", "@qase/mcp-server"],
      "env": {
        "QASE_API_TOKEN": "your_api_token_here",
        "NODE_EXTRA_CA_CERTS": "/path/to/your/certificate.pem"
      }
    }
  }
}
```

To find your certificate:
- **Corporate environments**: Contact your IT department for the CA certificate
- **macOS**: Export from Keychain Access (System Roots → your CA → Export as .pem)
- **Windows**: Export from Certificate Manager (certmgr.msc)
- **Linux**: Usually in `/etc/ssl/certs/` or `/etc/pki/tls/certs/`

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
2. If upgrading from v1, tool names have changed — see [MIGRATION.md](MIGRATION.md)
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

# Qase MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for [Qase Test Management Platform](https://qase.io) — connect AI assistants to your test cases, runs, defects, and more.

[![npm version](https://img.shields.io/npm/v/@qase/mcp-server)](https://www.npmjs.com/package/@qase/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.qase%2Fmcp--server-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=io.qase%2Fmcp-server)

## Table of Contents

- [Overview](#overview)
- [Use Cases](#use-cases)
- [Quick Start](#quick-start)
  - [Use the hosted Qase MCP (recommended)](#use-the-hosted-qase-mcp-recommended)
  - [Run it yourself](#run-it-yourself)
- [Upgrading from v1](#upgrading-from-v1)
- [Tools](#tools)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)
- [Links](#links)

## Overview

The Qase MCP Server lets AI assistants (Claude, Cursor, Codex, and any other MCP client) read and write Qase test cases, runs, results, defects, suites, milestones, and more — through a standardized protocol, with no custom integration code.

**Features:**

- **29 task-oriented tools** (30 total, including `qase_discover_tools`) — consolidated from 83 v1 tools for lower token usage and better LLM accuracy
- **Composite tools** — multi-step workflows in a single call: CI reporting, defect triage, regression run setup
- **QQL support** — Qase Query Language for advanced searches across cases, runs, results, defects, and plans
- **Project context bootstrap** — one call returns full project structure (suites, milestones, environments, users, custom fields)
- **Tool discovery** — secondary tools stay hidden until needed, keeping the default tool list small
- **Hosted or self-run** — connect to `https://mcp.qase.io/mcp` with just your Qase login, or run the server locally with your own API token
- **Tenant-safe caching & HTTP resilience** — two-tier cache (in-memory + optional Redis), connection pooling, retry with backoff
- **Escape hatch** — direct REST API access for any endpoint via `qase_api`

## Use Cases

| Scenario | Example prompt | Tool |
| --- | --- | --- |
| Bootstrap project context | "Show me the structure of project DEMO — suites, milestones, environments" | `qase_project_context` |
| Create or update a test case | "Create a high-priority smoke test case in project DEMO titled 'Login with valid credentials'" | `qase_case_upsert` |
| Report CI results | "Report these CI results for project DEMO: case 1 passed, case 2 failed with 'timeout error'" | `qase_ci_report` |
| Triage a failed test | "Create a critical defect for the login timeout failure in run #42" | `qase_triage_defect` |
| Search with QQL | "Find all failed test results from the last 7 days in project DEMO" | `qql_search` |

See [Tools](#tools) and [docs/tools.md](docs/tools.md) for the full reference.

## Quick Start

### Use the hosted Qase MCP (recommended)

No install, no API token — connect to the Qase-hosted server and sign in with your Qase account.

> **Note:** The hosted Qase MCP is available on the **Enterprise** plan in Qase. On other plans, [run the server yourself](#run-it-yourself) with your own API token.

- **Claude** — open **Settings → Connectors**, find **Qase Test Management**, click **Connect**.
- **Cursor** — add `{"mcpServers": {"qase": {"url": "https://mcp.qase.io/mcp"}}}` to `.cursor/mcp.json`.
- **Codex** — add the URL `https://mcp.qase.io/mcp` in **Settings → MCPs → Add server**, or configure `~/.codex/config.toml` for the CLI.

Full per-client steps, other clients, and the active-workspace model: **[docs/connect.md](docs/connect.md)**.

### Run it yourself

Install the package and provide your own API token:

```bash
npm install -g @qase/mcp-server
export QASE_API_TOKEN=your_api_token_here
```

Then point your MCP client's stdio config at the `@qase/mcp-server` binary. Full install options, client configs (Claude Desktop, Cursor, Claude Code, Codex, OpenCode), environment variables, and transports (stdio/SSE/streamable-HTTP): **[docs/self-run.md](docs/self-run.md)**.

## Upgrading from v1

v2 consolidates 83 v1 tools into **29 task-oriented tools** (30 total, including a discovery tool). Tool names and response shapes have changed. See **[MIGRATION.md](MIGRATION.md)** for the complete tool mapping table, response format changes, and before/after examples.

## Tools

30 tools across 6 groups (29 task-oriented tools plus `qase_discover_tools` for on-demand activation of secondary tools):

| Group | Count | Description |
| --- | --- | --- |
| Read | 2 | Fetch any entity by type/ID, or bootstrap full project context in one call |
| QQL | 2 | Search across cases, runs, results, defects, and plans with Qase Query Language |
| Write | 21 | Create, update, and delete cases, runs, results, defects, suites, milestones, plans, shared steps, environments, and attachments |
| Composite | 3 | Multi-step workflows in one call: CI reporting, defect triage, regression run setup |
| Escape hatch | 1 | Direct REST API access for any endpoint not covered by the tools above |
| Meta | 1 | `qase_discover_tools` — find and activate secondary tools on demand |

Full tool-by-tool reference with parameters and the discovery model: **[docs/tools.md](docs/tools.md)**.

## Documentation

- **[docs/connect.md](docs/connect.md)** — connect to the hosted Qase MCP (Claude, Cursor, Codex, other clients)
- **[docs/self-run.md](docs/self-run.md)** — install and run the server yourself (config, clients, transports)
- **[docs/tools.md](docs/tools.md)** — full tool reference, groups, and the discovery model
- **[docs/troubleshooting.md](docs/troubleshooting.md)** — auth, OAuth/connector, and SSL issues
- **[MIGRATION.md](MIGRATION.md)** — v1 → v2 tool mapping and migration guide

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and linting guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Support

- **Documentation**: https://docs.qase.io/en/articles/14984302-qase-mcp-server
- **Email**: support@qase.io
- **GitHub Issues**: https://github.com/qase-tms/qase-mcp-server/issues

## Links

- **Qase Platform**: https://qase.io
- **Qase Documentation**: https://help.qase.io
- **API Documentation**: https://developers.qase.io
- **MCP Protocol**: https://modelcontextprotocol.io
- **Issue Tracker**: https://github.com/qase-tms/qase-mcp-server/issues

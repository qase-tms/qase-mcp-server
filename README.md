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
- [Building on top of this server](#building-on-top-of-this-server)
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

- **40 task-oriented tools** (42 total, with `qase_discover_tools` and `qase_tool_help`) — consolidated from 83 v1 tools for lower token usage and better LLM accuracy
- **Composite tools** — multi-step workflows in a single call: CI reporting, defect triage, regression run setup
- **QQL support** — Qase Query Language for advanced searches across cases, runs, results, defects, and plans
- **Project context bootstrap** — one call returns full project structure (suites, milestones, environments, users, custom fields)
- **Test case review** — propose new cases or changes for review, assign reviewers, and track status (approving and merging remain UI-only)
- **Short descriptions, documentation on demand** — every tool is listed from the first request; `qase_tool_help` returns a tool's full documentation when the agent first reaches for it, and `qase_discover_tools` searches the catalogue by task
- **Hosted or self-run** — connect to `https://mcp.qase.io/mcp` (or `https://mcp-eu.qase.io/mcp` on the EU cluster) with just your Qase login, or run the server locally with your own API token
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

> **Note:** The hosted Qase MCP requires the **Enterprise** plan. On another plan, or on a dedicated instance, [run the server yourself](#run-it-yourself) with your own API token — that works everywhere.

> **Pick the URL for your region:** `https://mcp.qase.io/mcp` for the main cloud (`app.qase.io`), `https://mcp-eu.qase.io/mcp` for the EU cluster (`app-eu.qase.io`). The examples below use the main cloud; on the EU cluster substitute the EU URL and change nothing else.

- **Claude** — open **Settings → Connectors**, find **Qase Test Management**, click **Connect**. (The directory connector is main-cloud; on the EU cluster add `https://mcp-eu.qase.io/mcp` as a custom connector.)
- **Cursor** — add `{"mcpServers": {"qase": {"url": "https://mcp.qase.io/mcp"}}}` to `.cursor/mcp.json`.
- **Codex** — add the URL `https://mcp.qase.io/mcp` in **Settings → MCPs → Add server**, or configure `~/.codex/config.toml` for the CLI.
- **VS Code** — add `{"servers": {"qase": {"type": "http", "url": "https://mcp.qase.io/mcp"}}}` to `.vscode/mcp.json`, or run **MCP: Add Server**.

Full per-client steps, other clients, and the active-workspace model: **[docs/connect.md](docs/connect.md)**.

### Run it yourself

Install the package and provide your own API token:

```bash
npm install -g @qase/mcp-server
export QASE_API_TOKEN=your_api_token_here
```

Then point your MCP client's stdio config at the `@qase/mcp-server` binary. Full install options, client configs (Claude Desktop, Cursor, Claude Code, Codex, OpenCode), environment variables, and transports (stdio/SSE/streamable-HTTP): **[docs/self-run.md](docs/self-run.md)**.

## Building on top of this server

For **integration authors** only — if you use the server directly, nothing here applies to you.

If your product drives this server (a plugin, an agent, a wrapper CLI), it can identify itself so its usage is attributable in Qase analytics, independently of which AI host is connected:

```bash
QASE_MCP_INTEGRATION=quality-supervisor/1.4.0   # <name>/<version>, version optional
```

The name must be on the allowlist in [`src/utils/integration-marker.ts`](src/utils/integration-marker.ts) — add yours in a PR. Anything unlisted or malformed is ignored, and the API call still succeeds. HTTP transports also accept the marker per request (`X-Qase-Integration` header or `?integration=`). Details: **[docs/self-run.md](docs/self-run.md#integration-marker-for-integration-authors)**.

## Upgrading

**From 2.x to 3.0.0:** no tool was renamed and no argument changed, so prompts and automation keep working. What changed is the protocol underneath — the server speaks MCP 2026-07-28, sessions are gone, every tool is listed from the first request, and deleting takes two round trips. Self-hosting more than one replica now requires `QASE_MCP_REQUEST_STATE_KEY`.

**From v1 to v2:** v2 consolidated 83 v1 tools into **29 task-oriented tools** (30 total, including a discovery tool), and has since grown to 40 (42 total). Tool names and response shapes have changed.

Both upgrades, with the complete v1 → v2 tool mapping table and before/after examples: **[docs/migration.md](docs/migration.md)**.

## Tools

42 tools across 6 groups (40 task-oriented tools plus two meta tools: `qase_discover_tools` to search the catalogue and `qase_tool_help` to read a tool's full documentation). All of them are listed from the first request:

| Group | Count | Description |
| --- | --- | --- |
| Read | 2 | Fetch any entity by type/ID, or bootstrap full project context in one call |
| QQL | 2 | Search across cases, runs, results, defects, and plans with Qase Query Language |
| Write | 32 | Create, update, and delete cases (single or up to 100 at once), runs, results, defects, suites, milestones, plans, shared steps, environments, and attachments; link cases and runs to Jira issues; propose and manage test case reviews |
| Composite | 3 | Multi-step workflows in one call: CI reporting, defect triage, regression run setup |
| Escape hatch | 1 | Direct REST API access for any endpoint not covered by the tools above |
| Meta | 2 | `qase_discover_tools` — search the catalogue by what you are trying to do; `qase_tool_help` — the full documentation of one tool, on demand |

Full tool-by-tool reference with parameters: **[docs/tools.md](docs/tools.md)**.

## Documentation

- **[docs/connect.md](docs/connect.md)** — connect to the hosted Qase MCP (Claude, Cursor, Codex, other clients)
- **[docs/self-run.md](docs/self-run.md)** — install and run the server yourself (config, clients, transports)
- **[docs/tools.md](docs/tools.md)** — full tool reference, groups, and the discovery model
- **[docs/troubleshooting.md](docs/troubleshooting.md)** — auth, OAuth/connector, and SSL issues
- **[docs/migration.md](docs/migration.md)** — upgrade guides: 2.x → 3.0.0, and the v1 → v2 tool mapping

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

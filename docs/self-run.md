# Self-Run Guide (Local / stdio)

Run the Qase MCP Server yourself, using your own `QASE_API_TOKEN`. This is the local/stdio path: you install the package (or build from source) and your MCP client launches it as a subprocess.

Prefer zero-install? Connect to the Qase-hosted MCP server instead — no local setup, no API token. See [Connect to the hosted Qase MCP](connect.md).

## Prerequisites

- Node.js 20+
- Qase account with API token ([Get your token](https://app.qase.io/user/api/token))

## Installation

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

## Client Setup (stdio)

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

> Prefer no install and no API token? Connect Cursor to the hosted server instead — see [Connect to the hosted Qase MCP](connect.md).

To run the server locally with your own token:

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

## Transports

The server supports multiple transport types for different use cases.

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

> **Note:** This page covers running the server yourself with your own `QASE_API_TOKEN` (self-run). It does not cover operating the hosted OAuth proxy — that is internal operator documentation, not part of this guide.

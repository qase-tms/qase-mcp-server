# Connect to the hosted Qase MCP

The quickest way to use Qase — no install and no API token. Connect to the Qase-hosted MCP server at `https://mcp.qase.io/mcp` and sign in with your Qase account. Any MCP client that supports remote servers (OAuth 2.1) works; the client handles the OAuth flow for you — Claude, Cursor, and Codex are shown below.

Prefer to run the server yourself with your own `QASE_API_TOKEN`? See [Self-Run Guide (Local / stdio)](self-run.md).

## Claude

Qase publishes an official **Qase Test Management** connector in Claude's directory:

1. In Claude, open **Settings → Connectors** and find **Qase Test Management**.
2. Click **Connect** and complete the Qase sign-in when prompted.

## Cursor

Add the hosted server by URL in `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "qase": {
      "url": "https://mcp.qase.io/mcp"
    }
  }
}
```

Cursor opens your browser to sign in to Qase; the tools appear once you've authorized.

## VS Code

Add manually to `.vscode/mcp.json`:

```json
{
  "servers": {
    "qase": {
      "type": "http",
      "url": "https://mcp.qase.io/mcp"
    }
  }
}
```

VS Code opens your browser to sign in to Qase; the tools appear once you've authorized. Requires VS Code 1.101+ for remote MCP and OAuth support.

## Codex

**ChatGPT / Codex app** — open **Settings → MCPs → Add server**, enter the URL `https://mcp.qase.io/mcp`, and click **Authenticate**.

**Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.qase]
url = "https://mcp.qase.io/mcp"
auth = "oauth"
```

Then run `codex mcp login qase` and complete the Qase sign-in in your browser.

> **Note:** Enter the URL exactly as shown — without surrounding quotes. A stray quote (or its encoded form, `%22`) in the server URL breaks OAuth; if a connection ever fails to authenticate, remove the server entry and re-add it, typing the URL by hand.

## Other remote clients

Any MCP client that supports remote (HTTP) servers with OAuth 2.1 can connect the same way — point it at:

```
https://mcp.qase.io/mcp
```

In every case the hosted server authenticates via your Qase login (OAuth) — no local installation or `QASE_API_TOKEN` needed.

## Active workspace

The connector operates on the workspace currently selected in your Qase UI. To work in a different workspace, just switch it in Qase — the connector automatically routes subsequent requests to the newly selected workspace, with no need to reconnect or re-authorize.

## Troubleshooting

Connector not appearing, empty tool list, or OAuth sign-in failing? See [Troubleshooting](troubleshooting.md).

# Connect to the hosted Qase MCP

The quickest way to use Qase — no install and no API token. Connect to the Qase-hosted MCP server and sign in with your Qase account. Any MCP client that supports remote servers (OAuth 2.1) works; the client handles the OAuth flow for you — Claude, Cursor, Codex, and VS Code are shown below.

## Pick your endpoint

Qase's cloud runs in two regions, each with its own hosted MCP server. **Use the one your workspace lives on** — they are separate deployments, each backed by its own data and its own accounts, so the wrong URL cannot reach your projects.

| Your Qase workspace | MCP server URL |
|---|---|
| `app.qase.io` (main cloud) | `https://mcp.qase.io/mcp` |
| `app-eu.qase.io` (EU cluster) | `https://mcp-eu.qase.io/mcp` |

Every example below uses the main-cloud URL. On the EU cluster, substitute `https://mcp-eu.qase.io/mcp` and change nothing else: the setup, the OAuth flow and the tools are identical. Sign-in goes to that region's own identity provider — `auth.qase.io` or `auth-eu.qase.io` — so you authenticate against the region holding your data, and attachments you upload stay there too.

A **dedicated instance** is not a region and has no hosted endpoint; [run the server yourself](self-run.md) and point it at your own domain.

> **Availability:** The hosted Qase MCP is available on **every paid plan**, in either region. Two situations call for [running the server yourself](self-run.md) instead:
>
> - **The Free plan** — you can sign in, but tool calls are rejected with a plan error.
> - **A dedicated instance** — the hosted servers talk to Qase's own clouds, so neither can reach a dedicated deployment whatever your plan. Self-run points at your own domain via `QASE_API_DOMAIN`.
>
> Running the server yourself works on every plan, in both regions, and on dedicated instances.

Prefer to run the server yourself with your own `QASE_API_TOKEN`? See [Self-Run Guide (Local / stdio)](self-run.md).

## Claude

Qase publishes an official **Qase Test Management** connector in Claude's directory:

1. In Claude, open **Settings → Connectors** and find **Qase Test Management**.
2. Click **Connect** and complete the Qase sign-in when prompted.

The directory connector points at the main cloud. On the EU cluster, add it by URL instead — **Settings → Connectors → Add custom connector** — with `https://mcp-eu.qase.io/mcp`.

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

## VS Code

Add the hosted server to `.vscode/mcp.json` (workspace-scoped):

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

Or run **MCP: Add Server** from the Command Palette (`⇧⌘P` / `Ctrl+Shift+P`), choose **HTTP**, and enter the URL. VS Code opens your browser to sign in to Qase; the tools appear once you've authorized.

## Other remote clients

Any MCP client that supports remote (HTTP) servers with OAuth 2.1 can connect the same way — point it at the URL for your region:

```
https://mcp.qase.io/mcp        # main cloud
https://mcp-eu.qase.io/mcp     # EU cluster
```

In every case the hosted server authenticates via your Qase login (OAuth) — no local installation or `QASE_API_TOKEN` needed.

## Active workspace

The connector operates on the workspace currently selected in your Qase UI. To work in a different workspace, just switch it in Qase — the connector automatically routes subsequent requests to the newly selected workspace, with no need to reconnect or re-authorize.

## Troubleshooting

Connector not appearing, empty tool list, or OAuth sign-in failing? See [Troubleshooting](troubleshooting.md).

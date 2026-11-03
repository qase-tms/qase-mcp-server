# Run the Qase MCP server yourself

Run the Qase MCP server on your own computer, with your own Qase API token. Your AI tool starts the server for you in the background, so there is nothing to keep running. Setup takes about five minutes and works on every Qase plan, in both regions, and on dedicated instances.

> **Prefer no setup at all?** On any paid plan you can connect to the hosted Qase MCP instead: no install and no token, just a Qase sign-in. See [Connect to the hosted Qase MCP](connect.md). Self-run is the way in on the Free plan and on dedicated instances, and for setups without a browser to sign in from.

**On this page**

1. [Before you start](#before-you-start): check Node.js, create a token, note your region
2. [Pick your tool](#pick-your-tool): steps for Claude Desktop, Claude Code, Cursor, Codex and OpenCode
3. [Check it works](#check-it-works)
4. [Troubleshooting](#troubleshooting)

## Before you start

Do these three things once, whichever tool you use.

### 1. Check that Node.js 20 or newer is installed

The server runs on Node.js. Open a terminal (macOS: Terminal; Windows: PowerShell) and run:

```bash
node -v
```

If it prints `v20` or higher, you're set. If it prints an error or a lower version, install the LTS release from [nodejs.org](https://nodejs.org), then open a new terminal and check again.

You do not need to install the Qase package itself. Every setup below uses `npx -y @qase/mcp-server`, which downloads the server the first time your tool starts it and reuses it afterwards.

### 2. Create a Qase API token

Sign in to Qase and open the API token page for your region:

- Main cloud: <https://app.qase.io/user/api/token>
- EU cluster: <https://app-eu.qase.io/user/api/token>

Create a token and keep it somewhere safe. Treat it like a password: don't paste it into chats or tickets, and don't commit it to Git.

### 3. Note your Qase region

Look at your browser's address bar while you're signed in to Qase:

| You see | What to add to your setup |
| --- | --- |
| `app.qase.io` | Nothing. This is the default. |
| `app-eu.qase.io` | `QASE_API_DOMAIN` set to `api-eu.qase.io` |
| Your company's own Qase address (dedicated instance) | `QASE_API_DOMAIN` set to your API domain, for example `api-yourcompany.qase.io`. Ask your Qase admin if you're unsure. |

You don't write this anywhere yet. Each tool's section below shows where the line goes, right next to your token. A token is only valid in the region that created it, so create the token in the same workspace you point `QASE_API_DOMAIN` at.

## Pick your tool

Jump to the section for the tool you'll use Qase from. Each one ends with a quick test.

| Your tool | How you set it up |
| --- | --- |
| [Claude Desktop](#claude-desktop) | Paste a block into a settings file |
| [Claude Code](#claude-code) | Run one terminal command |
| [Cursor](#cursor) | Paste a block into a settings file |
| [OpenAI Codex](#openai-codex) (CLI and IDE extension) | Run one terminal command |
| [OpenCode](#opencode) | Paste a block into a settings file |
| [Another MCP client](#other-mcp-clients) | Use the same three values |

In every block, replace `your_api_token_here` with your token and keep the quotes around it.

### Claude Desktop

1. **Open the settings file.** In Claude Desktop, go to **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`, creating it if needed. Its location:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. **Paste the Qase setup.** If the file is empty or only contains `{}`, replace everything with:

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

   If the file already lists other servers, add only the `"qase": { ... }` entry inside the existing `mcpServers`, with a comma between it and the server before it.
3. **Save the file and restart Claude Desktop completely.** On macOS press Cmd+Q; on Windows right-click the tray icon and choose **Quit**. Closing the window is not enough, because the file is only read at startup.

**EU region or custom domain:** add a second line inside `env`, after a comma:

```json
"env": {
  "QASE_API_TOKEN": "your_api_token_here",
  "QASE_API_DOMAIN": "api-eu.qase.io"
}
```

**Qase doesn't appear?** The most common cause is invalid JSON, usually a missing or extra comma. On macOS with Node.js installed through nvm, Claude Desktop may also not find `npx`: run `which npx` in Terminal and use that full path as `"command"`.

### Claude Code

Run one command, with your token in place of `your_api_token_here`:

```bash
claude mcp add qase --scope user --env QASE_API_TOKEN=your_api_token_here -- npx -y @qase/mcp-server
```

**EU region or custom domain:** add a second `--env`:

```bash
claude mcp add qase --scope user --env QASE_API_TOKEN=your_api_token_here --env QASE_API_DOMAIN=api-eu.qase.io -- npx -y @qase/mcp-server
```

Then run `claude mcp list` and check that `qase` is listed as connected.

The `--scope` flag decides where Qase is available:

| Scope | Where Qase is available | Use it when |
| --- | --- | --- |
| `--scope user` | Every project on your computer | You want Qase everywhere. Recommended. |
| none (local) | Only the project you ran the command in | You want Qase in one project only. |
| `--scope project` | Everyone who opens the project, via a `.mcp.json` file in its root | You want to share the setup with your team. See below. |

**Sharing the setup through `.mcp.json`:** that file is meant to be committed, so never put a token in it. Reference an environment variable instead, and have each person set `QASE_API_TOKEN` in their own shell:

```json
{
  "mcpServers": {
    "qase": {
      "command": "npx",
      "args": ["-y", "@qase/mcp-server"],
      "env": {
        "QASE_API_TOKEN": "${QASE_API_TOKEN}"
      }
    }
  }
}
```

**Changing the token later:** run `claude mcp remove qase`, then run the add command again.

### Cursor

1. **Open Cursor's MCP settings file.** Use the global file, so Qase works in every project:
   - macOS / Linux: `~/.cursor/mcp.json`
   - Windows: `%USERPROFILE%\.cursor\mcp.json`

   Create it if it doesn't exist. You can also reach it from **Cursor Settings → Tools & MCP**.
2. **Paste the Qase setup.** If the file already lists other servers, add only the `"qase": { ... }` entry inside `mcpServers`.

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
3. **Save the file and restart Cursor.**

**EU region or custom domain:** add `"QASE_API_DOMAIN": "api-eu.qase.io"` inside `env`, after the token line and a comma.

Cursor also reads a project-level `.cursor/mcp.json`. Keep your token out of it if the project is committed to Git.

### OpenAI Codex

The Codex CLI and the Codex IDE extension share one configuration, so you set this up once for both. Run:

```bash
codex mcp add qase --env QASE_API_TOKEN=your_api_token_here -- npx -y @qase/mcp-server
```

**EU region or custom domain:** add a second `--env`:

```bash
codex mcp add qase --env QASE_API_TOKEN=your_api_token_here --env QASE_API_DOMAIN=api-eu.qase.io -- npx -y @qase/mcp-server
```

Then run `codex mcp list` and check that `qase` is listed. Inside Codex, `/mcp` shows the active servers.

**Prefer editing the file?** Codex keeps its settings in `~/.codex/config.toml`. It is TOML, not JSON, so the format differs from the other tools:

```toml
[mcp_servers.qase]
command = "npx"
args = ["-y", "@qase/mcp-server"]

[mcp_servers.qase.env]
QASE_API_TOKEN = "your_api_token_here"
# QASE_API_DOMAIN = "api-eu.qase.io"   # EU region or custom domain only
```

- The table name is `mcp_servers`, with an underscore. `mcpServers` is not read here.
- TOML uses `=` rather than `:`, and has no trailing commas.
- A trusted project can have its own `.codex/config.toml`. Keep your token out of it if the project is committed to Git.

### OpenCode

1. **Open OpenCode's config file.** Use the global file, so Qase works in every project: `~/.config/opencode/opencode.json`. Create it if it doesn't exist.
2. **Paste the Qase setup.** If the file already has an `mcp` section, add only the `"qase": { ... }` entry inside it.

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
3. **Save the file and restart OpenCode.**

**EU region or custom domain:** add `"QASE_API_DOMAIN": "api-eu.qase.io"` inside `environment`, after the token line and a comma.

> **Note:** OpenCode uses a different format from other MCP clients. Servers sit under `mcp` (not `mcpServers`), the command and its arguments form one `command` array, and settings go under `environment` (not `env`). Copying another tool's block won't work here.

OpenCode also reads an `opencode.json` in a project's root folder. Keep your token out of it if the project is committed to Git.

### Other MCP clients

Any client that can start a local (stdio) MCP server works. Give it:

- **Command:** `npx`
- **Arguments:** `-y`, `@qase/mcp-server`
- **Environment variable:** `QASE_API_TOKEN` set to your token, plus `QASE_API_DOMAIN` if your region needs one

Most clients accept the same JSON block as [Claude Desktop](#claude-desktop).

## Advanced settings

These are environment variables, set in the same place as your token.

### Other regions and custom domains

`QASE_API_DOMAIN` defaults to `api.qase.io`, which is Qase's main cloud. Point it elsewhere when your workspace is not there:

```bash
# EU cluster: workspaces on app-eu.qase.io
QASE_API_DOMAIN=api-eu.qase.io

# Enterprise dedicated instance
QASE_API_DOMAIN=api-yourcompany.qase.io
```

`QASE_API_DOMAIN` takes the domain only, with no scheme and no path. `https://api-eu.qase.io` and `api-eu.qase.io/v1` are rejected with an error. A non-default port does belong in it: `api-yourcompany.qase.io:8080`.

Both Qase clouds also offer a hosted connector, so self-run is a choice there rather than a requirement. See [Pick your endpoint](connect.md#pick-your-endpoint). On a **dedicated instance**, self-run is the only option: the hosted servers serve Qase's own clouds only, regardless of plan.

### Self-hosted deployments over plain HTTP

Requests go over HTTPS by default. If your self-hosted or on-premise Qase API is served over plain HTTP (typically a local or internal-network install without a certificate), set the scheme separately:

```bash
QASE_API_DOMAIN=api.qase.lo
QASE_API_PROTOCOL=http
```

Only `http` and `https` are recognised (case-insensitive, with or without a trailing `://`). Any other value falls back to `https`, so a typo cannot silently downgrade the connection.

Use `http` only for deployments you control on a trusted network: the API token travels in a request header, unencrypted, on every call.

### Corporate networks that inspect traffic

If the server fails with `unable to get local issuer certificate`, your network replaces certificates on the way out. Point Node.js at your company's CA certificate with `NODE_EXTRA_CA_CERTS`, next to your token. See [SSL Certificate Errors](troubleshooting.md#ssl-certificate-errors).

### Installing the package globally

Not needed for any setup on this page. If you'd rather install once instead of letting `npx` fetch the package:

```bash
npm install -g @qase/mcp-server
```

Then use `qase-mcp-server` as the command in your client configuration, with no arguments, and update it with `npm update -g @qase/mcp-server`.

## Check it works

Start a new chat in your tool and ask:

> List my Qase projects.

Your tool may ask permission to use a Qase tool the first time. If your projects come back, you're done.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Qase doesn't appear in your tool at all | Check the configuration for a missing comma, save, and fully restart the tool. Run `node -v` to confirm Node.js 20 or newer. |
| `Authentication failed: Please check your QASE_API_TOKEN` | Copy the token again and remove any extra spaces or quotes. Make sure it was created in the same region as your `QASE_API_DOMAIN`. |
| `Network error` or `ECONNREFUSED` | Check `QASE_API_DOMAIN`: domain only, no `https://`. On the main cloud, remove the line entirely. |
| `unable to get local issuer certificate` | Your network inspects traffic. See [SSL Certificate Errors](troubleshooting.md#ssl-certificate-errors). |
| `npx` not found (macOS, Node.js installed with nvm) | Run `which npx` in Terminal and use that full path as the command. |
| `Unknown tool` | You may be on an older cached version. See [Tool Not Found](troubleshooting.md#tool-not-found). |

More issues and fixes: [Troubleshooting](troubleshooting.md).

## Going further

- **Running one server for a team, behind a URL** (Streamable HTTP, several replicas, metrics): [Host a shared server](hosting.md)
- **Building a plugin, agent or wrapper on top of the server:** [Building on top of the server](integrations.md)
- **Changing the server's code or running it from source:** [CONTRIBUTING.md](../CONTRIBUTING.md)

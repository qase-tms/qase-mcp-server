# Troubleshooting

Issues are grouped by how you're connecting: the [hosted connector](connect.md) (OAuth, no local install) or a [self-run](self-run.md) server (your own `QASE_API_TOKEN`). If you're not sure which applies, most people using the hosted server at `https://mcp.qase.io/mcp` should look at the **Hosted Connector / OAuth** section first.

## Authentication Errors (Self-Run)

**Error**: `Authentication failed: Please check your QASE_API_TOKEN`

This means the server is running locally (self-run) and rejected the token it was given.

**Solution**:
1. Verify your API token is correct: https://app.qase.io/user/api/token
2. Ensure `QASE_API_TOKEN` is set in your environment or MCP client config's `env` section
3. Check for extra spaces or stray quotes around the token value
4. If you're on the hosted connector instead (no `QASE_API_TOKEN` involved), see [Hosted Connector / OAuth](#hosted-connector--oauth) below

## Hosted Connector / OAuth

These apply when connecting to the Qase-hosted server (`https://mcp.qase.io/mcp`) — see [Connect to the hosted Qase MCP](connect.md). There's no `QASE_API_TOKEN` here; authentication is a browser-based OAuth sign-in to your Qase account.

### Connector doesn't appear, or won't connect

**Solution**:
1. Confirm the server URL is exactly `https://mcp.qase.io/mcp` — no trailing slash variations, no surrounding quotes (see the clean-URL footgun below)
2. Confirm your MCP client supports remote (HTTP) servers with OAuth 2.1 — older clients or stdio-only integrations can't connect to a hosted URL
3. Restart your MCP client completely (close and reopen) after adding the server
4. Check that your network/firewall allows outbound HTTPS to `mcp.qase.io`

### "Auth required" or empty tool list after connecting

If you completed the browser sign-in but the client still reports the connector needs authorization, or shows zero tools:

**Solution**:
1. Make sure you actually completed the sign-in flow in the browser tab/window it opened — some clients silently fail if that tab is closed early
2. Try disconnecting and reconnecting the connector (not just refreshing the client)
3. If reconnecting doesn't help, follow the full remove-and-re-add steps below — a stale or partially-completed OAuth session is a common cause
4. Confirm you're signed in to the correct Qase account/workspace in your browser — if you have multiple Qase sessions, the wrong one may be active

### Clean-URL footgun: stray quote or `%22` breaks OAuth

A very common cause of persistent auth failures: the server URL got saved with an extra quote character around it, e.g. `"https://mcp.qase.io/mcp"` or its URL-encoded form `https://mcp.qase.io/mcp%22`. This can happen from copy-pasting a URL out of JSON, a table, or a chat message that included the quotes.

That stray character poisons the OAuth callback — it changes the client's registered redirect/resource identifiers, so the authorization server and the client end up disagreeing about the URL, and sign-in fails (or appears to succeed but leaves an empty tool list).

**This is not fixable by editing the URL in place.** Once a client has registered or cached an OAuth session against the bad URL, editing the field to remove the quote isn't enough — the client may still replay the old (poisoned) auth request from its cache.

**Solution**:
1. Fully **remove** the server entry from your MCP client (don't just edit it)
2. Re-**add** it as a new entry
3. Type the URL by hand: `https://mcp.qase.io/mcp` — no surrounding quotes, no extra characters
4. Complete the browser sign-in again from this fresh entry

### Browser sign-in is required

The hosted connector authenticates via OAuth in your default browser — there's no token to paste in. If your MCP client is running in an environment without a browser available (e.g. certain headless or remote setups), the sign-in step can't complete. Use a client/environment that can open a browser, or fall back to the [self-run guide](self-run.md) with your own `QASE_API_TOKEN`.

## Connection Errors

**Error**: `Network error` or `ECONNREFUSED`

**Solution**:
1. Check your internet connection
2. Verify the API domain is correct (especially for enterprise customers)
3. Check if Qase is accessible: https://api.qase.io/v1/

## SSL Certificate Errors

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

## Custom Domain Issues

**Error**: `Invalid domain` or connection errors with custom domain

**Solution**:
1. Ensure `QASE_API_DOMAIN` is set to just the domain (e.g., `api.company.qase.io`)
2. Don't include `https://` or `/v1` in the domain
3. Verify with your Qase administrator

## No Tools Showing in MCP Client

**Error**: MCP client shows "no tools, prompts or resources" or 0 tools available

**Solution**:
1. Verify your MCP configuration has the correct command and arguments (self-run) or the correct URL (hosted)
2. For self-run: check that `QASE_API_TOKEN` is set in the `env` section
3. For the hosted connector: check the [Hosted Connector / OAuth](#hosted-connector--oauth) section above, especially the clean-URL footgun
4. Restart your MCP client completely (close and reopen)
5. Check the MCP client logs for connection errors
6. For self-run from source, verify the server is built: `npm run build`

## Tool Not Found

**Error**: `Unknown tool: tool_name`

**Solution**:
1. Ensure you're using the latest version: `npm update -g @qase/mcp-server` (self-run) — the hosted connector always runs the latest version
2. If upgrading from v1, tool names have changed — see [MIGRATION.md](../MIGRATION.md)
3. Restart your MCP client after updating

## Still stuck?

- **Documentation**: https://help.qase.io
- **Email**: support@qase.io
- **GitHub Issues**: https://github.com/qase-tms/qase-mcp-server/issues

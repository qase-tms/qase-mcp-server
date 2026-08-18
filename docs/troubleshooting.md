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

### Access denied / Enterprise plan required

The hosted Qase MCP is available on the **Enterprise** plan in Qase. If your workspace is on another plan, requests are rejected with an access/plan error — the connector may sign in but tool calls fail with a plan-related message.

**Solution**: upgrade to the Enterprise plan, or [run the server yourself](self-run.md) with your own `QASE_API_TOKEN` (works on any plan).

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

### Session expires after 7 days of inactivity

An active hosted-connector session stays valid for **7 days**. As long as you use the connector within any 7-day window, it keeps working with no re-authorization. If a full week passes with no activity, the session expires and you'll be asked to sign in again.

**Solution**: when the client reports that authorization is needed, re-run the sign-in flow — it opens your browser; complete the Qase login and the connector resumes. No need to remove and re-add the server.

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
2. Don't include `https://` or `/v1` in the domain — the scheme goes in `QASE_API_PROTOCOL` instead (see below), and the API version is appended by the server
3. A non-default port does belong in the domain: `api.company.qase.io:8080`
4. Verify with your Qase administrator

## Self-Hosted API Served over Plain HTTP

**Error**: connection or TLS errors against a self-hosted Qase API that has no certificate

**Solution**: requests default to HTTPS. For a self-hosted or on-premise deployment served over plain HTTP, set the scheme separately:

```bash
QASE_API_DOMAIN=api.qase.lo
QASE_API_PROTOCOL=http
```

Only `http` and `https` are recognised; any other value falls back to `https`, so check for a typo if the scheme appears to be ignored. Use `http` only on a trusted network — the API token is sent unencrypted in a request header.

## No Tools Showing in MCP Client

**Error**: MCP client shows "no tools, prompts or resources" or 0 tools available

**Solution**:
1. Verify your MCP configuration has the correct command and arguments (self-run) or the correct URL (hosted)
2. For self-run: check that `QASE_API_TOKEN` is set in the `env` section
3. For the hosted connector: check the [Hosted Connector / OAuth](#hosted-connector--oauth) section above, especially the clean-URL footgun
4. Restart your MCP client completely (close and reopen)
5. Check the MCP client logs for connection errors
6. For self-run from source, verify the server is built: `npm run build`

## "Upload isn't possible on this connector"

**Symptom**: the agent says attachments cannot be uploaded — often phrased as the endpoint requiring `multipart/form-data` while `qase_api` only sends JSON.

**Cause**: the agent did not see `qase_attachment_upload`. Before 2.2.0 it was a discoverable tool, hidden from the tool list until `qase_discover_tools` was called, so the agent fell back to the `qase_api` escape hatch — which genuinely cannot send `multipart/form-data`.

**Solution**:
1. Update to 2.2.0 or later, where the upload tool is always listed: `npm update -g @qase/mcp-server` (the hosted connector always runs the latest version)
2. On an older version, ask the agent to run `qase_discover_tools` with `"attachment"` first
3. Pass the file as `file_base64`. `file_path` only works when the server runs on the same machine as the file — the hosted connector cannot read your filesystem
4. To attach the result to a case, pass the returned hash in the `attachments` array of `qase_case_upsert` (or `qase_result_record`, `qase_ci_report`, `qase_defect_upsert`, `qase_triage_defect`)

## Review tools fail or aren't listed

**Symptom**: `qase_review_*` tools are missing, or every call fails.

**Solution**:
1. Review tools are discoverable — ask the agent to run `qase_discover_tools` with `"review"`
2. Enable **Test case review** in the project settings; without it every review endpoint rejects the request
3. Approving, requesting changes, merging, and declining are **UI-only** — the public API has no endpoints for them, so no tool can perform them
4. `reviewers` takes author UUIDs (or emails, which are resolved). The review's author cannot be its own reviewer, and the author is whoever owns the API token

## Tool Not Found

**Error**: `Unknown tool: tool_name`

**Solution**:
1. Ensure you're using the latest version: `npm update -g @qase/mcp-server` (self-run) — the hosted connector always runs the latest version
2. If upgrading from v1, tool names have changed — see [docs/migration.md](migration.md)
3. Restart your MCP client after updating

## Still stuck?

- **Documentation**: https://docs.qase.io/en/articles/14984302-qase-mcp-server
- **Email**: support@qase.io
- **GitHub Issues**: https://github.com/qase-tms/qase-mcp-server/issues

# Building on top of the server

For **integration authors** only: anyone building a product that drives this server, such as a plugin, an agent or a wrapper CLI. If you use the server directly, nothing here applies to you; see [Run the Qase MCP server yourself](self-run.md) or [Connect to the hosted Qase MCP](connect.md).

## Integration marker

If you are *building a product on top of* this server (a plugin, an agent, a wrapper CLI), you can have your integration identified in Qase analytics. Set `QASE_MCP_INTEGRATION` in the environment you launch the server with:

```bash
# <name>/<version> — the version is optional
QASE_MCP_INTEGRATION=quality-supervisor/1.4.0
```

The server forwards it to the Qase API as `X-MCP-Integration-Name` and `X-MCP-Integration-Version`. It is a separate identity from the server deployment (`User-Agent`) and from the connected AI host (`X-MCP-Client-*`), so the same integration is attributable across every host and both deployments.

Rules:

- Format is `<name>/<version>`; the version may be omitted. The name is lowercased.
- A version must be made of word characters, dots, dashes or pluses, up to 32 characters — anything else is dropped and only the name is sent.
- **The name must be on the allowlist** in [`src/utils/integration-marker.ts`](../src/utils/integration-marker.ts) (`ALLOWED_INTEGRATIONS`). This bounds the cardinality of the analytics dimension, so an unlisted name is ignored entirely and nothing is sent. To add your integration, open a PR adding it to that array.
- A malformed or unlisted marker is dropped silently; the API call itself still succeeds.

Over HTTP transports the marker can also travel per request instead of per process — send an `X-Qase-Integration: <name>/<version>` header, or add `?integration=<name>/<version>` to the MCP endpoint URL. The query parameter is the fallback for clients that do not pass custom headers through.

On **Streamable HTTP**, the marker is read fresh on every single request: a marker on one call is never attributed to the next. Precedence: request header → query parameter → `QASE_MCP_INTEGRATION`.

On the (deprecated) **SSE** transport, the marker is captured once, when the `/sse` stream opens, and reused for every message posted on that stream afterwards — a header sent on an individual `/messages` POST can still override it for that one call, but there is no per-request query-parameter fallback once the stream is open. Precedence there is: request header → the value captured when the stream opened → `QASE_MCP_INTEGRATION`.

For the HTTP transports themselves, see [Host a shared Qase MCP server](hosting.md).

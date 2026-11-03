# Host a shared Qase MCP server

Run the server as a network service that several people or web-based clients connect to by URL, instead of each person's tool starting its own copy.

**You probably don't need this page.** To use Qase from your own AI tool, follow [Run the Qase MCP server yourself](self-run.md), where your tool starts the server over stdio and nothing listens on the network. On a paid plan, [the hosted Qase MCP](connect.md) already provides a shared URL that Qase runs for you.

This page is for operators who run the server for a team on Qase's clouds, behind a VPN, or next to a dedicated instance.

> **Note:** This page covers running the server yourself. It does not cover operating the Qase-hosted OAuth proxy behind `mcp.qase.io`; that is internal operator documentation.

## Getting the server

Either run the published package:

```bash
npx -y @qase/mcp-server --transport streamable-http --port 3000
```

or build from source and use the npm scripts below:

```bash
git clone https://github.com/qase-tms/qase-mcp-server.git
cd qase-mcp-server
npm install
npm run build
```

The source build is the same one described in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Configuration

Set environment variables in the service's environment, or in a `.env` file in the directory the server starts from:

```bash
# Optional: Custom API domain for enterprise customers
QASE_API_DOMAIN=api.qase.io

# Optional: Scheme used to reach that domain — http or https (default: https)
QASE_API_PROTOCOL=https
```

`QASE_API_DOMAIN` and `QASE_API_PROTOCOL` work exactly as for a single user. See [Other regions and custom domains](self-run.md#other-regions-and-custom-domains) and [Self-hosted deployments over plain HTTP](self-run.md#self-hosted-deployments-over-plain-http).

`QASE_API_TOKEN` applies to the stdio transport only. On a network transport each client sends its own token; see [Security of network transports](#security-of-network-transports).

## Transports

The server supports multiple transport types for different use cases.

### Stdio Transport (Default)

Used by MCP clients like Claude Desktop and Cursor:

```bash
npm start
# or
npm run start:stdio
```

### SSE Transport

> **Deprecated.** The SSE transport was deprecated in the MCP specification on
> 2025-03-26 and will be removed in a future release. Use
> `--transport streamable-http` instead.

Server-Sent Events for web-based clients:

```bash
npm run start:sse
# Server runs on http://localhost:3000/sse
# Health check: http://localhost:3000/health
# Metrics: http://localhost:3000/metrics
```

Clients must send a bearer token — see [Security of network transports](#security-of-network-transports).

### Streamable HTTP Transport

Full HTTP-based transport — there is no session; every request is served on its own:

```bash
npm run start:http
# Server runs on http://localhost:3000/mcp
# Health check: http://localhost:3000/health
# Metrics: http://localhost:3000/metrics
```

Clients must send a bearer token — see [Security of network transports](#security-of-network-transports).

**Deleting anything requires a modern client.** Destructive tools (`qase_case_delete` and the rest) are confirmed through a multi-round-trip exchange: the first call returns a request for input instead of deleting anything, and the client must retry with the answer. That round trip needs capabilities a client declares during `initialize`, which only a client that negotiates the **2026-07-28** revision of MCP provides. A client still on the 2025-11-25 revision — the common case on a stateless HTTP connection — cannot complete it, so its deletion is refused with an explanation naming the two ways out: use a client that negotiates 2026-07-28, or delete in the Qase UI. This is specific to the HTTP transports; stdio and SSE are long-lived connections where confirmation always works, though a stdio client that itself negotiates 2026-07-28 goes through the same round trip rather than the old single-call flow.

### Custom Configuration

```bash
# Custom port and host
node build/index.js --transport streamable-http --port 8080 --host 0.0.0.0

# Available options:
# --transport: stdio | sse | streamable-http (default: stdio)
# --port: Port number (default: 3000)
# --host: Host address (default: 0.0.0.0)
```

## Security of network transports

`stdio` has no network listener: the client starts the process and the token
lives in the client's configuration. The `sse` and `streamable-http` transports
listen on a port, and two things follow from that.

**The client supplies the token.** Every request must carry
`Authorization: Bearer <token>`; the server does not fall back to its own
`QASE_API_TOKEN` when a request arrives without one. Sharing a single operator
token across a team is still fine — it just belongs in the client config:

```json
{
  "mcpServers": {
    "qase": {
      "url": "http://your-host:3000/mcp",
      "headers": { "Authorization": "Bearer YOUR_QASE_API_TOKEN" }
    }
  }
}
```

**Bind deliberately.** `--host` defaults to `0.0.0.0`, which accepts connections
from anywhere that can route to the machine. Pass `--host 127.0.0.1` unless the
server is meant to be reachable from the network, and keep OAuth on
(`QASE_OAUTH_ENABLED` defaults to enabled) unless you have a specific reason to
turn it off.

OAuth applies to `streamable-http` only: on `--transport sse` a token is
required but not validated by the server — any non-empty value passes, and a
bad one only fails later when the Qase API rejects it.

## Running more than one replica

Two pieces of state used to live inside a single process. From 3.0.0 both can be shared, and on a
multi-replica deployment both **must** be, because there are no sessions any more — consecutive
requests from the same client land on whichever replica the load balancer picks.

```bash
# Required when running more than one replica: the HMAC key that signs a pending
# destructive-action confirmation. At least 32 bytes, identical on every replica.
QASE_MCP_REQUEST_STATE_KEY=<a shared random string of 32+ bytes>

# Optional: share the L2 cache across replicas.
QASE_MCP_REDIS_URL=redis://host:6379
```

`QASE_MCP_REQUEST_STATE_KEY` is what makes a confirmation survive the trip through the client. The
server asks, the client answers, and the answer comes back carrying server-minted state that is
verified before anything is deleted. Without a shared key each replica generates its own at startup,
so a confirmation minted by one replica fails verification on another and the deletion is refused —
safe, but destructive tools stop working. A single replica needs nothing set.

`QASE_MCP_REDIS_URL` is optional: it shares the response cache between replicas so a repeated read is served from Valkey rather than from Qase again.

Upgrading an existing deployment from 2.x? See [2.x → 3.0.0](migration.md#2x--300) for sticky sessions, health probes and the removed `QASE_MCP_SESSION_TTL_MINUTES`.

## Monitoring

When using SSE or Streamable HTTP transport, a Prometheus-compatible `/metrics` endpoint is available:

```bash
curl http://localhost:3000/metrics
```

Metrics include:
- `qase_mcp_cache_hits_total` / `qase_mcp_cache_misses_total` - Cache hit/miss rates by tier (l1/l2)
- `qase_mcp_cache_errors_total` - Cache errors by tier
- `qase_mcp_circuit_breaker_state` - Redis circuit breaker state (0=closed, 1=half_open, 2=open)
- `qase_mcp_requests_total` - Requests served, labelled by `protocol` (the revision the client
  negotiated, e.g. `2026-07-28`, or `legacy` for 2025-11-25) and `client` (the client's own name).
  This is what tells you whether anyone still needs the older protocol revision before it is
  dropped. A 2025-era client reaches a stateless HTTP request without ever identifying itself, so
  it is counted as `client="unknown"`; on stdio and SSE the name comes from the connection's
  `initialize`. The number of distinct client names is capped at 20 per process — the label comes
  from the wire, and past the cap everything new is counted as `client="other"`.
- `qase_mcp_tool_calls_total` - Tool calls by tool name

## Troubleshooting

Server not starting, authentication errors, or connection issues? See [Troubleshooting](troubleshooting.md).

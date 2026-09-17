# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@qase.io**. Do not open a
public GitHub issue for a vulnerability.

Include, as far as you can: the affected version, the transport and
configuration (`stdio`, `--transport sse`, `--transport streamable-http`,
whether OAuth is enabled), reproduction steps, and the impact you observed. We
acknowledge reports within three business days.

## Supported versions

Fixes go into the latest minor release. Older minors are not patched.

## Running the server safely

The server has three transports, and only `stdio` has no network listener.

- **stdio** (default) — the client starts the process and talks to it over
  stdin/stdout. `QASE_API_TOKEN` supplies the credentials.
- **streamable-http** — the current network transport. OAuth is enabled by
  default and clients authenticate against it.
- **sse** — deprecated (MCP spec 2025-03-26), removed in 3.0.

On both network transports every request must carry
`Authorization: Bearer <token>`; the server does not fall back to
`QASE_API_TOKEN` for unauthenticated requests. A single shared operator token
still works — put it in the client configuration rather than in the server's
environment. Only `streamable-http` validates that token against OAuth/JWKS;
on `sse` any non-empty token passes the server's guard and a bad one is only
caught when the Qase API rejects it.

Additionally, bind to `127.0.0.1` with `--host` unless the server is meant to be
reachable from the network, and keep OAuth enabled unless you have a specific
reason to disable it.

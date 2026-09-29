import express, { Express } from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/server-legacy/auth';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import { requestTokenStorage } from '../utils/auth-context.js';
import { integrationStorage } from '../utils/integration-context.js';
import { serverEventBus } from '../tools/event-bus.js';
import { getMetrics } from '../cache/index.js';
import { getOAuthConfig, type OAuthConfig } from '../auth/oauth-config.js';
import { createJwksVerifier, type JwksVerifier } from '../auth/jwks-verifier.js';
import { createProxyProvider } from '../auth/proxy-provider.js';
import { createMcpGuard } from '../auth/mcp-guard.js';
import { createBearerRequiredGuard } from '../auth/bearer-guard.js';
import { authorizeRedirectUriStorage } from '../auth/client-context.js';
import type { RequestHandler } from 'express';
import { createJsonParseErrorHandler } from './json-parse-error.js';
import { readBodyLimit, bodyLimitBytes } from './body-limit.js';
import { createMcpRateLimiter } from './rate-limit.js';

export interface StreamableHttpConfig {
  port: number;
  host?: string;
  endpoint?: string;
}

/**
 * Interpret TRUST_PROXY for express's `trust proxy` setting: a hop count, the
 * booleans, or anything else passed through verbatim (express also accepts a
 * subnet or a comma-separated list). Unset means one proxy hop.
 */
function readTrustProxy(raw: string | undefined): number | boolean | string {
  if (raw === undefined) return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return raw;
}

export function setupStreamableHttpTransport(
  createServer: () => Server,
  config: StreamableHttpConfig,
  oauthDeps?: { config: OAuthConfig; verifier: JwksVerifier },
): Express {
  const app = express();

  // Behind a reverse proxy (k8s ingress, load balancer, ngrok) the client's
  // X-Forwarded-For header is set. The SDK's OAuth router uses express-rate-limit,
  // which throws on rate-limited endpoints (/register, /authorize, /token) unless
  // Express `trust proxy` is configured — otherwise those endpoints return 500.
  // Default to trusting 1 proxy hop; override with TRUST_PROXY (a hop count, or
  // 'false' to disable when running with no proxy in front).
  app.set('trust proxy', readTrustProxy(process.env.TRUST_PROXY));

  // CORS middleware for inspector
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    // Mcp-Method / Mcp-Name are required request headers as of MCP spec 2026-07-28
    // (gateway routing without body parsing) — allow them ahead of client adoption.
    // X-Qase-Integration is ours: without it a browser-based client's preflight
    // strips the marker and only the ?integration= fallback would work.
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, mcp-session-id, Mcp-Method, Mcp-Name, X-Qase-Integration',
    );
    // Expose auth challenge + session id so browser-based MCP clients (Inspector,
    // Claude.ai web) can read them from cross-origin responses. Without this the
    // 401 WWW-Authenticate challenge is invisible to client JS and OAuth never starts.
    res.header('Access-Control-Expose-Headers', 'WWW-Authenticate, mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    // Log request (omit headers to avoid exposing Authorization token in logs).
    // Method and path go in as format arguments, never inside the format string:
    // a path carrying `%s`/`%d` would otherwise swallow the query object.
    console.error('[StreamableHTTP] %s %s', req.method, req.path, { query: req.query });
    next();
  });

  app.use(express.json({ limit: readBodyLimit() }));
  app.use(createJsonParseErrorHandler());

  // OAuth: mount proxy auth router + protected-resource metadata, and guard /mcp.
  const oauthConfig = oauthDeps?.config ?? getOAuthConfig();
  let mcpGuard: RequestHandler | null = null;

  if (oauthConfig.enabled) {
    const verifier = oauthDeps?.verifier ?? createJwksVerifier(oauthConfig);
    const provider = createProxyProvider(oauthConfig, verifier);

    // Seed per-request redirect_uri so the proxy's getClient can echo it during /authorize.
    app.use((req, _res, next) => {
      const redirectUri =
        typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
      authorizeRedirectUriStorage.run(redirectUri, () => next());
    });

    // RFC 9728 protected-resource metadata — served at TWO paths by OUR OWN handlers:
    //
    //  - `/.well-known/oauth-protected-resource/mcp` (resource="https://mcp.qase.io/mcp")
    //    for clients that use the full endpoint URL as the resource identifier (VS Code).
    //  - `/.well-known/oauth-protected-resource` (root, resource=origin) for clients that
    //    discover at the root (Claude, Cursor, Codex). Backward compatible.
    //
    // Why our own handlers instead of the SDK's mcpAuthMetadataRouter: the SDK derives
    // authorization_servers from `new URL(issuer).href`, which appends a trailing slash
    // ("https://auth.qase.io/"). The AS's own metadata advertises the issuer WITHOUT the
    // slash ("https://auth.qase.io"), and RFC 8414 §3.3 requires the issuer a client used
    // to discover the AS to match the metadata's `issuer` EXACTLY. That slash mismatch
    // makes strict clients (VS Code) reject the AS metadata and refuse automatic client
    // registration (DCR). So authorization_servers must be exactly oauthConfig.issuer,
    // un-normalized. These routes are registered BEFORE mcpAuthRouter so they take
    // precedence over the SDK's own (slash-normalized) PRM mount; the SDK still serves the
    // AS metadata document + the proxy authorize/token/register endpoints.
    const authorizationServers = [oauthConfig.issuer];
    const rootResourceMetadata = {
      resource: new URL(oauthConfig.publicUrl).href,
      authorization_servers: authorizationServers,
    };
    const mcpResourceMetadata = {
      resource: new URL(oauthConfig.resourceUrl).href,
      authorization_servers: authorizationServers,
    };
    app.get('/.well-known/oauth-protected-resource', (_req, res) => {
      res.json(rootResourceMetadata);
    });
    app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
      res.json(mcpResourceMetadata);
    });

    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl: new URL(oauthConfig.issuer),
        // baseUrl = the public ORIGIN: the OAuth proxy endpoints (/authorize, /token,
        // /register) and AS metadata mount here. MUST stay the origin — decoupled from
        // resourceUrl — or the resource's `/mcp` path would leak into these paths.
        baseUrl: new URL(oauthConfig.publicUrl),
        // Still passed so the SDK generates its AS-metadata document; its own PRM mount is
        // shadowed by the explicit routes above.
        resourceServerUrl: new URL(oauthConfig.resourceUrl),
      }),
    );

    mcpGuard = createMcpGuard(verifier, oauthConfig);
    console.error('[StreamableHTTP] OAuth proxy enabled');
  }

  const endpoint = config.endpoint || '/mcp';
  const host = config.host || '0.0.0.0';
  // With OAuth on, mcpGuard validates JWTs and passes opaque tokens through.
  // With OAuth off there used to be no guard at all, which meant an
  // unauthenticated request ran under the operator's QASE_API_TOKEN. The
  // fallback guard keeps that door shut without pulling OAuth into a
  // deployment that deliberately turned it off.
  // The rate limiter comes first: it has to reject a flood before the guard
  // spends a JWT signature verify on it. Our edge limit lives on api.qase.io,
  // downstream of this process, so it never sees these requests.
  const guards: RequestHandler[] = [
    createMcpRateLimiter(),
    mcpGuard ?? createBearerRequiredGuard(),
  ];

  // One handler serves both protocol eras.
  //
  // `createMcpHandler` is per-request by construction: it calls the factory for
  // every request it serves and throws the instance away with the response. The
  // session map that used to live here — with its TTL sweep, its 404 for an
  // unknown id and its `mcp-session-id` header — has no counterpart in the
  // 2026-07-28 era, and the handler answers the two operations that only made
  // sense with a session (`GET` and `DELETE` on this endpoint) with 405.
  //
  // `legacy: 'stateless'` keeps 2025-era clients working: their requests are
  // routed to the handler's stateless legacy leg, which builds the same kind of
  // streamable-HTTP transport the hand-wired code did, minus the session.
  const mcpHandler = createMcpHandler(() => createServer(), {
    legacy: 'stateless',
    // The process-wide bus `subscriptions/listen` streams subscribe to, and the
    // one tool activation publishes onto (src/tools/event-bus.ts). Passing it
    // explicitly is what lets a change made deep inside a tool handler reach a
    // stream opened by an entirely different request.
    bus: serverEventBus,
    // Without this the SDK caps bodies at its own 4 MiB default and silently
    // undoes the 10 MB limit configured for attachment uploads.
    maxRequestBodySize: bodyLimitBytes(),
    onerror: (err) => console.error('[StreamableHTTP] handler error:', err),
  });
  // The adapter applies its own bound to bodies it reads off the Node stream.
  // Every request here arrives behind `express.json()` and is handed over as a
  // parsed body, so that path is not taken — but the two caps are set from the
  // same place so they cannot drift if it ever is.
  const nodeHandler = toNodeHandler(mcpHandler, {
    maxRequestBodySize: bodyLimitBytes(),
    onerror: (err) => console.error('[StreamableHTTP] adapter error:', err),
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http' });
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(getMetrics().renderPrometheus());
  });

  // MCP endpoint — one route for every method.
  //
  // `GET` and `DELETE` used to have hand-written routes of their own: resume
  // the standalone stream, end the session. Both are 2025-era session
  // operations and there is no session to do either to, so the handler answers
  // them `405`. They stay mounted here — rather than left to express's own
  // 404 — precisely so that the handler's 405 is what a client receives, and
  // so that an unauthenticated probe of either still meets the guard chain
  // first.
  //
  // The guard chain is unchanged and stays in this order: rate limiter (reject a
  // flood before spending a signature verify on it) → auth guard → the two
  // AsyncLocalStorage scopes → the handler.
  app.all(endpoint, ...guards, async (req, res): Promise<void> => {
    console.error(`[StreamableHTTP] ${req.method} ${endpoint} received`);

    // Extract per-request token from Authorization header (Bearer <token>)
    const authHeader = (req.headers['authorization'] as string) || '';
    const requestToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (requestToken) {
      console.error('[StreamableHTTP] Using per-request Bearer token');
    }

    // The integration marker is deliberately not read here. It used to be
    // captured once per session, and the session is gone; reading it per
    // request is the next change in this migration, which owns the test for it.
    // An empty scope means getIntegration() falls through to
    // QASE_MCP_INTEGRATION, exactly as it does on stdio.
    const integration = '';

    // Run the handler inside AsyncLocalStorage context so getApiClient() can read the token
    try {
      await requestTokenStorage.run(requestToken, () =>
        integrationStorage.run(integration, () =>
          // `req.auth` is the pass-through authInfo: the adapter forwards
          // whatever upstream middleware attached, and the handler never reads
          // a header or verifies a token itself. `req.body` is what
          // express.json() already parsed, so nothing re-reads the stream.
          nodeHandler(req, res, req.body),
        ),
      );
    } catch (error) {
      console.error('[StreamableHTTP] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  });

  // Start server and store reference to keep it alive
  const httpServer = app.listen(config.port, host, () => {
    console.error(`[StreamableHTTP] Server listening on http://${host}:${config.port}${endpoint}`);
    console.error(`[StreamableHTTP] Health check: http://${host}:${config.port}/health`);
  });

  // Handle server errors
  httpServer.on('error', (error: Error) => {
    console.error('[StreamableHTTP] Server error:', error);
  });

  // Handle client connections
  httpServer.on('connection', (socket) => {
    console.error(
      `[StreamableHTTP] New client connection from ${socket.remoteAddress}:${socket.remotePort}`,
    );
  });

  // Keep server reference alive (prevent garbage collection)
  (app as any)._httpServer = httpServer;

  return app;
}

import express, { Express } from 'express';
import { createJsonParseErrorHandler } from './json-parse-error.js';
import type http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { requestTokenStorage } from '../utils/auth-context.js';
import { integrationStorage } from '../utils/integration-context.js';
import { normalizeIntegrationMarker } from '../utils/integration-marker.js';
import { getMetrics } from '../cache/index.js';
import { createBearerRequiredGuard } from '../auth/bearer-guard.js';

export interface SSETransportConfig {
  port: number;
  host?: string;
  sseEndpoint?: string;
  messagesEndpoint?: string;
}

/** Normalised integration marker off a header or query value (integration-marker.ts). */
function readIntegrationMarker(value: unknown): string | undefined {
  return typeof value === 'string' ? normalizeIntegrationMarker(value) : undefined;
}

/** One open stream: its transport and the integration marker seen when it opened. */
interface SseSession {
  transport: SSEServerTransport;
  integration: string | undefined;
}

export function setupSSETransport(createServer: () => Server, config: SSETransportConfig): Express {
  const app = express();
  app.use(express.json());
  app.use(createJsonParseErrorHandler());

  const sseEndpoint = config.sseEndpoint || '/sse';
  const messagesEndpoint = config.messagesEndpoint || '/messages';
  const host = config.host || '0.0.0.0';

  // SSE has no OAuth wiring and is not getting any — the transport is
  // deprecated. What it does get is the floor: a caller must present a token,
  // so a request can no longer run under the operator's QASE_API_TOKEN.
  const requireBearer = createBearerRequiredGuard();

  // Keyed by the session id the SDK puts in the endpoint event it sends the
  // client, which the client then echoes as ?sessionId= on every POST. A single
  // `let transport` here used to mean the second client to connect took the
  // first one's stream.
  const sessions = new Map<string, SseSession>();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'sse' });
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(getMetrics().renderPrometheus());
  });

  // SSE endpoint for establishing connection
  app.get(sseEndpoint, requireBearer, (req, res) => {
    const integration =
      readIntegrationMarker(req.headers['x-qase-integration']) ??
      readIntegrationMarker(req.query.integration);
    const transport = new SSEServerTransport(messagesEndpoint, res);

    sessions.set(transport.sessionId, { transport, integration });
    console.error(`[SSE] Client connected (session ${transport.sessionId})`);

    res.on('close', () => {
      sessions.delete(transport.sessionId);
      console.error(`[SSE] Client disconnected (session ${transport.sessionId})`);
    });

    // A fresh Server per stream: Protocol.connect() stores the transport on the
    // instance, so sharing one Server between two clients would put them back
    // in the fight the session map exists to end.
    //
    // The catch matters: if transport.start() rejects (the client aborts the
    // GET, or any other SDK error), an unhandled rejection here would take
    // the whole process down on Node 22, the Dockerfile's base image, which
    // exits by default on an unhandled rejection.
    createServer()
      .connect(transport)
      .catch((error) => {
        sessions.delete(transport.sessionId);
        console.error(`[SSE] Failed to connect session ${transport.sessionId}:`, error);
      });
  });

  // Messages endpoint for receiving client messages
  app.post(messagesEndpoint, requireBearer, (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const session = sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Unknown or closed SSE session — reconnect to /sse' });
      return;
    }

    const authHeader = (req.headers['authorization'] as string) || '';
    const requestToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const integration =
      readIntegrationMarker(req.headers['x-qase-integration']) ?? session.integration ?? '';

    // `express.json()` above has already consumed the body, so it has to be
    // handed over — otherwise the SDK reads a spent stream and every call fails
    // with "stream is not readable".
    requestTokenStorage.run(requestToken, () =>
      integrationStorage.run(integration, () =>
        session.transport.handlePostMessage(req, res, req.body),
      ),
    );
  });

  // Start server
  const httpServer = app.listen(config.port, host, () => {
    console.error(`[SSE] Server listening on http://${host}:${config.port}${sseEndpoint}`);
    console.error(`[SSE] Health check: http://${host}:${config.port}/health`);
    console.error(
      '[SSE] WARNING: the SSE transport is deprecated (MCP spec 2025-03-26) and will be ' +
        'removed in 3.0. Use --transport streamable-http instead.',
    );
  });

  // Keep server reference alive (prevent garbage collection), same as streamable-http
  (app as unknown as { _httpServer: http.Server })._httpServer = httpServer;

  return app;
}

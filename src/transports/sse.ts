import express, { Express } from 'express';
import type http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { requestTokenStorage } from '../utils/auth-context.js';
import { integrationStorage } from '../utils/integration-context.js';
import { normalizeIntegrationMarker } from '../utils/integration-marker.js';
import { getMetrics } from '../cache/index.js';

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

export function setupSSETransport(server: Server, config: SSETransportConfig): Express {
  const app = express();
  app.use(express.json());

  const sseEndpoint = config.sseEndpoint || '/sse';
  const messagesEndpoint = config.messagesEndpoint || '/messages';
  const host = config.host || '0.0.0.0';

  let transport: SSEServerTransport | null = null;
  // This transport serves a single connection at a time, so the marker captured
  // when the stream is opened plays the role the per-session map plays in
  // streamable-http: it covers POSTs that cannot repeat the header.
  let connectionIntegration: string | undefined;

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
  app.get(sseEndpoint, (req, res) => {
    console.error('[SSE] Client connected');
    connectionIntegration =
      readIntegrationMarker(req.headers['x-qase-integration']) ??
      readIntegrationMarker(req.query.integration);
    transport = new SSEServerTransport(messagesEndpoint, res);
    server.connect(transport);
  });

  // Messages endpoint for receiving client messages
  app.post(messagesEndpoint, (req, res) => {
    if (!transport) {
      res.status(503).json({ error: 'No SSE connection established' });
      return;
    }
    const authHeader = (req.headers['authorization'] as string) || '';
    const requestToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const integration =
      readIntegrationMarker(req.headers['x-qase-integration']) ?? connectionIntegration ?? '';
    // `express.json()` above has already consumed the body, so it has to be
    // handed over — otherwise the SDK reads a spent stream and every call fails
    // with "stream is not readable".
    requestTokenStorage.run(requestToken, () =>
      integrationStorage.run(integration, () => transport!.handlePostMessage(req, res, req.body)),
    );
  });

  // Start server
  const httpServer = app.listen(config.port, host, () => {
    console.error(`[SSE] Server listening on http://${host}:${config.port}${sseEndpoint}`);
    console.error(`[SSE] Health check: http://${host}:${config.port}/health`);
  });

  // Keep server reference alive (prevent garbage collection), same as streamable-http
  (app as unknown as { _httpServer: http.Server })._httpServer = httpServer;

  return app;
}

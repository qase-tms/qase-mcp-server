import express, { Express } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export interface SSETransportConfig {
  port: number;
  host?: string;
  sseEndpoint?: string;
  messagesEndpoint?: string;
}

export function setupSSETransport(server: Server, config: SSETransportConfig): Express {
  const app = express();
  app.use(express.json());

  const sseEndpoint = config.sseEndpoint || '/sse';
  const messagesEndpoint = config.messagesEndpoint || '/messages';
  const host = config.host || '0.0.0.0';

  let transport: SSEServerTransport | null = null;

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'sse' });
  });

  // SSE endpoint for establishing connection
  app.get(sseEndpoint, (_req, res) => {
    console.error('[SSE] Client connected');
    transport = new SSEServerTransport(messagesEndpoint, res);
    server.connect(transport);
  });

  // Messages endpoint for receiving client messages
  app.post(messagesEndpoint, (req, res) => {
    if (transport) {
      transport.handlePostMessage(req, res);
    } else {
      res.status(503).json({ error: 'No SSE connection established' });
    }
  });

  // Start server
  app.listen(config.port, host, () => {
    console.error(`[SSE] Server listening on http://${host}:${config.port}${sseEndpoint}`);
    console.error(`[SSE] Health check: http://${host}:${config.port}/health`);
  });

  return app;
}

import express, { Express } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

export interface StreamableHttpConfig {
  port: number;
  host?: string;
  endpoint?: string;
}

// Helper to check if a request is an initialize request
function isInitializeRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && 'method' in body && body.method === 'initialize'
  );
}

export function setupStreamableHttpTransport(
  server: Server,
  config: StreamableHttpConfig,
): Express {
  const app = express();

  // CORS middleware for inspector
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    // Log all incoming requests for debugging
    console.error(`[StreamableHTTP] ${req.method} ${req.path}`, {
      headers: req.headers,
      query: req.query,
    });
    next();
  });

  app.use(express.json());

  const endpoint = config.endpoint || '/mcp';
  const host = config.host || '0.0.0.0';

  // Session management - store transport per session
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http' });
  });

  // MCP endpoint - DELETE for session cleanup
  app.delete(endpoint, async (req, res): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        error: 'Invalid or missing session ID',
      });
      return;
    }

    const transport = sessions.get(sessionId)!;

    try {
      await transport.close();
      sessions.delete(sessionId);
      console.error(`[StreamableHTTP] Session closed: ${sessionId}`);
      res.status(200).json({ status: 'session closed' });
    } catch (error) {
      console.error('[StreamableHTTP] Error closing session:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  });

  // MCP endpoint - GET for SSE streams (if needed)
  app.get(endpoint, async (req, res): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        error: 'Invalid or missing session ID',
      });
      return;
    }

    const transport = sessions.get(sessionId)!;

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('[StreamableHTTP] Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  });

  // MCP endpoint - POST for messages
  app.post(endpoint, async (req, res): Promise<void> => {
    console.error(`[StreamableHTTP] POST ${endpoint} received`, {
      sessionId: req.headers['mcp-session-id'],
      body: req.body,
    });

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing transport for this session
      transport = sessions.get(sessionId)!;
    } else if (isInitializeRequest(req.body)) {
      // This is an initialize request - create new session
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableJsonResponse: true,
      });

      // Store session
      sessions.set(newSessionId, transport);

      // Connect the MCP server to this transport
      await server.connect(transport);

      console.error(`[StreamableHTTP] New session created: ${newSessionId}`);
    } else {
      // Invalid request - has session ID but session not found
      res.status(400).json({
        error: 'Invalid request: session not found or not an initialize request',
      });
      return;
    }

    // Handle the request through the transport
    try {
      await transport.handleRequest(req, res, req.body);
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

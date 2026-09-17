import type { ErrorRequestHandler } from 'express';

/**
 * Turn a body-parser failure into a JSON-RPC parse error.
 *
 * Without this, express's default handler answers an unparsable body with an
 * HTML page whose <pre> block carries the SyntaxError stack — absolute
 * node_modules paths and dependency internals — and it does so before any auth
 * guard runs, so an unauthenticated caller can read it. Mount it directly after
 * express.json() on every transport that parses a body.
 */
export function createJsonParseErrorHandler(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    const isBodyParseError =
      err instanceof SyntaxError && 'body' in (err as SyntaxError & { body?: unknown });

    if (!isBodyParseError || res.headersSent) {
      next(err);
      return;
    }

    console.error('[Transport] Rejected an unparsable JSON body');
    res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  };
}

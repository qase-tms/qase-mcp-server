import type { ErrorRequestHandler } from 'express';

/**
 * Turn a body-parser failure into a JSON-RPC error.
 *
 * Without this, express's default handler answers a bad body with an HTML page
 * whose <pre> block carries the error stack — absolute node_modules paths and
 * dependency internals — and it does so before any auth guard runs, so an
 * unauthenticated caller can read it. Mount it directly after express.json()
 * on every transport that parses a body.
 *
 * Two failures arrive here: a body that is not JSON (answered -32700, the MCP
 * answer to unparsable input) and a body past the size cap (answered -32600 on
 * HTTP 413 — the request is well-formed, it is simply too large to accept).
 */
export function createJsonParseErrorHandler(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const isBodyParseError =
      err instanceof SyntaxError && 'body' in (err as SyntaxError & { body?: unknown });
    // body-parser tags the size failure on the error itself; the HTTP status it
    // carries is 413, which we keep.
    const isTooLarge = (err as { type?: string } | null)?.type === 'entity.too.large';

    if (isBodyParseError) {
      console.error('[Transport] Rejected an unparsable JSON body');
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    if (isTooLarge) {
      console.error('[Transport] Rejected a request body past the size limit');
      res.status(413).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message:
            'Request body too large. On a network transport the body carries base64 file ' +
            'content; send a smaller file, or run the server over stdio and pass file_path.',
        },
      });
      return;
    }

    next(err);
  };
}

// src/auth/bearer-guard.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Minimal auth guard for network transports running without OAuth.
 *
 * Requires a non-empty `Authorization: Bearer <token>` and nothing more — the
 * token's validity is established by the Qase API, which rejects a bad one.
 * What this closes is the silent fallback in `getEffectiveToken()`: without it
 * a request that presents no token at all runs under the operator's
 * `QASE_API_TOKEN`, so anyone who can reach the port acts as the operator.
 *
 * Unlike `createMcpGuard`, the 401 carries NO `WWW-Authenticate` header. That
 * header triggers OAuth discovery, and this guard only runs where OAuth is
 * disabled — a client sent down that path would chase metadata that does not
 * exist and fail somewhere inside the OAuth flow, instead of reading a plain
 * instruction to send a token.
 */
export function createBearerRequiredGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = (req.headers['authorization'] as string) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      res.status(401).json({
        error: 'invalid_token',
        error_description:
          'Missing bearer token. Send your Qase API token as "Authorization: Bearer <token>". ' +
          "Network transports no longer fall back to the server's QASE_API_TOKEN.",
      });
      return;
    }

    next();
  };
}

// src/auth/mcp-guard.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { isJwt } from './token-type.js';
import type { JwksVerifier } from './jwks-verifier.js';
import type { OAuthConfig } from './oauth-config.js';

/**
 * Dual-mode auth guard for the `/mcp` endpoint.
 *
 * - No bearer token        → 401 + WWW-Authenticate (triggers OAuth discovery).
 * - JWT (3 segments)       → validated against JWKS; 401 on failure.
 * - Opaque (legacy) token  → passed through unchanged (no JWKS validation).
 *
 * The token itself is forwarded by the existing transport handler, which reads
 * the Authorization header and stores it in requestTokenStorage.
 */
export function createMcpGuard(verifier: JwksVerifier, config: OAuthConfig): RequestHandler {
  const resourceMetadataUrl = `${config.resourceUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl}"`;

  const unauthorized = (res: Response, description: string): void => {
    res.set('WWW-Authenticate', challenge);
    res.status(401).json({ error: 'invalid_token', error_description: description });
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = (req.headers['authorization'] as string) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      unauthorized(res, 'Missing bearer token');
      return;
    }

    if (isJwt(token)) {
      try {
        await verifier.verifyJwt(token);
      } catch {
        unauthorized(res, 'JWT validation failed');
        return;
      }
    }

    next();
  };
}

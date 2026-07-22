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
  // RFC 9728 path-aware discovery: the metadata URL must carry the resource's
  // path so clients that use the full endpoint URL as the resource identifier
  // (e.g. VS Code) resolve the matching document. Origin comes from publicUrl
  // (the reachable server), the path segment from resourceUrl (`/mcp`).
  const origin = config.publicUrl.replace(/\/$/, '');
  const resourcePath = new URL(config.resourceUrl).pathname;
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource${
    resourcePath === '/' ? '' : resourcePath
  }`;
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

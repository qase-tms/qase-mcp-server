// src/auth/jwks-verifier.ts
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthConfig } from './oauth-config.js';

export interface JwksVerifier {
  verifyJwt(token: string): Promise<AuthInfo>;
}

/**
 * Build a JWKS-backed access-token verifier. The remote key set is cached for
 * one hour. `keyResolver` may be injected in tests (e.g. createLocalJWKSet).
 *
 * Signature, `exp`, `nbf`, `iss`, and `aud` are all validated by `jwtVerify`;
 * it throws on any mismatch.
 */
export function createJwksVerifier(
  config: OAuthConfig,
  keyResolver?: JWTVerifyGetKey,
): JwksVerifier {
  const resolve: JWTVerifyGetKey =
    keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl), { cacheMaxAge: 3600_000 });

  return {
    async verifyJwt(token: string): Promise<AuthInfo> {
      const { payload } = await jwtVerify(token, resolve, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: config.jwtAlgorithms,
      });

      const scopes =
        typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];

      return {
        token,
        clientId: (payload.client_id as string) ?? (payload.azp as string) ?? '',
        scopes,
        expiresAt: payload.exp,
        resource: new URL(config.audience),
        extra: { sub: payload.sub },
      };
    },
  };
}

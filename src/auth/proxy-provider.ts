// src/auth/proxy-provider.ts
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthConfig } from './oauth-config.js';
import type { JwksVerifier } from './jwks-verifier.js';

/**
 * Build a ProxyOAuthServerProvider that transparently forwards /authorize,
 * /token, /register, and /revoke to auth.qase.io. Access tokens are verified
 * locally with the JWKS verifier (defence-in-depth).
 *
 * Dynamic client registration is proxied upstream, so auth.qase.io is the
 * source of truth for clients. `getClient` echoes a permissive record so the
 * SDK's redirect-uri validation in /authorize passes for proxied clients.
 */
export function createProxyProvider(
  config: OAuthConfig,
  verifier: JwksVerifier,
): ProxyOAuthServerProvider {
  return new ProxyOAuthServerProvider({
    endpoints: {
      authorizationUrl: config.authorizationUrl,
      tokenUrl: config.tokenUrl,
      registrationUrl: config.registrationUrl,
      revocationUrl: config.revocationUrl,
    },
    verifyAccessToken: (token) => verifier.verifyJwt(token),
    getClient: async (clientId): Promise<OAuthClientInformationFull> => ({
      client_id: clientId,
      redirect_uris: [],
    }),
  });
}

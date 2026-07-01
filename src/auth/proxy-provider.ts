// src/auth/proxy-provider.ts
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { OAuthConfig } from './oauth-config.js';
import type { JwksVerifier } from './jwks-verifier.js';
import { authorizeRedirectUriStorage } from './client-context.js';

/**
 * Wraps fetch so the DCR registration response is schema-valid for the SDK.
 * The Qase AS returns `client_secret: null` for public clients, but the SDK's
 * OAuthClientInformationFullSchema expects a string or an omitted field. Strip the
 * null field (RFC 7591: client_secret is optional / omitted for public clients).
 * Only the registration endpoint's successful JSON response is touched; all other
 * requests pass through unchanged.
 */
export function createRegistrationSanitizingFetch(
  registrationUrl: string,
  underlyingFetch: FetchLike = globalThis.fetch,
): FetchLike {
  return async (url, init) => {
    const res = await underlyingFetch(url, init);
    if (String(url) !== registrationUrl || !res.ok) {
      return res;
    }
    const data = await res
      .clone()
      .json()
      .catch(() => null);
    if (
      data &&
      typeof data === 'object' &&
      (data as Record<string, unknown>).client_secret === null
    ) {
      delete (data as Record<string, unknown>).client_secret;
      return new Response(JSON.stringify(data), {
        status: res.status,
        statusText: res.statusText,
        headers: { 'content-type': 'application/json' },
      });
    }
    return res;
  };
}

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
    fetch: createRegistrationSanitizingFetch(config.registrationUrl),
    verifyAccessToken: (token) => verifier.verifyJwt(token),
    getClient: async (clientId): Promise<OAuthClientInformationFull> => {
      // Transparent proxy: echo the request's redirect_uri so the SDK's local
      // /authorize check passes. auth.qase.io is the authoritative validator.
      const redirectUri = authorizeRedirectUriStorage.getStore();
      return {
        client_id: clientId,
        redirect_uris: redirectUri ? [redirectUri] : [],
      };
    },
  });
}

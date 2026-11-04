// src/auth/proxy-provider.ts
import type { OAuthClientInformationFull, FetchLike } from '@modelcontextprotocol/server';
import {
  CustomOAuthError,
  ProxyOAuthServerProvider,
} from '@modelcontextprotocol/server-legacy/auth';

import type { OAuthConfig } from './oauth-config.js';
import type { JwksVerifier } from './jwks-verifier.js';
import { authorizeRedirectUriStorage } from './client-context.js';

/**
 * Wraps fetch to adapt both the outgoing DCR request and the incoming registration
 * response so they are compatible with the Qase AS and the SDK schema.
 *
 * Request side: the Qase AS only supports token_endpoint_auth_method "none" and
 * "client_secret_basic". Claude registers with "client_secret_post", which the AS
 * rejects (400 invalid_client_metadata). Rewrite it to "none" (public + PKCE) — the
 * recommended model for browser MCP clients, and the proxy never uses HTTP Basic.
 *
 * Response side: the Qase AS returns `client_secret: null` for public clients, but the
 * SDK's OAuthClientInformationFullSchema expects a string or an omitted field. Strip the
 * null field (RFC 7591: client_secret is optional / omitted for public clients).
 *
 * Rejections: the SDK turns any non-ok registration response into an opaque
 * `500 server_error`. A 400 with an RFC 7591 error body is rethrown as that same
 * OAuth error, so proxied clients see e.g. `invalid_redirect_uri` like direct ones.
 *
 * Only the registration endpoint is touched; all other requests pass through unchanged.
 */
export function createRegistrationSanitizingFetch(
  registrationUrl: string,
  underlyingFetch: FetchLike = globalThis.fetch,
): FetchLike {
  return async (url, init) => {
    if (String(url) !== registrationUrl) {
      return underlyingFetch(url, init);
    }

    const res = await underlyingFetch(url, rewriteUnsupportedAuthMethod(init));
    await throwUpstreamRegistrationError(res);
    return res.ok ? stripNullClientSecret(res) : res;
  };
}

function rewriteUnsupportedAuthMethod(init: RequestInit | undefined): RequestInit | undefined {
  if (init?.body == null) {
    return init;
  }
  try {
    const reqBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (reqBody.token_endpoint_auth_method === 'client_secret_post') {
      reqBody.token_endpoint_auth_method = 'none';
      return { ...init, body: JSON.stringify(reqBody) };
    }
  } catch {
    // Non-JSON body — forward unchanged.
  }
  return init;
}

async function throwUpstreamRegistrationError(res: Response): Promise<void> {
  if (res.status !== 400) {
    return;
  }
  const error = await readJsonObject(res);
  if (typeof error?.error === 'string') {
    const description = typeof error.error_description === 'string' ? error.error_description : '';
    throw new CustomOAuthError(error.error, description);
  }
}

async function stripNullClientSecret(res: Response): Promise<Response> {
  const data = await readJsonObject(res);
  if (data?.client_secret !== null) {
    return res;
  }
  delete data.client_secret;
  return new Response(JSON.stringify(data), {
    status: res.status,
    statusText: res.statusText,
    headers: { 'content-type': 'application/json' },
  });
}

async function readJsonObject(res: Response): Promise<Record<string, unknown> | null> {
  const data: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
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

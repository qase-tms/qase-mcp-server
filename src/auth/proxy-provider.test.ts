// src/auth/proxy-provider.test.ts
import { describe, it, expect } from '@jest/globals';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { OAuthClientInformationFullSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createProxyProvider, createRegistrationSanitizingFetch } from './proxy-provider.js';
import type { JwksVerifier } from './jwks-verifier.js';
import { getOAuthConfig } from './oauth-config.js';
import { authorizeRedirectUriStorage } from './client-context.js';

const verifier: JwksVerifier = {
  verifyJwt: async (token) => ({ token, clientId: 'cli-1', scopes: ['read'], expiresAt: 9999999999 }),
};

const REG_URL = 'https://auth.qase.io/oauth/register';
const publicClientResponse = {
  client_id: 'abc-123',
  client_id_issued_at: 1782890202,
  client_secret: null,
  client_secret_expires_at: 0,
  client_name: 'n',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createRegistrationSanitizingFetch', () => {
  it('strips null client_secret from the registration response so the SDK schema parses', async () => {
    const fake = async () => jsonResponse(publicClientResponse);
    const f = createRegistrationSanitizingFetch(REG_URL, fake);
    const res = await f(REG_URL, { method: 'POST' });
    const data = await res.json();
    expect('client_secret' in data).toBe(false);
    expect(OAuthClientInformationFullSchema.safeParse(data).success).toBe(true);
  });

  it('passes through a registration response that has a real client_secret', async () => {
    const withSecret = { ...publicClientResponse, client_secret: 'shhh' };
    const fake = async () => jsonResponse(withSecret);
    const f = createRegistrationSanitizingFetch(REG_URL, fake);
    const data = await (await f(REG_URL, {})).json();
    expect(data.client_secret).toBe('shhh');
  });

  it('does not touch responses from other endpoints', async () => {
    const tokenBody = { access_token: 'x', token_type: 'Bearer', client_secret: null };
    const fake = async () => jsonResponse(tokenBody);
    const f = createRegistrationSanitizingFetch(REG_URL, fake);
    const data = await (await f('https://auth.qase.io/oauth/token', {})).json();
    expect(data.client_secret).toBeNull(); // untouched — only /register is sanitized
  });

  it('passes through non-ok responses unchanged', async () => {
    const fake = async () => jsonResponse({ error: 'bad' }, 400);
    const f = createRegistrationSanitizingFetch(REG_URL, fake);
    const res = await f(REG_URL, {});
    expect(res.status).toBe(400);
  });
});

describe('createProxyProvider', () => {
  it('builds a ProxyOAuthServerProvider', () => {
    const provider = createProxyProvider(getOAuthConfig(), verifier);
    expect(provider).toBeInstanceOf(ProxyOAuthServerProvider);
  });

  it('delegates verifyAccessToken to the JWKS verifier', async () => {
    const provider = createProxyProvider(getOAuthConfig(), verifier);
    const info = await provider.verifyAccessToken('aaa.bbb.ccc');
    expect(info.clientId).toBe('cli-1');
  });

  it('getClient returns empty redirect_uris when no request context is set', async () => {
    const provider = createProxyProvider(getOAuthConfig(), verifier);
    const client = await provider.clientsStore.getClient('some-client-id');
    expect(client?.client_id).toBe('some-client-id');
    expect(client?.redirect_uris).toEqual([]);
  });

  it('getClient echoes the per-request redirect_uri', async () => {
    const provider = createProxyProvider(getOAuthConfig(), verifier);
    const client = await authorizeRedirectUriStorage.run('https://client.example/cb', () =>
      provider.clientsStore.getClient('cli-9'),
    );
    expect(client?.client_id).toBe('cli-9');
    expect(client?.redirect_uris).toEqual(['https://client.example/cb']);
  });
});

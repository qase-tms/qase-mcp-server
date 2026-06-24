// src/auth/proxy-provider.test.ts
import { describe, it, expect } from '@jest/globals';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { createProxyProvider } from './proxy-provider.js';
import type { JwksVerifier } from './jwks-verifier.js';
import { getOAuthConfig } from './oauth-config.js';
import { authorizeRedirectUriStorage } from './client-context.js';

const verifier: JwksVerifier = {
  verifyJwt: async (token) => ({ token, clientId: 'cli-1', scopes: ['read'], expiresAt: 9999999999 }),
};

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

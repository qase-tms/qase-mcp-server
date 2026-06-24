// src/auth/proxy-provider.test.ts
import { describe, it, expect } from '@jest/globals';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { createProxyProvider } from './proxy-provider.js';
import type { JwksVerifier } from './jwks-verifier.js';
import { getOAuthConfig } from './oauth-config.js';

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

  it('returns a client record from getClient', async () => {
    const provider = createProxyProvider(getOAuthConfig(), verifier);
    const client = await provider.clientsStore.getClient('some-client-id');
    expect(client?.client_id).toBe('some-client-id');
  });
});

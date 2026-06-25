// src/auth/jwks-verifier.test.ts
import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { createJwksVerifier } from './jwks-verifier.js';
import type { OAuthConfig } from './oauth-config.js';

const config: OAuthConfig = {
  enabled: true,
  authorizationUrl: 'https://auth.qase.io/oauth/authorize',
  tokenUrl: 'https://auth.qase.io/oauth/token',
  registrationUrl: 'https://auth.qase.io/oauth/register',
  revocationUrl: 'https://auth.qase.io/oauth/revoke',
  jwksUrl: 'https://auth.qase.io/oauth/jwks.json',
  issuer: 'https://auth.qase.io',
  audience: 'https://mcp.qase.io',
  jwtAlgorithms: ['RS256'],
  resourceUrl: 'https://mcp.qase.io',
  publicUrl: 'https://mcp.qase.io',
};

let privateKey: CryptoKey;
let resolver: JWTVerifyGetKey;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey as CryptoKey;
  const jwk = await exportJWK(kp.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  resolver = createLocalJWKSet({ keys: [jwk] });
});

function sign(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer(opts.iss ?? config.issuer)
    .setAudience(opts.aud ?? config.audience)
    .setExpirationTime(opts.exp ?? '1h')
    .sign(privateKey);
}

describe('createJwksVerifier', () => {
  it('returns AuthInfo for a valid token', async () => {
    const token = await sign({ client_id: 'cli-123', scope: 'read write', sub: 'user-1' });
    const info = await createJwksVerifier(config, resolver).verifyJwt(token);
    expect(info.token).toBe(token);
    expect(info.clientId).toBe('cli-123');
    expect(info.scopes).toEqual(['read', 'write']);
    expect(typeof info.expiresAt).toBe('number');
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await sign({}, { iss: 'https://evil.example.com' });
    await expect(createJwksVerifier(config, resolver).verifyJwt(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await sign({}, { aud: 'https://wrong.example.com' });
    await expect(createJwksVerifier(config, resolver).verifyJwt(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await sign({}, { exp: '-1h' });
    await expect(createJwksVerifier(config, resolver).verifyJwt(token)).rejects.toThrow();
  });

  it('rejects a token whose nbf is in the future', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setNotBefore('1h')
      .setExpirationTime('2h')
      .sign(privateKey);
    await expect(createJwksVerifier(config, resolver).verifyJwt(token)).rejects.toThrow();
  });
});

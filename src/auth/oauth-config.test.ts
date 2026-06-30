import { describe, it, expect, afterEach } from '@jest/globals';
import { getOAuthConfig } from './oauth-config.js';

const OAUTH_KEYS = [
  'QASE_OAUTH_ENABLED', 'QASE_OAUTH_AUTHORIZATION_URL', 'QASE_OAUTH_TOKEN_URL',
  'QASE_OAUTH_REGISTRATION_URL', 'QASE_OAUTH_REVOCATION_URL', 'QASE_OAUTH_JWKS_URL',
  'QASE_OAUTH_ISSUER', 'QASE_OAUTH_AUDIENCE', 'QASE_OAUTH_RESOURCE_URL',
  'QASE_OAUTH_JWT_ALGORITHMS', 'QASE_OAUTH_PUBLIC_URL',
];

describe('getOAuthConfig', () => {
  afterEach(() => {
    for (const k of OAUTH_KEYS) delete process.env[k];
  });

  it('returns production defaults', () => {
    const c = getOAuthConfig();
    expect(c.enabled).toBe(true);
    expect(c.authorizationUrl).toBe('https://auth.qase.io/oauth/authorize');
    expect(c.tokenUrl).toBe('https://auth.qase.io/oauth/token');
    expect(c.registrationUrl).toBe('https://auth.qase.io/oauth/register');
    expect(c.revocationUrl).toBe('');
    expect(c.jwksUrl).toBe('https://auth.qase.io/oauth/jwks.json');
    expect(c.issuer).toBe('https://auth.qase.io');
    expect(c.audience).toBe('https://mcp.qase.io');
    expect(c.jwtAlgorithms).toEqual(['RS256']);
    expect(c.resourceUrl).toBe('https://mcp.qase.io');
    expect(c.publicUrl).toBe('https://mcp.qase.io');
  });

  it('publicUrl defaults to resourceUrl and can be overridden independently', () => {
    process.env.QASE_OAUTH_PUBLIC_URL = 'http://localhost:3000';
    const c = getOAuthConfig();
    expect(c.publicUrl).toBe('http://localhost:3000');
    expect(c.resourceUrl).toBe('https://mcp.qase.io'); // resource identity unchanged
    expect(c.audience).toBe('https://mcp.qase.io');
  });

  it('is disabled when QASE_OAUTH_ENABLED is "false"', () => {
    process.env.QASE_OAUTH_ENABLED = 'false';
    expect(getOAuthConfig().enabled).toBe(false);
  });

  it('honors env overrides', () => {
    process.env.QASE_OAUTH_ISSUER = 'https://auth.staging.qase.io';
    process.env.QASE_OAUTH_AUDIENCE = 'https://mcp.staging.qase.io';
    const c = getOAuthConfig();
    expect(c.issuer).toBe('https://auth.staging.qase.io');
    expect(c.audience).toBe('https://mcp.staging.qase.io');
  });

  it('parses comma-separated jwt algorithms override', () => {
    process.env.QASE_OAUTH_JWT_ALGORITHMS = 'RS256, ES256';
    expect(getOAuthConfig().jwtAlgorithms).toEqual(['RS256', 'ES256']);
  });

  it('enables revocation only when QASE_OAUTH_REVOCATION_URL is set', () => {
    expect(getOAuthConfig().revocationUrl).toBe('');
    process.env.QASE_OAUTH_REVOCATION_URL = 'https://auth.qase.io/oauth/revoke';
    expect(getOAuthConfig().revocationUrl).toBe('https://auth.qase.io/oauth/revoke');
  });
});

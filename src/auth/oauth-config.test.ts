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
    // The AS canonicalizes the token audience to the origin with a trailing slash.
    expect(c.audience).toEqual(['https://mcp.qase.io/', 'https://mcp.qase.io/mcp']);
    expect(c.jwtAlgorithms).toEqual(['RS256']);
    // resourceUrl is the RFC 9728 identifier for the /mcp endpoint (path-aware).
    expect(c.resourceUrl).toBe('https://mcp.qase.io/mcp');
    // publicUrl is the origin, decoupled from resourceUrl (no /mcp path).
    expect(c.publicUrl).toBe('https://mcp.qase.io');
  });

  it('publicUrl defaults to the ORIGIN of resourceUrl (decoupled, no path leak)', () => {
    process.env.QASE_OAUTH_RESOURCE_URL = 'https://mcp.example.io/mcp';
    const c = getOAuthConfig();
    expect(c.resourceUrl).toBe('https://mcp.example.io/mcp');
    expect(c.publicUrl).toBe('https://mcp.example.io'); // origin only, /mcp dropped
  });

  it('publicUrl can be overridden independently of resourceUrl', () => {
    process.env.QASE_OAUTH_PUBLIC_URL = 'http://localhost:3000';
    const c = getOAuthConfig();
    expect(c.publicUrl).toBe('http://localhost:3000');
    expect(c.resourceUrl).toBe('https://mcp.qase.io/mcp'); // resource identity unchanged
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
    expect(c.audience).toEqual(['https://mcp.staging.qase.io']);
  });

  it('parses comma-separated jwt algorithms override', () => {
    process.env.QASE_OAUTH_JWT_ALGORITHMS = 'RS256, ES256';
    expect(getOAuthConfig().jwtAlgorithms).toEqual(['RS256', 'ES256']);
  });

  it('parses comma-separated audiences (multiple MCP clients)', () => {
    process.env.QASE_OAUTH_AUDIENCE = 'https://mcp.qase.io, https://mcp.qase.io/mcp';
    expect(getOAuthConfig().audience).toEqual(['https://mcp.qase.io', 'https://mcp.qase.io/mcp']);
  });

  it('enables revocation only when QASE_OAUTH_REVOCATION_URL is set', () => {
    expect(getOAuthConfig().revocationUrl).toBe('');
    process.env.QASE_OAUTH_REVOCATION_URL = 'https://auth.qase.io/oauth/revoke';
    expect(getOAuthConfig().revocationUrl).toBe('https://auth.qase.io/oauth/revoke');
  });
});

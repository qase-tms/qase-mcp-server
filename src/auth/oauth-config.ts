export interface OAuthConfig {
  enabled: boolean;
  authorizationUrl: string;
  tokenUrl: string;
  registrationUrl: string;
  revocationUrl: string;
  jwksUrl: string;
  issuer: string;
  /**
   * Accepted JWT `aud` values. Multiple are supported because different MCP
   * clients derive the RFC 8707 resource indicator differently (e.g. Claude
   * sends `https://mcp.qase.io`, Codex sends the endpoint `https://mcp.qase.io/mcp`),
   * and the AS mints the token audience from that resource. A token is accepted
   * if its `aud` matches any entry. Configured via comma-separated QASE_OAUTH_AUDIENCE.
   */
  audience: string[];
  jwtAlgorithms: string[];
  resourceUrl: string;
  publicUrl: string;
}

/**
 * Read OAuth configuration from the environment, falling back to Qase
 * production defaults. OAuth is enabled unless explicitly disabled.
 */
export function getOAuthConfig(): OAuthConfig {
  const env = process.env;
  const resourceUrl = env.QASE_OAUTH_RESOURCE_URL ?? 'https://mcp.qase.io';
  return {
    enabled: env.QASE_OAUTH_ENABLED !== 'false',
    authorizationUrl: env.QASE_OAUTH_AUTHORIZATION_URL ?? 'https://auth.qase.io/oauth/authorize',
    tokenUrl: env.QASE_OAUTH_TOKEN_URL ?? 'https://auth.qase.io/oauth/token',
    registrationUrl: env.QASE_OAUTH_REGISTRATION_URL ?? 'https://auth.qase.io/oauth/register',
    revocationUrl: env.QASE_OAUTH_REVOCATION_URL ?? '',
    jwksUrl: env.QASE_OAUTH_JWKS_URL ?? 'https://auth.qase.io/oauth/jwks.json',
    issuer: env.QASE_OAUTH_ISSUER ?? 'https://auth.qase.io',
    audience: (env.QASE_OAUTH_AUDIENCE ?? 'https://mcp.qase.io')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    jwtAlgorithms: (env.QASE_OAUTH_JWT_ALGORITHMS ?? 'RS256')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    resourceUrl,
    publicUrl: env.QASE_OAUTH_PUBLIC_URL ?? resourceUrl,
  };
}

export interface OAuthConfig {
  enabled: boolean;
  authorizationUrl: string;
  tokenUrl: string;
  registrationUrl: string;
  revocationUrl: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
  resourceUrl: string;
}

/**
 * Read OAuth configuration from the environment, falling back to Qase
 * production defaults. OAuth is enabled unless explicitly disabled.
 */
export function getOAuthConfig(): OAuthConfig {
  const env = process.env;
  return {
    enabled: env.QASE_OAUTH_ENABLED !== 'false',
    authorizationUrl: env.QASE_OAUTH_AUTHORIZATION_URL ?? 'https://auth.qase.io/oauth/authorize',
    tokenUrl: env.QASE_OAUTH_TOKEN_URL ?? 'https://auth.qase.io/oauth/token',
    registrationUrl: env.QASE_OAUTH_REGISTRATION_URL ?? 'https://auth.qase.io/oauth/register',
    revocationUrl: env.QASE_OAUTH_REVOCATION_URL ?? 'https://auth.qase.io/oauth/revoke',
    jwksUrl: env.QASE_OAUTH_JWKS_URL ?? 'https://auth.qase.io/oauth/jwks.json',
    issuer: env.QASE_OAUTH_ISSUER ?? 'https://auth.qase.io',
    audience: env.QASE_OAUTH_AUDIENCE ?? 'https://mcp.qase.io',
    resourceUrl: env.QASE_OAUTH_RESOURCE_URL ?? 'https://mcp.qase.io',
  };
}

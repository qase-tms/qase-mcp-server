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
  /**
   * The RFC 9728 resource identifier for the protected `/mcp` endpoint, e.g.
   * `https://mcp.qase.io/mcp`. Modern clients (VS Code) use the FULL endpoint
   * URL as the resource identifier and do path-aware metadata discovery, so
   * this carries the `/mcp` path. Drives the path-aware protected-resource
   * metadata document + the WWW-Authenticate challenge path.
   */
  resourceUrl: string;
  /**
   * The public ORIGIN the server is reached at, e.g. `https://mcp.qase.io`
   * (no path). This is the OAuth proxy base — `/authorize`, `/token`,
   * `/register` and the AS metadata are mounted here. Kept decoupled from
   * `resourceUrl` so the `/mcp` path on the resource identifier never leaks
   * into the proxy endpoint paths.
   */
  publicUrl: string;
}

/**
 * Read OAuth configuration from the environment, falling back to Qase
 * production defaults. OAuth is enabled unless explicitly disabled.
 */
export function getOAuthConfig(): OAuthConfig {
  const env = process.env;
  const resourceUrl = env.QASE_OAUTH_RESOURCE_URL ?? 'https://mcp.qase.io/mcp';
  return {
    enabled: env.QASE_OAUTH_ENABLED !== 'false',
    authorizationUrl: env.QASE_OAUTH_AUTHORIZATION_URL ?? 'https://auth.qase.io/oauth/authorize',
    tokenUrl: env.QASE_OAUTH_TOKEN_URL ?? 'https://auth.qase.io/oauth/token',
    registrationUrl: env.QASE_OAUTH_REGISTRATION_URL ?? 'https://auth.qase.io/oauth/register',
    revocationUrl: env.QASE_OAUTH_REVOCATION_URL ?? '',
    jwksUrl: env.QASE_OAUTH_JWKS_URL ?? 'https://auth.qase.io/oauth/jwks.json',
    issuer: env.QASE_OAUTH_ISSUER ?? 'https://auth.qase.io',
    // The AS canonicalizes the token audience to the origin WITH a trailing
    // slash (`https://mcp.qase.io/`), regardless of which resource variant the
    // client sent, so that value MUST be accepted. The `/mcp` form is kept for
    // defense in depth. Override with comma-separated QASE_OAUTH_AUDIENCE.
    audience: (env.QASE_OAUTH_AUDIENCE ?? 'https://mcp.qase.io/,https://mcp.qase.io/mcp')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    jwtAlgorithms: (env.QASE_OAUTH_JWT_ALGORITHMS ?? 'RS256')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    resourceUrl,
    // Decoupled from resourceUrl: default to its ORIGIN so the proxy base never
    // inherits the `/mcp` path. Override independently with QASE_OAUTH_PUBLIC_URL.
    publicUrl: env.QASE_OAUTH_PUBLIC_URL ?? new URL(resourceUrl).origin,
  };
}

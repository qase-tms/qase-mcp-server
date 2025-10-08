/**
 * Qase API Client Configuration
 *
 * Provides a singleton instance of the Qase API client with support for:
 * - Token-based authentication
 * - Custom enterprise domains
 * - Environment-based configuration
 */

import { QaseApi } from 'qaseio';

/**
 * Configuration for the Qase API client
 */
interface ApiClientConfig {
  token: string;
  domain: string;
  host: string;
}

/**
 * Get API client configuration from environment variables
 */
function getConfig(): ApiClientConfig {
  const token = process.env.QASE_API_TOKEN;

  if (!token) {
    throw new Error(
      'QASE_API_TOKEN environment variable is required. ' +
        'Get your token from: https://app.qase.io/user/api/token',
    );
  }

  const domain = process.env.QASE_API_DOMAIN || 'api.qase.io';

  // Validate domain format (should not include protocol or path)
  if (domain.includes('://') || domain.includes('/')) {
    throw new Error(
      'QASE_API_DOMAIN should only contain the domain name (e.g., api.qase.io), ' +
        'not the full URL with protocol or path',
    );
  }

  const host = `https://${domain}/v1`;

  return { token, domain, host };
}

/**
 * Singleton API client instance
 */
let clientInstance: QaseApi | null = null;

/**
 * Get or create the Qase API client instance
 *
 * @returns Configured QaseApi instance
 * @throws Error if QASE_API_TOKEN is not set
 */
export function getApiClient(): QaseApi {
  if (!clientInstance) {
    const config = getConfig();

    clientInstance = new QaseApi({
      token: config.token,
      host: config.host,
    });
  }

  return clientInstance;
}

/**
 * Reset the client instance (useful for testing)
 * @internal
 */
export function resetClientInstance(): void {
  clientInstance = null;
}

// Re-export types from qaseio for convenience
export type { QaseApi } from 'qaseio';

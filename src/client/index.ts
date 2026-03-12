/**
 * Qase API Client Configuration
 *
 * Provides a singleton instance of the Qase API client with support for:
 * - Token-based authentication
 * - Per-request Bearer token authentication
 * - Custom enterprise domains
 * - Environment-based configuration
 *
 * Also provides direct API call helper for endpoints not exposed by the SDK.
 */

import { QaseApi } from 'qaseio';
import axios, { AxiosRequestConfig } from 'axios';
import { requestTokenStorage } from '../utils/auth-context.js';

/**
 * Configuration for the Qase API client
 */
interface ApiClientConfig {
  token: string;
  host: string;
}

/**
 * Get validated API host from QASE_API_DOMAIN env var.
 */
function getHost(): string {
  const domain = process.env.QASE_API_DOMAIN || 'api.qase.io';

  if (domain.includes('://') || domain.includes('/')) {
    throw new Error(
      'QASE_API_DOMAIN should only contain the domain name (e.g., api.qase.io), ' +
        'not the full URL with protocol or path',
    );
  }

  return `https://${domain}`;
}

/**
 * Get the effective API token for the current request.
 *
 * Priority:
 *   1. Per-request Bearer token from Authorization header (AsyncLocalStorage)
 *   2. Shared QASE_API_TOKEN environment variable
 */
function getEffectiveToken(): string {
  const requestToken = requestTokenStorage.getStore();
  if (requestToken) {
    return requestToken;
  }

  const envToken = process.env.QASE_API_TOKEN;
  if (!envToken) {
    throw new Error(
      'QASE_API_TOKEN environment variable is required. ' +
        'Get your token from: https://app.qase.io/user/api/token',
    );
  }
  return envToken;
}

/**
 * Get full API client config (token + host).
 */
function getConfig(): ApiClientConfig {
  return { token: getEffectiveToken(), host: getHost() };
}

/**
 * Singleton API client instance (used for shared QASE_API_TOKEN fallback).
 */
let clientInstance: QaseApi | null = null;

/**
 * Get or create the Qase API client instance.
 *
 * Auth priority:
 *   1. Per-request Bearer token from Authorization header (set via AsyncLocalStorage)
 *      → creates a fresh QaseApi instance with the user's own token
 *   2. Shared QASE_API_TOKEN env var (singleton, read-only fallback)
 *
 * @returns Configured QaseApi instance
 * @throws Error if neither a request token nor QASE_API_TOKEN is available
 */
export function getApiClient(): QaseApi {
  const requestToken = requestTokenStorage.getStore();
  if (requestToken) {
    return new QaseApi({ token: requestToken, host: getHost() });
  }

  if (!clientInstance) {
    const config = getConfig();
    clientInstance = new QaseApi({ token: config.token, host: config.host });
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

/**
 * Make a direct API call to Qase API for endpoints not exposed by the SDK.
 * Use this for: /user, /shared_parameter, /configuration, /system_field
 *
 * @param path - API path (e.g., '/v1/user' or '/v1/user/123')
 * @param options - Optional axios request config (for query params, etc.)
 * @returns Promise with the API response data
 */
export async function apiRequest<T = any>(
  path: string,
  options: AxiosRequestConfig = {},
): Promise<T> {
  const token = getEffectiveToken();
  const host = getHost();

  const response = await axios({
    method: options.method || 'GET',
    url: `${host}${path}`,
    headers: {
      Token: token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  return response.data;
}

// Re-export types from qaseio for convenience
export type { QaseApi } from 'qaseio';

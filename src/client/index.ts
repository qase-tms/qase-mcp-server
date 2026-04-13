/**
 * Qase API Client Configuration
 *
 * Provides a singleton instance of the Qase API client with support for:
 * - Token-based authentication
 * - Per-request Bearer token authentication
 * - Custom enterprise domains
 * - Environment-based configuration
 */

import {
  Configuration,
  ProjectsApi,
  CasesApi,
  SuitesApi,
  RunsApi,
  ResultsApi,
  PlansApi,
  MilestonesApi,
  DefectsApi,
  EnvironmentsApi,
  AttachmentsApi,
  SharedStepsApi,
  AuthorsApi,
  CustomFieldsApi,
  SearchApi,
  ConfigurationsApi,
  SystemFieldsApi,
  UsersApi,
  SharedParametersApi,
} from 'qase-api-client';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createKeepAliveAgent, attachRetry, attachInflightDedupe } from '../http/index.js';
import FormData from 'form-data';
import { requestTokenStorage, getEffectiveToken } from '../utils/auth-context.js';
import { VERSION } from '../version.js';

const USER_AGENT = `qase-mcp/${VERSION}`;

/**
 * Configuration for the Qase API client
 */
interface ApiClientConfig {
  token: string;
  host: string;
}

/**
 * Wrapper around qase-api-client that preserves the `client.resource.method()` interface.
 */
class QaseApiClient {
  readonly projects: ProjectsApi;
  readonly cases: CasesApi;
  readonly suites: SuitesApi;
  readonly runs: RunsApi;
  readonly results: ResultsApi;
  readonly plans: PlansApi;
  readonly milestones: MilestonesApi;
  readonly defects: DefectsApi;
  readonly environment: EnvironmentsApi;
  readonly attachments: AttachmentsApi;
  readonly sharedSteps: SharedStepsApi;
  readonly authors: AuthorsApi;
  readonly customFields: CustomFieldsApi;
  readonly search: SearchApi;
  readonly configurations: ConfigurationsApi;
  readonly systemFields: SystemFieldsApi;
  readonly users: UsersApi;
  readonly sharedParameters: SharedParametersApi;

  private readonly token: string;
  private readonly host: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(config: ApiClientConfig) {
    this.token = config.token;
    this.host = config.host;

    const agent = createKeepAliveAgent({ maxSockets: 20 });
    this.axiosInstance = axios.create({ httpsAgent: agent, headers: { 'User-Agent': USER_AGENT } });
    attachRetry(this.axiosInstance);
    attachInflightDedupe(this.axiosInstance);

    const basePath = `${config.host}/v1`;
    const cfg = new Configuration({
      apiKey: config.token,
      basePath,
      formDataCtor: FormData as any,
    });

    this.projects = new ProjectsApi(cfg, basePath, this.axiosInstance);
    this.cases = new CasesApi(cfg, basePath, this.axiosInstance);
    this.suites = new SuitesApi(cfg, basePath, this.axiosInstance);
    this.runs = new RunsApi(cfg, basePath, this.axiosInstance);
    this.results = new ResultsApi(cfg, basePath, this.axiosInstance);
    this.plans = new PlansApi(cfg, basePath, this.axiosInstance);
    this.milestones = new MilestonesApi(cfg, basePath, this.axiosInstance);
    this.defects = new DefectsApi(cfg, basePath, this.axiosInstance);
    this.environment = new EnvironmentsApi(cfg, basePath, this.axiosInstance);
    this.attachments = new AttachmentsApi(cfg, basePath, this.axiosInstance);
    this.sharedSteps = new SharedStepsApi(cfg, basePath, this.axiosInstance);
    this.authors = new AuthorsApi(cfg, basePath, this.axiosInstance);
    this.customFields = new CustomFieldsApi(cfg, basePath, this.axiosInstance);
    this.search = new SearchApi(cfg, basePath, this.axiosInstance);
    this.configurations = new ConfigurationsApi(cfg, basePath, this.axiosInstance);
    this.systemFields = new SystemFieldsApi(cfg, basePath, this.axiosInstance);
    this.users = new UsersApi(cfg, basePath, this.axiosInstance);
    this.sharedParameters = new SharedParametersApi(cfg, basePath, this.axiosInstance);
  }

  /**
   * Make a direct API call for endpoints not fully covered by the SDK.
   */
  async request<T = any>(path: string, options: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.axiosInstance.request({
      method: options.method || 'GET',
      url: `${this.host}${path}`,
      headers: {
        Token: this.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    return response.data;
  }
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
 * Get full API client config (token + host).
 */
function getConfig(): ApiClientConfig {
  return { token: getEffectiveToken(), host: getHost() };
}

/**
 * Singleton API client instance (used for shared QASE_API_TOKEN fallback).
 */
let clientInstance: QaseApiClient | null = null;

/**
 * Get or create the Qase API client instance.
 *
 * Auth priority:
 *   1. Per-request Bearer token from Authorization header (set via AsyncLocalStorage)
 *      → creates a fresh QaseApiClient instance with the user's own token
 *   2. Shared QASE_API_TOKEN env var (singleton, read-only fallback)
 *
 * @returns Configured QaseApiClient instance
 * @throws Error if neither a request token nor QASE_API_TOKEN is available
 */
export function getApiClient(): QaseApiClient {
  const requestToken = requestTokenStorage.getStore();
  if (requestToken) {
    return new QaseApiClient({ token: requestToken, host: getHost() });
  }

  if (!clientInstance) {
    const config = getConfig();
    clientInstance = new QaseApiClient({ token: config.token, host: config.host });
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

export type { QaseApiClient };

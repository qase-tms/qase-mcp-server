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
  ReviewsApi,
} from 'qase-api-client';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createKeepAliveAgent, attachRetry, attachInflightDedupe } from '../http/index.js';
import { isJwt } from '../auth/token-type.js';
import FormData from 'form-data';
import { requestTokenStorage, getEffectiveToken } from '../utils/auth-context.js';
import { getServer } from '../utils/server-context.js';
import { VERSION } from '../version.js';

/**
 * Build the User-Agent / source string sent to the Qase API. Qase uses this to
 * attribute the request source. Defaults to `qase-mcp`; the hosted deployment
 * sets `QASE_MCP_SOURCE=qase-mcp-hosted` to distinguish it from the self-run CLI.
 */
export function getUserAgent(): string {
  const source = process.env.QASE_MCP_SOURCE?.trim() || 'qase-mcp';
  return `${source}/${VERSION}`;
}

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
  readonly reviews: ReviewsApi;

  private readonly token: string;
  private readonly host: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(config: ApiClientConfig, axiosInstance?: AxiosInstance) {
    this.token = config.token;
    this.host = config.host;

    const jwtToken = isJwt(config.token);

    const agent = createKeepAliveAgent({ maxSockets: 20 });
    this.axiosInstance = axiosInstance ?? axios.create({ httpsAgent: agent });

    // The generated SDK puts its own `User-Agent: qase-api-client-js/x.y.z` into
    // Configuration.baseOptions, and the generator merges those headers over the
    // axios instance defaults — so setting the source as a default silently loses
    // to it on every SDK call, leaving only the qase_api escape hatch correctly
    // attributed. A request interceptor runs after that merge, so it is the one
    // place the header can be asserted for both paths.
    this.axiosInstance.interceptors.request.use((req) => {
      req.headers = req.headers ?? {};
      req.headers['User-Agent'] = getUserAgent();
      return req;
    });

    // For JWTs, forward verbatim as Authorization: Bearer on every request.
    // Opaque tokens keep using the Qase `Token` header via Configuration.apiKey.
    if (jwtToken) {
      this.axiosInstance.interceptors.request.use((req) => {
        req.headers = req.headers ?? {};
        req.headers['Authorization'] = `Bearer ${config.token}`;
        return req;
      });
    }

    // Tag each Qase API request with the MCP client identity (which AI host/model
    // is using the connector) for backend metrics. Sourced per-request from the
    // MCP `initialize` clientInfo, read via serverStorage during tool execution.
    this.axiosInstance.interceptors.request.use((req) => {
      const client = getServer()?.getClientVersion();
      if (client?.name) {
        req.headers = req.headers ?? {};
        req.headers['X-MCP-Client-Name'] = client.name;
        if (client.version) {
          req.headers['X-MCP-Client-Version'] = client.version;
        }
      }
      return req;
    });

    attachRetry(this.axiosInstance);
    attachInflightDedupe(this.axiosInstance);

    const basePath = `${config.host}/v1`;
    const cfg = new Configuration({
      ...(jwtToken ? {} : { apiKey: config.token }),
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
    this.reviews = new ReviewsApi(cfg, basePath, this.axiosInstance);
  }

  /**
   * Make a direct API call for endpoints not fully covered by the SDK.
   */
  async request<T = any>(path: string, options: AxiosRequestConfig = {}): Promise<T> {
    const authHeaders = isJwt(this.token)
      ? { Authorization: `Bearer ${this.token}` }
      : { Token: this.token };

    const { headers: optionHeaders, ...restOptions } = options;

    const response = await this.axiosInstance.request({
      method: options.method || 'GET',
      url: `${this.host}${path}`,
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        ...optionHeaders,
      },
      ...restOptions,
    });

    return response.data;
  }
}

/**
 * Get validated API host from QASE_API_DOMAIN env var.
 *
 * The scheme comes from QASE_API_PROTOCOL and defaults to https; it exists so a
 * self-hosted API served over plain HTTP (http://api.qase.lo) can be reached.
 * A non-default port belongs in the domain (api.qase.lo:8080) — only `://` and
 * paths are rejected here.
 */
function getHost(): string {
  const domain = process.env.QASE_API_DOMAIN || 'api.qase.io';

  if (domain.includes('://') || domain.includes('/')) {
    throw new Error(
      'QASE_API_DOMAIN should only contain the domain name (e.g., api.qase.io), ' +
        'not the full URL with protocol or path',
    );
  }

  return `${getProtocol()}://${domain}`;
}

/**
 * Scheme for API requests. Accepts `http` or `https`, with or without the `://`
 * suffix; anything else falls back to https rather than failing, so a typo can
 * never downgrade the connection to something unexpected.
 */
function getProtocol(): string {
  const protocol = process.env.QASE_API_PROTOCOL?.trim().toLowerCase().replace(/:\/*$/, '');

  return protocol === 'http' ? 'http' : 'https';
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

export { QaseApiClient };

import { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

export interface RetryOptions {
  /** Maximum retry attempts (does not count the initial attempt). Default: 3. */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. Default: 200. */
  baseDelayMs?: number;
  /** Max jitter in ms added to each backoff delay. Default: 100. */
  maxJitterMs?: number;
}

interface InternalConfig extends AxiosRequestConfig {
  __retryCount?: number;
}

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options', 'delete']);
const RETRY_STATUSES_IDEMPOTENT = new Set([429, 502, 503, 504]);
const RETRY_STATUSES_MUTATING = new Set([429]);
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN']);

/**
 * Attach a retry interceptor with jittered exponential backoff.
 *
 * Policy (from ADR-0001, §9):
 * - Idempotent (GET/HEAD/OPTIONS/DELETE): retry 429/502/503/504 + network errors
 * - Mutating (POST/PATCH/PUT): retry only 429 + pre-send timeouts
 */
export function attachRetry(instance: AxiosInstance, opts: RetryOptions = {}): void {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const maxJitterMs = opts.maxJitterMs ?? 100;

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalConfig | undefined;
      if (!config) throw error;

      const attempt = config.__retryCount ?? 0;
      if (attempt >= maxRetries) throw error;
      if (!shouldRetry(error)) throw error;

      config.__retryCount = attempt + 1;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * maxJitterMs;
      await sleep(delay);
      return instance.request(config);
    },
  );
}

function shouldRetry(error: AxiosError): boolean {
  const method = (error.config?.method || 'get').toLowerCase();
  const isIdempotent = IDEMPOTENT_METHODS.has(method);

  if (error.response) {
    const statuses = isIdempotent ? RETRY_STATUSES_IDEMPOTENT : RETRY_STATUSES_MUTATING;
    return statuses.has(error.response.status);
  }

  // Network / pre-response errors
  const code = error.code ?? '';
  // Also handle generic "Network Error" (no code set) which axios emits for
  // connection-level failures when no response is received at all.
  if (isIdempotent && (RETRYABLE_NETWORK_CODES.has(code) || error.message === 'Network Error'))
    return true;
  // Mutating: only retry on pre-send timeouts (safe — request not dispatched)
  if (!isIdempotent && code === 'ECONNABORTED') return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

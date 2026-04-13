import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Attach an in-flight deduplication adapter.
 *
 * When two concurrent GETs have the same URL + sorted query, the second
 * caller piggy-backs on the first request's promise instead of issuing a new
 * network call. Applied per-axios-instance — each tenant gets its own
 * instance in `getApiClient()`, so dedup never crosses tenants.
 *
 * Mutating requests (POST/PATCH/PUT/DELETE) are never deduped — they are
 * not safe to collapse and may have different bodies.
 */
export function attachInflightDedupe(instance: AxiosInstance): void {
  const inflight = new Map<string, Promise<AxiosResponse>>();
  const originalAdapter = instance.defaults.adapter;
  if (!originalAdapter) {
    throw new Error('attachInflightDedupe: axios instance has no default adapter');
  }

  instance.defaults.adapter = (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    if (!isDedupable(config)) {
      return callOriginal(originalAdapter, config);
    }
    const key = cacheKey(config);
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = callOriginal(originalAdapter, config).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}

function callOriginal(
  adapter: AxiosRequestConfig['adapter'] | unknown,
  config: AxiosRequestConfig,
): Promise<AxiosResponse> {
  if (typeof adapter === 'function') {
    return (adapter as (c: AxiosRequestConfig) => Promise<AxiosResponse>)(config);
  }
  throw new Error('attachInflightDedupe: original adapter is not a function');
}

function isDedupable(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  return method === 'get' || method === 'head';
}

function cacheKey(config: AxiosRequestConfig): string {
  const url = config.url ?? '';
  const base = config.baseURL ?? '';
  const params = config.params ? stableStringify(config.params) : '';
  return `${config.method ?? 'get'}|${base}|${url}|${params}`;
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

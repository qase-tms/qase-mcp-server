import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

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

  // Capture whatever adapter was set on the instance at attach time.
  // - If MockAdapter is installed first → capturedAdapter is the mock function.
  // - If nothing was set (fresh axios.create()) → capturedAdapter is undefined;
  //   we fall back to axios's built-in http adapter via getAdapter.
  const capturedAdapter = instance.defaults.adapter;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolvedAdapter: any;
  if (typeof capturedAdapter === 'function') {
    resolvedAdapter = capturedAdapter;
  } else {
    // axios ≥1.7 exposes getAdapter('http') which returns the actual function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvedAdapter = (axios as any).getAdapter?.('http');
    if (typeof resolvedAdapter !== 'function') {
      // Last-resort fallback: skip dedup rather than crash the server.
      console.error(
        '[dedupe] WARNING: could not resolve HTTP adapter; in-flight deduplication disabled.',
      );
      return;
    }
  }

  instance.defaults.adapter = (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    if (!isDedupable(config)) {
      return resolvedAdapter(config);
    }
    const key = dedupeKey(config);
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = resolvedAdapter(config).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}

function isDedupable(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  return method === 'get' || method === 'head';
}

function dedupeKey(config: AxiosRequestConfig): string {
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

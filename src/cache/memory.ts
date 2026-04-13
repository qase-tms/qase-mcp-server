import { LRUCache } from 'lru-cache';
import { CacheBackend } from './types.js';

export interface InMemoryCacheOptions {
  /** Global cap across all tenants. */
  maxEntries: number;
  /** Per-tenant cap. Inferred from the 3rd segment of the key (`v1:host:tenantId:...`). */
  maxPerTenant: number;
  /** Optional periodic sweep interval for defensive cleanup. Default: 60 seconds. */
  sweepIntervalMs?: number;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * Process-local LRU cache with TTL and per-tenant cap.
 *
 * Tenant extraction: keys built by `buildCacheKey` have the shape
 *   `v1:{host}:{tenantId}:{resource}:{scope}:{paramsJson}`
 * We parse out `tenantId` to enforce per-tenant quotas without adding another
 * indirection layer.
 */
export class InMemoryCache implements CacheBackend {
  private readonly store: LRUCache<string, Entry>;
  private readonly perTenantCount = new Map<string, number>();
  private readonly maxPerTenant: number;
  private readonly sweepTimer?: ReturnType<typeof setInterval>;

  constructor(opts: InMemoryCacheOptions) {
    this.maxPerTenant = opts.maxPerTenant;
    this.store = new LRUCache<string, Entry>({
      max: opts.maxEntries,
      dispose: (_value, key, reason) => {
        // Decrement on every disposal reason except overwrite ('set'):
        // - 'evict' → LRU global cap exceeded, entry removed from a different tenant's pressure
        // - 'delete' → explicit delete()/deleteByPrefix()
        // - 'expire' → lru-cache's own TTL (we don't use it but it's still possible)
        // - 'fetch' → we don't use fetchMethod, but cover for completeness
        // - 'set' → overwrite: old value disposed, but key still exists with new value, count unchanged
        if (reason !== 'set') {
          this.decTenant(key);
        }
      },
    });

    const sweepMs = opts.sweepIntervalMs ?? 60_000;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      this.sweepTimer.unref?.();
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const existed = this.store.has(key);
    const tenant = extractTenantId(key);

    if (!existed && tenant) {
      const current = this.perTenantCount.get(tenant) ?? 0;
      if (current >= this.maxPerTenant) {
        return; // silently drop — tenant is at quota
      }
      this.perTenantCount.set(tenant, current + 1);
    }

    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async close(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.store.clear();
    this.perTenantCount.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  private decTenant(key: string): void {
    const tenant = extractTenantId(key);
    if (!tenant) return;
    const current = this.perTenantCount.get(tenant);
    if (!current) return;
    if (current <= 1) {
      this.perTenantCount.delete(tenant);
    } else {
      this.perTenantCount.set(tenant, current - 1);
    }
  }
}

function extractTenantId(key: string): string | undefined {
  // key: v1:{host}:{tenantId}:...
  const parts = key.split(':');
  return parts.length >= 3 ? parts[2] : undefined;
}

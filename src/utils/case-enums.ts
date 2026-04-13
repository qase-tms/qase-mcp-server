import { getApiClient } from '../client/index.js';
import { getCache, buildCacheKey, hashToken } from '../cache/index.js';
import { getEffectiveToken } from './auth-context.js';

type CaseEnumField = 'priority' | 'type' | 'behavior' | 'severity' | 'status' | 'layer';

const caseEnumFields: CaseEnumField[] = [
  'priority',
  'type',
  'behavior',
  'severity',
  'status',
  'layer',
];

interface SystemFieldOption {
  id: number;
  slug: string;
  title?: string;
}

interface SystemFieldResponse {
  slug: string;
  options?: SystemFieldOption[];
}

type SystemFieldMap = Record<string, Record<string, number>>;

const SYSTEM_FIELDS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalizeEnumValue(raw: unknown, lookup?: Record<string, number>): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  if (Number.isInteger(parsed)) return parsed;

  const lower = trimmed.toLowerCase();
  return lookup?.[lower];
}

function buildFieldLookup(entry: SystemFieldResponse): Record<string, number> | undefined {
  if (!entry.options || entry.options.length === 0) return undefined;
  const out: Record<string, number> = {};
  for (const opt of entry.options) {
    out[opt.slug.toLowerCase()] = opt.id;
    if (opt.title) out[opt.title.toLowerCase()] = opt.id;
    out[opt.id.toString()] = opt.id;
  }
  return out;
}

function systemFieldsKey(): string {
  const token = getEffectiveToken();
  const host = process.env.QASE_API_DOMAIN || 'api.qase.io';
  return buildCacheKey({
    host,
    tenantId: hashToken(token),
    resource: 'system_fields',
  });
}

async function fetchSystemFieldMaps(): Promise<SystemFieldMap> {
  const client = getApiClient();
  const response = await client.systemFields.getSystemFields();
  const map: SystemFieldMap = {};

  for (const entry of response.data.result as SystemFieldResponse[]) {
    const slug = entry.slug.toLowerCase();
    const lookup = buildFieldLookup(entry);
    if (lookup) map[slug] = lookup;
  }
  return map;
}

async function getSystemFieldMaps(): Promise<SystemFieldMap> {
  const cache = getCache();
  const key = systemFieldsKey();

  const cached = await cache.get<SystemFieldMap>(key);
  if (cached) return cached;

  const fresh = await fetchSystemFieldMaps();
  await cache.set(key, fresh, SYSTEM_FIELDS_TTL_MS);
  return fresh;
}

export async function normalizeCaseEnums<T extends Record<string, unknown>>(
  caseData: T,
): Promise<T> {
  const normalized = { ...caseData };
  const systemFields = await getSystemFieldMaps();

  for (const field of caseEnumFields) {
    const raw = normalized[field];
    const lookup = systemFields[field];
    const mapped = normalizeEnumValue(raw, lookup);
    if (mapped !== undefined) {
      (normalized as Record<string, unknown>)[field] = mapped;
    }
  }
  return normalized;
}

/** @internal — used by tests to pre-populate the tenant-scoped shard. */
export async function __setCaseEnumCacheForTest(snapshot: SystemFieldMap): Promise<void> {
  const cache = getCache();
  await cache.set(systemFieldsKey(), snapshot, SYSTEM_FIELDS_TTL_MS);
}

/** @internal — used by tests to clear the tenant-scoped shard. */
export async function resetCaseEnumCacheForTest(): Promise<void> {
  const cache = getCache();
  await cache.delete(systemFieldsKey());
}

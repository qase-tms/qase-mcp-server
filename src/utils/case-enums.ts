import { apiRequest } from '../client/index.js';

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

type SystemFieldMap = Record<string, Map<string, number>>;

let systemFieldCache: Promise<SystemFieldMap> | null = null;

function normalizeEnumValue(raw: unknown, lookup?: Map<string, number>): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === 'number') {
    return raw;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    if (trimmed === '') {
      return undefined;
    }

    const parsed = Number(trimmed);

    if (Number.isInteger(parsed)) {
      return parsed;
    }

    const lower = trimmed.toLowerCase();

    if (lookup?.has(lower)) {
      return lookup.get(lower);
    }
  }

  return undefined;
}

function createFieldMap(entry: SystemFieldResponse): Map<string, number> | undefined {
  if (!entry.options || entry.options.length === 0) {
    return undefined;
  }

  const map = new Map<string, number>();

  for (const option of entry.options) {
    map.set(option.slug.toLowerCase(), option.id);

    if (option.title) {
      map.set(option.title.toLowerCase(), option.id);
    }

    map.set(option.id.toString(), option.id);
  }

  return map;
}

async function getSystemFieldMaps(): Promise<SystemFieldMap> {
  if (systemFieldCache) {
    return systemFieldCache;
  }

  systemFieldCache = apiRequest<{ status: boolean; result: SystemFieldResponse[] }>(
    '/v1/system_field',
  ).then((response) => {
    const map: SystemFieldMap = {};

    for (const entry of response.result) {
      const normalizedSlug = entry.slug.toLowerCase();
      const fieldMap = createFieldMap(entry);

      if (fieldMap) {
        map[normalizedSlug] = fieldMap;
      }
    }

    return map;
  });

  return systemFieldCache;
}

export async function normalizeCaseEnums<T extends Record<string, unknown>>(
  caseData: T,
): Promise<T> {
  const normalized = { ...caseData };
  const systemFields = await getSystemFieldMaps();

  for (const field of caseEnumFields) {
    const rawValue = normalized[field as keyof typeof normalized];
    const lookup = systemFields[field];
    const mappedValue = normalizeEnumValue(rawValue, lookup);

    if (mappedValue !== undefined) {
      (normalized as Record<string, unknown>)[field] = mappedValue;
    }
  }

  return normalized;
}

export function resetCaseEnumCacheForTest(): void {
  systemFieldCache = null;
}

export function __setCaseEnumCacheForTest(snapshot: SystemFieldMap): void {
  systemFieldCache = Promise.resolve(snapshot);
}

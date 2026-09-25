/**
 * Recursively strip `null`, `undefined`, empty arrays, and empty objects
 * from API responses before sending them to the LLM.
 *
 * Zero, false, and empty strings are preserved — they carry signal (e.g.
 * `"description": ""` is different from missing description when the user
 * asked about it).
 *
 * Returns `undefined` only when the input itself is `null` or `undefined`.
 * For objects that collapse to zero kept fields, returns `{}` (an empty
 * object) — callers should test with `Object.keys(result).length === 0` if
 * they want to detect collapse, not `result === undefined`. Arrays that
 * become empty are returned as `[]`.
 */
export function compactResponse(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return compactArray(value);
  return compactObject(value as Record<string, unknown>);
}

/** Drop the entries that compacted away; an emptied array stays an array. */
function compactArray(items: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of items) {
    const c = compactResponse(item);
    if (c !== undefined) out.push(c);
  }
  return out;
}

/** Drop the keys that compacted away; an emptied object stays an object. */
function compactObject(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const c = compactResponse(record[key]);
    if (!carriesNoSignal(c)) out[key] = c;
  }
  return out;
}

/** Absent, or a container that compacted down to nothing. */
function carriesNoSignal(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return isPlainObject(value) && Object.keys(value).length === 0;
}

/**
 * Keep only the listed top-level fields on an object, or apply the same
 * projection to each element of an array.
 *
 * Special case: `['*']` returns the input unchanged.
 */
export function projectFields<T>(value: T, fields: string[]): T {
  if (fields.length === 1 && fields[0] === '*') return value;
  if (Array.isArray(value)) {
    return value.map((item) => projectSingle(item, fields)) as unknown as T;
  }
  return projectSingle(value, fields) as T;
}

function projectSingle(obj: unknown, fields: string[]): unknown {
  if (!isPlainObject(obj)) return obj;
  const src = obj;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in src) out[f] = src[f];
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

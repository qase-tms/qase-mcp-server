/**
 * Integration Marker
 *
 * An *integration* is a product built on top of this MCP server (a plugin, an
 * agent, a wrapper CLI) that wants to be attributable in Qase analytics. It is a
 * third, independent axis from the two identities already on the wire:
 *
 *   - `User-Agent: qase-mcp/<v>` — which deployment of this server (self-run vs hosted)
 *   - `X-MCP-Client-*`          — which AI host is connected (Claude, Cursor, …)
 *   - `X-MCP-Integration-*`     — which integration is driving the server (this file)
 *
 * The allowlist below is the cardinality control: the backend stores whatever it
 * receives into a PUBLIC_API_CALL analytics dimension and does not guess, so an
 * unknown marker must never reach it. Adding an integration is a deliberate
 * change here, in code review.
 */

/**
 * Integration names allowed to identify themselves to the Qase API.
 * Lowercase; anything not listed here is ignored entirely.
 */
export const ALLOWED_INTEGRATIONS: readonly string[] = ['quality-supervisor'];

/** Longest name or version we will look at; longer input is truncated, then validated. */
const MAX_FIELD_LENGTH = 100;

/** Versions are opaque to us — word chars, dots, dashes and pluses only. */
const VERSION_PATTERN = /^[\w.\-+]{1,32}$/;

export interface IntegrationMarker {
  /** Lowercased, allowlisted integration name. */
  name: string;
  /** Present only when the supplied version passed validation. */
  version?: string;
}

/**
 * Parse a `<name>/<version>` marker (version optional).
 *
 * Everything is best-effort and silent: a malformed, oversized or unknown marker
 * yields `undefined` rather than an error, so a bad marker can never fail the
 * API call it was attached to. A valid name with an invalid version keeps the
 * name and drops the version.
 */
export function parseIntegrationMarker(
  raw: string | undefined | null,
): IntegrationMarker | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  const separator = trimmed.indexOf('/');
  const rawName = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const rawVersion = separator === -1 ? '' : trimmed.slice(separator + 1);

  const name = rawName.trim().slice(0, MAX_FIELD_LENGTH).toLowerCase();
  if (!ALLOWED_INTEGRATIONS.includes(name)) return undefined;

  const version = rawVersion.trim().slice(0, MAX_FIELD_LENGTH);
  return VERSION_PATTERN.test(version) ? { name, version } : { name };
}

/**
 * Parse and re-serialise a marker into its canonical `<name>[/<version>]` form,
 * or `undefined` if it is not usable. Transports use this to normalise a marker
 * once, at the edge, so nothing unbounded or unknown is remembered per session.
 */
export function normalizeIntegrationMarker(raw: string | undefined | null): string | undefined {
  const marker = parseIntegrationMarker(raw);
  if (!marker) return undefined;
  return marker.version ? `${marker.name}/${marker.version}` : marker.name;
}

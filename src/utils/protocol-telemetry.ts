/**
 * Who is talking to us, and on which revision of the protocol.
 *
 * This server serves two protocol eras at once, and the decision to stop
 * serving the older one cannot be made from the code — only from traffic. The
 * counter this module feeds is what turns "should we drop 2025-11-25?" into a
 * question with an answer.
 *
 * On the 2026-07-28 revision every request carries a `_meta` envelope naming
 * the revision and identifying the client, so both labels come from the
 * request itself. A 2025-era request carries no envelope at all; the client's
 * name is then only known where an `initialize` happened (stdio, SSE), and is
 * reported as `unknown` on a stateless HTTP leg — which is itself worth
 * knowing, since that is exactly the traffic a strict modern-only endpoint
 * would refuse.
 */

import { PROTOCOL_VERSION_META_KEY, CLIENT_INFO_META_KEY } from '@modelcontextprotocol/server';
import { getMetrics } from '../cache/index.js';
import { getServer } from './server-context.js';

/** Distinct client names this process will ever emit as a label. */
export const CLIENT_LABEL_LIMIT = 20;

/** The label for a request whose era carries no version envelope. */
const LEGACY_PROTOCOL = 'legacy';
const UNKNOWN_CLIENT = 'unknown';
/** An envelope that names no revision — shape drift, not an era. */
const UNKNOWN_PROTOCOL = 'unknown';
const OVERFLOW_CLIENT = 'other';
const MAX_CLIENT_LENGTH = 32;

/**
 * Turns a client-supplied name into a bounded metric label.
 *
 * The name arrives from the wire, and every distinct value becomes its own
 * series in an in-process map that nothing evicts. So the value is both
 * normalised (a label is not free-form text) and CAPPED: past the limit every
 * new name collapses into one bucket. Names already seen keep their series, so
 * the clients that actually matter stay legible however much noise arrives
 * after them.
 */
export class ClientLabeller {
  private readonly seen = new Set<string>();

  constructor(private readonly limit: number = CLIENT_LABEL_LIMIT) {}

  label(raw: unknown): string {
    if (typeof raw !== 'string') return UNKNOWN_CLIENT;

    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_CLIENT_LENGTH);
    if (!cleaned) return UNKNOWN_CLIENT;

    if (this.seen.has(cleaned)) return cleaned;
    if (this.seen.size >= this.limit) return OVERFLOW_CLIENT;
    this.seen.add(cleaned);
    return cleaned;
  }
}

/** The handler context this module reads — narrower than the SDK's, on purpose. */
interface TelemetryContext {
  mcpReq?: { envelope?: Record<string, unknown> };
}

/**
 * The two labels for one request. The revision string is passed through as the
 * envelope names it rather than folded into an era, so a revision that does not
 * exist yet shows up as itself on the day a client first sends it.
 */
export function protocolLabels(
  ctx: TelemetryContext,
  labeller: ClientLabeller,
): { protocol: string; client: string } {
  const envelope = ctx.mcpReq?.envelope;

  if (!envelope) {
    // 2025-era: the name is known only if an initialize established it.
    return {
      protocol: LEGACY_PROTOCOL,
      client: labeller.label(getServer()?.getClientVersion()?.name),
    };
  }

  const version = envelope[PROTOCOL_VERSION_META_KEY];
  const clientInfo = envelope[CLIENT_INFO_META_KEY] as { name?: unknown } | undefined;

  return {
    protocol: typeof version === 'string' && version.length > 0 ? version : UNKNOWN_PROTOCOL,
    client: labeller.label(clientInfo?.name),
  };
}

/** One labeller per process, so the cap bounds the process and not one request. */
const processLabeller = new ClientLabeller();

/** Count one served request under the revision and client it came from. */
export function recordProtocolRequest(ctx: TelemetryContext): void {
  getMetrics().incCounter('qase_mcp_requests_total', protocolLabels(ctx, processLabeller));
}

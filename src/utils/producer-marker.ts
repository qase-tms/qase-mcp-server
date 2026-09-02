/**
 * Producer Marker
 *
 * Which *part* of an integration produced this call — a skill, a slash command,
 * or an agent. A fourth axis under the integration marker (see
 * integration-marker.ts), answering "what did they run" where that one answers
 * "what is driving the server".
 *
 * Unlike integrations, producers are NOT allowlisted. An integration is a
 * product and its name is a deliberate, reviewed addition; a producer is a part
 * of one, and new parts appear whenever that product ships a feature. Requiring
 * a server release before a new skill could be counted would guarantee the
 * metric lags the thing it measures. Cardinality is instead bounded by the
 * pattern below, by the seq cap, and by the fact that nothing is forwarded
 * unless the integration name itself passed the allowlist.
 */

/** How the user reached the producer. */
export type Entrypoint = 'skill' | 'command' | 'agent';

const ENTRYPOINTS: readonly string[] = ['skill', 'command', 'agent'];

/** Lowercase, dash-separated, 2-48 characters. Deliberately narrow. */
const PRODUCER_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** Longest input we will look at; longer is truncated, then validated. */
const MAX_FIELD_LENGTH = 128;

/** Calls beyond this in one run all report the cap, bounding cardinality. */
export const MAX_SEQ = 500;

export interface ProducerMarker {
  producer: string;
  /** 1-based index of this call within its run; MAX_SEQ for anything beyond. */
  seq: number;
  entrypoint: Entrypoint;
}

/**
 * Parse a `<producer>/<seq>/<entrypoint>` marker.
 *
 * Best-effort and silent, exactly like parseIntegrationMarker: anything
 * malformed yields undefined rather than an error, so a bad marker can never
 * fail the API call it was attached to.
 */
export function parseProducerMarker(raw: string | undefined | null): ProducerMarker | undefined {
  const trimmed = raw?.trim().slice(0, MAX_FIELD_LENGTH);
  if (!trimmed) return undefined;

  const parts = trimmed.split('/');
  if (parts.length !== 3) return undefined;

  const producer = parts[0].trim().toLowerCase();
  if (!PRODUCER_PATTERN.test(producer)) return undefined;

  const entrypoint = parts[2].trim().toLowerCase();
  if (!ENTRYPOINTS.includes(entrypoint)) return undefined;

  const seq = Number(parts[1].trim());
  if (!Number.isInteger(seq) || seq < 1) return undefined;

  return { producer, seq: Math.min(seq, MAX_SEQ), entrypoint: entrypoint as Entrypoint };
}

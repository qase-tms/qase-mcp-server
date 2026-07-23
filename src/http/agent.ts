import * as https from 'https';

export interface KeepAliveAgentOptions {
  /** Max concurrent sockets per host. Default: 20. */
  maxSockets?: number;
  /** Idle timeout before closing an unused connection. Default: 60s. */
  keepAliveMsecs?: number;
}

/**
 * Create an https.Agent with connection pooling enabled.
 *
 * Removes the TLS handshake (~50–150ms per request) from every call after
 * the first, which is the single biggest source of per-request latency when
 * talking to api.qase.io.
 */
export function createKeepAliveAgent(opts: KeepAliveAgentOptions = {}): https.Agent {
  return new https.Agent({
    keepAlive: true,
    keepAliveMsecs: opts.keepAliveMsecs ?? 60_000,
    maxSockets: opts.maxSockets ?? 20,
  });
}

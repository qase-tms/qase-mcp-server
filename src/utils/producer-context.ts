import { AsyncLocalStorage } from 'async_hooks';
import type { ProducerMarker } from './producer-marker.js';

/**
 * Per-call producer storage.
 *
 * Per *call*, not per request or per session: one MCP session runs many
 * producers in sequence, which is the whole point of the axis. Opened by the
 * CallTool handler and read by the outbound interceptor.
 */
export const producerStorage = new AsyncLocalStorage<ProducerMarker>();

export function getProducer(): ProducerMarker | undefined {
  return producerStorage.getStore();
}

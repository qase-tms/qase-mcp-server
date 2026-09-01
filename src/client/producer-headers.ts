import type { IntegrationMarker } from '../utils/integration-marker.js';
import type { ProducerMarker } from '../utils/producer-marker.js';

/**
 * The attribution headers for one outbound Qase API request.
 *
 * A producer is never sent without an integration. A producer alone says "some
 * skill did this" without saying whose skill, which is not an attribution; and
 * because the integration name is allowlisted while the producer is only
 * shape-checked, the integration is what keeps an arbitrary client out of the
 * analytics dimension.
 */
export function buildIntegrationHeaders(
  integration: IntegrationMarker | undefined,
  producer: ProducerMarker | undefined,
): Record<string, string> {
  if (!integration) return {};

  const headers: Record<string, string> = {
    'X-MCP-Integration-Name': integration.name,
  };
  if (integration.version) {
    headers['X-MCP-Integration-Version'] = integration.version;
  }
  if (producer) {
    headers['X-MCP-Integration-Producer'] = producer.producer;
    headers['X-MCP-Integration-Seq'] = String(producer.seq);
    headers['X-MCP-Integration-Entrypoint'] = producer.entrypoint;
  }
  return headers;
}

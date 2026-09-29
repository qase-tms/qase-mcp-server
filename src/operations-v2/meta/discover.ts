/**
 * Tool Discovery Meta-Tool
 *
 * Searches and activates additional Qase tools on demand.
 * By default, only core tools are visible to reduce context token usage.
 * This tool lets the agent discover and activate tools for specific needs.
 */

import { z } from 'zod';
import { getMetrics } from '../../cache/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { DiscoverToolsOutput } from '../../utils/output-schemas.js';
import { getActivationStore } from '../../tools/activation.js';
import { publishToolsListChanged } from '../../tools/event-bus.js';
import { getServer } from '../../utils/server-context.js';
import { getEffectiveSubject } from '../../utils/auth-context.js';

/**
 * Tell the client its tool list is stale, on every channel that has one.
 *
 * The two paths are not alternatives — each serves a shape of connection the
 * other cannot reach:
 *
 * - `publishToolsListChanged()` publishes onto the `ServerEventBus` that
 *   `createMcpHandler` serves `subscriptions/listen` streams from. That is the
 *   only route to an HTTP modern-era client, whose listening stream belongs to
 *   a different request than this one, served by a `Server` instance that no
 *   longer exists by the time anyone needs telling.
 * - `sendToolListChanged()` goes out on THIS request's `Server` instance. That
 *   is the only route on stdio, where one instance serves the whole connection
 *   and `serveStdio` takes no bus at all — and stdio is what most installs run
 *   (Claude Desktop, Cursor, the npm package). Skipping it was how the 2.6.0
 *   fix for issue #93 would have come back on the widest channel we have.
 *
 * An HTTP legacy-stateless request reaches neither: there is no session to
 * notify and no subscription stream to publish to. That is a property of
 * serving 2025-era traffic statelessly, not something this function can fix.
 *
 * Nothing here may fail the tool call: an announcement that does not land
 * costs the agent one stale list (and `qase_discover_tools`' own description
 * tells it what to do about that), whereas a throw would lose the activation
 * result entirely.
 */
function announceToolListChanged(): void {
  try {
    publishToolsListChanged();
  } catch (err) {
    console.error('[Discover] Failed to publish tools/list_changed to the event bus:', err);
  }

  const server = getServer();
  if (!server) return;
  void server.sendToolListChanged().catch((err) => {
    console.error('[Discover] Failed to send tools/list_changed on this connection:', err);
  });
}

const Schema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Search query to find tools by name or description. ' +
        'Examples: "delete", "milestone", "attachment", "suite"',
    ),
  category: z
    .enum(['read', 'write', 'delete', 'composite', 'all'])
    .optional()
    .describe('Filter by tool category'),
  activate: z
    .boolean()
    .optional()
    .default(true)
    .describe('If true (default), found tools are activated and become available for use'),
});

async function handler(args: z.infer<typeof Schema>) {
  const { query, category } = args;
  // Handlers receive raw MCP arguments, so the schema default never runs —
  // apply it here or discovery silently stops activating anything.
  const activate = args.activate ?? true;

  let matches = query ? toolRegistry.searchTools(query) : toolRegistry.getAllTools();

  // Filter by category based on tool annotations
  if (category && category !== 'all') {
    matches = matches.filter((t) => {
      const ann = t.annotations;
      switch (category) {
        case 'delete':
          return ann?.destructiveHint === true;
        case 'read':
          return ann?.readOnlyHint === true;
        case 'write':
          return !ann?.readOnlyHint && !ann?.destructiveHint;
        case 'composite':
          return (
            t.name.startsWith('qase_ci_') ||
            t.name.startsWith('qase_triage_') ||
            t.name.startsWith('qase_regression_')
          );
        default:
          return true;
      }
    });
  }

  // Activate matched tools if requested. The active set is per-caller state
  // now, not the registry's — `store.add` records it for this subject and
  // returns only the names that were not already active.
  const activated: string[] = [];
  if (activate) {
    const names = matches.map((t) => t.name);
    const subject = getEffectiveSubject();
    activated.push(...(await getActivationStore().add(subject, names)));
  }

  for (const activatedName of activated) {
    getMetrics().incCounter('qase_mcp_tool_activations_total', { tool: activatedName });
  }

  // Tell anyone listening that the list they hold is stale. Only a real change
  // is announced — re-running discovery over tools that were already on says
  // nothing. See announceToolListChanged for why this is two channels.
  if (activated.length > 0) {
    announceToolListChanged();
  }

  return {
    found: matches.length,
    activated: activated.length,
    tools: matches.map((t) => ({
      name: t.name,
      description: t.description,
      destructive: t.annotations?.destructiveHint ?? false,
    })),
  };
}

toolRegistry.register({
  name: 'qase_discover_tools',
  title: 'Discover more tools',
  description:
    'Find and switch on tools that are hidden by default. Only core tools appear in the tool ' +
    'list; deletes, test plans, milestones, environments, shared steps and parameters, external ' +
    'issue links, case reviews, and project and custom-field management all exist but stay ' +
    'hidden until discovered. Search by what you are trying to do — "delete", "milestone", ' +
    '"plan", "review", "custom field" — and matching tools are activated and become callable. ' +
    "Every word in the query must appear in a tool's name or description, so prefer two or three " +
    'words over a sentence. Activation itself always takes effect immediately; whether your ' +
    'client is told about it depends on the connection: stdio gets ' +
    'notifications/tools/list_changed automatically, an HTTP client only if it opened a ' +
    'subscriptions/listen stream, and a stateless HTTP request has no channel to deliver one on ' +
    'at all. If a tool listed as activated here is still absent from your tool list, that is a ' +
    'missing notification, not a missing activation — call the same endpoint through qase_api ' +
    'instead of reporting the capability as missing; it asks for confirmation on DELETE exactly ' +
    'like the dedicated tools do, so this path does not skip that gate. Never conclude a ' +
    'capability is missing without searching here first. Cost: no API call, matching happens in ' +
    'memory, about 3ms. Free to call as often as needed.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
  outputSchema: DiscoverToolsOutput,
});

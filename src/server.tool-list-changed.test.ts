/**
 * Tool-list-changed notifications reach every open session.
 *
 * The tool registry is a process-wide singleton, but createServer runs once per
 * session on the HTTP transports. The wiring used to assign a single callback,
 * so each new session overwrote the previous one's: after two clients
 * connected, only the second was told that qase_discover_tools had activated a
 * tool. The first kept the tools/list it had cached at connect time and its
 * client answered "is not a function" for a tool the server was perfectly happy
 * to run (issue #93).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setTestEnv } from './utils/test-helpers.js';

setTestEnv();

// The operation modules build an API client on import; stub it away.
jest.mock('./client/index.js', () => ({
  getApiClient: jest.fn().mockReturnValue({}),
  apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
  resetClientInstance: jest.fn(),
}));

import { createServer } from './server.js';
import { toolRegistry } from './utils/registry.js';

/** A discoverable tool nothing else in this file activates. */
const HIDDEN_TOOL = 'qase_milestone_upsert';

describe('tool-list-changed notifications', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('reaches every session, not only the one created last', () => {
    const first = createServer();
    const second = createServer();
    const firstNotified = jest
      .spyOn(first, 'sendToolListChanged')
      .mockResolvedValue(undefined as never);
    const secondNotified = jest
      .spyOn(second, 'sendToolListChanged')
      .mockResolvedValue(undefined as never);

    expect(toolRegistry.activateTools([HIDDEN_TOOL])).toEqual([HIDDEN_TOOL]);

    expect(firstNotified).toHaveBeenCalledTimes(1);
    expect(secondNotified).toHaveBeenCalledTimes(1);

    first.onclose?.();
    second.onclose?.();
  });

  it('stops notifying a session once it closes', () => {
    const closing = createServer();
    const staying = createServer();
    const closingNotified = jest
      .spyOn(closing, 'sendToolListChanged')
      .mockResolvedValue(undefined as never);
    const stayingNotified = jest
      .spyOn(staying, 'sendToolListChanged')
      .mockResolvedValue(undefined as never);

    closing.onclose?.();
    // A second tool, because the first test's activation is sticky on the
    // shared registry and re-activating notifies nobody.
    expect(toolRegistry.activateTools(['qase_environment_upsert'])).toEqual([
      'qase_environment_upsert',
    ]);

    expect(closingNotified).not.toHaveBeenCalled();
    expect(stayingNotified).toHaveBeenCalledTimes(1);

    staying.onclose?.();
  });

  it('survives a session whose transport is already gone', () => {
    const broken = createServer();
    const healthy = createServer();
    jest.spyOn(broken, 'sendToolListChanged').mockImplementation(() => {
      throw new Error('Not connected');
    });
    const healthyNotified = jest
      .spyOn(healthy, 'sendToolListChanged')
      .mockResolvedValue(undefined as never);

    expect(() => toolRegistry.activateTools(['qase_plan_upsert'])).not.toThrow();
    expect(healthyNotified).toHaveBeenCalledTimes(1);

    broken.onclose?.();
    healthy.onclose?.();
  });
});

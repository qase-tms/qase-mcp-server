import { createKeepAliveAgent } from './agent.js';
import * as https from 'https';

describe('createKeepAliveAgent', () => {
  it('returns an https.Agent with keepAlive enabled', () => {
    const agent = createKeepAliveAgent();
    expect(agent).toBeInstanceOf(https.Agent);
    expect((agent as any).keepAlive).toBe(true);
  });

  it('uses the configured maxSockets', () => {
    const agent = createKeepAliveAgent({ maxSockets: 42 });
    expect((agent as any).maxSockets).toBe(42);
  });

  it('defaults to maxSockets=20', () => {
    const agent = createKeepAliveAgent();
    expect((agent as any).maxSockets).toBe(20);
  });
});

import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes through calls in closed state', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, openDurationMs: 1000 });
    const r = await cb.exec(async () => 'ok');
    expect(r).toBe('ok');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, openDurationMs: 1000 });
    const failing = async () => {
      throw new Error('boom');
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(failing)).rejects.toThrow('boom');
    }

    await expect(cb.exec(failing)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(cb.state).toBe('open');
  });

  it('resets failure count on success', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, openDurationMs: 1000 });
    const failing = async () => {
      throw new Error('boom');
    };

    await expect(cb.exec(failing)).rejects.toThrow('boom');
    await expect(cb.exec(failing)).rejects.toThrow('boom');
    await cb.exec(async () => 'ok');
    await expect(cb.exec(failing)).rejects.toThrow('boom');
    expect(cb.state).toBe('closed');
  });

  it('transitions to half-open after openDurationMs and allows one probe', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2, openDurationMs: 1000 });
    const failing = async () => {
      throw new Error('boom');
    };

    await expect(cb.exec(failing)).rejects.toThrow('boom');
    await expect(cb.exec(failing)).rejects.toThrow('boom');
    expect(cb.state).toBe('open');

    jest.advanceTimersByTime(1001);
    expect(cb.state).toBe('half_open');

    await cb.exec(async () => 'probe-ok');
    expect(cb.state).toBe('closed');
  });

  it('re-opens if the half-open probe fails', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2, openDurationMs: 1000 });
    const failing = async () => {
      throw new Error('boom');
    };

    await expect(cb.exec(failing)).rejects.toThrow('boom');
    await expect(cb.exec(failing)).rejects.toThrow('boom');

    jest.advanceTimersByTime(1001);
    await expect(cb.exec(failing)).rejects.toThrow('boom');
    expect(cb.state).toBe('open');
  });

  it('records state transitions into the provided metrics object', async () => {
    const transitions: string[] = [];
    const cb = new CircuitBreaker({
      name: 'test',
      failureThreshold: 2,
      openDurationMs: 1000,
      onStateChange: (s) => transitions.push(s),
    });
    const failing = async () => {
      throw new Error('boom');
    };
    await expect(cb.exec(failing)).rejects.toThrow();
    await expect(cb.exec(failing)).rejects.toThrow();
    jest.advanceTimersByTime(1001);
    await cb.exec(async () => 'ok');

    expect(transitions).toEqual(['open', 'half_open', 'closed']);
  });
});

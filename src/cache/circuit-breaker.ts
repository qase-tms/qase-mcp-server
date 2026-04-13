export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  name: string;
  /** Consecutive failures that flip the state from closed to open. */
  failureThreshold: number;
  /** Time in open state before transitioning to half-open. */
  openDurationMs: number;
  /** Optional callback invoked on every state transition. */
  onStateChange?: (state: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`CircuitBreaker[${name}] is open`);
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

/**
 * Three-state circuit breaker: closed → open → half_open → closed/open.
 *
 * - closed: calls pass through; consecutive failures accumulate
 * - open: calls short-circuit with CircuitOpenError until openDurationMs passes
 * - half_open: the next call probes the upstream; success closes, failure reopens
 */
export class CircuitBreaker {
  private _state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly opts: CircuitBreakerOptions;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = opts;
  }

  get state(): CircuitState {
    if (this._state === 'open' && Date.now() - this.openedAt >= this.opts.openDurationMs) {
      this.transition('half_open');
    }
    return this._state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.state;
    if (s === 'open') {
      throw new CircuitOpenError(this.opts.name);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this._state === 'half_open') this.transition('closed');
  }

  private onFailure(): void {
    if (this._state === 'half_open') {
      this.openedAt = Date.now();
      this.transition('open');
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.opts.failureThreshold) {
      this.openedAt = Date.now();
      this.transition('open');
    }
  }

  private transition(next: CircuitState): void {
    if (this._state === next) return;
    this._state = next;
    this.opts.onStateChange?.(next);
  }
}

/** Fixed-window rate limiter keyed by client (IP for now, user id once auth lands). */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Returns seconds until retry when over the limit, otherwise 0. */
  hit(key: string): number {
    const now = this.clock();
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      this.sweep(now);
      return 0;
    }
    w.count++;
    if (w.count > this.limit) return Math.ceil((w.start + this.windowMs - now) / 1000);
    return 0;
  }

  private sweep(now: number) {
    if (this.windows.size < 10_000) return;
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}

/** A budget shared by every client, reset each UTC day. Keeps a paid endpoint's worst day bounded. */
export class DailyCap {
  private day = '';
  private used = 0;
  constructor(
    private readonly limit: number,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Spends one call. False once today's budget is gone; a limit of 0 means no cap. */
  take(): boolean {
    if (this.limit === 0) return true;
    const today = new Date(this.clock()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
}

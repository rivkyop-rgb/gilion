/**
 * A ceiling on wrong passwords (security review, 04/11/2026). Without one, a
 * password could be guessed at whatever speed the server answers — and the
 * demo's seeded passwords are short.
 *
 * Counted twice: per address being tried (someone guessing one account from
 * many machines) and per network address (one machine trying many accounts).
 * In memory, because the app runs as one process; a restart forgets, which
 * costs an attacker nothing they did not already have.
 *
 * A refusal looks exactly like a wrong password — the same sentence — so the
 * limit tells a stranger nothing about which addresses exist.
 */
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_ACCOUNT = 10;
export const MAX_PER_ORIGIN = 30;

type Bucket = { count: number; since: number };

export class LoginThrottle {
  private buckets = new Map<string, Bucket>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string): Bucket | null {
    const b = this.buckets.get(key);
    if (!b) return null;
    if (this.now() - b.since > WINDOW_MS) {
      this.buckets.delete(key);
      return null;
    }
    return b;
  }

  /** Whether another attempt may be checked at all. */
  allowed(account: string, origin: string): boolean {
    return (
      (this.live(`a:${account}`)?.count ?? 0) < MAX_PER_ACCOUNT &&
      (this.live(`o:${origin}`)?.count ?? 0) < MAX_PER_ORIGIN
    );
  }

  failed(account: string, origin: string): void {
    for (const key of [`a:${account}`, `o:${origin}`]) {
      const b = this.live(key);
      if (b) b.count++;
      else this.buckets.set(key, { count: 1, since: this.now() });
    }
    // Keep the map from growing without bound under a spray of addresses.
    if (this.buckets.size > 10_000) {
      for (const [key] of this.buckets) if (!this.live(key)) this.buckets.delete(key);
    }
  }

  /** A right password clears the account's count — not the origin's. */
  succeeded(account: string): void {
    this.buckets.delete(`a:${account}`);
  }
}

export const loginThrottle = new LoginThrottle();

/** The caller's address as the proxy in front of us reports it. */
export function originOf(request: Request | undefined): string {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request?.headers.get("x-real-ip") || "unknown";
}

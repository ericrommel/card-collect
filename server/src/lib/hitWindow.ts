/**
 * Counts events inside a sliding window. Used to slow credential guessing
 * and exchange spam without a shared cache. Not a durable abuse system.
 */
export function createHitWindow(windowMs: number) {
  const hits = new Map<string, number[]>();

  return {
    /** True when this key is already at the limit. A false result records the hit. */
    tooMany(key: string, limit: number, now = Date.now()): boolean {
      const start = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((time) => time > start);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return true;
      }
      recent.push(now);
      hits.set(key, recent);
      return false;
    },
    clear(): void {
      hits.clear();
    },
  };
}

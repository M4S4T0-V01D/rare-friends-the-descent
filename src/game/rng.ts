/** Seeded PRNG (mulberry32) so a descent's layout and loot are reproducible from its seed. */
export class Rng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 0x9e3779b9; }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new RangeError("Cannot pick from an empty list.");
    return items[Math.floor(this.next() * items.length)];
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  /** Weighted pick; weights need not sum to anything in particular. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    if (total <= 0) throw new RangeError("Weighted pick needs a positive total weight.");
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= Math.max(0, weight);
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  }
  /** Roll a basis-point table (weights sum to 10,000), as used for shrine and event odds. */
  table<T extends { chanceBps: number }>(rows: readonly T[]): T {
    return this.weighted(rows.map(row => [row, row.chanceBps] as const));
  }
  fork(salt: number): Rng { return new Rng(hash32(Math.floor(this.next() * 4294967296) ^ salt)); }
}

export function hash32(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stable per-tile noise for decorative variation. */
export function tileNoise(x: number, y: number, salt = 0): number {
  return hash32(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt, 83492791)) / 4294967296;
}

export function randomSeed(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0];
}

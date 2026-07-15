/**
 * A tiny, dependency-free seeded pseudo-random number generator (mulberry32), used by the mock
 * fixture generators so mock datasets are reproducible across test runs given the same seed —
 * unlike `Math.random()`, which cannot be seeded.
 */
export class SeededRandom {
  private state: number;

  public constructor(seed = 42) {
    this.state = seed >>> 0;
  }

  /** @returns the next pseudo-random float in `[0, 1)`. */
  public next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns a pseudo-random integer in `[min, max]` (inclusive). */
  public int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** @returns a pseudo-randomly chosen element from `items`. */
  public pick<T>(items: readonly T[]): T {
    const index = this.int(0, items.length - 1);
    // items is never empty in this module's call sites; the non-null assertion documents that.
    return items[index] as T;
  }

  /** @returns `true` with probability `probability` (`0..1`). */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }
}

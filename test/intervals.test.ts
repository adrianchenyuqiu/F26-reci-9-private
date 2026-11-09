import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

const endpoint = fc.integer({ min: -20, max: 20 });
const interval: fc.Arbitrary<Interval> = fc.tuple(endpoint, endpoint)
  .map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
const boundaryPair: fc.Arbitrary<Interval[]> = fc.tuple(endpoint, fc.nat(10), fc.nat(10), fc.constantFrom(0, 1))
  .map(([leftEnd, leftWidth, rightWidth, gap]) => {
    const rightStart = leftEnd + gap;
    return [[rightStart, rightStart + rightWidth], [leftEnd - leftWidth, leftEnd]];
  });
const intervalList = fc.oneof(fc.array(interval), boundaryPair);
const separatedIntervals = fc.tuple(
  endpoint,
  fc.array(fc.tuple(fc.nat(10), fc.integer({ min: 1, max: 5 })), { minLength: 2 }),
).map(([start, segments]) => {
  let nextStart = start;
  return segments.map(([width, gap]) => {
    const segment: Interval = [nextStart, nextStart + width];
    nextStart = segment[1] + gap;
    return segment;
  });
});

function coversPoint(intervals: readonly Interval[], point: number): boolean {
  return intervals.some(([start, end]) => start <= point && point <= end);
}

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. Output intervals are valid and sorted with a strict gap between neighbors.
  it('returns valid intervals with a strict gap between neighbors', () => {
    fc.assert(fc.property(intervalList, xs => {
      const out = mergeIntervals(xs);
      for (const [start, end] of out) {
        expect(Number.isInteger(start) && Number.isInteger(end)).toBe(true);
        expect(start).toBeLessThanOrEqual(end);
      }
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1][1]).toBeLessThan(out[i][0]);
      }
    }));
  });

  // Pattern: differential. Direct point membership agrees before and after merging.
  it('preserves coverage over the real line', () => {
    fc.assert(fc.property(intervalList, xs => {
      const input = structuredClone(xs);
      const out = mergeIntervals(xs);
      const endpoints = [...new Set([...input.flat(), ...out.flat()])].sort((a, b) => a - b);

      for (const point of endpoints) {
        expect(coversPoint(out, point)).toBe(coversPoint(input, point));
      }
      // Between consecutive endpoints, coverage is constant. One probe per gap is enough.
      for (let i = 1; i < endpoints.length; i++) {
        const midpoint = (endpoints[i - 1] + endpoints[i]) / 2;
        expect(coversPoint(out, midpoint)).toBe(coversPoint(input, midpoint));
      }
    }));
  });

  // Pattern: metamorphic. Reversing the input order gives the same merged intervals.
  it('is independent of input order', () => {
    fc.assert(fc.property(intervalList, xs => {
      const reversed = structuredClone(xs).reverse();
      expect(mergeIntervals(reversed)).toEqual(mergeIntervals(xs));
    }));
  });

  // Pattern: algebraic. Merging the merged output leaves it unchanged.
  it('is idempotent', () => {
    fc.assert(fc.property(intervalList, xs => {
      const merged = mergeIntervals(xs);
      expect(mergeIntervals(structuredClone(merged))).toEqual(merged);
    }));
  });

  // Pattern: conditional. Already separated intervals only need to be sorted.
  it('only sorts intervals that are already separated', () => {
    fc.assert(fc.property(separatedIntervals, sorted => {
      const input = structuredClone(sorted).reverse();
      expect(mergeIntervals(input)).toEqual(sorted);
    }));
  });

  // Pattern: invariant. Neither the input order nor its endpoints change.
  it('leaves the input array and its intervals unchanged', () => {
    fc.assert(fc.property(intervalList, xs => {
      const original = structuredClone(xs);
      mergeIntervals(xs);
      expect(xs).toEqual(original);
    }));
  });
});

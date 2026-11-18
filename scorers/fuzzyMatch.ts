import type { Scorer } from '../src/types';

export interface FuzzyMatchOptions {
  /** Minimum similarity in [0, 1] to pass. Default 0.8. */
  threshold?: number;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Score = 1 - normalized edit distance (case- and whitespace-insensitive). Character-level: not semantic. */
export function fuzzyMatch(options: FuzzyMatchOptions = {}): Scorer {
  const { threshold = 0.8 } = options;
  return {
    name: 'fuzzyMatch',
    score(output, evalCase) {
      if (evalCase.expected === undefined) {
        throw new Error(`fuzzyMatch scorer: case "${evalCase.id}" has no expected value`);
      }
      const a = normalize(output);
      const b = normalize(evalCase.expected);
      const maxLen = Math.max(a.length, b.length);
      const similarity = maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
      const pass = similarity >= threshold;
      return {
        score: similarity,
        pass,
        reason: `similarity ${similarity.toFixed(3)} ${pass ? '>=' : '<'} threshold ${String(threshold)}`,
      };
    },
  };
}

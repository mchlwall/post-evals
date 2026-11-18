import type { Scorer } from '../src/types';
import { caseConfig } from './util';

export interface KeywordOptions {
  present?: string[];
  absent?: string[];
  caseSensitive?: boolean;
}

/** Score = fraction of checks satisfied; passes only if all are. Override per case via `metadata.keywords`. */
export function keywords(options: KeywordOptions = {}): Scorer {
  return {
    name: 'keywords',
    score(output, evalCase) {
      const { present = [], absent = [], caseSensitive = false } = caseConfig(evalCase, 'keywords', options);
      if (present.length + absent.length === 0) {
        throw new Error(`keywords scorer: nothing configured for case "${evalCase.id}"`);
      }
      const haystack = caseSensitive ? output : output.toLowerCase();
      const has = (k: string): boolean => haystack.includes(caseSensitive ? k : k.toLowerCase());

      const missing = present.filter((k) => !has(k));
      const forbidden = absent.filter((k) => has(k));
      const total = present.length + absent.length;
      const failed = missing.length + forbidden.length;

      const problems = [
        ...(missing.length > 0 ? [`missing: ${missing.join(', ')}`] : []),
        ...(forbidden.length > 0 ? [`forbidden present: ${forbidden.join(', ')}`] : []),
      ];
      return {
        score: (total - failed) / total,
        pass: failed === 0,
        reason: failed === 0 ? `all ${String(total)} keyword checks satisfied` : problems.join('; '),
      };
    },
  };
}

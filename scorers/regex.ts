import type { Scorer } from '../src/types';
import { caseConfig } from './util';

export interface RegexOptions {
  pattern?: string;
  flags?: string;
  /** true (default): output must match. false: output must NOT match. */
  mustMatch?: boolean;
}

/** Override per case via `metadata.regex`. */
export function regex(options: RegexOptions = {}): Scorer {
  return {
    name: 'regex',
    score(output, evalCase) {
      const { pattern, flags, mustMatch = true } = caseConfig(evalCase, 'regex', options);
      if (pattern === undefined) {
        throw new Error(`regex scorer: no pattern configured for case "${evalCase.id}"`);
      }
      const matched = new RegExp(pattern, flags).test(output);
      const pass = matched === mustMatch;
      return {
        score: pass ? 1 : 0,
        pass,
        reason: `/${pattern}/${flags ?? ''} ${matched ? 'matched' : 'did not match'} (expected ${mustMatch ? 'match' : 'no match'})`,
      };
    },
  };
}

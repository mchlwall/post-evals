import type { Scorer } from '../src/types';

export interface ExactMatchOptions {
  caseSensitive?: boolean;
}

/** Output, trimmed, equals `case.expected`, trimmed. */
export function exactMatch(options: ExactMatchOptions = {}): Scorer {
  const { caseSensitive = true } = options;
  const norm = (s: string): string => (caseSensitive ? s.trim() : s.trim().toLowerCase());
  return {
    name: 'exactMatch',
    score(output, evalCase) {
      if (evalCase.expected === undefined) {
        throw new Error(`exactMatch scorer: case "${evalCase.id}" has no expected value`);
      }
      const pass = norm(output) === norm(evalCase.expected);
      return { score: pass ? 1 : 0, pass, reason: pass ? 'output equals expected' : 'output differs from expected' };
    },
  };
}

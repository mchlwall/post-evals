import type { Scorer } from '../src/types';
import { caseConfig } from './util';

export interface LengthOptions {
  /** 'tokens' is an estimate (chars / 4), not a real tokenizer count. */
  unit?: 'chars' | 'words' | 'tokens';
  min?: number;
  max?: number;
}

function measure(output: string, unit: NonNullable<LengthOptions['unit']>): number {
  switch (unit) {
    case 'chars':
      return output.length;
    case 'words':
      return output.trim() === '' ? 0 : output.trim().split(/\s+/).length;
    case 'tokens':
      return Math.ceil(output.length / 4);
  }
}

/** Passes when output length is within [min, max]. Override per case via `metadata.length`. */
export function length(options: LengthOptions = {}): Scorer {
  return {
    name: 'length',
    score(output, evalCase) {
      const { unit = 'chars', min, max } = caseConfig(evalCase, 'length', options);
      if (min === undefined && max === undefined) {
        throw new Error(`length scorer: no min or max configured for case "${evalCase.id}"`);
      }
      const n = measure(output, unit);
      const tooShort = min !== undefined && n < min;
      const tooLong = max !== undefined && n > max;
      const pass = !tooShort && !tooLong;
      const bounds = `[${String(min ?? 0)}, ${String(max ?? '∞')}]`;
      return {
        score: pass ? 1 : 0,
        pass,
        reason: pass ? `${String(n)} ${unit} within ${bounds}` : `${String(n)} ${unit} outside ${bounds}`,
      };
    },
  };
}

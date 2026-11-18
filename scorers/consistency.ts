import type { EvalCase, Scorer } from '../src/types';
import { mean, stdDev } from './util';

export interface Sample {
  tier?: string;
  score?: number;
}

export interface ConsistencyOptions {
  /** Re-runs the task for a case, returning raw output. Typically wraps provider.generate. */
  run: (evalCase: EvalCase) => Promise<string>;
  /** Pulls the categorical tier and/or numeric score out of one output. */
  extract: (output: string) => Sample;
  /** Total samples, including the output already produced by the run. Default 3. */
  n?: number;
  /** Minimum fraction of samples agreeing on the modal tier. Default 1 (unanimous). */
  minTierAgreement?: number;
  /** Maximum population standard deviation of the numeric score. Default 0.1. */
  maxScoreStdDev?: number;
}

/**
 * Samples the same case n times (the original output is sample 1, so n-1 extra calls) and measures
 * tier agreement and score spread. Scoring is on agreement, not correctness: a model that is
 * consistently wrong passes this scorer.
 */
export function consistency(options: ConsistencyOptions): Scorer {
  const { run, extract, n = 3, minTierAgreement = 1, maxScoreStdDev = 0.1 } = options;
  if (n < 2) throw new Error('consistency scorer needs n >= 2');
  return {
    name: 'consistency',
    async score(output, evalCase) {
      // Sequential on purpose: keeps request rate low.
      const outs = [output];
      for (let i = 1; i < n; i++) outs.push(await run(evalCase));
      const samples = outs.map(extract);

      const parts: number[] = [];
      const notes: string[] = [];
      let pass = true;

      const tiers = samples.flatMap((s) => (s.tier === undefined ? [] : [s.tier]));
      if (tiers.length > 0) {
        const counts = new Map<string, number>();
        for (const t of tiers) counts.set(t, (counts.get(t) ?? 0) + 1);
        const agreement = Math.max(...counts.values()) / n;
        parts.push(agreement);
        notes.push(`tier agreement ${agreement.toFixed(2)} [${tiers.join(', ')}]`);
        if (tiers.length < n || agreement < minTierAgreement) pass = false;
      }

      const scores = samples.flatMap((s) => (s.score === undefined ? [] : [s.score]));
      if (scores.length > 0) {
        const sd = stdDev(scores);
        parts.push(Math.max(0, 1 - sd / maxScoreStdDev));
        notes.push(`score mean ${mean(scores).toFixed(3)} sd ${sd.toFixed(3)} [${scores.join(', ')}]`);
        if (scores.length < n || sd > maxScoreStdDev) pass = false;
      }

      if (parts.length === 0) {
        return { score: 0, pass: false, reason: 'extract() found no tier or score in any sample' };
      }
      return { score: mean(parts), pass, reason: notes.join('; ') };
    },
  };
}

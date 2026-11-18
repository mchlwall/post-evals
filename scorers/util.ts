import type { EvalCase, Scorer } from '../src/types';

/**
 * Per-case scorer config lives in `case.metadata[key]` so suites can be plain JSON/YAML.
 * Metadata values override the factory's defaults field by field.
 */
export function caseConfig<T extends object>(
  evalCase: EvalCase,
  key: string,
  defaults?: T,
): Partial<T> {
  const fromMeta = evalCase.metadata?.[key];
  const meta = typeof fromMeta === 'object' && fromMeta !== null && !Array.isArray(fromMeta) ? fromMeta : {};
  return { ...defaults, ...meta };
}

/** Restricts a scorer to the cases where `predicate` is true; other cases skip it. */
export function when(predicate: (evalCase: EvalCase) => boolean, scorer: Scorer): Scorer {
  return { ...scorer, appliesTo: predicate };
}

/** Predicate: the case has a `metadata[key]` value. */
export const hasMeta =
  (key: string) =>
  (evalCase: EvalCase): boolean =>
    evalCase.metadata?.[key] !== undefined;

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

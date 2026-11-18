/** One input to evaluate. `expected` and `metadata` carry whatever scorers need (schemas, keywords, ranges...). */
export interface EvalCase {
  id: string;
  input: string;
  expected?: string;
  metadata?: Record<string, unknown>;
}

/** Outcome of one scorer on one output. `score` is normalized to [0, 1]. */
export interface ScoreResult {
  score: number;
  pass: boolean;
  reason: string;
}

/**
 * Scorers are pure with respect to the harness: they see only the output and the case.
 * Scorers that need a model (LLM judge, consistency) are built by factories that close over a Provider.
 */
export interface Scorer {
  name: string;
  /** If present and false for a case, the runner skips this scorer for that case (no score recorded). */
  appliesTo?: (evalCase: EvalCase) => boolean;
  score(output: string, evalCase: EvalCase): ScoreResult | Promise<ScoreResult>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Result of running one case: the model output, every scorer's verdict, and rollups. */
export interface RunResult {
  caseId: string;
  /** null when generation failed; see `error`. */
  output: string | null;
  error?: string;
  latencyMs: number;
  usage?: TokenUsage;
  scores: Record<string, ScoreResult>;
  /** True only if there was no error and every scorer passed. */
  pass: boolean;
  /** Mean of scorer scores; 0 when errored. */
  meanScore: number;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  /** passed / total, 0 when total is 0. */
  passRate: number;
  meanScore: number;
}

export interface SuiteResult {
  suite: string;
  provider: string;
  model: string;
  startedAt: string;
  durationMs: number;
  gitSha?: string;
  cases: RunResult[];
  summary: SuiteSummary;
}

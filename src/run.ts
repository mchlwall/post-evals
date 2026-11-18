import type { Provider } from './providers';
import type { SuiteDefinition } from './suite';
import type { EvalCase, RunResult, ScoreResult, SuiteResult, TokenUsage } from './types';

export interface RunOptions {
  /** Cases in flight at once. Default 4. */
  concurrency?: number;
  gitSha?: string;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Runs fn over items with at most `limit` in flight, keeping results in input order. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Runs every case through the provider, then every scorer over the output.
 * A generation failure marks the case errored (the SDK already retries transient API errors).
 * A scorer that throws is recorded as a failed score with reason "scorer error: ...", so one bad
 * scorer never hides the others.
 */
export async function runSuite(
  suite: SuiteDefinition,
  cases: readonly EvalCase[],
  provider: Provider,
  options: RunOptions = {},
): Promise<SuiteResult> {
  const { concurrency = 4, gitSha } = options;
  const startedAt = new Date();
  const buildPrompt = suite.buildPrompt ?? ((c: EvalCase) => c.input);

  const generate = (c: EvalCase): ReturnType<Provider['generate']> =>
    provider.generate({ prompt: buildPrompt(c), system: suite.system });
  const scorers = suite.scorers({ provider, run: async (c) => (await generate(c)).text });

  const runCase = async (c: EvalCase): Promise<RunResult> => {
    const t0 = Date.now();
    let output: string;
    let usage: TokenUsage | undefined;
    try {
      const res = await generate(c);
      output = res.text;
      usage = res.usage;
    } catch (err) {
      return { caseId: c.id, output: null, error: errMsg(err), latencyMs: Date.now() - t0, scores: {}, pass: false, meanScore: 0 };
    }

    const latencyMs = Date.now() - t0;
    const scores: Record<string, ScoreResult> = {};
    for (const scorer of scorers) {
      if (scorer.appliesTo?.(c) === false) continue;
      try {
        scores[scorer.name] = await scorer.score(output, c);
      } catch (err) {
        scores[scorer.name] = { score: 0, pass: false, reason: `scorer error: ${errMsg(err)}` };
      }
    }
    const results = Object.values(scores);
    return {
      caseId: c.id,
      output,
      latencyMs,
      usage,
      scores,
      pass: results.every((s) => s.pass),
      meanScore: mean(results.map((s) => s.score)),
    };
  };

  const caseResults = await pool(cases, concurrency, runCase);

  const total = caseResults.length;
  const passed = caseResults.filter((r) => r.pass).length;
  const errored = caseResults.filter((r) => r.error !== undefined).length;
  return {
    suite: suite.name,
    provider: provider.name,
    model: provider.model,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    gitSha,
    cases: caseResults,
    summary: {
      total,
      passed,
      failed: total - passed - errored,
      errored,
      passRate: total === 0 ? 0 : passed / total,
      meanScore: mean(caseResults.map((r) => r.meanScore)),
    },
  };
}

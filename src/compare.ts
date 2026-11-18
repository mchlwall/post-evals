import type { SuiteResult } from './types';

export type DiffStatus = 'regression' | 'improvement' | 'unchanged' | 'new' | 'removed';

export interface CaseDiff {
  caseId: string;
  status: DiffStatus;
  beforePass?: boolean;
  afterPass?: boolean;
  beforeScore?: number;
  afterScore?: number;
}

export interface Comparison {
  diffs: CaseDiff[];
  passRateDelta: number;
  meanScoreDelta: number;
}

/** Per-case diff. A regression is a case that passed in the baseline and does not now. */
export function compare(current: SuiteResult, baseline: SuiteResult): Comparison {
  const before = new Map(baseline.cases.map((c) => [c.caseId, c]));
  const after = new Map(current.cases.map((c) => [c.caseId, c]));
  const diffs: CaseDiff[] = [];

  for (const c of current.cases) {
    const b = before.get(c.caseId);
    if (b === undefined) {
      diffs.push({ caseId: c.caseId, status: 'new', afterPass: c.pass, afterScore: c.meanScore });
      continue;
    }
    const status: DiffStatus = b.pass && !c.pass ? 'regression' : !b.pass && c.pass ? 'improvement' : 'unchanged';
    diffs.push({
      caseId: c.caseId,
      status,
      beforePass: b.pass,
      afterPass: c.pass,
      beforeScore: b.meanScore,
      afterScore: c.meanScore,
    });
  }
  for (const b of baseline.cases) {
    if (!after.has(b.caseId)) {
      diffs.push({ caseId: b.caseId, status: 'removed', beforePass: b.pass, beforeScore: b.meanScore });
    }
  }

  return {
    diffs,
    passRateDelta: current.summary.passRate - baseline.summary.passRate,
    meanScoreDelta: current.summary.meanScore - baseline.summary.meanScore,
  };
}

const fmt = (n: number | undefined): string => (n === undefined ? 'n/a' : n.toFixed(3));
const verdict = (p: boolean | undefined): string => (p === undefined ? 'n/a' : p ? 'pass' : 'fail');

export function describeDiff(d: CaseDiff): string {
  return `${d.status.toUpperCase().padEnd(11)} ${d.caseId}: ${verdict(d.beforePass)} -> ${verdict(d.afterPass)} (score ${fmt(d.beforeScore)} -> ${fmt(d.afterScore)})`;
}

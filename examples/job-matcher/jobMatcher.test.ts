import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dryRunProvider } from '../../src/dryRun';
import { MockProvider, sequence } from '../../src/providers';
import { runSuite } from '../../src/run';
import type { EvalCase } from '../../src/types';
import { createJobMatcherSuite } from './jobMatcher';
import { grounding, scoreInRange, tierMatch } from './scorers';

/** A synthetic golden set. The real one is private and is never used in tests. */
const SCHEMA = {
  type: 'object',
  required: ['job', 'tier', 'scores', 'gaps', 'whyStillStrong'],
  properties: {
    job: { type: 'object', required: ['file'], properties: { file: { type: 'string' } } },
    tier: { type: 'object', required: ['value'], properties: { value: { enum: ['Apply', 'Stretch', 'Skip'] } } },
    scores: { type: 'object', required: ['overall'], properties: { overall: { type: 'number' } } },
    gaps: { type: 'array' },
    whyStillStrong: { type: 'array' },
  },
};

const PERSONA = 'Seven years of automated testing with Playwright and Python. Built CI pipelines for regression suites.';
const JOBS: Record<string, string> = {
  'alpha.md': 'We need a test engineer with Kubernetes experience and strong Playwright skills for our payments platform.',
  'beta.md': 'Manual tester wanted for overnight support rota, relocation to Berlin required.',
};

const GAPS: Record<string, string> = {
  'jobs/alpha.md': 'Kubernetes experience for the payments platform',
  'jobs/beta.md': 'Relocation to Berlin required for the overnight support rota',
};

function report(file: string, tier: string, overall: number): object {
  return {
    job: { file },
    tier: { value: tier },
    scores: { overall },
    gaps: [{ description: GAPS[file] ?? 'Kubernetes experience for the payments platform' }],
    whyStillStrong: [{ point: 'automation', evidence: 'Seven years of automated testing with Playwright and Python' }],
  };
}

function makeDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'role-match-'));
  mkdirSync(path.join(dir, 'schema'));
  mkdirSync(path.join(dir, 'jobs'));
  mkdirSync(path.join(dir, 'reports'));
  writeFileSync(path.join(dir, 'persona.md'), PERSONA);
  writeFileSync(path.join(dir, 'rubric.md'), '# Rubric v1');
  writeFileSync(path.join(dir, 'schema/report.schema.json'), JSON.stringify(SCHEMA));
  for (const [f, text] of Object.entries(JOBS)) writeFileSync(path.join(dir, 'jobs', f), text);
  writeFileSync(path.join(dir, 'reports/alpha.json'), JSON.stringify(report('jobs/alpha.md', 'Apply', 7.4)));
  writeFileSync(path.join(dir, 'reports/beta.json'), JSON.stringify(report('jobs/beta.md', 'Skip', 3.1)));
  return dir;
}

const c = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: 'x',
  input: JOBS['alpha.md'] ?? '',
  expected: 'Apply',
  metadata: { scoreRange: [6.4, 8.4] },
  ...over,
});
const out = (r: object): string => JSON.stringify(r);

describe('job-matcher suite on a synthetic golden set', () => {
  it('loads cases, versions the suite by rubric hash, and replays the labels under --dry-run', async () => {
    const suite = createJobMatcherSuite(makeDir());
    expect(suite.name).toMatch(/^job-matcher-[0-9a-f]{7}$/);
    const cases = (await suite.loadCases?.()) ?? [];
    expect(cases.map((x) => [x.id, x.expected])).toEqual([['alpha', 'Apply'], ['beta', 'Skip']]);
    // consistency is sampled once per tier
    expect(cases.every((x) => x.metadata?.consistency === true)).toBe(true);

    const result = await runSuite(suite, cases, dryRunProvider(cases, suite));
    expect(result.cases.filter((r) => !r.pass).map((r) => [r.caseId, r.scores])).toEqual([]);
  });

  it('flags a wrong tier and an out-of-range score', async () => {
    const suite = createJobMatcherSuite(makeDir());
    const cases = (await suite.loadCases?.()) ?? [];
    const wrong = new MockProvider({ respond: () => out(report('jobs/alpha.md', 'Skip', 2)) });
    const result = await runSuite(suite, cases.slice(0, 1), wrong);
    const scores = result.cases[0]?.scores;
    expect(scores?.tierMatch?.pass).toBe(false);
    expect(scores?.scoreInRange?.pass).toBe(false);
    expect(scores?.jsonSchema?.pass).toBe(true);
  });

  it('fails consistency when reruns disagree on tier', async () => {
    const suite = createJobMatcherSuite(makeDir());
    const cases = (await suite.loadCases?.()) ?? [];
    const flaky = new MockProvider({
      respond: sequence([out(report('jobs/alpha.md', 'Apply', 7.4)), out(report('jobs/alpha.md', 'Stretch', 6.5))]),
    });
    const result = await runSuite(suite, cases.slice(0, 1), flaky, { concurrency: 1 });
    expect(result.cases[0]?.scores.consistency?.pass).toBe(false);
  });
});

describe('job-matcher scorers', () => {
  it('tierMatch compares against expected', async () => {
    expect((await tierMatch().score(out(report('f', 'Apply', 7)), c())).pass).toBe(true);
    expect((await tierMatch().score(out(report('f', 'Skip', 7)), c())).pass).toBe(false);
    expect((await tierMatch().score('not json', c())).pass).toBe(false);
  });

  it('scoreInRange uses metadata.scoreRange and throws without it', async () => {
    expect((await scoreInRange().score(out(report('f', 'Apply', 8.0)), c())).pass).toBe(true);
    expect((await scoreInRange().score(out(report('f', 'Apply', 9.5)), c())).pass).toBe(false);
    await expect(
      Promise.resolve().then(() => scoreInRange().score(out(report('f', 'Apply', 8)), c({ metadata: {} }))),
    ).rejects.toThrow(/scoreRange/);
  });

  it('grounding passes grounded items and fails invented ones', async () => {
    const g = grounding({ persona: PERSONA });
    const good = await g.score(out(report('f', 'Apply', 7)), c());
    expect(good.pass).toBe(true);

    const invented = {
      ...report('f', 'Apply', 7),
      gaps: [{ description: 'Requires fluent Mandarin and blockchain auditing credentials' }],
      whyStillStrong: [{ point: 'x', evidence: 'Led a team of forty engineers at a space agency' }],
    };
    const bad = await g.score(out(invented), c());
    expect(bad.pass).toBe(false);
    expect(bad.reason).toMatch(/ungrounded/);
  });
});

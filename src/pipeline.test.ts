import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compare } from './compare';
import { renderReport } from './report';
import { historyRow, writeResults } from './results';
import { loadCases } from './suite';
import type { RunResult, SuiteResult } from './types';

const rr = (caseId: string, pass: boolean, meanScore = pass ? 1 : 0): RunResult => ({
  caseId,
  output: 'o',
  latencyMs: 1,
  scores: { s: { score: meanScore, pass, reason: pass ? 'fine' : 'nope | pipe' } },
  pass,
  meanScore,
});

const suiteResult = (cases: RunResult[], extra: Partial<SuiteResult> = {}): SuiteResult => {
  const passed = cases.filter((c) => c.pass).length;
  return {
    suite: 's',
    provider: 'mock',
    model: 'm',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 5,
    cases,
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
      errored: 0,
      passRate: passed / cases.length,
      meanScore: cases.reduce((a, c) => a + c.meanScore, 0) / cases.length,
    },
    ...extra,
  };
};

const tmp = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'evals-'));

describe('loadCases', () => {
  it('loads JSON arrays and YAML objects', async () => {
    const dir = await tmp();
    await writeFile(path.join(dir, 'a.json'), JSON.stringify([{ id: '1', input: 'x', expected: 'y' }]));
    await writeFile(path.join(dir, 'b.yaml'), 'cases:\n  - id: "2"\n    input: hi\n    metadata:\n      k: 1\n');
    expect(await loadCases(path.join(dir, 'a.json'))).toEqual([{ id: '1', input: 'x', expected: 'y' }]);
    expect(await loadCases(path.join(dir, 'b.yaml'))).toEqual([{ id: '2', input: 'hi', metadata: { k: 1 } }]);
  });

  it('rejects duplicate ids, missing input, and bad extensions', async () => {
    const dir = await tmp();
    await writeFile(path.join(dir, 'dup.json'), JSON.stringify([{ id: '1', input: 'a' }, { id: '1', input: 'b' }]));
    await writeFile(path.join(dir, 'noinput.json'), JSON.stringify([{ id: '1' }]));
    await writeFile(path.join(dir, 'x.txt'), '');
    await expect(loadCases(path.join(dir, 'dup.json'))).rejects.toThrow(/duplicate id/);
    await expect(loadCases(path.join(dir, 'noinput.json'))).rejects.toThrow(/string "input"/);
    await expect(loadCases(path.join(dir, 'x.txt'))).rejects.toThrow(/unsupported extension/);
  });
});

describe('results', () => {
  it('writes a results file and appends history rows under one header', async () => {
    const dir = await tmp();
    const r = suiteResult([rr('a', true), rr('b', false)], { gitSha: 'abc123' });
    const file = await writeResults(r, dir);
    await writeResults(r, dir);
    expect(path.basename(file)).toBe('2026-01-01T00-00-00-000Z-s.json');
    expect((JSON.parse(await readFile(file, 'utf8')) as SuiteResult).suite).toBe('s');
    const lines = (await readFile(path.join(dir, 'history.csv'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('timestamp,suite,provider,model,pass_rate,mean_score,git_sha,cases');
    expect(lines[1]).toBe('2026-01-01T00:00:00.000Z,s,mock,m,0.5000,0.5000,abc123,2');
  });

  it('quotes csv cells containing commas', () => {
    expect(historyRow(suiteResult([rr('a', true)], { model: 'a,b' }))).toContain('"a,b"');
  });
});

describe('compare and report', () => {
  const baseline = suiteResult([rr('a', true), rr('b', true), rr('c', false), rr('gone', true)]);
  const current = suiteResult([rr('a', true), rr('b', false), rr('c', true), rr('fresh', true)]);

  it('classifies each case', () => {
    const byId = Object.fromEntries(compare(current, baseline).diffs.map((d) => [d.caseId, d.status]));
    expect(byId).toEqual({ a: 'unchanged', b: 'regression', c: 'improvement', fresh: 'new', gone: 'removed' });
  });

  it('renders a report with a summary and escaped per-case reasons', () => {
    const md = renderReport(current);
    expect(md).toContain('# Eval report: s');
    expect(md).toContain('## Summary');
    expect(md).toContain('| b | fail |');
    expect(md).toContain('nope \\| pipe');
  });
});

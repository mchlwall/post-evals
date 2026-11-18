import { exactMatch } from '../scorers';
import { MockProvider } from './providers';
import { runSuite } from './run';
import { defineSuite } from './suite';
import type { EvalCase, Scorer } from './types';

const cases: EvalCase[] = [
  { id: 'ok', input: 'a', expected: 'a' },
  { id: 'bad', input: 'b', expected: 'x' },
  { id: 'boom', input: 'throw', expected: 'x' },
];

const suite = (scorers: Scorer[]) => defineSuite({ name: 't', casesFile: 'unused.json', scorers: () => scorers });

describe('runSuite', () => {
  it('counts passed, failed, and errored cases', async () => {
    const provider = new MockProvider({
      respond: (req) => {
        if (req.prompt === 'throw') throw new Error('model down');
        return req.prompt;
      },
    });
    const result = await runSuite(suite([exactMatch()]), cases, provider);
    expect(result.summary).toMatchObject({ total: 3, passed: 1, failed: 1, errored: 1 });
    expect(result.summary.passRate).toBeCloseTo(1 / 3);
    expect(result.cases[2]?.error).toBe('model down');
    expect(result.cases[2]?.output).toBeNull();
    expect(result.provider).toBe('mock');
  });

  it('records a throwing scorer as a failed score without hiding others', async () => {
    const bad: Scorer = { name: 'bad', score: () => { throw new Error('misconfigured'); } };
    const result = await runSuite(suite([bad, exactMatch()]), cases.slice(0, 1), new MockProvider());
    const r = result.cases[0];
    expect(r?.scores.bad?.reason).toBe('scorer error: misconfigured');
    expect(r?.scores.exactMatch?.pass).toBe(true);
    expect(r?.pass).toBe(false);
  });

  it('skips scorers whose appliesTo returns false', async () => {
    const skipped: Scorer = { name: 'skipped', appliesTo: () => false, score: () => { throw new Error('should not run'); } };
    const result = await runSuite(suite([skipped, exactMatch()]), cases.slice(0, 1), new MockProvider());
    expect(Object.keys(result.cases[0]?.scores ?? {})).toEqual(['exactMatch']);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const slow: Scorer = {
      name: 'slow',
      score: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { score: 1, pass: true, reason: '' };
      },
    };
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), input: 'x' }));
    await runSuite(suite([slow]), many, new MockProvider(), { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty case list', async () => {
    const result = await runSuite(suite([exactMatch()]), [], new MockProvider());
    expect(result.summary).toMatchObject({ total: 0, passRate: 0 });
  });
});

import { MockProvider, sequence } from '../src/providers';
import { consistency, JUDGE_SCHEMA, llmJudge } from './index';
import { baseCase, outputs } from './fixtures';

describe('llmJudge', () => {
  it('returns the judge score and rationale, passing above the threshold', async () => {
    const provider = new MockProvider({ respond: () => '{"rationale":"Covers all points.","score":0.85}' });
    const r = await llmJudge({ provider, rubric: 'Mentions revenue and costs.' }).score(outputs.summary, baseCase);
    expect(r).toEqual({ score: 0.85, pass: true, reason: 'Covers all points.' });
  });

  it('fails below the threshold', async () => {
    const provider = new MockProvider({ respond: () => '{"rationale":"Misses costs.","score":0.4}' });
    const r = await llmJudge({ provider, rubric: 'x', passThreshold: 0.7 }).score(outputs.summary, baseCase);
    expect(r.pass).toBe(false);
  });

  it('sends the rubric, tagged output, and the strict schema', async () => {
    const provider = new MockProvider({ respond: () => '{"rationale":"ok","score":1}' });
    await llmJudge({ provider, rubric: 'RUBRIC-TEXT' }).score('OUTPUT-TEXT', baseCase);
    const req = provider.requests[0];
    expect(req?.prompt).toContain('RUBRIC-TEXT');
    expect(req?.prompt).toContain('<output>\nOUTPUT-TEXT\n</output>');
    expect(req?.jsonSchema).toBe(JUDGE_SCHEMA);
  });

  it.each([['{"rationale":"r","score":1.5}'], ['{"rationale":"r","score":"high"}'], ['not json']])(
    'throws on malformed judge output %s',
    async (bad) => {
      const provider = new MockProvider({ respond: () => bad });
      await expect(llmJudge({ provider, rubric: 'x' }).score('o', baseCase)).rejects.toThrow();
    },
  );
});

describe('consistency', () => {
  const extract = (o: string): { tier?: string; score?: number } => {
    const j = JSON.parse(o) as { tier: string; score: number };
    return { tier: j.tier, score: j.score };
  };
  const out = (tier: string, score: number): string => JSON.stringify({ tier, score });

  it('passes when samples agree', async () => {
    const provider = new MockProvider({ respond: () => out('strong', 0.9) });
    const s = consistency({ run: (c) => provider.generate({ prompt: c.input }).then((r) => r.text), extract });
    const r = await s.score(out('strong', 0.9), baseCase);
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
    expect(provider.requests).toHaveLength(2); // n=3 includes the original output
  });

  it('fails when tiers disagree and scores spread (simulated nondeterminism)', async () => {
    const provider = new MockProvider({ respond: sequence([out('weak', 0.3), out('strong', 0.9)]) });
    const s = consistency({ run: (c) => provider.generate({ prompt: c.input }).then((r) => r.text), extract });
    const r = await s.score(out('strong', 0.9), baseCase);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/tier agreement 0\.67/);
    expect(r.score).toBeLessThan(1);
  });

  it('honors a looser tier-agreement threshold', async () => {
    const provider = new MockProvider({ respond: sequence([out('weak', 0.9), out('strong', 0.9)]) });
    const s = consistency({
      run: (c) => provider.generate({ prompt: c.input }).then((r) => r.text),
      extract,
      minTierAgreement: 0.6,
    });
    expect((await s.score(out('strong', 0.9), baseCase)).pass).toBe(true);
  });

  it('rejects n < 2', () => {
    expect(() => consistency({ run: () => Promise.resolve(''), extract, n: 1 })).toThrow(/n >= 2/);
  });
});

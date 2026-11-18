import { exactMatch, fuzzyMatch, jsonSchema, keywords, length, levenshtein, regex } from './index';
import { baseCase, outputs, withMeta } from './fixtures';

describe('length', () => {
  it('passes within bounds and fails outside', async () => {
    const s = length({ unit: 'words', min: 3, max: 20 });
    expect((await s.score(outputs.summary, baseCase)).pass).toBe(true);
    expect((await s.score(outputs.empty, baseCase)).pass).toBe(false);
    expect((await s.score(outputs.long, baseCase)).pass).toBe(false);
  });
  it('lets case metadata override options', async () => {
    const s = length({ unit: 'chars', max: 10 });
    expect((await s.score(outputs.summary, withMeta({ length: { max: 500 } }))).pass).toBe(true);
  });
  it('estimates tokens as chars/4', async () => {
    const r = await length({ unit: 'tokens', max: 5 }).score('x'.repeat(21), baseCase);
    expect(r.pass).toBe(false);
  });
  it('throws when unconfigured', async () => {
    await expect(Promise.resolve().then(() => length().score('x', baseCase))).rejects.toThrow(/no min or max/);
  });
});

describe('keywords', () => {
  it('scores the fraction of satisfied checks', async () => {
    const r = await keywords({ present: ['revenue', 'costs', 'headcount'], absent: ['layoffs'] }).score(
      outputs.summary,
      baseCase,
    );
    expect(r.score).toBeCloseTo(0.75);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/missing: headcount/);
  });
  it('flags forbidden keywords case-insensitively', async () => {
    const r = await keywords({ absent: ['REVENUE'] }).score(outputs.summary, baseCase);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/forbidden present/);
  });
  it('supports case-sensitive matching', async () => {
    const r = await keywords({ present: ['Revenue'], caseSensitive: true }).score(outputs.summary, baseCase);
    expect(r.pass).toBe(false);
  });
});

describe('regex', () => {
  it('passes on match and on mustMatch=false non-match', async () => {
    expect((await regex({ pattern: '\\d+%' }).score(outputs.summary, baseCase)).pass).toBe(true);
    expect((await regex({ pattern: 'layoffs', mustMatch: false }).score(outputs.summary, baseCase)).pass).toBe(true);
  });
  it('fails on non-match', async () => {
    expect((await regex({ pattern: '^Q3' }).score(outputs.summary, baseCase)).pass).toBe(false);
  });
  it('reads the pattern from case metadata', async () => {
    const r = await regex().score(outputs.summary, withMeta({ regex: { pattern: 'grew', flags: 'i' } }));
    expect(r.pass).toBe(true);
  });
});

describe('jsonSchema', () => {
  const schema = {
    type: 'object',
    properties: { tier: { type: 'string' }, score: { type: 'number' } },
    required: ['tier', 'score'],
  };
  it('validates plain and fenced JSON', async () => {
    const s = jsonSchema();
    expect((await s.score(outputs.json, withMeta({ schema }))).pass).toBe(true);
    expect((await s.score(outputs.jsonFenced, withMeta({ schema }))).pass).toBe(true);
  });
  it('reports schema violations', async () => {
    const r = await jsonSchema().score(outputs.jsonBadShape, withMeta({ schema }));
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/schema violations/);
  });
  it('fails on non-JSON output', async () => {
    const r = await jsonSchema().score(outputs.prose, withMeta({ schema }));
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/not valid JSON/);
  });
  it('throws when no schema is available', async () => {
    await expect(Promise.resolve().then(() => jsonSchema().score(outputs.json, baseCase))).rejects.toThrow(/no schema/);
  });
});

describe('exactMatch', () => {
  it('ignores surrounding whitespace', async () => {
    expect((await exactMatch().score(` ${outputs.summary}\n`, baseCase)).pass).toBe(true);
  });
  it('is case-sensitive by default and optionally insensitive', async () => {
    expect((await exactMatch().score(outputs.summary.toUpperCase(), baseCase)).pass).toBe(false);
    expect((await exactMatch({ caseSensitive: false }).score(outputs.summary.toUpperCase(), baseCase)).pass).toBe(true);
  });
  it('throws without an expected value', async () => {
    await expect(
      Promise.resolve().then(() => exactMatch().score('a', { id: 'x', input: 'q' })),
    ).rejects.toThrow(/no expected/);
  });
});

describe('fuzzyMatch', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('passes near-matches above threshold and fails distant ones', async () => {
    const near = outputs.summary.replace('grew', 'rose');
    expect((await fuzzyMatch({ threshold: 0.8 }).score(near, baseCase)).pass).toBe(true);
    expect((await fuzzyMatch({ threshold: 0.8 }).score('completely different text', baseCase)).pass).toBe(false);
  });
  it('treats two empty strings as identical', async () => {
    const r = await fuzzyMatch().score('', { id: 'x', input: 'q', expected: '' });
    expect(r.score).toBe(1);
  });
});

import path from 'node:path';
import { dryRunProvider } from '../../src/dryRun';
import { runSuite } from '../../src/run';
import { loadCases } from '../../src/suite';
import suite from './suite';

describe('examples/basic (mock provider, no keys)', () => {
  it('runs end to end and every case passes', async () => {
    const cases = await loadCases(path.join(__dirname, 'cases.json'));
    const result = await runSuite(suite, cases, dryRunProvider(cases, suite));

    const failures = result.cases.filter((c) => !c.pass).map((c) => `${c.caseId}: ${JSON.stringify(c.scores)}`);
    expect(failures).toEqual([]);
    expect(result.summary.total).toBe(9);
  });

  it('exercises every scorer at least once', async () => {
    const cases = await loadCases(path.join(__dirname, 'cases.json'));
    const result = await runSuite(suite, cases, dryRunProvider(cases, suite));
    const used = new Set(result.cases.flatMap((c) => Object.keys(c.scores)));
    expect([...used].sort()).toEqual(
      ['consistency', 'exactMatch', 'fuzzyMatch', 'jsonSchema', 'keywords', 'length', 'llmJudge', 'regex'],
    );
  });
});

import { existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { compare, describeDiff } from './compare';
import { dryRunProvider } from './dryRun';
import { createProvider, isProviderName, PROVIDER_NAMES } from './providers';
import type { Provider } from './providers';
import { renderReport } from './report';
import { getGitSha, readResults, writeResults } from './results';
import { runSuite } from './run';
import { loadCases } from './suite';
import type { SuiteDefinition } from './suite';
import type { EvalCase } from './types';

function resolveSuiteFile(arg: string): string {
  const candidates = [arg, path.join('examples', arg, 'suite.ts')];
  const found = candidates.find((p) => existsSync(p) && statSync(p).isFile());
  if (found === undefined) throw new Error(`suite not found: tried ${candidates.join(', ')}`);
  return path.resolve(found);
}

async function loadSuite(file: string): Promise<SuiteDefinition> {
  interface Loaded {
    default?: SuiteDefinition | { default?: SuiteDefinition };
  }
  const mod = (await import(pathToFileURL(file).href)) as Loaded;
  // A CommonJS module imported via import() arrives wrapped one level deeper: { default: { default: def } }.
  const top = mod.default;
  const def = top !== undefined && 'default' in top ? top.default : (top as SuiteDefinition | undefined);
  if (def === undefined || typeof def.name !== 'string' || typeof def.scorers !== 'function') {
    throw new Error(`${file} must default-export a suite made with defineSuite()`);
  }
  return def;
}

function intOption(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

const program = new Command().name('eval').description('LLM output-evaluation harness');

program
  .command('run <suite>')
  .description('run a suite: a path to a suite module, or a name under examples/<name>/suite.ts')
  .option('--provider <name>', `one of ${PROVIDER_NAMES.join(', ')}`, 'anthropic')
  .option('--model <id>', 'model id (required for anthropic)')
  .option('--dry-run', 'use the mock provider; no API keys or network')
  .option('--compare <results.json>', 'print a per-case regression diff against a previous results file')
  .option('--limit <n>', 'run only the first n cases (cheap smoke runs)')
  .option('--concurrency <n>', 'cases in flight at once', '4')
  .option('--min-pass-rate <rate>', 'exit 1 if pass rate is below this (0-1)')
  .option('--results-dir <dir>', 'where to write results', 'results')
  .action(
    async (
      suiteArg: string,
      opts: {
        provider: string;
        model?: string;
        dryRun?: boolean;
        compare?: string;
        limit?: string;
        concurrency: string;
        minPassRate?: string;
        resultsDir: string;
      },
    ) => {
      const suiteFile = resolveSuiteFile(suiteArg);
      const def = await loadSuite(suiteFile);
      let cases: EvalCase[];
      if (def.loadCases !== undefined) cases = await def.loadCases();
      else if (def.casesFile !== undefined) cases = await loadCases(path.resolve(path.dirname(suiteFile), def.casesFile));
      else throw new Error(`suite "${def.name}" defines neither casesFile nor loadCases`);
      if (opts.limit !== undefined) cases = cases.slice(0, intOption('--limit', opts.limit));

      let provider: Provider;
      if (opts.dryRun === true) {
        provider = dryRunProvider(cases, def);
      } else {
        if (!isProviderName(opts.provider)) throw new Error(`unknown provider "${opts.provider}"`);
        provider = createProvider(opts.provider, { model: opts.model });
      }

      const gitSha = getGitSha();
      const result = await runSuite(def, cases, provider, {
        concurrency: intOption('--concurrency', opts.concurrency),
        gitSha,
      });

      const file = await writeResults(result, opts.resultsDir);
      const s = result.summary;
      console.log(
        `${result.suite} [${result.provider}/${result.model}]: ${String(s.passed)}/${String(s.total)} passed ` +
          `(${(s.passRate * 100).toFixed(1)}%), mean score ${s.meanScore.toFixed(3)}, ${String(s.errored)} errored`,
      );
      console.log(`wrote ${file}`);

      for (const c of result.cases.filter((r) => !r.pass)) {
        const why = c.error ?? Object.entries(c.scores).filter(([, v]) => !v.pass).map(([k, v]) => `${k}: ${v.reason}`).join('; ');
        console.log(`  FAIL ${c.caseId}: ${why}`);
      }

      if (opts.compare !== undefined) {
        const cmp = compare(result, await readResults(opts.compare));
        console.log(`\nvs ${opts.compare}: pass rate ${(cmp.passRateDelta * 100).toFixed(1)} pts, mean score ${cmp.meanScoreDelta.toFixed(3)}`);
        for (const d of cmp.diffs.filter((x) => x.status !== 'unchanged')) console.log(`  ${describeDiff(d)}`);
      }

      if (opts.minPassRate !== undefined) {
        const min = Number(opts.minPassRate);
        if (Number.isNaN(min) || min < 0 || min > 1) throw new Error('--min-pass-rate must be between 0 and 1');
        if (s.passRate < min) {
          console.error(`pass rate ${s.passRate.toFixed(3)} is below --min-pass-rate ${String(min)}`);
          process.exitCode = 1;
        }
      }
    },
  );

program
  .command('report <results>')
  .description('render a Markdown report from a results file')
  .option('--out <file.md>', 'write to a file instead of stdout')
  .action(async (resultsFile: string, opts: { out?: string }) => {
    const md = renderReport(await readResults(resultsFile));
    if (opts.out === undefined) process.stdout.write(md);
    else await writeFile(opts.out, md);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

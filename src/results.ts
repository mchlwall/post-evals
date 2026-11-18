import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SuiteResult } from './types';

export const HISTORY_HEADER = 'timestamp,suite,provider,model,pass_rate,mean_score,git_sha,cases';

export function getGitSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function historyRow(r: SuiteResult): string {
  return [
    r.startedAt,
    r.suite,
    r.provider,
    r.model,
    r.summary.passRate.toFixed(4),
    r.summary.meanScore.toFixed(4),
    r.gitSha ?? '',
    String(r.summary.total),
  ]
    .map(csvCell)
    .join(',');
}

/** Writes `<dir>/<timestamp>-<suite>.json` and appends a row to `<dir>/history.csv`. Returns the JSON path. */
export async function writeResults(result: SuiteResult, dir = 'results'): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${result.suite}.json`);
  await writeFile(file, JSON.stringify(result, null, 2) + '\n');

  const history = path.join(dir, 'history.csv');
  const exists = await stat(history).then(() => true, () => false);
  await appendFile(history, `${exists ? '' : HISTORY_HEADER + '\n'}${historyRow(result)}\n`);
  return file;
}

export async function readResults(file: string): Promise<SuiteResult> {
  return JSON.parse(await readFile(file, 'utf8')) as SuiteResult;
}

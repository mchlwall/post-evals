import type { RunResult, SuiteResult } from './types';

const cell = (s: string, max = 200): string => {
  const flat = s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function problems(c: RunResult): string {
  if (c.error !== undefined) return `error: ${c.error}`;
  return Object.entries(c.scores)
    .filter(([, s]) => !s.pass)
    .map(([name, s]) => `${name}: ${s.reason}`)
    .join('; ');
}

/** Markdown report: a summary table and per-case results with reasons. Regressions: see `run --compare`. */
export function renderReport(result: SuiteResult): string {
  const s = result.summary;
  const lines: string[] = [
    `# Eval report: ${result.suite}`,
    '',
    `- Model: \`${result.provider}/${result.model}\``,
    `- Run: ${result.startedAt} (${String(Math.round(result.durationMs))} ms)`,
    ...(result.gitSha === undefined ? [] : [`- Commit: \`${result.gitSha}\``]),
    '',
    '## Summary',
    '',
    '| Total | Passed | Failed | Errored | Pass rate | Mean score |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${String(s.total)} | ${String(s.passed)} | ${String(s.failed)} | ${String(s.errored)} | ${pct(s.passRate)} | ${s.meanScore.toFixed(3)} |`,
    '',
  ];

  lines.push('## Cases', '', '| Case | Result | Score | Reasons |', '| --- | --- | ---: | --- |');
  for (const c of result.cases) {
    const verdict = c.error !== undefined ? 'error' : c.pass ? 'pass' : 'fail';
    lines.push(`| ${cell(c.caseId)} | ${verdict} | ${c.meanScore.toFixed(3)} | ${cell(problems(c))} |`);
  }
  return lines.join('\n') + '\n';
}

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalCase } from '../../src/types';

export interface Golden {
  persona: string;
  rubric: string;
  schema: Record<string, unknown>;
  /** Short hash of rubric.md; identifies the rubric version in history.csv. */
  rubricVersion: string;
  cases: EvalCase[];
}

interface GoldenReport {
  job: { file: string };
  tier: { value: string };
  scores: { overall: number };
}

function isGoldenReport(v: unknown): v is GoldenReport {
  const r = v as Partial<GoldenReport> | null;
  return (
    typeof r?.job?.file === 'string' && typeof r.tier?.value === 'string' && typeof r.scores?.overall === 'number'
  );
}

/**
 * Reads the role-match golden set from `dir` at run time. Nothing is copied into this repo: the
 * persona and job posts are private.
 *
 *   persona.md, rubric.md, schema/report.schema.json   the task definition
 *   reports/<name>.json                                labelled reports (tier, overall score, ...)
 *   <report.job.file>                                  the job post each report grades
 *
 * Each case's input is the job post, `expected` is the golden tier, and the golden report itself is
 * kept as `metadata.mockOutput` so `--dry-run` replays the labels.
 */
export function loadGolden(dir: string, tolerance = 1): Golden {
  const read = (rel: string): string => readFileSync(path.join(dir, rel), 'utf8');
  const persona = read('persona.md');
  const rubric = read('rubric.md');
  const schema = JSON.parse(read('schema/report.schema.json')) as Record<string, unknown>;

  const files = readdirSync(path.join(dir, 'reports')).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no reports/*.json found under ${dir}`);

  const cases = files.map((f): EvalCase => {
    const raw = read(`reports/${f}`);
    const report: unknown = JSON.parse(raw);
    if (!isGoldenReport(report)) throw new Error(`reports/${f} is missing job.file, tier.value or scores.overall`);
    const overall = report.scores.overall;
    return {
      id: f.replace(/\.json$/, ''),
      input: read(report.job.file),
      expected: report.tier.value,
      metadata: {
        file: report.job.file,
        schema,
        scoreRange: [overall - tolerance, overall + tolerance],
        mockOutput: raw,
      },
    };
  });

  return {
    persona,
    rubric,
    schema,
    rubricVersion: createHash('sha1').update(rubric).digest('hex').slice(0, 7),
    cases,
  };
}

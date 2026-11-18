import { consistency, hasMeta, jsonSchema, when } from '../../scorers';
import { defineSuite } from '../../src/suite';
import type { SuiteDefinition } from '../../src/suite';
import type { EvalCase } from '../../src/types';
import { loadGolden } from './golden';
import { grounding, reportSample, scoreInRange, tierMatch } from './scorers';

const INSTRUCTIONS = `You grade one job post against one candidate persona using the rubric below.
Follow the rubric exactly: criterion scores 0-3, the four dimension scores, the weighted overall score, the hard-constraint override, then the tier rules in order.
Use only facts in the persona and the job post.
Reply with a single JSON object that validates against the JSON Schema below, and nothing else: no prose, no markdown fences.
Set job.file to the "Job file" given in the user message. scoredAt can be any ISO 8601 date-time.`;

export interface JobMatcherOptions {
  /** Allowed distance between output overall score and golden overall score. Default 1.0. */
  scoreTolerance?: number;
}

/**
 * Builds the job-matcher suite from a role-match checkout. Cost note: every case sends the persona
 * and rubric, and consistency re-runs only one representative case per tier (2 extra calls each).
 */
export function createJobMatcherSuite(dir: string, options: JobMatcherOptions = {}): SuiteDefinition {
  const golden = loadGolden(dir, options.scoreTolerance);

  // One consistency sample per golden tier: the first case seen for it.
  const sampled = new Set<string>();
  const cases: EvalCase[] = golden.cases.map((c) => {
    const tier = c.expected ?? '';
    if (sampled.has(tier)) return c;
    sampled.add(tier);
    return { ...c, metadata: { ...c.metadata, consistency: true } };
  });

  return defineSuite({
    name: `job-matcher-${golden.rubricVersion}`,
    loadCases: () => Promise.resolve(cases),
    system: [
      INSTRUCTIONS,
      `<persona>\n${golden.persona}\n</persona>`,
      `<rubric>\n${golden.rubric}\n</rubric>`,
      `<json_schema>\n${JSON.stringify(golden.schema)}\n</json_schema>`,
    ].join('\n\n'),
    buildPrompt: (c) => {
      const file = typeof c.metadata?.file === 'string' ? c.metadata.file : 'jobs/unknown.md';
      return `Job file: ${file}\n\n<job_post>\n${c.input}\n</job_post>`;
    },
    scorers: ({ run }) => [
      jsonSchema(),
      tierMatch(),
      scoreInRange(),
      grounding({ persona: golden.persona, rubric: golden.rubric }),
      // Overall is on a 1-10 scale, so allow a standard deviation of 0.5 across the 3 runs.
      when(hasMeta('consistency'), consistency({ run, extract: reportSample, n: 3, maxScoreStdDev: 0.5 })),
    ],
  });
}

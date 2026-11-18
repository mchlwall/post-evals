import { extractJson } from '../../src/providers';
import type { Sample } from '../../scorers';
import type { Scorer } from '../../src/types';

/** The parts of a role-match report these scorers read. Everything is optional: models get things wrong. */
export interface Report {
  tier?: { value?: unknown };
  scores?: { overall?: unknown };
  gaps?: { description?: unknown }[];
  criteria?: { text?: unknown; status?: unknown }[];
  whyStillStrong?: { evidence?: unknown }[];
}

export function parseReport(output: string): Report | undefined {
  try {
    const v = extractJson(output);
    return typeof v === 'object' && v !== null ? v : undefined;
  } catch {
    return undefined;
  }
}

const fail = (reason: string) => ({ score: 0, pass: false, reason });

/** Output tier equals the golden tier (`case.expected`). */
export function tierMatch(): Scorer {
  return {
    name: 'tierMatch',
    score(output, evalCase) {
      const report = parseReport(output);
      if (report === undefined) return fail('output is not a JSON object');
      const got = report.tier?.value;
      const pass = got === evalCase.expected;
      return { score: pass ? 1 : 0, pass, reason: `tier ${String(got)} vs golden ${String(evalCase.expected)}` };
    },
  };
}

/** Output overall score falls inside `metadata.scoreRange` (golden overall ± tolerance). */
export function scoreInRange(): Scorer {
  return {
    name: 'scoreInRange',
    score(output, evalCase) {
      const range = evalCase.metadata?.scoreRange;
      if (!Array.isArray(range) || typeof range[0] !== 'number' || typeof range[1] !== 'number') {
        throw new Error(`scoreInRange: case "${evalCase.id}" has no numeric metadata.scoreRange`);
      }
      const report = parseReport(output);
      const overall = report?.scores?.overall;
      if (typeof overall !== 'number') return fail('output has no numeric scores.overall');
      const pass = overall >= range[0] && overall <= range[1];
      return {
        score: pass ? 1 : 0,
        pass,
        reason: `overall ${String(overall)} ${pass ? 'within' : 'outside'} [${range[0].toFixed(1)}, ${range[1].toFixed(1)}]`,
      };
    },
  };
}

const tokens = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

function overlap(item: string, source: Set<string>): number {
  const t = [...tokens(item)];
  return t.length === 0 ? 1 : t.filter((x) => source.has(x)).length / t.length;
}

const strings = (xs: (Record<string, unknown> | undefined)[] | undefined, key: string): string[] =>
  Array.isArray(xs) ? xs.flatMap((x) => (typeof x?.[key] === 'string' ? [x[key]] : [])) : [];

export interface GroundingOptions {
  persona: string;
  /** Rubric text; its vocabulary ("tier", "essential", salary bands) legitimately appears in narrative items. */
  rubric?: string;
  /** Share of an item's words (4+ letters) that must appear in its source text. Default 0.6. */
  minOverlap?: number;
  /** Share of items that must be grounded for the case to pass. Default 0.8. */
  minFraction?: number;
}

/**
 * Checks the report is anchored in the inputs, not invented:
 *  - criteria marked "missing" must be worded from the job post (strict: the schema says criterion
 *    text is "worded close to the original post");
 *  - gaps and strengths (whyStillStrong evidence) must be findable in the job post, persona or
 *    rubric combined. They are narrative and mix sources ("SQL is 1/5 but the post requires..."),
 *    so a single-source check wrongly fails real labelled reports.
 * A crude word-overlap test. It catches wholesale invention, not subtle misstatement, and it
 * penalises legitimate paraphrase. Calibrate the thresholds against the golden reports first.
 */
export function grounding(options: GroundingOptions): Scorer {
  const { persona, rubric = '', minOverlap = 0.6, minFraction = 0.8 } = options;
  const knownTokens = tokens(`${persona}\n${rubric}`);
  return {
    name: 'grounding',
    score(output, evalCase) {
      const report = parseReport(output);
      if (report === undefined) return fail('output is not a JSON object');

      const jobTokens = tokens(evalCase.input);
      const known = new Set([...knownTokens, ...jobTokens]);
      const groups = [
        {
          kind: 'missing criteria vs post',
          items: strings(report.criteria?.filter((c) => c.status === 'missing'), 'text'),
          source: jobTokens,
        },
        { kind: 'gaps vs post+persona+rubric', items: strings(report.gaps, 'description'), source: known },
        { kind: 'strengths vs post+persona+rubric', items: strings(report.whyStillStrong, 'evidence'), source: known },
      ];

      const checks = groups.flatMap((g) =>
        g.items.map((text) => ({ kind: g.kind, text, ok: overlap(text, g.source) >= minOverlap })),
      );
      if (checks.length === 0) return fail('no gaps, missing criteria or strengths to check');

      const grounded = checks.filter((c) => c.ok).length;
      const fraction = grounded / checks.length;
      const breakdown = groups
        .filter((g) => g.items.length > 0)
        .map((g) => `${g.kind} ${String(checks.filter((c) => c.kind === g.kind && c.ok).length)}/${String(g.items.length)}`)
        .join(', ');
      const bad = checks.filter((c) => !c.ok).slice(0, 3).map((c) => `[${c.kind}] ${c.text.slice(0, 80)}`);
      return {
        score: fraction,
        pass: fraction >= minFraction,
        reason: `${breakdown}${bad.length > 0 ? `; ungrounded: ${bad.join(' | ')}` : ''}`,
      };
    },
  };
}

/** Pulls the tier and overall score out of a report, for the consistency scorer. */
export function reportSample(output: string): Sample {
  const report = parseReport(output);
  const tier = report?.tier?.value;
  const overall = report?.scores?.overall;
  return {
    ...(typeof tier === 'string' ? { tier } : {}),
    ...(typeof overall === 'number' ? { score: overall } : {}),
  };
}

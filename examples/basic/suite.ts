import { consistency, exactMatch, fuzzyMatch, hasMeta, jsonSchema, keywords, length, llmJudge, regex, when } from '../../scorers';
import { defineSuite } from '../../src/suite';

/** Reads the sentiment out of a JSON answer; used as the "tier" for the consistency scorer. */
function sentimentTier(output: string): { tier?: string } {
  try {
    const parsed = JSON.parse(output) as { sentiment?: unknown };
    return typeof parsed.sentiment === 'string' ? { tier: parsed.sentiment } : {};
  } catch {
    return {};
  }
}

/**
 * One suite, every scorer. Each case opts into scorers through its metadata (see cases.json), and
 * `when(...)` skips a scorer for cases that don't configure it.
 */
export default defineSuite({
  name: 'basic',
  casesFile: 'cases.json',
  system: 'You are a precise assistant. Follow the requested output format exactly and keep answers short.',
  scorers: ({ provider, run }) => [
    when(hasMeta('length'), length()),
    when(hasMeta('keywords'), keywords()),
    when(hasMeta('regex'), regex()),
    when(hasMeta('schema'), jsonSchema()),
    when((c) => c.metadata?.match === 'exact', exactMatch({ caseSensitive: false })),
    when((c) => c.metadata?.match === 'fuzzy', fuzzyMatch({ threshold: 0.8 })),
    when(
      hasMeta('judge'),
      llmJudge({
        provider,
        rubric: 'The summary is faithful to the source, includes every key fact, adds nothing new, and is one sentence.',
      }),
    ),
    when(hasMeta('consistency'), consistency({ run, extract: sentimentTier, n: 3 })),
  ],
});

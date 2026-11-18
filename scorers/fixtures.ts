import type { EvalCase } from '../src/types';

/** Fixture outputs shared by the scorer tests. */
export const outputs = {
  summary: 'The quarterly report shows revenue grew 12% while costs stayed flat.',
  empty: '',
  long: 'word '.repeat(200),
  json: '{"tier":"strong","score":0.9,"missing":["kubernetes"]}',
  jsonFenced: '```json\n{"tier":"strong","score":0.9,"missing":[]}\n```',
  jsonBadShape: '{"tier":7}',
  prose: 'I could not produce JSON, sorry.',
} as const;

export const baseCase: EvalCase = {
  id: 'c1',
  input: 'Summarize the report.',
  expected: 'The quarterly report shows revenue grew 12% while costs stayed flat.',
};

export const withMeta = (metadata: Record<string, unknown>, extra: Partial<EvalCase> = {}): EvalCase => ({
  ...baseCase,
  metadata,
  ...extra,
});

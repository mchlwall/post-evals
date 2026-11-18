import { MockProvider } from './providers';
import type { Provider } from './providers';
import type { SuiteDefinition } from './suite';
import type { EvalCase } from './types';

/**
 * Provider for --dry-run and CI. Answers each case's prompt with `metadata.mockOutput` (or echoes
 * the prompt), and any structured-output request (the LLM judge) with a fixed passing verdict.
 * No keys, no network. Proves the plumbing, says nothing about model quality.
 */
export function dryRunProvider(cases: readonly EvalCase[], def: SuiteDefinition): Provider {
  const build = def.buildPrompt ?? ((c: EvalCase) => c.input);
  const canned: Record<string, string> = {};
  for (const c of cases) {
    const out = c.metadata?.mockOutput;
    if (typeof out === 'string') canned[build(c)] = out;
  }
  return new MockProvider({
    model: 'mock-dry-run',
    respond: (req) =>
      req.jsonSchema === undefined ? (canned[req.prompt] ?? req.prompt) : '{"rationale":"mock judge","score":0.9}',
  });
}

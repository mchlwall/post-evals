import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Provider } from './providers';
import type { EvalCase, Scorer } from './types';

export interface ScorerContext {
  provider: Provider;
  /** Re-runs the suite's task for a case (same prompt). Used by consistency scorers. */
  run: (evalCase: EvalCase) => Promise<string>;
}

/** A suite is code (scorers) plus data (a cases file). Export one as `default` from `examples/<name>/suite.ts`. */
export interface SuiteDefinition {
  name: string;
  /** JSON or YAML file, relative to the suite module. Provide this or `loadCases`. */
  casesFile?: string;
  /** Builds cases in code, for data that can't live in this repo (e.g. a private golden set). */
  loadCases?: () => Promise<EvalCase[]>;
  system?: string;
  /** Turns a case into the prompt sent to the model. Default: the case input. */
  buildPrompt?: (evalCase: EvalCase) => string;
  scorers: (ctx: ScorerContext) => Scorer[];
}

export function defineSuite(def: SuiteDefinition): SuiteDefinition {
  return def;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Loads cases from a JSON or YAML file: either an array of cases or `{ cases: [...] }`. */
export async function loadCases(file: string): Promise<EvalCase[]> {
  const text = await readFile(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  let data: unknown;
  if (ext === '.json') data = JSON.parse(text);
  else if (ext === '.yaml' || ext === '.yml') data = parseYaml(text);
  else throw new Error(`${file}: unsupported extension "${ext}" (use .json, .yaml or .yml)`);

  const list = Array.isArray(data) ? (data as unknown[]) : isRecord(data) ? data.cases : undefined;
  if (!Array.isArray(list)) {
    throw new Error(`${file}: expected an array of cases or an object with a "cases" array`);
  }

  const seen = new Set<string>();
  return (list as unknown[]).map((raw, i) => {
    const where = `${file}: case #${String(i + 1)}`;
    if (!isRecord(raw)) throw new Error(`${where} is not an object`);
    if (typeof raw.id !== 'string' || raw.id === '') throw new Error(`${where} needs a string "id"`);
    if (seen.has(raw.id)) throw new Error(`${where}: duplicate id "${raw.id}"`);
    seen.add(raw.id);
    if (typeof raw.input !== 'string') throw new Error(`${where} ("${raw.id}") needs a string "input"`);
    if (raw.expected !== undefined && typeof raw.expected !== 'string') {
      throw new Error(`${where} ("${raw.id}"): "expected" must be a string`);
    }
    if (raw.metadata !== undefined && !isRecord(raw.metadata)) {
      throw new Error(`${where} ("${raw.id}"): "metadata" must be an object`);
    }
    return { id: raw.id, input: raw.input, expected: raw.expected, metadata: raw.metadata };
  });
}

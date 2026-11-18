import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv/dist/2020';
import { extractJson } from '../src/providers';
import type { Scorer } from '../src/types';

export interface JsonSchemaOptions {
  /** Default schema; `metadata.schema` on a case takes precedence. */
  schema?: Record<string, unknown>;
}

// Ajv2020 handles draft 2020-12 and plain schemas. Formats (uri, date-time) are not validated.
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
// Compiling the same $id twice throws, so compiled validators are cached by schema content.
const compiled = new Map<string, ValidateFunction>();

function validatorFor(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  let fn = compiled.get(key);
  if (fn === undefined) {
    fn = ajv.compile(schema);
    compiled.set(key, fn);
  }
  return fn;
}

/** Output must be JSON (fences tolerated) that validates against the case's schema. */
export function jsonSchema(options: JsonSchemaOptions = {}): Scorer {
  return {
    name: 'jsonSchema',
    score(output, evalCase) {
      const fromCase = evalCase.metadata?.schema;
      const schema =
        typeof fromCase === 'object' && fromCase !== null ? (fromCase as Record<string, unknown>) : options.schema;
      if (schema === undefined) {
        throw new Error(`jsonSchema scorer: no schema in metadata.schema or options for case "${evalCase.id}"`);
      }

      let parsed: unknown;
      try {
        parsed = extractJson(output);
      } catch (err) {
        return { score: 0, pass: false, reason: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
      }

      const validate = validatorFor(schema);
      if (validate(parsed)) return { score: 1, pass: true, reason: 'valid against schema' };
      const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
      return { score: 0, pass: false, reason: `schema violations: ${errors.join('; ')}` };
    },
  };
}

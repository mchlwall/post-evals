import type { GenerateRequest, GenerateResponse, Provider } from './types';

/** Decides the mock's output. `call` is the zero-based index of this generate() call on the provider. */
export type MockResponder = (req: GenerateRequest, call: number) => string;

export interface MockProviderOptions {
  model?: string;
  respond?: MockResponder;
}

/** Returns canned outputs so tests and CI run without API keys. Records every request it sees. */
export class MockProvider implements Provider {
  readonly name = 'mock';
  readonly model: string;
  readonly requests: GenerateRequest[] = [];
  private readonly respond: MockResponder;

  constructor(opts: MockProviderOptions = {}) {
    this.model = opts.model ?? 'mock-1';
    this.respond = opts.respond ?? ((req) => req.prompt);
  }

  generate(req: GenerateRequest): Promise<GenerateResponse> {
    const call = this.requests.length;
    this.requests.push(req);
    try {
      return Promise.resolve({ text: this.respond(req, call), model: this.model });
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/** Responder that walks through `outputs` in order, repeating the last one. Simulates nondeterminism. */
export function sequence(outputs: readonly string[]): MockResponder {
  if (outputs.length === 0) throw new Error('sequence() needs at least one output');
  return (_req, call) => outputs.at(Math.min(call, outputs.length - 1)) ?? '';
}

/** Responder that cycles through `outputs` forever. */
export function cycle(outputs: readonly string[]): MockResponder {
  if (outputs.length === 0) throw new Error('cycle() needs at least one output');
  return (_req, call) => outputs.at(call % outputs.length) ?? '';
}

/** Responder that answers by prompt lookup, falling back to `fallback`. */
export function byPrompt(map: Readonly<Record<string, string>>, fallback = ''): MockResponder {
  return (req) => map[req.prompt] ?? fallback;
}

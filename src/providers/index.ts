import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import type { Provider } from './types';

export type { GenerateRequest, GenerateResponse, Provider } from './types';
export { AnthropicProvider } from './anthropic';
export { MockProvider, sequence, cycle, byPrompt } from './mock';
export { extractJson } from './util';

export const PROVIDER_NAMES = ['anthropic', 'mock'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

/** To add a provider: implement `Provider` in `src/providers/<name>.ts`, then add it here. */
export function createProvider(name: ProviderName, opts: { model?: string } = {}): Provider {
  switch (name) {
    case 'mock':
      return new MockProvider({ model: opts.model });
    case 'anthropic':
      if (opts.model === undefined) throw new Error('--model is required for provider "anthropic"');
      return new AnthropicProvider({ model: opts.model });
  }
}

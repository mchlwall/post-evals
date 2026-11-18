import type { TokenUsage } from '../types';

export interface GenerateRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  /**
   * Constrain the output to this JSON Schema using the provider's native structured output
   * (Anthropic `output_config.format`). Keep schemas simple: `additionalProperties: false` and
   * every property listed in `required`.
   */
  jsonSchema?: Record<string, unknown>;
}

export interface GenerateResponse {
  text: string;
  /** Model that actually served the request, as reported by the API. */
  model: string;
  usage?: TokenUsage;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

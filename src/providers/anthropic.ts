import Anthropic from '@anthropic-ai/sdk';
import type { GenerateRequest, GenerateResponse, Provider } from './types';

export interface AnthropicProviderOptions {
  model: string;
  /** Output cap per request. Thinking tokens count against it on current models, so keep it generous. */
  maxTokens?: number;
  /** Inject a client (tests); by default credentials come from the environment (ANTHROPIC_API_KEY). */
  client?: Anthropic;
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.client = opts.client ?? new Anthropic();
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? this.maxTokens,
      messages: [{ role: 'user', content: req.prompt }],
      system: req.system,
      ...(req.jsonSchema === undefined
        ? {}
        : { output_config: { format: { type: 'json_schema' as const, schema: req.jsonSchema } } }),
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(`model refused the request (${response.stop_details?.category ?? 'unknown category'})`);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

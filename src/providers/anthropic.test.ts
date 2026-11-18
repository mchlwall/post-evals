import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './anthropic';

/** Fake SDK client: records the request and returns a canned response. No network. */
function fakeClient(response: unknown): { client: Anthropic; calls: unknown[] } {
  const calls: unknown[] = [];
  const client = {
    messages: {
      create: (req: unknown): Promise<unknown> => {
        calls.push(req);
        return Promise.resolve(response);
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const ok = (content: unknown[] = [{ type: 'text', text: 'hello' }]): unknown => ({
  content,
  model: 'served-model',
  stop_reason: 'end_turn',
  usage: { input_tokens: 11, output_tokens: 7 },
});

describe('AnthropicProvider (fake client)', () => {
  it('sends model, max_tokens and the prompt, and maps text and usage', async () => {
    const { client, calls } = fakeClient(ok());
    const p = new AnthropicProvider({ model: 'm1', client });
    const res = await p.generate({ prompt: 'hi' });

    expect(calls[0]).toEqual({ model: 'm1', max_tokens: 4096, messages: [{ role: 'user', content: 'hi' }] });
    expect(res).toEqual({ text: 'hello', model: 'served-model', usage: { inputTokens: 11, outputTokens: 7 } });
    expect(p.name).toBe('anthropic');
    expect(p.model).toBe('m1');
  });

  it('passes system, a per-request maxTokens override, and never sends temperature', async () => {
    const { client, calls } = fakeClient(ok());
    await new AnthropicProvider({ model: 'm1', client, maxTokens: 100 }).generate({ prompt: 'p', system: 's' });
    await new AnthropicProvider({ model: 'm1', client }).generate({ prompt: 'p', maxTokens: 50 });

    expect(calls[0]).toMatchObject({ system: 's', max_tokens: 100 });
    expect(calls[1]).toMatchObject({ max_tokens: 50 });
    expect(JSON.stringify(calls)).not.toContain('temperature');
  });

  it('requests structured output when a schema is given', async () => {
    const { client, calls } = fakeClient(ok());
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    await new AnthropicProvider({ model: 'm1', client }).generate({ prompt: 'p', jsonSchema: schema });
    expect(calls[0]).toMatchObject({ output_config: { format: { type: 'json_schema', schema } } });
  });

  it('joins text blocks and ignores non-text blocks', async () => {
    const { client } = fakeClient(
      ok([{ type: 'thinking', thinking: '' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }]),
    );
    expect((await new AnthropicProvider({ model: 'm1', client }).generate({ prompt: 'p' })).text).toBe('ab');
  });

  it('throws on a refusal, naming the category', async () => {
    const { client } = fakeClient({ ...(ok() as object), stop_reason: 'refusal', stop_details: { category: 'cyber' } });
    await expect(new AnthropicProvider({ model: 'm1', client }).generate({ prompt: 'p' })).rejects.toThrow(/refused.*cyber/);
  });

  it('propagates API errors', async () => {
    const client = {
      messages: { create: (): Promise<never> => Promise.reject(new Error('429 rate limited')) },
    } as unknown as Anthropic;
    await expect(new AnthropicProvider({ model: 'm1', client }).generate({ prompt: 'p' })).rejects.toThrow(/429/);
  });
});

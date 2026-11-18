import { MockProvider, cycle, createProvider, extractJson, sequence } from './index';

describe('MockProvider', () => {
  it('echoes the prompt by default and records requests', async () => {
    const p = new MockProvider();
    const r = await p.generate({ prompt: 'hi', system: 's' });
    expect(r.text).toBe('hi');
    expect(p.requests).toEqual([{ prompt: 'hi', system: 's' }]);
  });

  it('simulates nondeterminism with sequence()', async () => {
    const p = new MockProvider({ respond: sequence(['a', 'b']) });
    const outs = [];
    for (let i = 0; i < 3; i++) outs.push((await p.generate({ prompt: 'x' })).text);
    expect(outs).toEqual(['a', 'b', 'b']);
  });

  it('cycles with cycle()', async () => {
    const p = new MockProvider({ respond: cycle(['a', 'b']) });
    const outs = [];
    for (let i = 0; i < 3; i++) outs.push((await p.generate({ prompt: 'x' })).text);
    expect(outs).toEqual(['a', 'b', 'a']);
  });

  it('rejects (not throws) when the responder throws', async () => {
    const p = new MockProvider({
      respond: () => {
        throw new Error('boom');
      },
    });
    await expect(p.generate({ prompt: 'x' })).rejects.toThrow('boom');
  });
});

describe('createProvider', () => {
  it('builds a mock without a model', () => {
    expect(createProvider('mock').name).toBe('mock');
  });
  it('requires a model for real providers', () => {
    expect(() => createProvider('anthropic')).toThrow(/--model is required/);
  });
});

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('recovers JSON surrounded by prose', () => {
    expect(extractJson('Sure! {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });
  it('throws when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow(/no JSON/);
  });
});

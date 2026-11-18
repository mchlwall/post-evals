/**
 * Parses JSON from model output, tolerating markdown fences and surrounding prose.
 * Structured output should make this unnecessary; it is a guard for mock/legacy models.
 * Throws if no JSON value can be recovered.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('no JSON object found in model output');
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

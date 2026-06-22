import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AISummaryResult {
  bullets: [string, string, string];
  keyQuote: string | null;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tags: string[];
  tokensUsed: number;
}

export async function generateSummaryAndTags(
  content: string,
  type: string,
  title: string
): Promise<AISummaryResult> {
  // Truncate to ~8000 tokens worth of content (keep first 6000 + last 2000 chars)
  let trimmed = content;
  if (content.length > 32000) {
    trimmed = content.slice(0, 24000) + '\n\n[...]\n\n' + content.slice(-8000);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    temperature: 0.3,
    system:
      'You are an expert content summarizer. Extract the most valuable insights from content and return structured JSON. Be concise and specific — no generic statements.',
    messages: [
      {
        role: 'user',
        content: `Summarize this ${type} titled '${title}':

${trimmed}

Return ONLY valid JSON:
{
  "bullet_1": "First key insight (start with a verb)",
  "bullet_2": "Second key insight (start with a verb)",
  "bullet_3": "Third key insight or takeaway (start with a verb)",
  "key_quote": "Most memorable direct quote (null if none)",
  "tags": ["tag1", "tag2", "tag3"],
  "sentiment": "positive|negative|neutral|mixed"
}`,
      },
    ],
  });

  const raw = (response.content[0] as Anthropic.TextBlock).text;
  const parsed = JSON.parse(raw);

  return {
    bullets: [parsed.bullet_1, parsed.bullet_2, parsed.bullet_3],
    keyQuote: parsed.key_quote ?? null,
    sentiment: parsed.sentiment ?? 'neutral',
    tags: (parsed.tags as string[]).map((t) => t.toLowerCase()),
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

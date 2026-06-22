import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/viv1dixit/Aria_proj',
    'X-Title': 'Aria Reading App',
  },
});

// Free models on OpenRouter (no credits needed)
const FREE_MODEL = 'google/gemma-4-31b-it:free';

export interface AISummaryResult {
  bullets: [string, string, string];
  keyQuote: string | null;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tags: string[];
  tokensUsed: number;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateSummaryAndTags(
  content: string,
  type: string,
  title: string,
  retries = 3
): Promise<AISummaryResult> {
  let trimmed = content;
  if (content.length > 32000) {
    trimmed = content.slice(0, 24000) + '\n\n[...]\n\n' + content.slice(-8000);
  }

  const prompt = `Summarize this ${type} titled '${title}':

${trimmed}

Return ONLY valid JSON (no markdown, no code fences):
{
  "bullet_1": "First key insight (start with a verb)",
  "bullet_2": "Second key insight (start with a verb)",
  "bullet_3": "Third key insight or takeaway (start with a verb)",
  "key_quote": "Most memorable direct quote (null if none)",
  "tags": ["tag1", "tag2", "tag3"],
  "sentiment": "positive|negative|neutral|mixed"
}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: FREE_MODEL,
        max_tokens: 512,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are an expert content summarizer. Extract the most valuable insights and return structured JSON only. No markdown, no explanation.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const raw = (response.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);
      const tokensUsed = (response.usage?.total_tokens ?? 0);

      return {
        bullets: [parsed.bullet_1, parsed.bullet_2, parsed.bullet_3],
        keyQuote: parsed.key_quote ?? null,
        sentiment: parsed.sentiment ?? 'neutral',
        tags: (parsed.tags as string[]).map((t) => t.toLowerCase()),
        tokensUsed,
      };
    } catch (err: unknown) {
      const is429 = err instanceof Error && (err.message.includes('429') || err.message.includes('rate'));
      if (is429 && attempt < retries) {
        const delay = attempt * 15_000;
        console.warn(`[OpenRouter] Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt}/${retries})...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new Error('OpenRouter: max retries exceeded');
}

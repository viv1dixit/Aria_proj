import { Worker, Job } from 'bullmq';
import { extract } from '@extractus/article-extractor';
import { Innertube } from 'youtubei.js';
import { SavedItem } from '../models/SavedItem';
import { Summary } from '../models/Summary';
import { Tag } from '../models/Tag';
import { ItemTag } from '../models/ItemTag';
import { redisConnection } from '../config/redis';
import { generateSummaryAndTags } from '../utils/aiSummarizer';
import { pushToUser } from '../utils/sseManager';

async function scrapeArticle(url: string): Promise<{ text: string; title?: string; author?: string; ogImage?: string; favicon?: string }> {
  const result = await extract(url);
  if (!result) throw new Error('Failed to extract article content');
  const text = result.content?.replace(/<[^>]+>/g, '') ?? '';
  return {
    text,
    title: result.title ?? undefined,
    author: result.author ?? undefined,
    ogImage: (result as any).image ?? undefined,
    favicon: (result as any).favicon ?? undefined,
  };
}

async function scrapeYouTube(url: string): Promise<{ text: string; title?: string; ogImage?: string }> {
  // Fetch metadata via oEmbed (no API key needed)
  let oembedTitle: string | undefined;
  let ogImage: string | undefined;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const resp = await fetch(oembedUrl);
    if (resp.ok) {
      const data = (await resp.json()) as { title?: string; thumbnail_url?: string };
      oembedTitle = data.title;
      ogImage = data.thumbnail_url;
    }
  } catch { /* non-critical */ }

  const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!videoIdMatch) throw new Error('Invalid YouTube URL');

  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoIdMatch[1]);

  const title = oembedTitle ?? (info.basic_info.title as string | undefined);
  const description = (info.basic_info.short_description as string | undefined) ?? '';

  // Attempt transcript — gracefully degrade to description if unavailable
  let transcriptText = '';
  try {
    const transcript = await info.getTranscript();
    transcriptText =
      transcript.transcript.content?.body?.initial_segments
        ?.map((s: any) => s.snippet?.text ?? '')
        .join(' ') ?? '';
  } catch (err: any) {
    console.warn(`[YouTube] Transcript unavailable for ${url}: ${err.message ?? err}`);
  }

  // Use transcript if we got meaningful text, otherwise fall back to description
  const text = transcriptText.trim().length > 100 ? transcriptText : description;

  if (!text) throw new Error('No transcript or description available for this video');

  return { text, title, ogImage };
}

async function processItem(job: Job) {
  const { itemId, url, type, userId, existingTitle } = job.data;

  await SavedItem.findByIdAndUpdate(itemId, { status: 'processing' });

  let rawContent = '';
  let title: string | undefined;
  let author: string | undefined;
  let ogImage: string | undefined;
  let favicon: string | undefined;

  if (type === 'youtube') {
    const result = await scrapeYouTube(url);
    rawContent = result.text;
    title = result.title;
    ogImage = result.ogImage;
  } else {
    const result = await scrapeArticle(url);
    rawContent = result.text;
    title = result.title;
    author = result.author;
    ogImage = result.ogImage;
    favicon = result.favicon;
  }

  const wordCount = rawContent.split(/\s+/).filter(Boolean).length;
  const readTimeMin = Math.ceil(wordCount / 200);

  const effectiveTitle = existingTitle
    ? (await SavedItem.findById(itemId).select('title').lean())?.title ?? title ?? url
    : title ?? url;

  const { bullets, keyQuote, sentiment, tags, tokensUsed } = await generateSummaryAndTags(
    rawContent,
    type,
    effectiveTitle
  );

  await SavedItem.findByIdAndUpdate(itemId, {
    rawContent,
    wordCount,
    readTimeMin,
    status: 'done',
    ...(!existingTitle && title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(ogImage ? { ogImage } : {}),
    ...(favicon ? { favicon } : {}),
  });

  await Summary.findOneAndUpdate(
    { itemId },
    {
      itemId,
      bullet1: bullets[0],
      bullet2: bullets[1],
      bullet3: bullets[2],
      keyQuote,
      sentiment,
      modelUsed: 'llama-3.1-8b-instruct',
      tokensUsed,
      generatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  for (const tagName of tags) {
    const tag = await Tag.findOneAndUpdate(
      { userId, name: tagName },
      { $setOnInsert: { userId, name: tagName } },
      { upsert: true, new: true }
    );
    await ItemTag.findOneAndUpdate(
      { itemId, tagId: tag._id },
      { itemId, tagId: tag._id },
      { upsert: true }
    );
  }

  pushToUser(userId, 'item:done', { itemId });
}

export function startItemWorker() {
  const worker = new Worker('item-processing', processItem, {
    connection: redisConnection,
    concurrency: 3,
  });

  worker.on('failed', async (job, err) => {
    if (job) {
      console.error(`Job ${job.id} failed:`, err.message);
      await SavedItem.findByIdAndUpdate(job.data.itemId, { status: 'failed' });
      pushToUser(job.data.userId, 'item:failed', { itemId: job.data.itemId, error: err.message });
    }
  });

  console.log('Item processing worker started');
  return worker;
}

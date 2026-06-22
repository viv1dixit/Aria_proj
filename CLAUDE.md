## 1. Project Overview

A productivity web app where authenticated users paste a URL (article or YouTube video), and the app:
- Saves the link to a personal dashboard
- Fetches and parses the full content
- Uses AI (Claude API) to generate a **3-bullet summary** and **auto-tags**
- Lets users manage, filter, search, and revisit saved content

Users already have login, register, Google OAuth, JWT, and DB wired up. This document covers everything built on top of that foundation.

---

## 2. Tech Stack

### Backend
- **Runtime**: Node.js (Express) or Python (FastAPI/Django)
- **Database**: MONGODB — add new tables
- **ORM**: Prisma (Node) 
- **Queue / Background Jobs**: BullMQ (Node + Redis) 
<!-- - **AI Provider**: Anthropic Claude API (`claude-sonnet-4-6`) -->
- **Content Scraping**: `@extractus/article-extractor` (Node) 
- **YouTube Transcript**:  `youtubei.js` (Node)
- **Redis**: For job queues and caching

### Frontend
- **Framework**: React (Vite) or Next.js
- **State Management**: Zustand or Redux Toolkit
- **Data Fetching**: React Query (TanStack Query)
- **UI Components**: shadcn/ui + Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router v6 or Next.js App Router
- **Rich Text**: React Markdown (for rendering summaries)

### Infrastructure
- **Auth**: Already done (JWT + Google OAuth)
- **File Storage**: Cloudinary or AWS S3 (for OG image caching)
- **Deployment**: Railway / Render / Vercel + Railway

---

## 4. API Endpoints

All routes are protected with the existing JWT middleware unless noted.

### Items — Core CRUD

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/items` | Save a new URL (triggers background job) |
| GET | `/api/items` | List all items (with filters, sort, pagination) |
| GET | `/api/items/:id` | Get single item with summary + tags |
| PATCH | `/api/items/:id` | Update is_read, is_starred, is_archived, reading_progress |
| DELETE | `/api/items/:id` | Soft-delete or hard-delete an item |
| POST | `/api/items/:id/retry` | Retry failed AI processing |



### Items — Query Parameters for GET /api/items
```
?page=1
&limit=20
&type=article|youtube
&status=done|pending|failed
&is_read=true|false
&is_starred=true|false
&is_archived=true|false
&tag=tag-id
&collection=collection-id
&q=search-term          (full-text search on title, summary, tags)
&sort=created_at|read_time_min|title  (default: created_at desc)
&domain=medium.com
```

### Summaries

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/items/:id/summary` | Get AI summary for an item |
| POST | `/api/items/:id/summary/regenerate` | Force regenerate summary |

### Tags

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tags` | List all user's tags (with item counts) |
| POST | `/api/tags` | Create new tag |
| PATCH | `/api/tags/:id` | Rename tag or change color |
| DELETE | `/api/tags/:id` | Delete tag (removes from all items) |
| POST | `/api/items/:id/tags` | Add tag to item |
| DELETE | `/api/items/:id/tags/:tagId` | Remove tag from item |

### Collections

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/collections` | List all collections |
| POST | `/api/collections` | Create collection |
| PATCH | `/api/collections/:id` | Update collection |
| DELETE | `/api/collections/:id` | Delete collection |
| POST | `/api/collections/:id/items` | Add item to collection |
| DELETE | `/api/collections/:id/items/:itemId` | Remove item from collection |

### Notes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/items/:id/notes` | List notes for an item |
| POST | `/api/items/:id/notes` | Add a note |
| PATCH | `/api/notes/:id` | Edit a note |
| DELETE | `/api/notes/:id` | Delete a note |

### Browser Extension & Share Target

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/items/quick-save` | Quick-save from browser extension or share sheet |

### Stats & Analytics

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/stats` | User stats (total saved, read, top tags, read-time saved) |

---

## 5. Content Processing Pipeline

This is the core background job flow. When a user submits a URL:

### Step 1 — URL submitted (POST /api/items)
```
1. Validate URL format
2. Detect type: YouTube (if youtube.com/youtu.be) or article
3. Create saved_item record with status='pending'
4. Enqueue job in Redis queue
5. Return the item immediately to frontend (optimistic)
```

### Step 2 — Background Worker picks up job
```
FOR ARTICLES:
  - Fetch HTML with axios / httpx (with user-agent spoofing)
  - Extract readable content via @extractus/article-extractor or newspaper3k
  - Extract: title, author, og_image, word_count, favicon, domain
  - Estimate read_time_min = Math.ceil(word_count / 200)
  - Truncate content to 8000 tokens for AI (keep first + last sections)

FOR YOUTUBE:
  - Extract video ID from URL
  - Fetch video metadata from YouTube oEmbed API (no API key needed)
    GET https://www.youtube.com/oembed?url={url}&format=json
  - Fetch transcript via youtube-transcript-api
    (handles auto-generated + manual captions)
  - Merge transcript chunks into full text
  - Estimate read_time_min from video duration
```

### Step 3 — AI Summarization (Claude API call)
```
System prompt:
  "You are an expert content summarizer. Extract the most valuable insights
  from content and return structured JSON. Be concise and specific — no
  generic statements."

User prompt:
  "Summarize this {type} titled '{title}':

  {content}

  Return ONLY valid JSON:
  {
    'bullet_1': 'First key insight (start with a verb)',
    'bullet_2': 'Second key insight (start with a verb)',
    'bullet_3': 'Third key insight or takeaway (start with a verb)',
    'key_quote': 'Most memorable direct quote (null if none)',
    'tags': ['tag1', 'tag2', 'tag3'],  // 3-5 lowercase single-word or hyphenated tags
    'sentiment': 'positive|negative|neutral|mixed'
  }"

Model: claude-sonnet-4-6
Max tokens: 512
Temperature: 0.3
```

### Step 4 — Save results & notify
```
1. Save summary to summaries table
2. Upsert tags: create if not exists, link via item_tags
3. Update saved_item: status='done', title, author, og_image, etc.
4. Push real-time update to frontend via WebSocket or SSE
5. On failure: status='failed', log error, schedule retry (max 3 attempts)
```

---
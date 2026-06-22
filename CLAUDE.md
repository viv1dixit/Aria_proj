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

## 6. Frontend Pages & Components

### Route Structure
```
/                   → Landing page (if not logged in) or redirect to /dashboard
/login              → Login page (existing)
/register           → Register page (existing)
/dashboard          → Main reading list (default: All Items)
/dashboard/starred  → Starred items
/dashboard/archived → Archived items
/dashboard/tag/:tagId → Items by tag
/dashboard/collection/:collectionId → Items in collection
/item/:id           → Item detail page (full view + notes)
/settings           → User settings + integrations
/stats              → Reading stats / analytics
```

### Component Tree

```
<App>
  <AuthProvider>           ← existing JWT/OAuth context
    <Router>
      <Layout>
        <Sidebar>
          <UserAvatar />
          <NavItem icon="home"    label="All Items" />
          <NavItem icon="star"    label="Starred" />
          <NavItem icon="archive" label="Archived" />
          <Divider label="Tags" />
          <TagList>
            <TagItem color="#..." name="ai" count={12} />
          </TagList>
          <Divider label="Collections" />
          <CollectionList />
          <Divider />
          <NavItem icon="bar-chart" label="My Stats" />
          <NavItem icon="settings"  label="Settings" />
        </Sidebar>

        <MainContent>
          <TopBar>
            <SearchBar placeholder="Search titles, summaries, tags..." />
            <FilterDropdown />  ← type, status, sort
            <ViewToggle />      ← grid vs list view
            <AddButton />       ← opens AddItemModal
          </TopBar>

          <ItemGrid | ItemList>
            <ItemCard>
              <ItemCard.Favicon />
              <ItemCard.TypeBadge />     ← Article | YouTube
              <ItemCard.OGImage />
              <ItemCard.Title />
              <ItemCard.Domain />
              <ItemCard.ReadTime />
              <ItemCard.SummaryBullets /> ← 3 bullets (shimmer while loading)
              <ItemCard.Tags />
              <ItemCard.Actions>
                <StarButton />
                <ArchiveButton />
                <DeleteButton />
                <ShareButton />
              </ItemCard.Actions>
              <ItemCard.StatusBadge />   ← pending | processing | failed
            </ItemCard>
          </ItemGrid>

          <Pagination />
        </MainContent>
      </Layout>

      <AddItemModal>
        <URLInput placeholder="Paste article or YouTube URL..." />
        <DetectedPreview />   ← shows favicon + domain after URL parse
        <SubmitButton />
        <QuickTips />         ← "Works with Medium, YouTube, Substack..."
      </AddItemModal>

      <ItemDetailDrawer | ItemDetailPage>
        <DetailHeader>
          <BackButton />
          <ExternalLink />
          <ActionBar />
        </DetailHeader>
        <DetailMeta>
          <OGImage />
          <Title />
          <Author /> <Domain /> <ReadTime />
        </DetailMeta>
        <SummaryCard>
          <Heading>AI Summary</Heading>
          <BulletList />
          <KeyQuote />
          <SentimentBadge />
          <RegenerateButton />
        </SummaryCard>
        <TagsSection>
          <TagPicker (combobox) />
        </TagsSection>
        <NotesSection>
          <NoteEditor />
          <NoteList />
        </NotesSection>
      </ItemDetailDrawer>
    </Router>
  </AuthProvider>
</App>
```

---

## 7. Key UI States & Behaviors

### AddItemModal — URL Submission Flow
```
State 1: Empty input
State 2: User typing → validate URL on blur
State 3: Valid URL detected → show domain favicon + "YouTube Video" or "Article"
State 4: Submitting → loading spinner
State 5: Success → modal closes, new card appears at top of grid with "Processing…" badge
State 6: Error → inline error message
```

### ItemCard — Processing States
```
pending/processing: Card appears immediately with shimmer skeleton on summary area
done:               Full card renders with bullets + tags
failed:             Card shows error state + "Retry" button
```

### Real-time Updates (WebSocket / SSE)
```
When job completes on backend:
  → emit event: { type: 'item:updated', itemId: '...', status: 'done' }
Frontend listener:
  → React Query invalidates query for that itemId
  → Card re-renders with summary (no page refresh needed)
```

### Search (Debounced, 300ms)
```
Searches across:
  - Item title
  - Summary bullets (bullet_1, bullet_2, bullet_3)
  - Tag names
  - Author
  - Domain

Use PostgreSQL full-text search:
  CREATE INDEX items_fts ON saved_items
    USING GIN(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(raw_content,'')));
```

---

## 8. Settings Page

```
/settings
  ├── Profile
  │     name, email, avatar, change password
  │
  ├── Reading Preferences
  │     default view (grid/list)
  │     items per page (10 / 20 / 50)
  │     auto-archive after reading (toggle)
  │
  ├── AI Preferences
  │     summary language (English / Spanish / French / auto-detect)
  │     summary style (concise / detailed)
  │     number of tags to auto-generate (3 / 5 / 7)
  │
  ├── Integrations
  │     Browser Extension download link
  │     API Key (generate personal token for extension/API)
  │     RSS Feed (unique URL to subscribe to saved items)
  │
  └── Danger Zone
        Export all data (JSON / CSV)
        Delete all items
        Delete account
```

---

## 9. Browser Extension (Optional Enhancement)

A minimal Chrome/Firefox extension that:
- Adds a toolbar button
- On click: sends `POST /api/items/quick-save` with the current tab URL + JWT token
- Shows toast: "Saved! Summary generating…"

**Manifest V3 files:**
```
/extension
  manifest.json
  popup.html
  popup.js
  background.js
  icon-16.png
  icon-48.png
  icon-128.png
```

---

## 10. Stats Page (/stats)

Show the user:
- Total items saved (all time)
- Total items read
- Total estimated reading time saved (sum of read_time_min for read items)
- Reading streak (days in a row with at least 1 item read)
- Top 5 tags by count (bar chart)
- Items saved per week (line chart, last 12 weeks)
- Top domains (pie chart)
- Most productive reading day (histogram)

---

## 11. File / Folder Structure

### Backend (Node/Express example)
```
/backend
  /src
    /config
      db.ts          ← DB connection (Prisma or pg)
      redis.ts       ← Redis connection (BullMQ)
      ai.ts          ← Anthropic client setup
    /middleware
      auth.ts        ← existing JWT middleware
      rateLimit.ts   ← per-user rate limiting (50 saves/day)
    /routes
      items.ts
      tags.ts
      collections.ts
      notes.ts
      stats.ts
    /services
      contentExtractor.ts   ← article scraping logic
      youtubeService.ts     ← transcript + metadata
      aiService.ts          ← Claude API calls + prompt builder
      urlDetector.ts        ← parse URL, detect type, extract domain
    /workers
      processingWorker.ts   ← BullMQ worker (runs the pipeline)
      retryWorker.ts        ← handles failed item retries
    /queues
      itemQueue.ts          ← BullMQ queue definition
    /utils
      tokenCounter.ts       ← estimate tokens, truncate content
      readTime.ts           ← word count → minutes
      ogImage.ts            ← fetch OG image + cache to S3/Cloudinary
    /types
      index.ts
    app.ts
    server.ts
  prisma/
    schema.prisma
  .env
```

### Frontend (React/Vite example)
```
/frontend
  /src
    /api
      itemsApi.ts        ← axios calls to backend
      tagsApi.ts
      collectionsApi.ts
      statsApi.ts
    /components
      /ui                ← shadcn components
      /layout
        Sidebar.tsx
        TopBar.tsx
        Layout.tsx
      /items
        ItemCard.tsx
        ItemGrid.tsx
        ItemList.tsx
        ItemDetailDrawer.tsx
        AddItemModal.tsx
        SummaryCard.tsx
        ProcessingCard.tsx   ← skeleton state
      /tags
        TagList.tsx
        TagPicker.tsx
        TagBadge.tsx
      /collections
        CollectionList.tsx
      /notes
        NoteEditor.tsx
        NoteList.tsx
      /stats
        StatsOverview.tsx
        WeeklyChart.tsx
        TopTagsChart.tsx
      /common
        SearchBar.tsx
        FilterDropdown.tsx
        EmptyState.tsx
        ErrorState.tsx
    /hooks
      useItems.ts        ← React Query hooks
      useTags.ts
      useCollections.ts
      useSearch.ts       ← debounced search
      useWebSocket.ts    ← real-time updates
      useStats.ts
    /stores
      uiStore.ts         ← Zustand (sidebar open, view mode, filters)
    /pages
      DashboardPage.tsx
      ItemDetailPage.tsx
      StatsPage.tsx
      SettingsPage.tsx
    /utils
      urlHelpers.ts
      formatters.ts      ← format dates, read times
      constants.ts
    /types
      index.ts
    App.tsx
    main.tsx
  .env
```

---

## 12. Environment Variables

### Backend `.env`
```env
# Existing
DATABASE_URL=postgresql://...
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# New
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
MAX_CONTENT_TOKENS=8000
MAX_SAVES_PER_DAY=50

# Optional
CLOUDINARY_URL=cloudinary://...
AWS_S3_BUCKET=...
```

### Frontend `.env`
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

---

## 13. Claude API Prompt — Full Detail

### System Prompt
```
You are an expert content analyst specializing in extracting key insights
from articles and video transcripts. Your summaries are concise, specific,
and written in active voice. You always return valid JSON with no additional text.
```

### User Prompt Template
```
Content type: {article | youtube video}
Title: {title}
Author: {author | channel name}
Source: {domain}

Content:
---
{truncated_content}
---

Instructions:
1. Write exactly 3 bullet points, each starting with an action verb
2. Each bullet point must be 1-2 sentences maximum
3. Extract the single most memorable quote (direct words only, not paraphrase)
4. Generate 3-5 topic tags (lowercase, hyphenated if multi-word)
5. Assess overall sentiment

Return ONLY this JSON structure, no markdown, no explanation:
{
  "bullet_1": "...",
  "bullet_2": "...",
  "bullet_3": "...",
  "key_quote": "..." or null,
  "tags": ["...", "..."],
  "sentiment": "positive" | "negative" | "neutral" | "mixed"
}
```

### Error Handling for AI Response
```typescript
// Parse response safely
const parseAIResponse = (raw: string) => {
  try {
    // Strip possible markdown code fences
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    // Validate required fields
    if (!parsed.bullet_1 || !parsed.bullet_2 || !parsed.bullet_3) {
      throw new Error('Missing required bullet points')
    }

    return parsed
  } catch (e) {
    throw new Error(`AI response parsing failed: ${e.message}`)
  }
}
```

---

## 14. Rate Limiting & Abuse Prevention

```
Per user:
  - Max 50 URL saves per day
  - Max 3 AI regenerations per item per day
  - Max 10 concurrent pending items

Global:
  - Anthropic API key shared → track token usage
  - Cache summaries — never re-call AI for same URL (check by URL hash)
  - Content fetch timeout: 10s
  - Max content size: 500KB raw HTML
```

---

## 15. Build Order for Cursor

Build in this sequence to keep things working at every step:

```
Phase 1 — Database
  1. Add new tables to Prisma schema (or SQL migrations)
  2. Run migrations

Phase 2 — Backend Core
  3. POST /api/items (create item, return immediately, status=pending)
  4. GET /api/items (list with pagination, no AI yet)
  5. PATCH /api/items/:id (update read/starred/archived)
  6. DELETE /api/items/:id

Phase 3 — Content Extraction
  7. urlDetector.ts (type detection + domain extraction)
  8. contentExtractor.ts (article scraping)
  9. youtubeService.ts (transcript + oEmbed metadata)

Phase 4 — AI Pipeline
  10. aiService.ts (Claude API call + prompt)
  11. processingWorker.ts (BullMQ worker combining phases 3+4)
  12. Wire worker to POST /api/items job queue

Phase 5 — Remaining API
  13. Tags CRUD endpoints
  14. Summary endpoint + regenerate
  15. Collections CRUD
  16. Notes CRUD
  17. Stats endpoint

Phase 6 — Frontend
  18. AddItemModal + POST /api/items
  19. ItemCard (with skeleton states)
  20. Dashboard page with list/grid
  21. WebSocket/SSE for real-time card updates
  22. Filters + Search
  23. Item detail drawer/page
  24. Tags management
  25. Stats page
  26. Settings page
```

---

## 16. Supported Sites (Out of Box)

The content extractor handles these cleanly:
- Medium, Substack, Notion (public)
- The Verge, TechCrunch, Wired
- Dev.to, Hashnode, GitHub READMEs
- Wikipedia
- YouTube (any video with captions)
- BBC, Reuters, NY Times (some paywalled)
- Hacker News (links to actual articles)

**Known limitations:**
- Paywalled content (NYT, WSJ) → only OG metadata saved
- Twitter/X threads → not supported (no reliable extractor)
- PDFs → not supported in v1 (add later with pdf-parse)
- Instagram/TikTok → not supported

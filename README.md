# letterbookxd — 책장 (My Reading Records)

> A personal reading tracker and library management app for Korean book readers, with edition management, reading statistics, and a curated admin panel.

---

## 1. Project Overview

**letterbookxd** (책장, "bookshelf") is a Korean-focused single-page application for tracking personal reading history. It allows a single authenticated owner to catalogue their book collection across multiple publishers and editions, record per-volume reading progress, rate completed works, and visualize reading habits through rich statistics. The app models the nuances of Korean book publishing — multiple translation editions, volume series (권/상/중/하), and author-centric browsing — with a clean, serif-heavy UI.

**Core value proposition:** A highly personalized, single-owner reading diary that handles the full complexity of multi-publisher, multi-volume Korean literature — far beyond what a generic shelf app provides.

---

## 2. Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Build Tool | Vite | 5.4.2 |
| Routing | React Router DOM | 7.13.1 |
| Styling | Tailwind CSS | 3.4.1 |
| Icons | Lucide React | 0.344.0 |
| State Management | Zustand | 5.0.11 |
| Database / BaaS | Supabase (PostgreSQL) | 2.57.4 |
| Charts | Recharts | 3.7.0 |
| Map Visualization | react-simple-maps | 3.0.0 |
| PostCSS | postcss + autoprefixer | 8.4.35 / 10.4.18 |
| Linting | ESLint 9 + TypeScript plugin | 9.9.1 |

**Architectural notes:**
- **SPA** — entirely client-side rendered; no SSR or SSG.
- **Deployed to GitHub Pages** at the `/letterbookxd/` subpath; Vite `base` is set accordingly.
- **Authenticated owner** — Supabase Auth sessions identify log ownership; catalogue administration requires `app_metadata.role = "admin"`.
- **Supabase** serves as both the database and the only backend. There are no custom server routes.
- A **Vite dev proxy** (`/aladin-api`) routes requests to the Aladin (Korean book) external API to avoid CORS during development.

---

## 3. File Tree

```
letterbookxd/
├── .env                          # Environment variables (Supabase URL, anon key, owner ID)
├── .github/
│   └── workflows/
│       └── deploy.yml            # CI/CD: build → commit docs/ → push to GitHub Pages
├── .gitignore
├── docs/                         # ⚠️ Generated build output (GitHub Pages source) — do not edit
├── eslint.config.js              # ESLint flat config with TS + React Hooks rules
├── index.html                    # Vite HTML entry point; mounts <div id="root">
├── package.json                  # Dependencies, scripts (dev/build/lint/preview/typecheck)
├── postcss.config.js             # PostCSS config for Tailwind + Autoprefixer
├── tailwind.config.js            # Tailwind theme: stone palette, Noto KR fonts, custom utilities
├── tsconfig.json                 # TypeScript project references
├── tsconfig.app.json             # App-specific TS config (strict mode, bundler resolution)
├── vite.config.ts                # Vite config: base path, React plugin, Aladin API proxy, docs output
│
└── src/
    ├── main.tsx                  # React entry — mounts <App> into #root with StrictMode
    ├── App.tsx                   # Root component: BrowserRouter + all <Route> definitions
    ├── index.css                 # Global styles: Tailwind directives, Korean fonts, hide-scrollbar
    ├── vite-env.d.ts             # Vite environment type declarations
    │
    ├── types/
    │   └── index.ts              # All shared TypeScript interfaces (Work, EditionSet, Volume, logs, DB rows)
    │
    ├── lib/
    │   └── supabase.ts           # Supabase client singleton (createClient with env vars)
    │
    ├── store/
    │   ├── bookStore.ts          # Zustand store: caches works/editionSets/volumes; mergeById helper
    │   └── logStore.ts           # Zustand store: all reading logs + full CRUD + auto-completion cascade
    │
    ├── services/
    │   ├── api.ts                # searchBooks() — legacy/unused search; Aladin API call helper
    │   └── db.ts                 # All Supabase queries: fetch/insert for works, editions, series, authors, logs
    │
    ├── utils/
    │   ├── bookGrouping.ts       # Groups flat DB rows → Work hierarchy; Korean text normalization; slugify
    │   └── bookMappers.ts        # Converts DbWork/DbEdition rows → client-side Work/EditionSet/Volume types
    │
    ├── data/                     # ⚠️ DEPRECATED — mock data files pending deletion
    │   ├── mockData.ts           # Static mock works (unused)
    │   ├── mockApiData.ts        # Static mock API responses (unused)
    │   └── searchIndex.ts        # Pre-built search index (unused, replaced by Supabase)
    │
    ├── pages/
    │   ├── SearchPage.tsx        # / — Book search, genre badge filtering, series/author/list browsing
    │   ├── BookDetailPage.tsx    # /book/:workId — Work detail with editions, volumes, translations
    │   ├── BookshelfPage.tsx     # /bookshelf — Personal shelf with reading state filtering and pagination
    │   ├── ReadingLogPage.tsx    # /reading-log — Editable log table with sort/filter and deletion
    │   ├── AuthorPage.tsx        # /author/:name — Author stats, all works, life-books list
    │   ├── StatsPage.tsx         # /stats — Full reading analytics dashboard (charts, maps)
    │   ├── SeriesPage.tsx        # /series/:id — Series overview with per-work progress
    │   └── AdminPage.tsx         # /admin — Data curation panel (add works/editions/authors/series)
    │
    └── components/
        ├── layout/
        │   └── Navbar.tsx        # Sticky top nav with links to all main sections
        ├── ui/
        │   ├── BookCover.tsx     # Cover image with aspect-ratio variants and error fallback icon
        │   └── StarRating.tsx    # 1–5 star interactive/readonly rating widget
        └── book/
            ├── VolumeRow.tsx         # Single volume row: eye-state toggle, page tracker, rating, liked
            ├── SetReviewPanel.tsx    # Completion review panel for an EditionSet (rating + liked)
            └── TranslationComparison.tsx  # Tabbed view comparing text excerpts across translations
```

---

## 4. Page-by-Page Breakdown

### `/` — SearchPage

| Field | Value |
|-------|-------|
| **Route** | `/` |
| **Purpose** | Main discovery page; lets the owner browse and search the entire book catalogue |
| **Key UI elements** | Search bar with autocomplete dropdown, genre badge filter strip, tab navigation (전체/시리즈/작가/목록), grid of book cards |
| **User interactions** | Type to search, click genre badges to filter, switch tabs to browse by series/author/list, click a card to navigate to detail |
| **Auth required** | No |
| **Data fetched** | `fetchAllWorks()` via `db.ts`; logs loaded from `logStore` for reading-state badges |

---

### `/book/:workId` — BookDetailPage

| Field | Value |
|-------|-------|
| **Route** | `/book/:workId` |
| **Purpose** | Full detail view for one literary work — all editions, volumes, and translations |
| **Key UI elements** | Cover image, metadata (author, year, genre), TranslationComparison tabs, VolumeRow list per publisher, SetReviewPanel |
| **User interactions** | Toggle reading state per volume (eye icon: unread→reading→completed), set current page, rate volumes, mark as life-book, rate the entire edition set |
| **Auth required** | No (owner is implicit via env var) |
| **Data fetched** | `fetchWorkById()`, `fetchEditionsByWorkId()` → `bookStore`; `logStore.loadLogs()` |

---

### `/bookshelf` — BookshelfPage

| Field | Value |
|-------|-------|
| **Route** | `/bookshelf` |
| **Purpose** | Personal library view — all logged works with filtering by reading state and pagination |
| **Key UI elements** | Filter tabs (all/reading/completed/unread), book grid with state badges, inline page-update modal |
| **User interactions** | Filter by reading state, click book to open detail, update current page inline |
| **Auth required** | No |
| **Data fetched** | Uses cached `bookStore` + `logStore`; no additional fetches if stores are populated |

---

### `/reading-log` — ReadingLogPage

| Field | Value |
|-------|-------|
| **Route** | `/reading-log` |
| **Purpose** | Chronological, editable log of all reading events |
| **Key UI elements** | Sortable/filterable table of log entries, rating filter, author filter, delete buttons |
| **User interactions** | Sort by date/rating/author, filter, delete individual log entries |
| **Auth required** | No |
| **Data fetched** | `logStore` (all volume logs, set completion logs, series completion logs) |

---

### `/author/:name` — AuthorPage

| Field | Value |
|-------|-------|
| **Route** | `/author/:name` |
| **Purpose** | Author-centric view with personal stats and all works by that author |
| **Key UI elements** | Author stats summary, grid of all works, life-books section |
| **User interactions** | Browse works, click to navigate to book detail |
| **Auth required** | No |
| **Data fetched** | Filters `bookStore.works` by author name; cross-references `logStore` |

---

### `/stats` — StatsPage

| Field | Value |
|-------|-------|
| **Route** | `/stats` |
| **Purpose** | Comprehensive reading analytics dashboard |
| **Key UI elements** | Summary cards (total books, pages, avg rating), bar/line charts (Recharts), world map (react-simple-maps), genre breakdown, monthly trends, Nobel Prize count, life-books list |
| **User interactions** | Read-only data visualization; no user input |
| **Auth required** | No |
| **Data fetched** | Computed from `bookStore` + `logStore` client-side; no additional network calls |

---

### `/series/:id` — SeriesPage

| Field | Value |
|-------|-------|
| **Route** | `/series/:id` |
| **Purpose** | Series overview showing all works in a series with aggregate progress |
| **Key UI elements** | Series title/description, work list with per-work reading state, series completion log panel |
| **User interactions** | Browse works, mark series-level review/rating once complete |
| **Auth required** | No |
| **Data fetched** | `fetchSeriesById()`, `fetchWorksBySeriesId()` via `db.ts` |

---

### `/admin` — AdminPage

| Field | Value |
|-------|-------|
| **Route** | `/admin` |
| **Purpose** | Owner-only data curation panel for adding/editing the catalogue |
| **Key UI elements** | Tabbed forms: Add Work, Add Edition (with Aladin ISBN lookup), Add Author, Add Series |
| **User interactions** | Fill forms, trigger Aladin API lookup by ISBN, submit to Supabase |
| **Auth required** | No auth gate — relies on Supabase row-level security (RLS) and owner ID |
| **Data fetched** | Aladin API (via `/aladin-api` Vite proxy) for book metadata on ISBN lookup; writes to Supabase |

---

## 5. Component Dependency Map

### Shared Components

| Component | Used by | What it does |
|-----------|---------|--------------|
| `Navbar` | `App.tsx` (wraps all pages) | Top navigation; links to /, /bookshelf, /reading-log, /stats, /admin |
| `BookCover` | `SearchPage`, `BookDetailPage`, `BookshelfPage`, `AuthorPage`, `SeriesPage` | Renders cover image with aspect-ratio variants (`portrait`/`square`) and fallback icon |
| `StarRating` | `VolumeRow`, `SetReviewPanel`, `ReadingLogPage`, `StatsPage` | 1–5 star rating, interactive or readonly |
| `VolumeRow` | `BookDetailPage` | Per-volume reading state (eye toggle), page progress, rating, liked |
| `SetReviewPanel` | `BookDetailPage` | Edition-set-level completion review with rating and liked |
| `TranslationComparison` | `BookDetailPage` | Tabbed comparison of text excerpts across different translation editions |

### Global State (Zustand)

| Store | Controls | Consumed by |
|-------|----------|-------------|
| `useBookStore` | `works[]`, `editionSets[]`, `volumes[]` | Nearly all pages; populated once on app load |
| `useLogStore` | `volumeLogs[]`, `setCompletionLogs[]`, `seriesCompletionLogs[]` + all CRUD | `BookDetailPage`, `BookshelfPage`, `ReadingLogPage`, `AuthorPage`, `StatsPage`, `SeriesPage` |

---

## 6. API & Data Flow

### Supabase Queries (`src/services/db.ts`)

| Function | Table(s) | Purpose |
|----------|----------|---------|
| `fetchAllWorks()` | `works`, `editions` | Loads full catalogue on app init |
| `fetchWorkById(workId)` | `works` | Single work metadata |
| `fetchEditionsByWorkId(workId)` | `editions` | All editions for a work |
| `fetchSeriesById(id)` | `series` | Series metadata |
| `fetchWorksBySeriesId(id)` | `works` | All works belonging to a series |
| `fetchAllLogs()` | `logs` | All reading logs for the owner |
| `upsertVolumeLog(log)` | `logs` | Create or update a per-volume log |
| `deleteLog(id)` | `logs` | Delete a log entry |
| `insertWork(work)` | `works` | Admin: add new work |
| `insertEdition(edition)` | `editions` | Admin: add new edition |
| `insertAuthor(author)` | `authors` | Admin: add new author |
| `insertSeries(series)` | `series` | Admin: add new series |
| `getAladinDetail(isbn)` | — | Calls Aladin external API for page count/cover |

### External Third-Party Services

| Service | Purpose | Integration point |
|---------|---------|-------------------|
| **Supabase** | PostgreSQL database + RLS-based access control | `src/lib/supabase.ts` → all `db.ts` functions |
| **Aladin API** | Korean book metadata (ISBN lookup, page counts, cover images) | `src/services/api.ts` + Vite proxy `/aladin-api` → `AdminPage.tsx` |

### Overall Data Flow

```
Supabase DB
    │
    ▼
db.ts (query functions)
    │
    ├──► bookStore (Zustand)  ──► SearchPage, BookDetailPage, BookshelfPage, ...
    │       works[], editionSets[], volumes[]
    │
    └──► logStore (Zustand)   ──► All pages that display reading state
            volumeLogs[], setCompletionLogs[], seriesCompletionLogs[]
                │
                └──► Auto-cascade: volume complete → SetCompletionLog
                                   all set logs in series → SeriesCompletionLog
```

User actions (toggle state, rate, update page) → `logStore` method → `db.ts` upsert → Supabase → store updated in-memory → React re-renders.

---

## 7. Environment Variables & Configuration

> **Note:** The Supabase anon key is intentionally public (client-side) — access control is enforced by Supabase Row Level Security (RLS).

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project REST endpoint | ✅ | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anonymous key | ✅ | `eyJhbGci...` (JWT) |

**Setup:**

```bash
# Create a .env file at the project root
# Copy .env.example and provide the project credentials.

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

All variables are prefixed with `VITE_` — Vite exposes them to the browser via `import.meta.env`.

---

## 8. Setup & Local Development

**Prerequisites:**
- Node.js ≥ 18
- npm ≥ 9
- A Supabase project with the required tables (`works`, `editions`, `series`, `authors`, `logs`)

```bash
# 1. Clone
git clone https://github.com/kingjnu-sakayume/letterbookxd.git
cd letterbookxd

# 2. Install dependencies
npm install

# 3. Configure environment
#    Create .env with the three VITE_ variables (see §7 above)

# 4. Start dev server (includes Aladin API proxy)
npm run dev
# → http://localhost:5173/letterbookxd/

# 5. Type-check
npm run typecheck

# 6. Lint
npm run lint

# 7. Build for production (outputs to /docs)
npm run build

# 8. Preview the production build locally
npm run preview
```

**Deployment** is automated via `.github/workflows/deploy.yml`:
- Push to `main` → GitHub Actions runs `npm ci && npm run build` → commits `/docs` → GitHub Pages serves it.

---

## 9. Key Conventions & Notes for Developers / LLMs

### ID Encoding

- **Work IDs:** UUIDs from Supabase (`work.id`).
- **EditionSet IDs:** Composite string `{workId}::{publisher}` — parse with `parseEditionSetId()` by splitting on `::`.
- **Volume IDs:** `vol-{edition.id}` — prefix used to distinguish from other ID types.

### Type System (Two Parallel Layers)

There are two parallel type layers — keep them separate:

| Layer | Types | Location | Used for |
|-------|-------|----------|---------|
| **Client model** | `Work`, `EditionSet`, `Volume`, `VolumeLog`, `SetCompletionLog`, `SeriesCompletionLog` | `src/types/index.ts` | All UI components and stores |
| **DB model** | `DbWork`, `DbEdition`, `DbLog` | `src/types/index.ts` | Raw Supabase row shapes |

Conversion happens exclusively in `src/utils/bookMappers.ts`. Never pass raw DB rows to components.

### All Database Access Goes Through `db.ts`

Do not call `supabase` directly from components or stores — all Supabase queries must go through `src/services/db.ts`. Stores call `db.ts` functions and cache results in Zustand.

### State Mutation Pattern

```
User action → logStore method (optimistic update) → db.ts persist → store state updated
```

`logStore` is the single source of truth for reading state. Components must not write to Supabase directly.

### Auto-Completion Cascade Logic (`logStore.ts`)

When toggling a volume to `completed`:
1. Check if **all volumes** in the EditionSet are `completed` → auto-create `SetCompletionLog`.
2. New `SetCompletionLog` created → check if **all works** in the series have `SetCompletionLog`s → auto-create `SeriesCompletionLog`.
3. Reverse: un-completing a volume → delete the auto-generated `SetCompletionLog` → delete the auto-generated `SeriesCompletionLog`.

The `autoGenerated: true` flag distinguishes system-created logs from user-created ones. User-created logs (rating, liked) are never auto-deleted.

### Korean Volume Parsing

`extractVolumeNumber()` in `src/utils/bookGrouping.ts` handles: `1권`, `상`, `중`, `하`, and numeric-only titles. Modify this function when changing volume grouping logic.

### Deprecated Files — Safe to Delete

The following files in `src/data/` are unused and marked for deletion:
- `src/data/mockData.ts`
- `src/data/mockApiData.ts`
- `src/data/searchIndex.ts`

Also, `searchBooks()` in `src/services/api.ts` is no longer called (replaced by Supabase).

### Naming Conventions

| Category | Convention | Example |
|----------|------------|---------|
| Pages | PascalCase + `Page` suffix | `BookDetailPage.tsx` |
| Components | PascalCase | `VolumeRow.tsx` |
| Stores | camelCase + `Store` suffix | `bookStore.ts` |
| Utilities | camelCase | `bookGrouping.ts` |
| DB functions | camelCase verb phrases | `fetchEditionsByWorkId()` |
| CSS classes | Tailwind utilities; custom via `@layer` in `index.css` | `hide-scrollbar` |

### Reading State Color Codes

| State | Color | Value |
|-------|-------|-------|
| `reading` | Blue | `#378ADD` |
| `completed` | Green | `#639922` |
| `unread` | Gray | `#a8a29e` (stone-400) |

### Base Path

The app is deployed at `/letterbookxd/`. React Router's `basename="/letterbookxd"` is set in `App.tsx`. Do not hardcode absolute paths in `<Link>` or `navigate()` calls.

### Known Limitations

- **Authenticated ownership:** Log reads and writes use the signed-in Supabase user's UUID and RLS `auth.uid()`. Catalogue writes additionally require `app_metadata.role = "admin"`; `user_metadata` is never trusted for authorization.
- **No offline support:** All data is fetched from Supabase on load; no service worker or local cache beyond Zustand in-memory state.
- **Aladin proxy is dev-only:** The `/aladin-api` proxy in `vite.config.ts` only works during development. The admin ISBN lookup will fail in production unless a separate CORS proxy is deployed.
- **`docs/` is committed:** The build output lives in `/docs` and is version-controlled for GitHub Pages. Run `npm run build` before committing if deploying manually.

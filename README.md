# letterbookxd — 책장 (My Reading Records)

> A personal reading tracker and library management app for Korean book readers, with edition management, reading statistics, and a curated admin panel.

---

## 1. Project Overview

**letterbookxd** (책장, "bookshelf") is a Korean-focused single-page application for tracking personal reading history. It allows a single authenticated owner to catalogue their book collection across multiple publishers and editions, record per-volume reading progress, rate completed works, and visualize reading habits through statistics. The app models the nuances of Korean book publishing — multiple translation editions, volume series (권/상/중/하), and author-centric browsing.

The interface uses a "paper and ink" look: a warm paper background, ink-coloured text, a seal-red (인주) accent taken from 장서인 ownership stamps, Gowun Batang for titles and reading text and Pretendard for the UI. Layouts are fluid and use the full width of desktop monitors (multi-column pages instead of a narrow centred column).

**Core value proposition:** A highly personalized, single-owner reading diary that handles the full complexity of multi-publisher, multi-volume Korean literature — far beyond what a generic shelf app provides.

---

## 2. Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Build Tool | Vite | 5.4.2 |
| Routing | React Router DOM (`HashRouter`) | 7.13.1 |
| Styling | Tailwind CSS (custom paper/ink tokens) | 3.4.1 |
| Fonts | Pretendard (jsDelivr), Gowun Batang (Google Fonts) | 1.3.9 / — |
| Icons | Lucide React | 0.344.0 |
| State Management | Zustand | 5.0.11 |
| Database / BaaS | Supabase (PostgreSQL) | 2.57.4 |
| Flowcharts | @xyflow/react | 12.10.2 |
| Map Visualization | react-simple-maps | 3.0.0 |
| PostCSS | postcss + autoprefixer | 8.4.35 / 10.4.18 |
| Linting | ESLint 9 + TypeScript plugin | 9.9.1 |

Charts on the stats page are plain HTML/SVG components (`src/components/stats/`); there is no chart library.

**Architectural notes:**
- **SPA** — entirely client-side rendered; no SSR or SSG.
- **Deployed to GitHub Pages** at the `/letterbookxd/` subpath; Vite `base` is set accordingly and routing uses `HashRouter`.
- **Authenticated owner** — Supabase Auth sessions identify log ownership; catalogue administration requires `app_metadata.role = "admin"`.
- **Supabase** serves as both the database and the only backend. There are no custom server routes.
- A **Vite dev proxy** (`/aladin-api`) routes requests to the Aladin (Korean book) external API to avoid CORS during development.

---

## 3. File Tree

```
letterbookxd/
├── .github/workflows/            # ci.yml (PR checks), deploy.yml (Pages), deploy-edge-functions.yml
├── docs/                         # ⚠️ Generated build output (GitHub Pages source) — do not edit
├── index.html                    # Vite entry; loads Pretendard + Gowun Batang
├── tailwind.config.js            # Design tokens: paper/ink/line/seal/reading/completed/star, fonts, 3xl breakpoint
├── vite.config.ts                # base path, React plugin, Aladin dev proxy, docs output
├── supabase/                     # RLS migrations, aladin-proxy edge function
├── tests/                        # node:test suites (stats, Hangul helpers)
│
└── src/
    ├── main.tsx                  # React entry
    ├── App.tsx                   # HashRouter, routes, auth → log loading, confirm/toast providers
    ├── index.css                 # Base styles + component classes (.btn, .field, .panel, .book-cover …)
    │
    ├── types/index.ts            # Shared client + flowchart types
    ├── lib/
    │   ├── supabase.ts           # Supabase client singleton
    │   ├── hangul.ts             # 초성 search, match ranking, highlight ranges, 조사(을/를…) helper
    │   └── authMessages.ts       # Korean messages for Supabase auth errors
    ├── store/
    │   ├── authStore.ts          # Session + ready flag (onAuthStateChange), sign out
    │   ├── catalogStore.ts       # Cached catalogue (works+editions, series, authors) for browse/search/shelf/log/stats
    │   ├── bookStore.ts          # Works/editionSets/volumes used by the completion cascade
    │   ├── logStore.ts           # Reading logs + CRUD + auto-completion cascade
    │   └── toastStore.ts         # Small toast queue (`toast(message, tone)`)
    ├── services/
    │   ├── db.ts                 # Supabase queries (works, editions, series, catalogue, flowcharts, Aladin detail)
    │   ├── api.ts                # Aladin URL builder (+ unused legacy `searchBooks`)
    │   └── bookCache.ts          # `ensureWorkLoaded` — loads a work's volumes before changing state outside its page
    ├── hooks/                    # useDocumentTitle, useMediaQuery, useOutsideClick, useLibrary (work status, reading items)
    ├── domain/
    │   ├── books/identity.ts     # Edition-set / volume id helpers
    │   └── stats/computeStats.ts # Pure statistics calculation (tested)
    ├── utils/                    # bookMappers, bookGrouping, editionUtils, format, readingState
    │
    ├── pages/
    │   ├── SearchPage.tsx        # /            둘러보기 — filters (view/state/tag/list) in the URL, cover grid
    │   ├── BookDetailPage.tsx    # /book/:id    cover column, editions & volumes, translations, related works
    │   ├── SeriesPage.tsx        # /series/:id  table of contents, selected work's volumes, series rating
    │   ├── AuthorPage.tsx        # /author/:n   portrait & facts, bio, my figures, works, reading-order timeline
    │   ├── BookshelfPage.tsx     # /bookshelf   reading / series in progress / completed (grouped)
    │   ├── ReadingLogPage.tsx    # /reading-log diary table by month, edit & delete dialogs
    │   ├── StatsPage.tsx         # /stats       figures, monthly chart, bars, map, 100-book list
    │   ├── AdminPage.tsx         # /admin       works table, add forms with previews, flowchart editor
    │   ├── LoginPage.tsx         # /login       owner sign-in, returns to the previous page
    │   └── NotFoundPage.tsx      # *            unknown routes
    │
    └── components/
        ├── layout/               # Navbar (tabs + mobile tab bar), GlobalSearch, AccountMenu, Page/PageHeader/SectionHeading/Breadcrumbs, ScrollManager
        ├── ui/                   # BookCover, StarRating, Tabs, Dialog, ConfirmProvider + confirm, Toaster, States, ProgressBar, Portrait, ReadingMark, LikeButton
        ├── book/                 # VolumeRow, SetReviewPanel, TranslationComparison, ReadingCard, ProgressDialog
        ├── stats/                # StatFigure, MonthlyChart (+ table view), BarList, LiteraryMap, mapScale
        ├── flowchart/            # Reading-order sidebar, modal, editor
        ├── auth/                 # AdminGate, LoginForm
        └── admin/                # FormControls (Field, TextArea, SelectField, StatusDisplay, FormHeader)
```

---

## 4. Page-by-Page Breakdown

Every page shares the same shell: a sticky full-width header (seal logo, section tabs, global search, account menu) and, below `md`, a bottom tab bar. Pages use `Page` (fluid width with responsive side padding) and a `PageHeader`. Detail pages use a three-column grid on `xl` (sticky cover column · main · side panel) that collapses to two columns on `lg` and one column on phones.

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | `SearchPage` (둘러보기) | Continue-reading cards (signed in), a filter sidebar (view: 단행본/시리즈/작가, my reading state, 분류 tags, 목록 lists) and an auto-fill cover grid. Filters, sort and the text filter live in the URL so Back returns to the same list. |
| `/book/:workId` | `BookDetailPage` | Breadcrumbs, cover + my record summary, title/author/tags (tags link back to filtered browse), description, publisher tabs with volume rows (state switch, page form, ratings), set review for multi-volume editions, translation comparison and other works by the author or series. |
| `/series/:id` | `SeriesPage` | Series cover with my progress and series rating, a numbered table of contents with reading marks, the selected work's editions and volumes, and a preview panel. |
| `/author/:name` | `AuthorPage` | Portrait (monogram fallback) and facts, bio, my figures (read / average rating / 인생책), works by year, and the reading-order timeline with a full flowchart modal. Works without an `authors` row still render. |
| `/bookshelf` | `BookshelfPage` | Header figures, tabs (전체/읽는 중/완독/이어 읽을 시리즈), reading cards with a page-progress dialog (including "다 읽었어요"), series in progress with the next title, completions grouped by year or rating. |
| `/reading-log` | `ReadingLogPage` | Diary table grouped by month (sticky month labels), filters for year/rating/kind/author/text, edit dialog (date, rating, 인생책) and delete with confirmation. Unread resets are not listed; series completions show the series. |
| `/stats` | `StatsPage` | Year switch, six key figures, monthly completions (hover/focus tooltips + table view), rating/author/tag/publisher bars, a choropleth map with a country list, and progress on the 노벨 연구소 100선 list. |
| `/admin` | `AdminPage` (behind `AdminGate`) | Section nav, a searchable works table with an edit dialog, add forms with live previews, and the flowchart editor. |
| `/login` | `LoginPage` | Email/password sign-in; returns to the page that sent you there. |
| `*` | `NotFoundPage` | Unknown routes. |

Personal pages (`/bookshelf`, `/reading-log`, `/stats`) show a sign-in prompt to visitors. Catalogue pages are public; editing controls appear only when signed in.

---

## 5. Component Dependency Map

### Shared Components

| Component | Used by | What it does |
|-----------|---------|--------------|
| `Navbar` | `App.tsx` | Header tabs with section-aware active state, `GlobalSearch`, `AccountMenu`, mobile tab bar, skip link |
| `GlobalSearch` | `Navbar` | Quick search over works/series/authors (초성, keyboard, `/` or Ctrl/⌘+K); inline on `lg`, full-screen overlay below |
| `Page`, `PageHeader`, `SectionHeading`, `Breadcrumbs` | all pages | Layout primitives |
| `BookCover` | most pages | Cover with spine shading and fade-in; cloth-bound typographic fallback when there is no image |
| `StarRating` | book, shelf, log, author | Read-only stars (no nested buttons) or an interactive radio group with hover preview |
| `Tabs` | browse, book, shelf, admin | Underline tabs with arrow-key navigation |
| `Dialog`, `ConfirmProvider` / `useConfirm` | log, book, shelf, admin | Accessible modal (focus trap, Esc, stacking) and promise-based confirmation replacing `window.confirm` |
| `Toaster` / `toast()` | `App.tsx`, stores | Save/failure feedback (store write errors surface here) |
| `VolumeRow`, `SetReviewPanel`, `TranslationComparison` | book, series | Reading state per volume, set rating, stacked translation excerpts |
| `ReadingCard`, `ProgressDialog` | browse, shelf | In-progress volume card; page update / mark finished |

### Global State (Zustand)

| Store | Controls | Consumed by |
|-------|----------|-------------|
| `useAuthStore` | session, `ready`, `signOut` | App (loads/clears logs on user change), header, pages |
| `useCatalogStore` | cached works/series/authors | browse, search, shelf, log, stats, related works; `reload()` after admin edits |
| `useBookStore` | works/editionSets/volumes of opened works | completion cascade in `logStore` |
| `useLogStore` | volume/set/series logs + CRUD, `hasLoaded` | all personal views |
| `useToastStore` | toast queue | `Toaster` |

---

## 6. API & Data Flow

### Supabase Queries (`src/services/db.ts`)

| Function | Table(s) | Purpose |
|----------|----------|---------|
| `fetchCatalogRows()` | `works`+`editions`, `series`, `authors` | Catalogue for browse, search, shelf, log and stats (cached in `catalogStore`) |
| `fetchAllWorks()` | `works` | Admin: work list for the edition form |
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
    ├──► catalogStore (Zustand) ──► browse grid, global search, shelf, log, stats
    │       works[] (+editions), series[], authors[]
    │
    ├──► bookStore (Zustand)  ──► completion cascade (volumes of opened works)
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

### Supabase 관리자 인증 설정

관리자 화면은 매직 링크가 아니라 Supabase Auth의 **이메일/비밀번호 로그인**을 사용한다. 다음 설정은 Supabase Dashboard에서 프로젝트 소유자가 직접 수행해야 한다.

1. **Authentication → Providers → Email**에서 Email 공급자를 활성화한다. 실서비스에서는 **Confirm email**도 활성화하고 실제로 메일을 받을 수 있는 관리자 이메일을 사용한다.
2. **Authentication → Users → Add user**에서 관리자 사용자를 만든다. 개발 전용 계정이 필요하면 `test@test.com`을 사용할 수 있지만, 실서비스에는 사용하지 않는다. 비밀번호 관리자에서 생성한 길고 고유한 비밀번호를 설정하며 비밀번호를 저장소나 `VITE_` 환경 변수에 넣지 않는다.
3. 이메일 확인을 완료한 다음, 서버 측 Admin API 또는 Dashboard의 SQL Editor처럼 service-role 권한이 있는 안전한 경로에서 관리자 claim을 부여한다. 예를 들어 SQL Editor에서는 다음 쿼리를 실행한다.

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
     || '{"role":"admin"}'::jsonb
   where email = 'test@test.com';
   ```

   실서비스 계정은 위 이메일을 실제 관리자 이메일로 바꾼다. `user_metadata`는 사용자가 변경할 수 있으므로 권한 판정에 사용하지 않는다. 기존 세션이 있다면 claim이 포함된 새 JWT를 받도록 로그아웃한 뒤 다시 로그인한다.
4. **Authentication → URL Configuration**에서 아래 주소를 등록한다.
   - Site URL: `https://kingjnu-sakayume.github.io/letterbookxd/` (실제 배포 도메인을 쓰는 경우 해당 값으로 교체)
   - Redirect URLs: `http://localhost:5173/letterbookxd/#/admin`
   - Redirect URLs: `https://kingjnu-sakayume.github.io/letterbookxd/#/admin`

현재 비밀번호 로그인은 redirect URL을 사용하지 않지만, 이메일 확인 흐름과 향후 인증 링크가 올바른 관리자 경로로 돌아오도록 위 값을 유지한다. 매직 링크 로그인을 다시 도입한다면 관리자 로그인에서는 반드시 `signInWithOtp`의 `options.shouldCreateUser: false`를 설정해 존재하지 않는 이메일로 신규 사용자가 자동 생성되지 않게 한다.

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

### Unused Code

`searchBooks()` in `src/services/api.ts` is no longer called (the catalogue comes from Supabase). The old `src/data/` mock files have already been removed.

### Naming Conventions

| Category | Convention | Example |
|----------|------------|---------|
| Pages | PascalCase + `Page` suffix | `BookDetailPage.tsx` |
| Components | PascalCase | `VolumeRow.tsx` |
| Stores | camelCase + `Store` suffix | `bookStore.ts` |
| Utilities | camelCase | `bookGrouping.ts` |
| DB functions | camelCase verb phrases | `fetchEditionsByWorkId()` |
| CSS classes | Tailwind utilities; shared classes via `@layer` in `index.css` | `btn btn-primary`, `field`, `panel`, `book-cover`, `hide-scrollbar` |

### Design System

Tokens live in `tailwind.config.js`; shared component classes live in `src/index.css`.

| Token | Value | Use |
|-------|-------|-----|
| `paper` / `paper-raised` / `paper-sunken` | `#f4f0e8` / `#fbf9f4` / `#ece6da` | Page, panels, wells |
| `ink` / `ink-soft` / `ink-muted` / `ink-faint` | `#1d1b17` / `#3b3730` / `#6d665a` / `#8a8274` | Text (muted ≥ 4.5:1 on paper; faint is for non-essential text only) |
| `line` / `line-strong` / `line-soft` | `#dcd4c4` / `#c5bba7` / `#e7e1d5` | Hairlines and borders |
| `seal` | `#a0312a` | Logo, 인생책 heart, destructive actions, focus ring |
| `reading` | `#2e5d8a` | 읽는 중 |
| `completed` | `#4d7a2e` (text: `completed-dark` `#3b5f22`) | 완독, completion stamps, chart bars |
| `star` | `#b27d17` | Star ratings, rating bars |

- **Type:** `font-serif` (Gowun Batang) for page/book titles, section headings and reading text (descriptions, excerpts); `font-sans` (Pretendard) for everything else, including all numbers in figures and charts. Use `tnum` for numbers that align in columns.
- **Layout:** no fixed max width. `page-x` gives responsive side padding (up to `3xl` = 1920px); grids use `repeat(auto-fill, minmax(…))` so wider screens get more columns; long text is limited to ~68ch inside wide columns.
- **Components first:** use `Page`/`PageHeader`/`SectionHeading`, `Tabs`, `Dialog`/`useConfirm`, `toast()`, `BookCover`, `StarRating`, `ReadingMark` rather than one-off markup. Do not use `window.confirm`/`alert`.
- **Copy:** short, plain Korean. Use `josa()` from `src/lib/hangul.ts` when a particle follows dynamic text (`josa(title, '을', '를')`). Avoid emoji and decorative glyphs in the UI.
- **Charts:** one hue per single-series chart, hairline grids, ≤24px bars with 4px rounded ends, values written as text or available in a table view; the map uses the validated 5-step moss ramp in `mapScale.ts`.

### Reading State Color Codes

| State | Token | Value |
|-------|-------|-------|
| `reading` | `reading` | `#2e5d8a` |
| `completed` | `completed` | `#4d7a2e` |
| `unread` | `ink-faint` | `#8a8274` |

### Base Path

The app is deployed at `/letterbookxd/` (Vite `base`). Routing uses `HashRouter`, so app paths look like `/letterbookxd/#/book/<id>`; always navigate with `<Link>`/`navigate()` and route-relative paths.

### Known Limitations

- **Authenticated ownership:** Log reads and writes use the signed-in Supabase user's UUID and RLS `auth.uid()`. `/admin` requires an email/password session whose JWT has `app_metadata.role = "admin"`; the UI gate complements rather than replaces matching RLS policies. `user_metadata` is never trusted for authorization. Grant the role only through the Supabase Dashboard or Admin API, then have the user sign in again to refresh the JWT.
- **No offline support:** All data is fetched from Supabase on load; no service worker or local cache beyond Zustand in-memory state.
- **Aladin proxy is dev-only:** The `/aladin-api` proxy in `vite.config.ts` only works during development. The admin ISBN lookup will fail in production unless a separate CORS proxy is deployed.
- **`docs/` is committed:** The build output lives in `/docs` and is version-controlled for GitHub Pages. Run `npm run build` before committing if deploying manually.

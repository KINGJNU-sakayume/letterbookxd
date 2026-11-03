# letterbookxd — 책장 (My Reading Records)

> A personal reading tracker and library management app for Korean book readers, with edition management, reading statistics, and a curated admin panel.

---

## 1. Project Overview

**letterbookxd** (책장, "bookshelf") is a Korean-focused single-page application for tracking personal reading history. It is a single-owner app with no sign-in: reading records live in the browser (IndexedDB) and the catalogue ships with the site as JSON. It lets the owner catalogue their book collection across multiple publishers and editions, record per-volume reading progress, rate completed works, and visualize reading habits through statistics. The app models the nuances of Korean book publishing — multiple translation editions, volume series (권/상/중/하), and author-centric browsing.

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
| Local storage | Dexie (IndexedDB) | 4.x |
| Catalogue | Bundled JSON (`src/data/catalog.json`) | — |
| Flowcharts | @xyflow/react | 12.10.2 |
| Map Visualization | react-simple-maps | 3.0.0 |
| PostCSS | postcss + autoprefixer | 8.4.35 / 10.4.18 |
| Linting | ESLint 9 + TypeScript plugin | 9.9.1 |

Charts on the stats page are plain HTML/SVG components (`src/components/stats/`); there is no chart library.

**Architectural notes:**
- **SPA** — entirely client-side rendered; no SSR or SSG.
- **Deployed to GitHub Pages** at the `/letterbookxd/` subpath; Vite `base` is set accordingly and routing uses `HashRouter`.
- **No backend for app data.** This device is the owner: there is no sign-in. Reading logs are stored in the browser with IndexedDB (Dexie). The public catalogue (works, editions, series, authors, reading-order flowcharts, translation excerpts) is committed as `src/data/catalog.json` and bundled into the site.
- **Catalogue editing** happens in `/admin` and is saved on this device as an *override* (a full edited copy in IndexedDB). "카탈로그 JSON 내보내기" downloads `catalog.json`; commit it over `src/data/catalog.json` to publish.
- **Backups**: `/settings` exports and imports `{ app: 'letterbookxd', version: 1, exportedAt, logs, catalogOverrides? }`. An import is previewed first (new / unchanged / conflicts) and only applied after approval.
- **No server at all.** The admin form's auto-fill calls the National Library of Korea ISBN API (국립중앙도서관 ISBN 서지정보, `seoji`) straight from the browser; it allows CORS. The certification key is typed into `/admin` once and stored only in this browser (IndexedDB). It never goes into the repository, the build or backups. All calls go through `src/services/bookLookup.ts`.

---

## 3. File Tree

```
letterbookxd/
├── .github/workflows/            # ci.yml (PR checks), deploy.yml (Pages)
├── docs/                         # ⚠️ Generated build output (GitHub Pages source) — do not edit
├── index.html                    # Vite entry; loads Pretendard + Gowun Batang
├── tailwind.config.js            # Design tokens: paper/ink/line/seal/reading/completed/star, fonts, 3xl breakpoint
├── vite.config.ts                # base path, React plugin, docs output
├── tests/                        # node:test suites (stats, Hangul, translation diff, Life Hub, logStore, backup, catalogue, book lookup)
│   ├── harness/app.ts            # esbuild entry bundling the store/storage/backup modules for tests
│   └── setup.mjs                 # fake-indexeddb + window shim
│
└── src/
    ├── main.tsx                  # React entry
    ├── App.tsx                   # HashRouter, routes, loads logs once, confirm/toast providers
    ├── index.css                 # Base styles + component classes (.btn, .field, .panel, .book-cover …)
    │
    ├── types/index.ts            # Shared client + flowchart types
    ├── data/catalog.json         # The public catalogue (commit exports here)
    ├── catalog/model.ts          # Catalogue row types, normalize/serialize (stable sort by id), content hash
    ├── storage/db.ts             # Dexie database `letterbookxd`: `logs`, `catalogOverride`, `settings` (this device only)
    ├── lib/
    │   ├── hangul.ts             # 초성 search, match ranking, highlight ranges, 조사(을/를…) helper
    │   └── download.ts           # Save a string as a file
    ├── store/
    │   ├── catalogStore.ts       # Cached catalogue (works+editions, series, authors) for browse/search/shelf/log/stats
    │   ├── bookStore.ts          # Works/editionSets/volumes used by the completion cascade
    │   ├── logStore.ts           # Reading logs (IndexedDB) + CRUD + auto-completion cascade
    │   └── toastStore.ts         # Small toast queue (`toast(message, tone)`)
    ├── services/
    │   ├── catalogSource.ts      # Bundled catalogue + on-device override; mutateCatalog, status, discard
    │   ├── db.ts                 # Catalogue reads and writes
    │   ├── bookLookup.ts         # Book lookup (국립중앙도서관 seoji API) + key stored in this browser
    │   └── bookCache.ts          # `ensureWorkLoaded` — loads a work's volumes before changing state outside its page
    ├── hooks/                    # useDocumentTitle, useMediaQuery, useOutsideClick, useLibrary, useCatalogStatus
    ├── domain/
    │   ├── books/identity.ts     # Edition-set / volume id helpers
    │   ├── logs/records.ts       # Stored log record shape, validation, mapping to client logs
    │   ├── logs/cascade.ts       # Pure set/series completion decisions
    │   ├── backup/backup.ts      # Backup format, import plan (conflicts)
    │   └── stats/computeStats.ts # Pure statistics calculation (tested)
    ├── lifehub/                  # Life Hub proposals (remote.ts, resolve.ts, apply.ts, LifeHubPanel.tsx)
    ├── utils/                    # bookMappers, editionUtils, format, readingState, translationDiff
    │
    ├── pages/
    │   ├── SearchPage.tsx        # /            둘러보기 — filters (view/state/tag/list) in the URL, cover grid
    │   ├── BookDetailPage.tsx    # /book/:id    cover column, editions & volumes, translations, related works
    │   ├── SeriesPage.tsx        # /series/:id  table of contents, selected work's volumes, series rating
    │   ├── AuthorPage.tsx        # /author/:n   portrait & facts, bio, my figures, works, reading-order timeline
    │   ├── BookshelfPage.tsx     # /bookshelf   reading / series in progress / completed (grouped)
    │   ├── ReadingLogPage.tsx    # /reading-log diary table by month, edit & delete dialogs
    │   ├── StatsPage.tsx         # /stats       figures, monthly chart, bars, map, 100-book list
    │   ├── AdminPage.tsx         # /admin       catalogue edit bar, works table, add forms, flowchart editor
    │   ├── SettingsPage.tsx      # /settings    backup export, import preview, catalogue status
    │   └── NotFoundPage.tsx      # *            unknown routes
    │
    └── components/
        ├── layout/               # Navbar (tabs + mobile tab bar), GlobalSearch, AccountMenu (내 서재 menu), Page/PageHeader/SectionHeading/Breadcrumbs, ScrollManager
        ├── ui/                   # BookCover, StarRating, Tabs, Dialog, ConfirmProvider + confirm, Toaster, States, ProgressBar, Portrait, ReadingMark, LikeButton
        ├── book/                 # VolumeRow, SetReviewPanel, TranslationComparison, ReadingCard, ProgressDialog
        ├── stats/                # StatFigure, MonthlyChart (+ table view), BarList, LiteraryMap, mapScale
        ├── flowchart/            # Reading-order sidebar, modal, editor
        └── admin/                # FormControls, CatalogEditBar (override status · export · discard), catalogFormat
```

---

## 4. Page-by-Page Breakdown

Every page shares the same shell: a sticky full-width header (seal logo, section tabs, global search, account menu) and, below `md`, a bottom tab bar. Pages use `Page` (fluid width with responsive side padding) and a `PageHeader`. Detail pages use a three-column grid on `xl` (sticky cover column · main · side panel) that collapses to two columns on `lg` and one column on phones.

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | `SearchPage` (둘러보기) | Continue-reading cards, a filter sidebar (view: 단행본/시리즈/작가, my reading state, 분류 tags, 목록 lists) and an auto-fill cover grid. Filters, sort and the text filter live in the URL so Back returns to the same list. |
| `/book/:workId` | `BookDetailPage` | Breadcrumbs, cover + my record summary, title/author/tags (tags link back to filtered browse), description, publisher tabs with volume rows (state switch, page form, ratings), set review for multi-volume editions, translation comparison and other works by the author or series. |
| `/series/:id` | `SeriesPage` | Series cover with my progress and series rating, a numbered table of contents with reading marks, the selected work's editions and volumes, and a preview panel. |
| `/author/:name` | `AuthorPage` | Portrait (monogram fallback) and facts, bio, my figures (read / average rating / 인생책), works by year, and the reading-order timeline with a full flowchart modal. Works without an `authors` row still render. |
| `/bookshelf` | `BookshelfPage` | Header figures, tabs (전체/읽는 중/완독/이어 읽을 시리즈), reading cards with a page-progress dialog (including "다 읽었어요"), series in progress with the next title, completions grouped by year or rating. |
| `/reading-log` | `ReadingLogPage` | Diary table grouped by month (sticky month labels), filters for year/rating/kind/author/text, edit dialog (date, rating, 인생책) and delete with confirmation. Unread resets are not listed; series completions show the series. |
| `/stats` | `StatsPage` | Year switch, six key figures, monthly completions (hover/focus tooltips + table view), rating/author/tag/publisher bars, a choropleth map with a country list, and progress on the 노벨 연구소 100선 list. |
| `/admin` | `AdminPage` | Catalogue edit bar (override status, 카탈로그 JSON 내보내기, 편집본 버리기), section nav, a searchable works table with an edit dialog, add forms with live previews, and the flowchart editor. Deleting a work also deletes this device's logs for it. |
| `/settings` | `SettingsPage` | 백업 JSON 내보내기, import (backup JSON) with a preview of new / unchanged / conflicting records, and catalogue status. |
| `/login` | — | Redirects to `/` (old links). |
| `*` | `NotFoundPage` | Unknown routes. |

There is no sign-in: personal pages (`/bookshelf`, `/reading-log`, `/stats`) show this browser's records, and editing controls are always available. Someone else opening the deployed site sees the public catalogue and their own (empty) browser storage.

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
| `useCatalogStore` | cached works/series/authors | browse, search, shelf, log, stats, related works; `reload()` after admin edits |
| `useBookStore` | works/editionSets/volumes of opened works | completion cascade in `logStore` |
| `useLogStore` | volume/set/series logs (IndexedDB) + CRUD, `hasLoaded`, backup import/export helpers | all personal views, Life Hub approval |
| `useToastStore` | toast queue | `Toaster` |

---

## 6. API & Data Flow

### Catalogue (`src/services/db.ts` over `catalogSource.ts`)

The catalogue is `src/data/catalog.json` (`{ version: 1, works, editions, series, authors, flowcharts }`, rows use snake_case column names). If this device has an override in IndexedDB, it is used instead. Every admin write goes through `mutateCatalog()`, which edits a copy and saves it as the override. If the result equals the bundled file, the override is removed. The override remembers the hash of the bundled catalogue it started from. When a newer `catalog.json` is deployed, `/admin` warns that the override is stale.

| Function | Purpose |
|----------|---------|
| `fetchCatalogRows()` | Catalogue for browse, search, shelf, log and stats (cached in `catalogStore`) |
| `fetchAllWorks()` / `fetchWorkById()` / `fetchEditionsByWorkId()` | Work and edition lookups |
| `fetchSeriesById()` / `fetchAllSeries()` / `fetchWorksBySeriesId()` | Series |
| `fetchAuthorByName()` / `fetchWorksByAuthor()` / `fetchWorkAuthorNames()` | Author page, flowchart editor |
| `insertWork()` / `updateWork()` / `deleteWork()` / `insertEdition()` / `insertSeries()` / `upsertAuthorByName()` | Admin edits (new ids: `crypto.randomUUID()`) |
| `fetchFlowchartByAuthor()` / `upsertFlowchart()` | Reading-order flowcharts |

### Reading logs (`src/store/logStore.ts` over `src/storage/db.ts`)

Logs are stored in the Dexie table `logs` (indexes: `id, logType, volumeId, editionSetId, workId, seriesId`) as `LogRecord`s (`src/domain/logs/records.ts`):

`id` (`crypto.randomUUID()`, matches `/^[A-Za-z0-9_-]{1,128}$/`), `logType` (`volume` / `set_completion` / `series_completion`), `volumeId`, `editionSetId`, `workId`, `seriesId`, `readingState`, `currentPage`, `liked`, `rating`, `autoGenerated`, `createdAt` (first created; for completion logs this is the completion date), `updatedAt`.

The public API: `loadLogs`, `upsertVolumeLog`, `updateReadingProgress`, `upsertSetCompletionLog`, `upsertSeriesCompletionLog`, `updateLogMetadata`, `deleteLogById`, `get*Log`. plus `deleteLogsByWorkId`, `applyImport`, `exportRecords`.

### External Third-Party Services

| Service | Purpose | Integration point |
|---------|---------|-------------------|
| **국립중앙도서관 ISBN 서지정보 API** (`https://www.nl.go.kr/seoji/SearchApi.do`) | Book search for the admin edition form: ISBN, publisher, cover (`TITLE_URL`), page count (`PAGE`), volume (`VOL`) | `src/services/bookLookup.ts` → `AdminPage.tsx` (`EditionForm`) |

Search by title, or by ISBN when the query is 10/13 digits. The key (`cert_key`) is requested at [nl.go.kr → Open API → 인증키 신청/관리](https://www.nl.go.kr/NL/contents/N31101020000.do), entered in `/admin` → 판본 추가, and stored in this browser's `settings` table. It is not part of backups.

### Overall Data Flow

```
src/data/catalog.json ─┐
IndexedDB override ────┴─► catalogSource ─► db.ts ─┬─► catalogStore ──► browse grid, search, shelf, log, stats
                                                   └─► bookStore ────► completion cascade (volumes of opened works)

IndexedDB logs ─► logStore ──► all pages that display reading state
                     │
                     └──► Auto-cascade: all volumes of an edition complete → set_completion
                                        every work in the series has set_completion → series_completion
```

User action → `logStore` method → Dexie write → store state updated in memory → React re-renders.

---

### Life Hub proposals (optional)

Claude can propose reading records through [Life Hub](https://github.com/KINGJNU-sakayume/life-hub) ("데미안 다 읽었어, 별 다섯 개"). On **내 책장** the owner connects once (`Life Hub 연결`; OAuth public client `public/lifehub-client.json` with PKCE, `letterbookxd:inbox` only; Life Hub returns to `public/lifehub/`). Each proposal is matched against the catalogue (`src/lifehub/resolve.ts`): only a single exact title (and author) match, a single publisher and a single volume are preselected; anything else is a choice for the owner, and books missing from the catalogue wait until they are added. Approving writes through `logStore.upsertVolumeLog` (same completion cascade as the UI) and, for a stated completion date, `updateLogMetadata`. Receipts (proposal → log ID) and rejections are kept in localStorage and retried; rejecting changes nothing.

**Claude card approvals.** Claude can show the proposal as a card and the owner can edit and approve it there. 책장 syncs `status=open` (pending + card-approved) and uses the owner's edited version (`final_candidate`) when there is one. It shares its catalogue with Life Hub for the card (`PUT …/refs/works` = work id, title, author; `PUT …/refs/editions` = edition id, publisher, `"<work id>/<volume>"`; public catalogue data only, sent when it changes). A card-approved proposal is recorded on opening (`src/lifehub/apply.ts`, the same path as the review dialog) only when Life Hub saw no need to ask, the setting 「Claude에서 승인된 항목 자동 반영」 (default on, this device, `letterbookxd.lifehub.auto-apply.v1`) is on, and `autoPlan` finds one work, one edition set and one volume; anything else stays in the list as 「Claude에서 승인함 · 확인 필요」. A stated completion date also dates the edition-set completion it creates.

## 7. Configuration & Backups

There are no environment variables and no secrets in the repository or the build. The only key the app uses (the 국립중앙도서관 `cert_key`) is entered in the browser. **Never commit** backups, tokens or keys. `.gitignore` already excludes `backups/` and `letterbookxd-backup*.json`.

### Publishing catalogue edits

1. Edit in `/admin` (changes are saved on this device).
2. Click **카탈로그 JSON 내보내기** and save the file over `src/data/catalog.json`.
3. Commit and push. After deployment, click **편집본 버리기** so this device follows the deployed file again.

### Backups

`/settings` → **백업 JSON 내보내기** downloads `letterbookxd-backup-YYYY-MM-DD.json` with every log (and the catalogue override, if any). **파일 고르기** accepts a backup JSON and shows new / unchanged / conflicting records. A conflict is either the same id with different content, or a different id pointing at the same volume, edition or series. You choose to skip or overwrite conflicts before anything is written.

---

## 8. Setup & Local Development

**Prerequisites:**
- Node.js ≥ 18
- npm ≥ 9

```bash
# 1. Clone
git clone https://github.com/kingjnu-sakayume/letterbookxd.git
cd letterbookxd

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
# → http://localhost:5173/letterbookxd/

# 4. Type-check
npm run typecheck

# 5. Lint and test (node:test; IndexedDB via fake-indexeddb)
npm run lint
npm test

# 6. Build for production (outputs to /docs)
npm run build

# 7. Preview the production build locally
npm run preview
```

**Deployment** is automated via `.github/workflows/deploy.yml`:
- Push to `main` → GitHub Actions runs `npm ci && npm run build` → commits `/docs` → GitHub Pages serves it.

---

## 9. Key Conventions & Notes for Developers / LLMs

### ID Encoding

- **Work IDs:** UUIDs (`work.id`); new rows use `crypto.randomUUID()`.
- **Log IDs:** `crypto.randomUUID()`. Life Hub receipts use them as `entity_id`.
- **EditionSet IDs:** Composite string `{workId}::{publisher}` — parse with `parseEditionSetId()` by splitting on `::`.
- **Volume IDs:** `vol-{edition.id}` — prefix used to distinguish from other ID types.

### Type System (Two Parallel Layers)

There are two parallel type layers — keep them separate:

| Layer | Types | Location | Used for |
|-------|-------|----------|---------|
| **Client model** | `Work`, `EditionSet`, `Volume`, `VolumeLog`, `SetCompletionLog`, `SeriesCompletionLog` | `src/types/index.ts` | All UI components and stores |
| **Catalogue rows** | `DbWork`, `DbEdition`, `DbSeries`, `DbAuthor`, `DbFlowchart` | `src/catalog/model.ts` | Rows of `catalog.json` |
| **Stored logs** | `LogRecord` | `src/domain/logs/records.ts` | IndexedDB rows and backups |

Conversion happens exclusively in `src/utils/bookMappers.ts`. Never pass raw DB rows to components.

### Storage Access

Catalogue reads and writes go through `src/services/db.ts` (backed by `catalogSource.ts`). Logs are read and written only through `logStore`. Components never touch Dexie directly.

### State Mutation Pattern

```
User action → logStore method → Dexie write → store state updated
```

`logStore` is the single source of truth for reading state.

### Auto-Completion Cascade Logic (`logStore.ts`)

When toggling a volume to `completed`:
1. Check if **all volumes** in the EditionSet are `completed` → auto-create `SetCompletionLog`.
2. New `SetCompletionLog` created → check if **all works** in the series have `SetCompletionLog`s → auto-create `SeriesCompletionLog`.
3. Reverse: un-completing a volume → delete the `SetCompletionLog` → delete the `SeriesCompletionLog`.
4. `deleteLogById`: deleting a volume log also deletes its edition's set completion and its series completion; deleting a set completion deletes the series completion.

The decisions themselves are pure functions in `src/domain/logs/cascade.ts`. The series membership comes from the catalogue (`seriesInfoForWork`).

The `autoGenerated: true` flag distinguishes system-created logs from user-created ones. User-created logs (rating, liked) are never auto-deleted.

### Korean Volume Parsing

`extractVolumeFromTitle()` in `src/services/db.ts` handles `1권`, `상`, `중`, `하` and trailing numbers. The edition form uses it when the library record has no `VOL`.

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
| `ink` / `ink-soft` / `ink-muted` / `ink-faint` | `#1d1b17` / `#3b3730` / `#665f54` / `#726b5e` | Text. On `paper` / `paper-raised`: muted 5.5:1 / 6.0:1, faint 4.6:1 / 5.0:1. On `paper-sunken` muted is 5.1:1 but faint drops to 4.2:1, so use muted there |
| `line` / `line-strong` / `line-soft` | `#dcd4c4` / `#c5bba7` / `#e7e1d5` | Hairlines and borders |
| `seal` | `#a0312a` | Logo, 인생책 heart, destructive actions, focus ring |
| `reading` | `#2e5d8a` | 읽는 중 |
| `completed` | `#4d7a2e` (text: `completed-dark` `#3b5f22`) | 완독, completion stamps, chart bars |
| `star` | `#b27d17` | Star ratings, rating bars |

- **Type:** `font-serif` (Gowun Batang) for page/book titles, section headings and reading text (descriptions, excerpts); `font-sans` (Pretendard) for everything else, including all numbers in figures and charts. Use `tnum` for numbers that align in columns.
- **Layout:** no fixed max width. `page-x` gives responsive side padding (up to `3xl` = 1920px); grids use `repeat(auto-fill, minmax(…))` so wider screens get more columns; long text is limited to ~68ch inside wide columns.
- **Touch:** the `coarse:` variant (`@media (pointer: coarse)`, defined in `tailwind.config.js`) grows controls to 44px on touch screens while mouse layouts stay compact. `btn`, `btn-sm`, `btn-icon`, `btn-icon-sm`, `chip`, `Tabs`, `StarRating` and `LikeButton` already do this; give any new one-off control a `coarse:` size too.
- **Focus:** links that wrap a cover or portrait use the `tile` class so the seal-coloured focus ring sits around the whole tile. Do not add `outline-none` to links or buttons.
- **Components first:** use `Page`/`PageHeader`/`SectionHeading`, `Tabs`, `Dialog`/`useConfirm`, `toast()`, `BookCover`, `StarRating`, `ReadingMark` rather than one-off markup. Do not use `window.confirm`/`alert`.
- **Copy:** short, plain Korean. Use `josa()` from `src/lib/hangul.ts` when a particle follows dynamic text (`josa(title, '을', '를')`). Avoid emoji and decorative glyphs in the UI.
- **Charts:** one hue per single-series chart, hairline grids, ≤24px bars with 4px rounded ends, values written as text or available in a table view; the map uses the validated 5-step moss ramp in `mapScale.ts`.

### Reading State Color Codes

| State | Token | Value |
|-------|-------|-------|
| `reading` | `reading` | `#2e5d8a` |
| `completed` | `completed` | `#4d7a2e` |
| `unread` | `ink-faint` | `#726b5e` |

### Base Path

The app is deployed at `/letterbookxd/` (Vite `base`). Routing uses `HashRouter`, so app paths look like `/letterbookxd/#/book/<id>`; always navigate with `<Link>`/`navigate()` and route-relative paths.

### Known Limitations

- **Data lives in one browser.** Logs are not synced between devices. Move them with a backup JSON. Clearing site data deletes them, so back up regularly.
- **Public catalogue only.** Anything in `src/data/catalog.json` is public, so keep personal notes out of catalogue fields.
- **`docs/` is committed:** The build output lives in `/docs` and is version-controlled for GitHub Pages. Run `npm run build` before committing if deploying manually.

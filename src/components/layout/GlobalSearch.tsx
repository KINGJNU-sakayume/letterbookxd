import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useCatalogStore } from '../../store/catalogStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { highlightRange, josa, matchRank } from '../../lib/hangul';
import { compareKo } from '../../utils/format';
import { BookCover } from '../ui/BookCover';
import { Portrait } from '../ui/Portrait';
import { Spinner } from '../ui/States';

type Kind = 'work' | 'series' | 'author';

interface SearchResult {
  kind: Kind;
  key: string;
  to: string;
  title: string;
  sub: string;
  image: string | null;
}

const GROUP_LABEL: Record<Kind, string> = { work: '작품', series: '시리즈', author: '작가' };
const LIMIT: Record<Kind, number> = { work: 7, series: 3, author: 3 };

function useSearchResults(query: string): SearchResult[] {
  const { works, series, authors } = useCatalogStore();
  return useMemo(() => {
    if (!query.trim()) return [];
    const pick = <T,>(items: T[], score: (item: T) => number | null, name: (item: T) => string) =>
      items
        .map((item) => ({ item, s: score(item) }))
        .filter((x): x is { item: T; s: number } => x.s !== null)
        .sort((a, b) => a.s - b.s || compareKo(name(a.item), name(b.item)))
        .map((x) => x.item);
    const best = (title: string, other: string) => {
      const a = matchRank(title, query);
      const b = matchRank(other, query);
      if (a === null && b === null) return null;
      return Math.min(a ?? Infinity, (b ?? Infinity) + 4);
    };

    const workHits = pick(works, (w) => best(w.title, w.author), (w) => w.title)
      .slice(0, LIMIT.work)
      .map<SearchResult>((w) => ({
        kind: 'work',
        key: `w-${w.id}`,
        to: `/book/${w.id}`,
        title: w.title,
        sub: [w.author, w.published_year].filter(Boolean).join(' · '),
        image: w.cover,
      }));
    const seriesHits = pick(series, (s) => best(s.title, s.author), (s) => s.title)
      .slice(0, LIMIT.series)
      .map<SearchResult>((s) => ({
        kind: 'series',
        key: `s-${s.id}`,
        to: `/series/${s.id}`,
        title: s.title,
        sub: `${s.author} · ${s.workIds.length}부작`,
        image: s.cover,
      }));
    const authorHits = pick(authors, (a) => matchRank(a.name, query), (a) => a.name)
      .slice(0, LIMIT.author)
      .map<SearchResult>((a) => ({
        kind: 'author',
        key: `a-${a.id}`,
        to: `/author/${encodeURIComponent(a.name)}`,
        title: a.name,
        sub: [a.country, `작품 ${a.workCount}편`].filter(Boolean).join(' · '),
        image: a.photo_url,
      }));
    return [...workHits, ...seriesHits, ...authorHits];
  }, [query, works, series, authors]);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const range = highlightRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="rounded-[2px] bg-[#f0dfc2] px-px text-ink">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

interface ResultsProps {
  listId: string;
  query: string;
  results: SearchResult[];
  active: number;
  onHover: (index: number) => void;
  onPick: (result: SearchResult) => void;
}

function Results({ listId, query, results, active, onHover, onPick }: ResultsProps) {
  const status = useCatalogStore((s) => s.status);

  if (!query.trim()) {
    return (
      <p className="px-4 py-5 text-[13.5px] leading-relaxed text-ink-muted">
        제목, 작가, 시리즈 이름으로 찾습니다. <span className="whitespace-nowrap">초성(예: ㅈㅇㅂ)도 됩니다.</span>
      </p>
    );
  }
  if (results.length === 0) {
    return status === 'loading' || status === 'idle' ? (
      <p className="flex items-center gap-2 px-4 py-5 text-[13.5px] text-ink-muted">
        <Spinner /> 목록을 불러오는 중
      </p>
    ) : (
      <p className="px-4 py-5 text-[13.5px] text-ink-muted">{josa(`‘${query.trim()}’`, '과', '와')} 맞는 결과가 없습니다.</p>
    );
  }

  return (
    <ul id={listId} role="listbox" aria-label="검색 결과" className="py-1.5">
      {results.map((r, i) => {
        const groupStart = i === 0 || results[i - 1].kind !== r.kind;
        return (
          <li key={r.key} role="presentation">
            {groupStart && (
              <div className={`px-4 pb-1.5 pt-2.5 text-[12px] font-medium text-ink-faint ${i > 0 ? 'mt-1 border-t border-line-soft' : ''}`}>
                {GROUP_LABEL[r.kind]}
              </div>
            )}
            <button
              type="button"
              role="option"
              id={`${listId}-${i}`}
              aria-selected={i === active}
              onMouseMove={() => onHover(i)}
              onClick={() => onPick(r)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${i === active ? 'bg-paper-sunken' : ''}`}
            >
              {r.kind === 'author' ? (
                <Portrait src={r.image} name={r.title} shape="circle" className="h-9 w-9 shrink-0" />
              ) : (
                <BookCover src={r.image} alt="" title={r.title} className="w-8 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-ink">
                  <Highlight text={r.title} query={query} />
                </span>
                <span className="block truncate text-[12.5px] text-ink-muted">{r.sub}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 결과 목록 키보드 조작과 이동을 묶은 공통 동작 */
function useSearchBox(onDone: () => void) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useSearchResults(query);
  const navigate = useNavigate();
  const load = useCatalogStore((s) => s.load);

  const pick = useCallback(
    (r: SearchResult) => {
      navigate(r.to);
      setQuery('');
      setActive(0);
      onDone();
    },
    [navigate, onDone],
  );

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[Math.min(active, results.length - 1)];
      if (r) pick(r);
    }
  }

  function change(value: string) {
    setQuery(value);
    setActive(0);
  }

  return { query, change, active, setActive, results, pick, onKeyDown, load };
}

function InlineSearch() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const close = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
  }, []);
  const box = useSearchBox(close);
  const dismiss = useCallback(() => setOpen(false), []);
  useOutsideClick(boxRef, open, dismiss);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex h-10 w-64 items-center gap-2 rounded-[5px] border border-line bg-paper-raised px-3 transition-colors focus-within:border-ink-soft hover:border-line-strong xl:w-80 2xl:w-96">
        <Search size={16} className="shrink-0 text-ink-faint" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={box.query}
          onChange={(e) => {
            box.change(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            void box.load();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (box.query) box.change('');
              else close();
              return;
            }
            box.onKeyDown(e);
          }}
          placeholder="제목, 작가 검색"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && box.results.length ? `${listId}-${box.active}` : undefined}
          aria-label="책 검색"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
        />
        {box.query ? (
          <button type="button" onClick={() => { box.change(''); inputRef.current?.focus(); }} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="검색어 지우기">
            <X size={15} />
          </button>
        ) : (
          <kbd className="kbd" title="어디서든 / 키로 검색">/</kbd>
        )}
      </div>
      {open && (
        <div className="animate-drop panel absolute right-0 top-[calc(100%+8px)] z-50 max-h-[min(70vh,560px)] w-[min(520px,calc(100vw-2rem))] overflow-y-auto shadow-pop">
          <Results listId={listId} query={box.query} results={box.results} active={box.active} onHover={box.setActive} onPick={box.pick} />
        </div>
      )}
    </div>
  );
}

function OverlaySearch() {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  const box = useSearchBox(close);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        aria-label="검색"
        onClick={() => {
          setOpen(true);
          void box.load();
        }}
      >
        <Search size={19} />
      </button>
      {open &&
        createPortal(
          <div className="animate-fade-in fixed inset-0 z-[70] flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label="검색">
            <div className="page-x flex h-16 shrink-0 items-center gap-3 border-b border-line">
              <Search size={18} className="shrink-0 text-ink-faint" aria-hidden />
              <input
                autoFocus
                type="search"
                value={box.query}
                onChange={(e) => box.change(e.target.value)}
                onKeyDown={box.onKeyDown}
                placeholder="제목, 작가 검색"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={box.results.length ? `${listId}-${box.active}` : undefined}
                aria-label="책 검색"
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
              />
              <button type="button" onClick={close} className="btn btn-ghost -mr-2">
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <Results listId={listId} query={box.query} results={box.results} active={box.active} onHover={box.setActive} onPick={box.pick} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function GlobalSearch() {
  const wide = useMediaQuery('(min-width: 1024px)');
  return wide ? <InlineSearch /> : <OverlaySearch />;
}

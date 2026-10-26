import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { Translation } from '../../types';
import { josa } from '../../lib/hangul';
import { diffAgainst } from '../../utils/translationDiff';

interface TranslationComparisonProps {
  translations: Translation[];
  /** 지금 보고 있는 판본의 번역: 다른 번역은 이것과 견준다 */
  highlightKey?: string;
  /** 내가 읽은 판본의 번역 */
  readKeys?: string[];
}

/** '민음사 번역' → '민음사', 'AI 번역' → 'AI' */
const shortLabel = (label: string) => label.replace(/\s*번역$/, '');

/** 같은 첫 문단을 번역본마다 하나씩 고르며 읽는다 */
export function TranslationComparison({ translations, highlightKey, readKeys = [] }: TranslationComparisonProps) {
  const uid = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // 보고 있는 판본이 바뀌면 고른 번역도 그 판본으로 돌아온다
  const [picked, setPicked] = useState<{ base?: string; key: string } | null>(null);
  const [showDiff, setShowDiff] = useState(true);

  if (translations.length === 0) return null;

  const base = translations.find((t) => t.key === highlightKey);
  const pickedKey = picked && picked.base === highlightKey ? picked.key : undefined;
  const current = translations.find((t) => t.key === pickedKey) ?? base ?? translations[0];
  const index = translations.indexOf(current);
  const isBase = current === base;
  const single = translations.length === 1;

  const diff = diffAgainst(!isBase && showDiff ? base?.text : null, current.text);
  const prev = translations[(index + translations.length - 1) % translations.length];
  const next = translations[(index + 1) % translations.length];

  function choose(key: string, focus = false) {
    setPicked({ base: highlightKey, key });
    if (focus) {
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
      });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    choose((e.key === 'ArrowRight' ? next : prev).key, true);
  }

  return (
    <section aria-labelledby={`${uid}-heading`} className="panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-4">
        <h2 id={`${uid}-heading`} className="font-serif text-[19px] font-bold text-ink">
          번역 비교
        </h2>
        <span className="text-[12.5px] text-ink-muted">첫 문단, {translations.length}종</span>
      </div>

      <div className="space-y-3 bg-paper px-5 pb-5 pt-4">
        {!single && (
          <div
            ref={listRef}
            role="tablist"
            aria-label="번역 고르기"
            onKeyDown={onKeyDown}
            className="flex flex-wrap gap-1.5"
          >
            {translations.map((t) => {
              const selected = t === current;
              const read = readKeys.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${t.key}`}
                  aria-selected={selected}
                  aria-controls={`${uid}-panel`}
                  tabIndex={selected ? 0 : -1}
                  data-key={t.key}
                  onClick={() => choose(t.key)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors coarse:min-h-11 ${
                    selected ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {t === base && (
                    <span
                      aria-hidden
                      className={`h-[7px] w-[7px] shrink-0 rounded-full ${selected ? 'bg-reading-light' : 'bg-reading'}`}
                    />
                  )}
                  {shortLabel(t.label)}
                  {read && (
                    <span className={`inline-flex items-center gap-0.5 text-[11.5px] ${selected ? 'opacity-90' : 'text-ink-muted'}`}>
                      <Check size={13} strokeWidth={2.6} aria-hidden />
                      읽음
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div
          role={single ? undefined : 'tabpanel'}
          id={`${uid}-panel`}
          aria-labelledby={single ? undefined : `${uid}-tab-${current.key}`}
          className="space-y-3"
        >
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-muted">
            <b className="text-[14px] font-semibold text-ink">{current.label}</b>
            {readKeys.includes(current.key) && (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold">
                <Check size={13} strokeWidth={2.6} aria-hidden />
                내가 읽은 판본
              </span>
            )}
            {isBase && base && !single && (
              <span className="rounded-full bg-reading-light px-2 py-px text-[11.5px] font-semibold text-reading-dark">기준 · 보고 있는 판본</span>
            )}
            {!isBase && base && (
              <>
                {showDiff && (
                  <span className="tnum">
                    {josa(shortLabel(base.label), '과', '와')} 다른 어절 <b className="text-ink">{diff.changed}</b> / {diff.total}
                  </span>
                )}
                <button
                  type="button"
                  aria-pressed={showDiff}
                  onClick={() => setShowDiff((v) => !v)}
                  className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink coarse:min-h-11 coarse:px-2"
                >
                  {showDiff ? '표시 끄기' : '다른 어절 표시'}
                </button>
              </>
            )}
          </p>

          <p className="whitespace-pre-line font-serif text-[15.5px] leading-[1.85] text-ink-soft">
            {diff.pieces.map((p, i) =>
              p.changed ? (
                <mark key={i} className="-mx-0.5 rounded-[3px] bg-reading-light px-0.5 text-reading-dark box-decoration-clone">
                  {p.text}
                </mark>
              ) : (
                p.text
              ),
            )}
          </p>
        </div>
      </div>

      {!single && (
        <div className="flex items-center justify-between gap-2 border-t border-line-soft px-5 py-2.5 text-[13px] text-ink-muted">
          <button
            type="button"
            onClick={() => choose(prev.key)}
            className="inline-flex items-center gap-1 rounded-control border border-line bg-paper px-3 py-1 font-semibold text-ink-soft hover:border-line-strong hover:text-ink coarse:min-h-11"
          >
            <ArrowLeft size={14} aria-hidden />
            {shortLabel(prev.label)}
          </button>
          <span className="tnum">
            {index + 1} / {translations.length}
          </span>
          <button
            type="button"
            onClick={() => choose(next.key)}
            className="inline-flex items-center gap-1 rounded-control border border-line bg-paper px-3 py-1 font-semibold text-ink-soft hover:border-line-strong hover:text-ink coarse:min-h-11"
          >
            {shortLabel(next.label)}
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

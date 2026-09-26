import type { Translation } from '../../types';

interface TranslationComparisonProps {
  translations: Translation[];
  /** 지금 고른 판본의 번역을 표시 */
  highlightKey?: string;
}

/** 같은 첫 문단을 번역본마다 나란히 읽는다 */
export function TranslationComparison({ translations, highlightKey }: TranslationComparisonProps) {
  if (translations.length === 0) return null;
  return (
    <section aria-labelledby="translations-heading" className="panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-4">
        <h2 id="translations-heading" className="font-serif text-[19px] font-bold text-ink">
          번역 비교
        </h2>
        <span className="text-[12.5px] text-ink-muted">첫 문단 · {translations.length}종</span>
      </div>
      <ol className="divide-y divide-line-soft">
        {translations.map((t) => {
          const current = t.key === highlightKey;
          return (
            <li key={t.key} className={`px-5 py-4 transition-colors ${current ? 'bg-paper' : ''}`}>
              <p className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${current ? 'bg-ink' : 'bg-line-strong'}`} />
                {t.label}
                {current && <span className="text-ink-faint">· 보고 있는 판본</span>}
              </p>
              <p className="whitespace-pre-line font-serif text-[15.5px] leading-[1.85] text-ink-soft">{t.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

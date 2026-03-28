import { useState } from 'react';
import { Languages } from 'lucide-react';
import type { Translation } from '../../types';

interface TranslationComparisonProps {
  translations: Translation[];
  workTitle: string;
}

export function TranslationComparison({ translations, workTitle }: TranslationComparisonProps) {
  const [activeKey, setActiveKey] = useState(translations[0]?.key ?? '');

  const active = translations.find((t) => t.key === activeKey);

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <Languages size={16} className="text-stone-600" />
        <h3 className="text-sm font-semibold text-stone-800">번역 비교</h3>
        <span className="text-xs text-stone-400 ml-1">— 《{workTitle}》 첫 문단</span>
      </div>

      <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 border-b border-stone-100">
        {translations.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveKey(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeKey === t.key
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 min-h-[100px]">
        {active && (
          <p
            key={active.key}
            className="text-sm text-stone-700 leading-relaxed font-serif animate-fade-in"
          >
            {active.text}
          </p>
        )}
      </div>
    </div>
  );
}

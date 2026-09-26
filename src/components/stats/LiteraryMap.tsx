import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { COUNTRY_MAPPING } from '../../domain/stats/computeStats';

import { MAP_RAMP, NO_DATA, rampColor } from './mapScale';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface GeoFeature {
  rsmKey: string;
  properties: { name: string };
}

interface LiteraryMapProps {
  /** 한국어 나라 이름 → 완독 수 */
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (country: string) => void;
}

export function LiteraryMap({ counts, selected, onSelect }: LiteraryMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ name: string; count: number; x: number; y: number } | null>(null);

  // 지도는 영어 이름으로 칠한다. 같은 나라를 가리키는 한국어 이름(터키/튀르키예)은 합친다.
  const byEnglish = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    Object.entries(counts).forEach(([ko, count]) => {
      const en = COUNTRY_MAPPING[ko];
      if (!en) return;
      const prev = map.get(en);
      map.set(en, { name: prev?.name ?? ko, count: (prev?.count ?? 0) + count });
    });
    return map;
  }, [counts]);
  const max = Math.max(0, ...Array.from(byEnglish.values(), (v) => v.count));

  function place(e: MouseEvent, name: string, count: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ name, count, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => setHover(null)}>
      <ComposableMap
        projectionConfig={{ scale: 150 }}
        width={800}
        height={380}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="완독한 책의 원작 나라 지도"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: GeoFeature[] }) =>
            geographies.map((geo) => {
              const hit = byEnglish.get(geo.properties.name);
              const count = hit?.count ?? 0;
              const isSelected = !!hit && hit.name === selected;
              const fill = rampColor(count, max);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseMove={(e: MouseEvent) => (hit ? place(e, hit.name, count) : setHover(null))}
                  onClick={() => hit && onSelect(hit.name)}
                  style={{
                    default: { fill, stroke: isSelected ? '#1d1b17' : '#f4f0e8', strokeWidth: isSelected ? 1.4 : 0.5, outline: 'none' },
                    hover: { fill: hit ? '#27410f' : NO_DATA, stroke: '#f4f0e8', strokeWidth: 0.5, outline: 'none', cursor: hit ? 'pointer' : 'default' },
                    pressed: { fill: hit ? '#27410f' : NO_DATA, outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[5px] bg-ink px-2.5 py-1.5 shadow-lift"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <span className="tnum block text-[14px] font-semibold leading-tight text-paper-raised">{hover.count}권</span>
          <span className="block text-[11.5px] leading-tight text-paper-deep">{hover.name}</span>
        </div>
      )}
    </div>
  );
}

export function MapLegend({ max }: { max: number }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-ink-muted" aria-label={`색이 진할수록 많이 읽은 나라, 최대 ${max}권`}>
      <span>적게</span>
      <span className="flex overflow-hidden rounded-[2px]" aria-hidden>
        {MAP_RAMP.map((c) => (
          <span key={c} className="h-2.5 w-6" style={{ backgroundColor: c }} />
        ))}
      </span>
      <span>많이</span>
      <span className="tnum text-ink-faint">· 최대 {max}권</span>
    </div>
  );
}

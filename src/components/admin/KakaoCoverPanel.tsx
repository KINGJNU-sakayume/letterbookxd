import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getCatalog, mutateCatalog } from '../../services/catalogSource';
import { getKakaoKey, KAKAO_KEY_GUIDE_URL, KakaoKeyMissingError, lookupKakaoCover, setKakaoKey } from '../../services/kakaoCover';
import {
  applyCoverChanges, coverReport, coverTargets, judgeCover, type CoverMode, type CoverOutcome, type CoverTarget,
} from '../../services/coverMigration';
import { useCatalogStore } from '../../store/catalogStore';
import { toast } from '../../store/toastStore';
import { downloadText } from '../../lib/download';
import { BookCover } from '../ui/BookCover';
import { Spinner } from '../ui/States';
import { StatusDisplay, type StatusMsg } from './FormControls';

/** 카카오 REST API 키 입력 (이 브라우저에만). 판본 추가 화면과 표지 바꾸기 화면이 같이 쓴다. */
export function KakaoKeyBox({ onChange }: { onChange?: (key: string | null) => void }) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getKakaoKey().then((k) => { setKey(k); onChange?.(k); }).catch(() => setKey(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next: string | null) {
    await setKakaoKey(next);
    const saved = await getKakaoKey();
    setKey(saved);
    onChange?.(saved);
    setDraft('');
    setEditing(false);
    if (saved) toast('카카오 키를 이 브라우저에 저장했습니다.');
  }

  if (key === undefined) return null;
  if (key && !editing) {
    return (
      <p className="flex flex-wrap gap-3 text-[12.5px] text-ink-muted">
        카카오 REST API 키 저장됨 (이 브라우저)
        <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2 hover:text-ink">키 바꾸기</button>
        <button type="button" onClick={() => void save(null)} className="underline underline-offset-2 hover:text-ink">키 지우기</button>
      </p>
    );
  }
  return (
    <div className="rounded-control border border-line bg-paper-sunken px-4 py-3">
      <label htmlFor="kakao-key" className="field-label">카카오 REST API 키</label>
      <p className="mb-2 text-[12.5px] leading-relaxed text-ink-muted">
        표지는 카카오(다음) 책 검색으로 찾습니다.{' '}
        <a href={KAKAO_KEY_GUIDE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">카카오 디벨로퍼스 → 내 애플리케이션 → 앱 키</a>의
        REST API 키를 붙여 넣으세요. 키는 이 브라우저에만 저장되고 백업·카탈로그·Life Hub에는 들어가지 않습니다.
      </p>
      <div className="flex gap-2">
        <input
          id="kakao-key"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void save(draft))}
          placeholder="REST API 키"
          className="field flex-1"
        />
        <button type="button" disabled={!draft.trim()} onClick={() => void save(draft)} className="btn btn-secondary h-auto px-4">저장</button>
        {key && <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost h-auto px-3">취소</button>}
      </div>
    </div>
  );
}

type Row = CoverTarget & { outcome: CoverOutcome | null; checked: boolean; applied: boolean };

const OUTCOME_TEXT: Record<CoverOutcome['kind'], string> = {
  found: '찾음',
  same: '바뀐 것 없음',
  not_found: '못 찾음',
  error: '오류',
};

/** 관리 화면 「표지 바꾸기」: 알라딘 표지 → 카카오 원본, 카카오 표지 다시 확인 */
export function KakaoCoverPanel() {
  const [mode, setMode] = useState<CoverMode>('aladin');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const stop = useRef(false);

  async function loadTargets(next: CoverMode) {
    const catalog = await getCatalog();
    setRows(coverTargets(catalog, next).map((t) => ({ ...t, outcome: null, checked: false, applied: false })));
    setProgress(0);
    setStatus(null);
  }
  useEffect(() => { void loadTargets(mode); }, [mode]);

  async function run() {
    stop.current = false;
    setRunning(true);
    setStatus(null);
    const next: Row[] = rows.map((r) => ({ ...r, outcome: null, checked: false, applied: false }));
    setRows(next);
    for (let i = 0; i < next.length; i++) {
      if (stop.current) break;
      let outcome: CoverOutcome;
      try {
        outcome = judgeCover(next[i].oldUrl, await lookupKakaoCover(next[i].isbn));
      } catch (err) {
        if (err instanceof KakaoKeyMissingError) {
          setStatus({ type: 'error', text: err.message });
          break;
        }
        outcome = { kind: 'error', message: err instanceof Error ? err.message : '조회하지 못했습니다.' };
      }
      next[i] = { ...next[i], outcome, checked: outcome.kind === 'found' && outcome.original };
      setRows([...next]);
      setProgress(i + 1);
      await new Promise((r) => setTimeout(r, 150));
    }
    setRunning(false);
  }

  async function apply() {
    const changes = rows
      .filter((r) => r.checked && r.outcome?.kind === 'found')
      .map((r) => ({ editionId: r.editionId, oldUrl: r.oldUrl, newUrl: r.outcome?.kind === 'found' ? r.outcome.newUrl : '' }));
    if (!changes.length) return;
    try {
      const n = await mutateCatalog((draft) => applyCoverChanges(draft, changes));
      const done = new Set(changes.map((c) => c.editionId));
      setRows((rs) => rs.map((r) => (done.has(r.editionId) ? { ...r, applied: true, checked: false } : r)));
      void useCatalogStore.getState().reload();
      setStatus({ type: 'success', text: `표지 ${n}개를 바꿨습니다. 위의 「카탈로그 JSON 내보내기」로 내려받아 src/data/catalog.json에 덮어써 커밋하세요.` });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '바꾸지 못했습니다.' });
    }
  }

  function exportReport() {
    const at = new Date().toISOString();
    const done = rows.filter((r): r is Row & { outcome: CoverOutcome } => r.outcome !== null);
    downloadText(`cover-report-${at.slice(0, 10)}.md`, coverReport(done, at), 'text/markdown');
  }

  const checkedCount = rows.filter((r) => r.checked).length;
  const summary = useMemo(() => {
    const count = (k: CoverOutcome['kind']) => rows.filter((r) => r.outcome?.kind === k).length;
    return { found: count('found'), same: count('same'), notFound: count('not_found'), error: count('error'), applied: rows.filter((r) => r.applied).length };
  }, [rows]);

  return (
    <div className="space-y-5">
      <KakaoKeyBox onChange={(k) => setHasKey(!!k)} />

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="대상" className="flex gap-4 text-[14px]">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="cover-mode" checked={mode === 'aladin'} disabled={running} onChange={() => setMode('aladin')} />
            알라딘 표지 → 카카오 원본
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="cover-mode" checked={mode === 'recheck'} disabled={running} onChange={() => setMode('recheck')} />
            카카오 표지 다시 확인
          </label>
        </div>
        <span className="tnum text-[13px] text-ink-muted">ISBN 있는 대상 {rows.length}권</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {running ? (
          <button type="button" className="btn btn-secondary" onClick={() => { stop.current = true; }}>
            <Spinner /> 멈추기 ({progress}/{rows.length})
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!hasKey || rows.length === 0} onClick={() => void run()}>
            <RefreshCw size={15} aria-hidden /> 카카오에서 찾기
          </button>
        )}
        <button type="button" className="btn btn-secondary" disabled={running || checkedCount === 0} onClick={() => void apply()}>
          고른 {checkedCount}권 바꾸기
        </button>
        <button type="button" className="btn btn-ghost" disabled={running || progress === 0} onClick={exportReport}>결과 내려받기</button>
      </div>

      {progress > 0 && (
        <p className="tnum text-[13px] text-ink-muted">
          찾음 {summary.found} · 바뀐 것 없음 {summary.same} · 못 찾음 {summary.notFound} · 오류 {summary.error} · 바꿈 {summary.applied}
        </p>
      )}
      <StatusDisplay status={status} />
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        이미지는 내려받지 않고 주소만 바꿉니다. 카카오 원본(t1.daumcdn.net)은 공식 문서에 없는 경로라 바뀔 수 있어, 「다시 확인」은 매달 1일 GitHub Actions(secret `KAKAO_REST_API_KEY`)가 배포된 카탈로그에 자동으로도 돌립니다.
        표지가 열리지 않으면 화면에는 기본 표지가 나옵니다.
      </p>

      {rows.length > 0 && (
        <ul className="panel divide-y divide-line-soft" aria-label="표지 후보">
          {rows.map((r) => {
            const found = r.outcome?.kind === 'found' ? r.outcome : null;
            return (
              <li key={r.editionId} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`${r.title} ${r.publisher} ${r.volume} 바꾸기`}
                  checked={r.checked}
                  disabled={!found || r.applied || running}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.editionId === r.editionId ? { ...x, checked: e.target.checked } : x)))}
                />
                <BookCover src={r.oldUrl} alt="" title={r.title} className="w-10 shrink-0" />
                <span aria-hidden className="text-ink-faint">→</span>
                {found ? <BookCover src={found.newUrl} alt="" title={r.title} className="w-10 shrink-0" /> : <span className="w-10 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{r.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {[r.publisher, r.volume && r.volume !== '1' && `${r.volume}권`, r.isbn].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-ink-muted">
                  {r.applied ? '바꿈' : r.outcome ? `${OUTCOME_TEXT[r.outcome.kind]}${found && !found.original ? ' (썸네일)' : ''}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

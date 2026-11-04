import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Page, PageHeader, SectionHeading } from '../components/layout/Page';
import { CatalogEditBar } from '../components/admin/CatalogEditBar';
import { formatDateTime } from '../components/admin/catalogFormat';
import { Spinner } from '../components/ui/States';
import { useConfirm } from '../components/ui/confirm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { downloadText } from '../lib/download';
import { useLogStore } from '../store/logStore';
import { useCatalogStore } from '../store/catalogStore';
import { toast } from '../store/toastStore';
import { getCatalogOverride, replaceCatalogOverride } from '../services/catalogSource';
import {
  backupFileName, buildBackup, parseImportFile, planImport, resolvePlan,
  type ImportPlan, type ImportSource,
} from '../domain/backup/backup';
import type { LogRecord } from '../domain/logs/records';
import { getLogSyncController } from '../lifehub/logSyncController';
import { prepareReview, type ReviewPlan } from '../lifehub/logSyncReview';
import { parseVolumeRef } from '../domain/books/identity';
import { browserDeps } from '../lifehub/remote';
import { LifeHubSection } from '../lifehub/LifeHubSection';
import { parseEditionSetId } from '../utils/editionUtils';

const STATE_LABEL: Record<string, string> = { unread: '안 읽음', reading: '읽는 중', completed: '완독' };
const TYPE_LABEL: Record<LogRecord['logType'], string> = { volume: '권', set_completion: '판본 완독', series_completion: '시리즈 완독' };

/** 지금의 기록(과 카탈로그 편집본)을 수동 JSON 백업으로 내려받는다. 내려받은 기록 수를 돌려준다. */
async function exportBackupNow(): Promise<number> {
  const [records, override] = await Promise.all([useLogStore.getState().exportRecords(), getCatalogOverride()]);
  downloadText(backupFileName(), JSON.stringify(buildBackup(records, override), null, 2) + '\n');
  return records.length;
}

export function SettingsPage() {
  useDocumentTitle('설정 · 백업');
  const { volumeLogs, setCompletionLogs, seriesCompletionLogs } = useLogStore();
  const total = volumeLogs.length + setCompletionLogs.length + seriesCompletionLogs.length;
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      toast(`기록 ${await exportBackupNow()}건을 내보냈습니다. 저장소(repo)에는 올리지 마세요.`);
    } catch (err) {
      console.error(err);
      toast('백업을 만들지 못했습니다.', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="설정 · 백업"
        description="독서 기록은 이 브라우저(IndexedDB)에만 저장됩니다. 브라우저 데이터를 지우거나 기기를 바꾸기 전에 백업해 두세요."
      />

      <div className="grid gap-12 xl:grid-cols-2">
        <section aria-labelledby="backup-export">
          <SectionHeading id="backup-export" title="백업 내보내기" count={`기록 ${total}건`} />
          <p className="text-[14px] leading-relaxed text-ink-soft">
            모든 독서 기록과, 있다면 이 기기의 카탈로그 편집본을 JSON 파일 하나로 내려받습니다.
            개인 기록이므로 공개 저장소에 커밋하지 마세요.
          </p>
          <button type="button" disabled={exporting} onClick={() => void handleExport()} className="btn btn-primary mt-5">
            {exporting ? <Spinner /> : <Download size={15} aria-hidden />}
            백업 JSON 내보내기
          </button>
        </section>

        <ImportSection />
      </div>

      <LifeHubSection reviewPanel={<StaleReviewPanel />} />

      <section aria-labelledby="catalog-status" className="mt-12">
        <SectionHeading id="catalog-status" title="카탈로그" />
        <CatalogEditBar compact />
      </section>
    </Page>
  );
}

function ImportSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState<ImportSource | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip');
  const [withCatalog, setWithCatalog] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setSource(null);
    setPlan(null);
    setFileName('');
    setError('');
    setMode('skip');
    setWithCatalog(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 일어나도록 비운다
    e.target.value = '';
    if (!file) return;
    setError('');
    setSource(null);
    setPlan(null);
    setFileName(file.name);
    const result = parseImportFile(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const existing = await useLogStore.getState().exportRecords();
    setSource(result.source);
    setPlan(planImport(existing, result.source.logs));
    setWithCatalog(false);
  }

  async function handleApply() {
    if (!source || !plan) return;
    const { put, deleteIds } = resolvePlan(plan, mode);
    if (withCatalog && source.catalogOverride) {
      const ok = await confirm({
        title: '카탈로그 편집본도 바꿀까요?',
        description: '이 기기에 있는 카탈로그 편집본이 백업의 편집본으로 바뀝니다.',
        confirmLabel: '바꾸기',
      });
      if (!ok) return;
    }
    setBusy(true);
    // 덮어쓰는 충돌은 지금 시각으로 다시 찍힌다: 「파일 내용을 쓰겠다」는 선택이 다음 동기화에서 서버의 더 새 버전에 밀리지 않는다
    const restampIds = mode === 'overwrite' ? plan.conflicts.map((c) => c.incoming.id) : [];
    const ok = await useLogStore.getState().applyImport(put, deleteIds, restampIds);
    if (ok && withCatalog && source.catalogOverride) {
      await replaceCatalogOverride(source.catalogOverride);
      void useCatalogStore.getState().reload();
    }
    setBusy(false);
    if (ok) {
      toast(`기록 ${put.length}건을 불러왔습니다.`);
      reset();
    } else {
      toast('기록을 불러오지 못했습니다.', 'error');
    }
  }

  return (
    <section aria-labelledby="backup-import">
      <SectionHeading id="backup-import" title="불러오기" />
      <p className="text-[14px] leading-relaxed text-ink-soft">
        이 앱에서 내보낸 백업 JSON을 고르세요.
        바로 저장하지 않고 먼저 무엇이 바뀌는지 보여 드립니다.
      </p>
      <label className="btn btn-secondary mt-5 cursor-pointer">
        <Upload size={15} aria-hidden />
        파일 고르기
        <input ref={inputRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void handleFile(e)} />
      </label>
      {fileName && <span className="ml-3 text-[13px] text-ink-muted">{fileName}</span>}
      {error && <p role="alert" className="mt-3 text-[13.5px] text-seal">{error}</p>}

      {source && plan && (
        <ImportPreview
          source={source}
          plan={plan}
          mode={mode}
          onMode={setMode}
          withCatalog={withCatalog}
          onWithCatalog={setWithCatalog}
          busy={busy}
          onApply={() => void handleApply()}
          onCancel={reset}
        />
      )}
    </section>
  );
}

function useRecordLabel() {
  const works = useCatalogStore((s) => s.works);
  const series = useCatalogStore((s) => s.series);
  const load = useCatalogStore((s) => s.load);
  useEffect(() => { void load(); }, [load]);
  return useMemo(() => {
    const workTitle = new Map(works.map((w) => [w.id, w.title]));
    const seriesTitle = new Map(series.map((s) => [s.id, s.title]));
    return (r: LogRecord) => {
      if (r.logType === 'series_completion') return seriesTitle.get(r.seriesId ?? '') ?? `시리즈 ${r.seriesId}`;
      const title = workTitle.get(r.workId ?? '') ?? `작품 ${r.workId}`;
      if (r.logType === 'set_completion' && r.editionSetId) {
        const { publisher } = parseEditionSetId(r.editionSetId);
        return publisher ? `${title} · ${publisher}` : title;
      }
      return title;
    };
  }, [works, series]);
}

function summary(r: LogRecord): string {
  return [
    TYPE_LABEL[r.logType],
    r.logType === 'volume' && r.readingState ? STATE_LABEL[r.readingState] : null,
    r.currentPage ? `${r.currentPage}쪽` : null,
    r.rating ? `별 ${r.rating}` : null,
    r.liked ? '인생책' : null,
    formatDateTime(r.createdAt),
  ].filter(Boolean).join(' · ');
}

function ImportPreview({ source, plan, mode, onMode, withCatalog, onWithCatalog, busy, onApply, onCancel }: {
  source: ImportSource;
  plan: ImportPlan;
  mode: 'skip' | 'overwrite';
  onMode: (m: 'skip' | 'overwrite') => void;
  withCatalog: boolean;
  onWithCatalog: (v: boolean) => void;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const label = useRecordLabel();
  const willWrite = plan.added.length + (mode === 'overwrite' ? plan.conflicts.length : 0);
  const canApply = willWrite > 0 || (withCatalog && !!source.catalogOverride);

  return (
    <div className="panel mt-6 p-5">
      <h3 className="font-serif text-[18px] font-bold text-ink">미리보기</h3>
      <p className="mt-1 text-[13px] text-ink-muted">
        책장 백업 파일
        {source.exportedAt && ` · ${formatDateTime(source.exportedAt)}에 내보냄`}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-control bg-paper-sunken py-3">
          <dt className="text-[12px] text-ink-muted">새 기록</dt>
          <dd className="tnum text-[20px] font-semibold text-ink">{plan.added.length}</dd>
        </div>
        <div className="rounded-control bg-paper-sunken py-3">
          <dt className="text-[12px] text-ink-muted">이미 같음</dt>
          <dd className="tnum text-[20px] font-semibold text-ink">{plan.unchanged.length}</dd>
        </div>
        <div className="rounded-control bg-paper-sunken py-3">
          <dt className="text-[12px] text-ink-muted">충돌</dt>
          <dd className={`tnum text-[20px] font-semibold ${plan.conflicts.length ? 'text-seal' : 'text-ink'}`}>{plan.conflicts.length}</dd>
        </div>
      </dl>

      {source.warnings.length > 0 && (
        <details className="mt-4 text-[13px] text-ink-soft">
          <summary className="cursor-pointer text-seal">주의 {source.warnings.length}건</summary>
          <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5">
            {source.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      {plan.conflicts.length > 0 && (
        <div className="mt-5">
          <p className="text-[13.5px] font-semibold text-ink">충돌한 기록</p>
          <p className="text-[12.5px] text-ink-muted">같은 ID인데 내용이 다르거나, 다른 ID로 같은 권·판본·시리즈를 가리키는 기록입니다.</p>
          <ul className="mt-2 max-h-72 divide-y divide-line overflow-auto rounded-control border border-line text-[13px]">
            {plan.conflicts.map((c) => (
              <li key={c.incoming.id} className="px-3 py-2">
                <p className="font-medium text-ink">
                  {label(c.incoming)}
                  <span className="ml-2 text-[12px] font-normal text-ink-faint">{c.reason === 'same-id' ? '같은 ID' : '같은 대상'}</span>
                </p>
                <p className="text-ink-muted">지금: {summary(c.existing)}</p>
                <p className="text-ink-soft">파일: {summary(c.incoming)}</p>
              </li>
            ))}
          </ul>
          <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-ink-soft">
            <legend className="sr-only">충돌 처리</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="conflict-mode" checked={mode === 'skip'} onChange={() => onMode('skip')} />
              충돌은 건너뛰기 (지금 기록 유지)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="conflict-mode" checked={mode === 'overwrite'} onChange={() => onMode('overwrite')} />
              충돌은 파일 내용으로 덮어쓰기
            </label>
          </fieldset>
        </div>
      )}

      {source.catalogOverride && (
        <label className="mt-5 flex items-start gap-2 text-[13.5px] text-ink-soft">
          <input type="checkbox" className="mt-1" checked={withCatalog} onChange={(e) => onWithCatalog(e.target.checked)} />
          <span>
            백업에 든 카탈로그 편집본도 불러오기
            <span className="block text-[12.5px] text-ink-muted">
              작품 {source.catalogOverride.catalog.works.length} · 판본 {source.catalogOverride.catalog.editions.length} · {formatDateTime(source.catalogOverride.updatedAt)} 수정
            </span>
          </span>
        </label>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !canApply} onClick={onApply} className="btn btn-primary">
          {busy && <Spinner />}
          {willWrite > 0 ? `기록 ${willWrite}건 불러오기` : '불러오기'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="btn btn-ghost">
          취소
        </button>
      </div>
    </div>
  );
}


const REVIEW_TYPE_LABEL: Record<LogRecord['logType'], string> = { volume: '권 기록', set_completion: '판본 완독', series_completion: '시리즈 완독' };

/**
 * 180일 넘게 쉰 기기의 검토. 서버 문서를 읽어 「다른 기기에서 지워진 것으로 보이는 기록」과 나머지 병합 결과를 보여 주고,
 * 확인한 뒤에만 적용한다. 취소하면 아무것도 바꾸지 않는다. 검토 상태를 푸는 길은 「적용하고 동기화」뿐이다.
 */
function StaleReviewPanel() {
  const confirm = useConfirm();
  const works = useCatalogStore((s) => s.works);
  const series = useCatalogStore((s) => s.series);
  const load = useCatalogStore((s) => s.load);
  useEffect(() => { void load(); }, [load]);
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = useMemo(() => {
    const workTitle = new Map(works.map((w) => [w.id, w.title]));
    const volumeNumber = new Map(works.flatMap((w) => w.editions.map((e) => [e.id, e.volume_number] as const)));
    const seriesTitle = new Map(series.map((x) => [x.id, x.title]));
    return (r: LogRecord): string => {
      const kind = REVIEW_TYPE_LABEL[r.logType];
      if (r.logType === 'series_completion') return `${seriesTitle.get(r.seriesId ?? '') ?? `시리즈 ${r.seriesId}`} · ${kind}`;
      const title = workTitle.get(r.workId ?? '') ?? `작품 ${r.workId}`;
      const no = r.logType === 'volume' && r.volumeId ? volumeNumber.get(parseVolumeRef(r.volumeId)) : null;
      return [title, no ? `${no}권` : null, kind].filter(Boolean).join(' · ');
    };
  }, [works, series]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      setPlan(await prepareReview(browserDeps()));
    } catch (e) {
      setError(e instanceof Error ? e.message : '서버 문서를 가져오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    const ok = await confirm({
      title: '검토 내용을 적용할까요?',
      description: plan.removals.logs.length
        ? `다른 기기에서 지워진 것으로 보이는 기록 ${plan.removals.logs.length}개를 이 기기에서 지우고, 나머지를 서버와 합친 뒤 동기화합니다. 지운 기록은 되돌릴 수 없으니 백업을 먼저 내려받았는지 확인하세요.`
        : '서버와 합친 뒤 동기화를 다시 시작합니다.',
      confirmLabel: '적용하고 동기화',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await getLogSyncController().completeReview(plan);
      setPlan(null);
      toast('검토를 적용하고 동기화했습니다.');
    } catch (e) {
      console.error(e);
      setError('검토를 적용하지 못했어요. 검토 필요 상태는 그대로예요.');
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="rounded-control bg-paper-sunken p-3 text-[13px] text-ink-soft">
        <p>이 기기는 180일 넘게 동기화하지 않아 자동으로 합치지 않았어요. 서버 문서를 검토한 뒤에만 동기화를 다시 시작할 수 있어요.</p>
        <button type="button" disabled={busy} onClick={() => void start()} className="btn btn-secondary btn-sm mt-2">
          {busy && <Spinner />}서버 문서 검토
        </button>
        {error && <p role="alert" className="mt-2 text-seal">{error}</p>}
      </div>
    );
  }

  const { removals, summary, skipped } = plan;
  return (
    <div className="rounded-control bg-paper-sunken p-4 text-[13px] text-ink-soft">
      <h3 className="font-serif text-[16px] font-bold text-ink">서버 문서 검토</h3>
      <p className="mt-3 font-semibold text-ink">다른 기기에서 지워진 것으로 보이는 기록 {removals.logs.length}개</p>
      {skipped && (
        <p className="mt-1 text-ink-muted">
          {skipped === 'no-server-doc'
            ? '서버에 동기화 문서가 아직 없어서 아무것도 지우지 않아요.'
            : '이 기기가 마지막으로 본 서버 시각을 알 수 없어서 아무것도 지우지 않아요.'}
        </p>
      )}
      {removals.logs.length > 0 && (
        <>
          <p className="mt-1 text-ink-muted">마지막 동기화 이후 바뀌지 않았고 서버에 흔적이 없는 기록이에요. 적용하면 이 기기에서만 지워지고, 묘비는 남기지 않아요.</p>
          <ul className="mt-2 max-h-56 divide-y divide-line overflow-auto rounded-control border border-line">
            {removals.logs.map((r) => (
              <li key={r.id} className="px-3 py-1.5">
                <span className="text-ink">{label(r)}</span>
                <span className="ml-2 text-[12px] text-ink-faint">{formatDateTime(r.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {removals.tombstones.length > 0 && (
        <p className="mt-1 text-ink-muted">오래된 삭제 흔적 {removals.tombstones.length}개도 함께 정리돼요.</p>
      )}
      <p className="mt-4 font-semibold text-ink">나머지 병합 결과</p>
      <p className="mt-1">서버에서 새로 들어오는 기록 {summary.added}개 · 내용이 바뀌는 기록 {summary.updated}개 · 서버에 밀려 사라지는 기록 {summary.removed}개</p>

      {error && <p role="alert" className="mt-3 text-seal">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn btn-secondary btn-sm"
          onClick={() => void exportBackupNow().then((n) => toast(`기록 ${n}건을 내보냈습니다. 저장소(repo)에는 올리지 마세요.`)).catch(() => toast('백업을 만들지 못했습니다.', 'error'))}
        >
          <Download size={14} aria-hidden />현재 기록 JSON 백업 내려받기
        </button>
        <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={() => void apply()}>
          {busy && <Spinner />}적용하고 동기화
        </button>
        <button type="button" disabled={busy} className="btn btn-ghost btn-sm" onClick={() => { setPlan(null); setError(''); }}>취소</button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
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
import { fetchRemoteAsImportSource, normalizeDeviceLabel } from '../lifehub/logSync';
import { beginConnect, browserDeps, connectAvailable, isConnected, mayHaveSyncScope } from '../lifehub/remote';
import { parseEditionSetId } from '../utils/editionUtils';

const STATE_LABEL: Record<string, string> = { unread: '안 읽음', reading: '읽는 중', completed: '완독' };
const TYPE_LABEL: Record<LogRecord['logType'], string> = { volume: '권', set_completion: '판본 완독', series_completion: '시리즈 완독' };

export function SettingsPage() {
  useDocumentTitle('설정 · 백업');
  const { volumeLogs, setCompletionLogs, seriesCompletionLogs } = useLogStore();
  const total = volumeLogs.length + setCompletionLogs.length + seriesCompletionLogs.length;
  const [exporting, setExporting] = useState(false);
  /** 180일 넘게 쉰 기기: 서버 문서를 가져오기 미리보기로 검토한다 */
  const [reviewSource, setReviewSource] = useState<ImportSource | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const [records, override] = await Promise.all([useLogStore.getState().exportRecords(), getCatalogOverride()]);
      const backup = buildBackup(records, override);
      downloadText(backupFileName(), JSON.stringify(backup, null, 2) + '\n');
      toast(`기록 ${records.length}건을 내보냈습니다. 저장소(repo)에는 올리지 마세요.`);
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

        <ImportSection externalSource={reviewSource} onExternalConsumed={() => setReviewSource(null)} />
      </div>

      <LogSyncSection onReview={setReviewSource} />

      <section aria-labelledby="catalog-status" className="mt-12">
        <SectionHeading id="catalog-status" title="카탈로그" />
        <CatalogEditBar compact />
      </section>
    </Page>
  );
}

function ImportSection({ externalSource, onExternalConsumed }: { externalSource: ImportSource | null; onExternalConsumed: () => void }) {
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

  // 서버 문서 검토: 파일을 고른 것과 같은 미리보기로 보여 준다
  useEffect(() => {
    if (!externalSource) return;
    let active = true;
    void useLogStore.getState().exportRecords().then((existing) => {
      if (!active) return;
      setError('');
      setFileName('Life Hub 서버 문서');
      setSource(externalSource);
      setPlan(planImport(existing, externalSource.logs));
      setWithCatalog(false);
      onExternalConsumed();
    });
    return () => { active = false; };
  }, [externalSource, onExternalConsumed]);

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


const controller = () => getLogSyncController();

/** 독서 기록 기기 동기화 (Life Hub). 수동 JSON 백업은 그대로 비상용이다. */
function LogSyncSection({ onReview }: { onReview: (source: ImportSource) => void }) {
  const snap = useSyncExternalStore(
    (fn) => controller().subscribe(fn),
    () => controller().snapshot(),
  );
  const deps = browserDeps();
  const connected = isConnected(deps);
  const [label, setLabel] = useState(snap.deviceLabel);
  const [labelError, setLabelError] = useState('');
  const [message, setMessage] = useState('');
  const busy = snap.status === 'syncing';

  function saveLabel() {
    const trimmed = label.trim();
    if (trimmed && !normalizeDeviceLabel(trimmed)) {
      setLabelError('기기 이름은 영문·숫자·기호 1~40자만 쓸 수 있어요.');
      return;
    }
    setLabelError('');
    controller().setDeviceLabel(trimmed);
    toast('기기 이름을 저장했습니다.');
  }

  async function reviewServerDocument() {
    setMessage('');
    try {
      const source = await fetchRemoteAsImportSource(browserDeps());
      if (!source) setMessage('서버에 동기화 문서가 아직 없어요.');
      else onReview(source);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '서버 문서를 가져오지 못했어요.');
    }
  }

  async function connect() {
    try {
      window.location.assign(await beginConnect(browserDeps()));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '연결을 시작하지 못했습니다.');
    }
  }

  return (
    <section aria-labelledby="log-sync" className="mt-12">
      <SectionHeading id="log-sync" title="기기 동기화" />
      <p className="text-[14px] leading-relaxed text-ink-soft">
        독서 기록을 Life Hub를 거쳐 여러 기기에서 같게 맞춥니다. 이 기기의 IndexedDB가 원본이고, 인터넷이 없어도 평소처럼 쓸 수 있어요.
        카탈로그 편집본은 동기화하지 않습니다. 위의 JSON 내보내기·불러오기는 그대로 비상용으로 쓸 수 있습니다.
      </p>

      {!connected ? (
        <p className="mt-4 text-[13.5px] text-ink-muted">
          먼저 Life Hub에 연결해야 해요. 연결 화면에서 <strong>동기화</strong> 항목에 체크해 주세요.{' '}
          <button type="button" className="underline underline-offset-2 disabled:opacity-50" disabled={!connectAvailable(window.location)} onClick={() => void connect()}>
            Life Hub 연결
          </button>
        </p>
      ) : (
        <div className="panel mt-5 space-y-4 p-5">
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={snap.enabled} onChange={(e) => controller().setEnabled(e.target.checked)} />
            이 기기에서 독서 기록 동기화 켜기
          </label>

          <dl className="grid gap-x-6 gap-y-1 text-[13.5px] sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">상태</dt>
            <dd role="status" className={snap.status === 'error' || snap.status === 'no_scope' || snap.status === 'review' ? 'text-seal' : 'text-ink'}>
              {snap.statusLabel}
              {snap.detail && <span className="ml-2 text-[12.5px] text-ink-muted">{snap.detail}</span>}
            </dd>
            <dt className="text-ink-muted">마지막 동기화</dt>
            <dd className="text-ink">{snap.lastSuccessAt ? formatDateTime(snap.lastSuccessAt) : '아직 없음'}</dd>
          </dl>

          {snap.status === 'no_scope' || (snap.enabled && !mayHaveSyncScope(deps)) ? (
            <p className="text-[13px] text-ink-soft">
              이 연결에는 동기화 권한이 없어요(제안 받기는 그대로 됩니다).{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => void connect()}>Life Hub 다시 연결</button>
              하고 연결 화면의 동기화 항목에 체크해 주세요.
            </p>
          ) : null}

          {snap.status === 'review' && (
            <div className="rounded-control bg-paper-sunken p-3 text-[13px] text-ink-soft">
              <p>이 기기는 180일 넘게 동기화하지 않아 자동으로 합치지 않았어요. 서버 문서를 불러오기 미리보기로 확인한 뒤 계속하세요.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reviewServerDocument()}>서버 문서 검토</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => controller().finishReview()}>검토를 마쳤어요, 동기화 계속</button>
              </div>
            </div>
          )}
          {message && <p role="alert" className="text-[13px] text-seal">{message}</p>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[13px] text-ink-muted">
              기기 이름 (선택, 영문·숫자 40자까지)
              <input
                className="field mt-1 block w-56"
                value={label}
                maxLength={40}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={saveLabel}
                placeholder="예: phone"
              />
            </label>
            <button type="button" className="btn btn-secondary" disabled={!snap.enabled || busy} onClick={() => void controller().syncNow()}>
              {busy ? <Spinner /> : <RefreshCw size={15} aria-hidden />}
              지금 동기화
            </button>
          </div>
          {labelError && <p role="alert" className="text-[13px] text-seal">{labelError}</p>}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { SectionHeading } from '../components/layout/Page';
import { Spinner } from '../components/ui/States';
import { toast } from '../store/toastStore';
import { getLogSyncController } from './logSyncController';
import { normalizeDeviceLabel, readConfig } from './logSync';
import { autoApplyEnabled, browserDeps, connectAvailable, setAutoApply } from './remote';
import { connectLifeHub, disconnectLifeHub, syncNowAll, useHubStore, useHubView } from './hubStore';
import type { HubCause } from './hubStatus';
import { boardNeedsReconnect } from '../board/upload';

export const LIFE_HUB_SECTION_ID = 'life-hub';

const canConnectHere = () => (typeof window !== 'undefined' && window.location ? connectAvailable(window.location) : false);

const CAUSE_TEXT: Partial<Record<HubCause, string>> = {
  lost: 'Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.',
  no_scope: '동기화 권한이 없는 연결입니다. 한 번 다시 연결하면 제안과 동기화가 함께 켜집니다.',
};

function StatusLine({ warn, children }: { warn?: boolean; children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-[14px] text-ink">
      <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${warn ? 'bg-seal' : 'bg-[var(--color-success)]'}`} />
      {children}
    </p>
  );
}

/**
 * 설정의 「Life Hub」 섹션: 앱 전체에서 Life Hub 연결·해제·「지금 동기화」가 있는 유일한 자리.
 * A 연결 전 · B 연결됨 · C 확인 필요. 180일 검토 화면은 설정 화면이 reviewPanel로 넘긴다.
 */
export function LifeHubSection({ reviewPanel }: { reviewPanel?: ReactNode }) {
  const view = useHubView();
  const message = useHubStore((s) => s.message);
  const proposalSyncing = useHubStore((s) => s.syncing);
  useHubStore((s) => s.rev);
  const boardReconnect = view.kind === 'B' && boardNeedsReconnect(browserDeps());
  const [params] = useSearchParams();
  const focus = params.get('section') === LIFE_HUB_SECTION_ID;

  // 연결 콜백이 끝나면 /settings?section=life-hub 로 온다: 이 섹션으로 스크롤한다.
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => document.getElementById(LIFE_HUB_SECTION_ID)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const busy = view.kind === 'B' && (proposalSyncing || view.line === '연결됨 · 동기화 중…');
  const syncButton = (
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void syncNowAll()}>
      {busy ? <Spinner /> : <RefreshCw size={15} aria-hidden />}
      지금 동기화
    </button>
  );
  const disconnectButton = (
    <button type="button" className="btn btn-secondary" onClick={disconnectLifeHub}>연결 해제</button>
  );
  const note = message && <p className="text-[13px] text-ink-muted">{message}</p>;

  return (
    <section id={LIFE_HUB_SECTION_ID} aria-labelledby="life-hub-title" className="mt-12 scroll-mt-20">
      <SectionHeading id="life-hub-title" title="Life Hub" />

      {view.kind === 'A' && <ConnectBlock note={note} />}

      {view.kind === 'B' && (
        <div className="space-y-4">
          <StatusLine>{view.line}</StatusLine>
          {boardReconnect && (
            <div className="rounded-control bg-seal-soft p-4 text-[13.5px] text-ink">
              <p>보드(Life Board)에 올리려면 Life Hub에 한 번 다시 연결해 주세요. 제안과 동기화는 지금처럼 계속됩니다.</p>
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void connectLifeHub()}>다시 연결</button>
            </div>
          )}
          {note}
          <div className="flex flex-wrap gap-2">
            {syncButton}
            {disconnectButton}
          </div>
          <AutoApplyCheckbox />
          <Advanced />
        </div>
      )}

      {view.kind === 'C' && (
        <div className="space-y-4">
          <StatusLine warn>확인 필요</StatusLine>
          {view.cause === 'review' ? (
            <div className="rounded-control bg-seal-soft p-3">{reviewPanel}</div>
          ) : (
            <div className="rounded-control bg-seal-soft p-4 text-[13.5px] text-ink">
              <p>{CAUSE_TEXT[view.cause] ?? view.detail ?? (view.cause === 'too_large' ? '문서가 너무 커서 자동 동기화를 멈췄어요' : '동기화하는 중 오류가 났어요. 로컬 기록은 그대로예요.')}</p>
              {(view.cause === 'lost' || view.cause === 'no_scope') && (
                <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void connectLifeHub()}>다시 연결</button>
              )}
              {view.cause === 'error' && <div className="mt-3">{syncButton}</div>}
            </div>
          )}
          {note}
          <div>{disconnectButton}</div>
          {view.cause !== 'lost' && <Advanced />}
        </div>
      )}
    </section>
  );
}

function ConnectBlock({ note }: { note: ReactNode }) {
  const canConnect = canConnectHere();
  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed text-ink-soft">Claude가 제안한 기록을 받고, 이 앱의 기록을 다른 기기와 맞춥니다.</p>
      <div>
        <button type="button" className="btn btn-primary" disabled={!canConnect} onClick={() => void connectLifeHub()}>Life Hub 연결</button>
        {!canConnect && <p className="mt-2 text-[13px] text-ink-muted">배포된 주소에서만 연결할 수 있어요.</p>}
      </div>
      {note}
    </div>
  );
}

function AutoApplyCheckbox() {
  const [on, setOn] = useState(() => autoApplyEnabled(browserDeps()));
  return (
    <label className="flex items-center gap-2 text-[14px] text-ink">
      <input type="checkbox" checked={on} onChange={(e) => { setAutoApply(e.target.checked, browserDeps()); setOn(e.target.checked); }} />
      Claude에서 승인한 기록은 바로 반영
      <span className="text-[12px] text-ink-muted">(책·판본·권이 하나로 정해질 때만, 이 기기)</span>
    </label>
  );
}

/** 접힌 「고급」: 동기화 설명, 기기 이름, 서버 버전 */
function Advanced() {
  const controller = getLogSyncController();
  const [label, setLabel] = useState(() => controller.snapshot().deviceLabel);
  const [labelError, setLabelError] = useState('');
  const version = readConfig(browserDeps()).version;

  function saveLabel() {
    const trimmed = label.trim();
    if (trimmed && !normalizeDeviceLabel(trimmed)) {
      setLabelError('기기 이름은 영문·숫자·기호 1~40자만 쓸 수 있어요.');
      return;
    }
    setLabelError('');
    controller.setDeviceLabel(trimmed);
    toast('기기 이름을 저장했습니다.');
  }

  return (
    <details className="text-[13.5px] text-ink-soft">
      <summary className="cursor-pointer text-ink-muted">고급</summary>
      <div className="mt-3 space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          독서 기록을 Life Hub를 거쳐 여러 기기에서 같게 맞춥니다. 이 기기의 IndexedDB가 원본이고, 인터넷이 없어도 평소처럼 쓸 수 있어요.
          카탈로그 편집본은 동기화하지 않습니다. 위의 JSON 내보내기·불러오기는 그대로 비상용으로 쓸 수 있습니다.
        </p>
        <label className="block text-[13px] text-ink-muted">
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
        {labelError && <p role="alert" className="text-[13px] text-seal">{labelError}</p>}
        {version !== null && <p className="tnum text-[13px] text-ink-muted">서버 버전 {version}</p>}
      </div>
    </details>
  );
}

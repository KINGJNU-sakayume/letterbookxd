/**
 * Life Hub 연결·제안 상태 (컴포넌트 밖). 제안 가져오기는 앱 시작 시 App이 startLifeHub로 돌리고,
 * 책장의 띠와 설정의 Life Hub 섹션은 이 스토어를 읽기만 한다.
 */
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { toast } from '../store/toastStore';
import { useCatalogStore, type CatalogEdition } from '../store/catalogStore';
import { autoPlan } from './resolve';
import { recordProposal } from './apply';
import {
  autoApplyEnabled, beginConnect, browserDeps, completeStoredCallback, disconnect, isConnected, LifeHubError,
  mayHaveSyncScope, rejectLocally, sync, type ReadingProposal,
} from './remote';
import { ensureSyncOn, getLogSyncController } from './logSyncController';
import { deriveHubView, type HubView } from './hubStatus';

interface HubState {
  proposals: ReadingProposal[];
  /** 제안 가져오기 중 */
  syncing: boolean;
  message: string | null;
  /** 사용자가 해제하지 않았는데 이번 세션에 연결이 끊겼다 */
  lost: boolean;
  /** 연결 여부(토큰)가 바뀌었을 때 다시 그리기 위한 값 */
  rev: number;
}

export const useHubStore = create<HubState>(() => ({ proposals: [], syncing: false, message: null, lost: false, rev: 0 }));

const set = (patch: Partial<HubState>) => useHubStore.setState(patch);
const volumeLabel = (e: CatalogEdition) => (e.volume_number && e.volume_number !== '1' ? ` ${e.volume_number}권` : '');

let wasConnected: boolean | null = null;
/** 토큰이 있는지 다시 본다. 연결돼 있다가 (해제 버튼 없이) 사라졌으면 「연결이 끊김」으로 표시한다. */
export function refreshConnection(): void {
  const now = isConnected(browserDeps());
  if (wasConnected && !now) set({ lost: true, proposals: [] });
  if (now) set({ lost: false });
  if (wasConnected !== now) set({ rev: useHubStore.getState().rev + 1 });
  wasConnected = now;
}

// One sync at a time (a card approval must never be recorded twice); a request meanwhile runs once after it.
let running = false;
let again = false;
/** Claude 제안 가져오기 + 카탈로그 공유 + 승인 영수증 (예전 LifeHubPanel의 runSync 그대로) */
export async function runProposalSync(): Promise<void> {
  if (!isConnected(browserDeps())) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  wasConnected = true;
  set({ syncing: true });
  try {
    const catalog = useCatalogStore.getState();
    const works = catalog.status === 'ready' ? catalog.works : undefined;
    let result = await sync(browserDeps(), works);
    // Claude-card approvals whose book is clear are recorded now, then their receipts go out.
    const recorded: string[] = [];
    if (works) {
      for (const p of result.proposals) {
        const plan = autoPlan(p, works, autoApplyEnabled(browserDeps()));
        if (!plan) continue;
        const ok = await recordProposal(p.key, plan.work, plan.publisher, plan.edition, {
          state: p.state, page: p.currentPage, rating: p.rating, liked: p.liked, date: p.date,
        }).catch((err: unknown) => { console.error('Life Hub 자동 반영 실패:', err); return false; });
        if (ok) recorded.push(`${plan.work.title}${volumeLabel(plan.edition)}`);
      }
      if (recorded.length) {
        toast(`Claude에서 승인한 책을 기록했습니다: ${recorded.map((t) => `「${t}」`).join(', ')}`);
        result = await sync(browserDeps(), works);
      }
    }
    set({
      proposals: result.proposals,
      message: result.conflicts ? `${result.conflicts}개 제안은 Life Hub와 상태가 다릅니다. 책장 기록은 그대로입니다.` : null,
    });
  } catch (e) {
    if (e instanceof LifeHubError && e.kind === 'not_connected') set({ proposals: [] });
    set({ message: e instanceof Error ? e.message : '동기화하지 못했습니다.' });
  } finally {
    running = false;
    set({ syncing: false });
    refreshConnection();
  }
  if (again) {
    again = false;
    await runProposalSync();
  }
}

/** 「지금 동기화」: 제안 가져오기 다음 기기 동기화 한 번 */
export async function syncNowAll(): Promise<void> {
  await runProposalSync();
  await getLogSyncController().syncNow();
}

/** 기존 연결 시작 (Life Hub 연결 · 다시 연결) */
export async function connectLifeHub(): Promise<void> {
  try {
    window.location.assign(await beginConnect(browserDeps()));
  } catch (e) {
    set({ message: e instanceof Error ? e.message : '연결을 시작하지 못했습니다.' });
  }
}

/** 연결 해제: 제안과 동기화를 모두 멈춘다. 이 기기의 기록은 지우지 않는다. */
export function disconnectLifeHub(): void {
  disconnect(browserDeps());
  getLogSyncController().setEnabled(false);
  wasConnected = false;
  set({ proposals: [], lost: false, message: 'Life Hub 연결을 해제했습니다.', rev: useHubStore.getState().rev + 1 });
}

export function rejectProposal(p: ReadingProposal): void {
  rejectLocally(p.key, browserDeps());
  set({ proposals: useHubStore.getState().proposals.filter((x) => x.key !== p.key) });
  toast('제안을 거절했습니다. 기록은 바뀌지 않았습니다.');
  void runProposalSync();
}

/** 검토 대화상자에서 기록한 뒤 */
export function markReviewed(key: string): void {
  set({ proposals: useHubStore.getState().proposals.filter((x) => x.key !== key) });
  void runProposalSync();
}

/** One token exchange per page load, even when effects run twice (StrictMode). */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

let started = false;
/**
 * 앱 시작 시 한 번 (App 수준): 연결 콜백을 마치고, 제안을 가져오고, 카탈로그가 준비되면 다시 가져온다.
 * 연결 콜백이 끝나면 동기화를 켜고 설정의 Life Hub 섹션으로 이동한다.
 */
export function startLifeHub(goToSettings: () => void): void {
  if (started) return;
  started = true;
  wasConnected = isConnected(browserDeps());
  getLogSyncController().subscribe(refreshConnection);
  finishCallback()
    .then((done) => {
      if (done) {
        refreshConnection();
        toast('Life Hub에 연결했습니다.');
        ensureSyncOn(browserDeps());
        void getLogSyncController().syncNow();
        goToSettings();
      }
      void runProposalSync();
    })
    .catch((e: unknown) => set({ message: e instanceof Error ? e.message : 'Life Hub에 연결하지 못했습니다.' }));

  // The catalogue loads on its own; once it is there, share it and record clear card approvals.
  useCatalogStore.subscribe((s, prev) => {
    if (s.status === 'ready' && prev.status !== 'ready') void runProposalSync();
  });
}

const controller = () => getLogSyncController();
const subscribeSnap = (fn: () => void) => controller().subscribe(fn);
const getSnap = () => controller().snapshot();

/** 설정의 Life Hub 섹션이 보일 상태 */
export function useHubView(): HubView {
  const snap = useSyncExternalStore(subscribeSnap, getSnap, getSnap);
  const lost = useHubStore((s) => s.lost);
  const syncing = useHubStore((s) => s.syncing);
  useHubStore((s) => s.rev);
  const deps = browserDeps();
  return deriveHubView({ connected: isConnected(deps), lost, mayHaveScope: mayHaveSyncScope(deps), snap, proposalSyncing: syncing, now: Date.now() });
}

/** 상태 C(확인 필요)이면 true: 설정 진입점에 점을 그린다 */
export const useLifeHubAttention = (): boolean => useHubView().kind === 'C';

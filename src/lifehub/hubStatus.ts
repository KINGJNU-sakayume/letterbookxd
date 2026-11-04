/**
 * 설정의 「Life Hub」 섹션이 보일 상태 (A 연결 전 · B 연결됨 · C 확인 필요).
 * 순수 함수: 화면과 테스트가 같은 규칙을 쓴다.
 */
import type { LogSyncStatus } from './logSync';

export interface HubInput {
  connected: boolean;
  /** 사용자가 해제하지 않았는데 이번 세션에 토큰이 사라졌다 (거부·만료) */
  lost: boolean;
  /** remote.mayHaveSyncScope: 토큰에 동기화 권한이 없다고 확인되면 false */
  mayHaveScope: boolean;
  snap: { status: LogSyncStatus; detail: string | null; lastSuccessAt: string | null };
  /** 제안 가져오기가 도는 중 */
  proposalSyncing: boolean;
  now: number;
}

export type HubCause = 'lost' | 'no_scope' | 'review' | 'too_large' | 'error';

export type HubView =
  | { kind: 'A' }
  | { kind: 'B'; line: string }
  | { kind: 'C'; cause: HubCause; detail: string | null };

const pad = (n: number) => String(n).padStart(2, '0');

/** 오늘이면 `오늘 HH:MM`, 아니면 `M월 D일 HH:MM` (이 기기의 시간대) */
export function formatSyncTime(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return sameDay ? `오늘 ${hm}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

export function deriveHubView(input: HubInput): HubView {
  const { connected, lost, mayHaveScope, snap, proposalSyncing, now } = input;
  if (!connected) return lost ? { kind: 'C', cause: 'lost', detail: null } : { kind: 'A' };
  if (!mayHaveScope || snap.status === 'no_scope') return { kind: 'C', cause: 'no_scope', detail: snap.detail };
  if (snap.status === 'review') return { kind: 'C', cause: 'review', detail: snap.detail };
  if (snap.status === 'too_large') return { kind: 'C', cause: 'too_large', detail: snap.detail };
  if (snap.status === 'error') return { kind: 'C', cause: 'error', detail: snap.detail };
  if (snap.status === 'syncing' || proposalSyncing) return { kind: 'B', line: '연결됨 · 동기화 중…' };
  if (snap.status === 'retry_later') return { kind: 'B', line: '연결됨 · 잠시 뒤 다시 시도' };
  return { kind: 'B', line: snap.lastSuccessAt ? `연결됨 · ${formatSyncTime(snap.lastSuccessAt, now)} 동기화` : '연결됨 · 아직 동기화 전' };
}

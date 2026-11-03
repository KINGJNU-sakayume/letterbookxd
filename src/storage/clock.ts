import type { LetterbookDb } from './db';

// 진행도를 바꾸는 모든 쓰기의 시각 규칙 (life-hub docs/P6_SYNC.md 6절):
// max(지금, 마지막으로 본 서버 written_at + 1ms, 이 기기의 직전 값 + 1ms).
// 값은 이 기기 전용 settings 테이블에 둔다 (백업에 들어가지 않는다).

const CLOCK_KEY = 'sync.clock';
interface ClockRow { last: string | null; server: string | null }

let nowOverride: (() => number) | null = null;
/** 테스트용: 시계를 고정한다. null이면 되돌린다. */
export function setNowForTests(fn: (() => number) | null): void {
  nowOverride = fn;
}
export const nowMs = () => (nowOverride ? nowOverride() : Date.now());

const parse = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** 순수 계산 */
export function computeStamp(now: number, serverWrittenAt: string | null, lastStamp: string | null): string {
  let t = now;
  const s = parse(serverWrittenAt);
  if (Number.isFinite(s)) t = Math.max(t, s + 1);
  const l = parse(lastStamp);
  if (Number.isFinite(l)) t = Math.max(t, l + 1);
  return new Date(t).toISOString();
}

async function readClock(db: LetterbookDb): Promise<ClockRow> {
  const row = await db.settings.get(CLOCK_KEY);
  const v = (row?.value ?? {}) as Partial<ClockRow>;
  return { last: typeof v.last === 'string' ? v.last : null, server: typeof v.server === 'string' ? v.server : null };
}

/** 다음 도장. db.settings를 포함한 읽기/쓰기 트랜잭션 안에서 부른다. */
export async function nextStamp(db: LetterbookDb): Promise<string> {
  const clock = await readClock(db);
  const stamp = computeStamp(nowMs(), clock.server, clock.last);
  await db.settings.put({ key: CLOCK_KEY, value: { ...clock, last: stamp } });
  return stamp;
}

/** 서버에서 본 written_at 중 가장 늦은 것을 기억한다. */
export async function noteServerTime(db: LetterbookDb, writtenAt: string): Promise<void> {
  if (!Number.isFinite(Date.parse(writtenAt))) return;
  const clock = await readClock(db);
  if (clock.server && Date.parse(clock.server) >= Date.parse(writtenAt)) return;
  await db.settings.put({ key: CLOCK_KEY, value: { ...clock, server: writtenAt } });
}

// 로컬 기록이 바뀌었음을 동기화 컨트롤러에 알리는 작은 신호 (logStore ↔ 컨트롤러 순환 의존을 피한다).
const listeners = new Set<() => void>();

export function onLogsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyLogsChanged(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* 동기화 신호 실패가 기록 저장을 막지 않는다 */ }
  }
}

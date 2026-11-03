/**
 * 기록 동기화를 언제 돌릴지 (life-hub docs/P6_SYNC.md 7절):
 * - 앱 시작과 탭이 다시 보일 때 pull. 폴링은 하지 않는다.
 * - 기록이 바뀌면 5초 디바운스 뒤 push, 탭이 숨겨질 때도 push.
 * - 패스는 한 번에 하나만 돈다. 도는 중에 요청이 오면 끝난 뒤 한 번 더 돈다. 병합 중에는 push하지 않는다(한 패스 안에서 순서대로).
 * - 같은 브라우저의 여러 탭은 (가능하면) Web Locks로 차례를 서고, 아니어도 서버의 412 처리로 안전하다.
 */
import { browserDeps, type Deps } from './remote';
import {
  readConfig, runLogSyncPass, setSyncEnabled, writeConfig, acknowledgeReview, STATUS_LABEL,
  type LogSyncStatus, type PassResult,
} from './logSync';
import { onLogsChanged } from '../domain/sync/changeSignal';

export const DEBOUNCE_MS = 5000;

export interface LogSyncSnapshot {
  enabled: boolean;
  status: LogSyncStatus;
  statusLabel: string;
  /** 상태 코드나 고정 문구 (문서·토큰·응답 본문은 없다) */
  detail: string | null;
  lastSuccessAt: string | null;
  deviceLabel: string;
}

export interface ControllerOptions {
  deps: () => Deps;
  run?: (deps: Deps, opts: { manual?: boolean }) => Promise<PassResult>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** 탭 사이 차례. 없으면 바로 실행한다. */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>;
  debounceMs?: number;
}

export function createLogSyncController(options: ControllerOptions) {
  const run = options.run ?? runLogSyncPass;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const withLock = options.withLock ?? (<T>(fn: () => Promise<T>) => fn());
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;

  let running = false;
  let again: false | { manual: boolean } = false;
  let timer: unknown = null;
  let last: { status: LogSyncStatus; detail: string | null } | null = null;
  const listeners = new Set<() => void>();
  let cached: LogSyncSnapshot | null = null;

  const compute = (): LogSyncSnapshot => {
    const config = readConfig(options.deps());
    let status: LogSyncStatus = 'off';
    let detail: string | null = null;
    if (config.enabled) {
      if (running) status = 'syncing';
      else if (last && last.status !== 'on' && last.status !== 'off') ({ status, detail } = last);
      else status = config.blocked ?? 'on';
    }
    return { enabled: config.enabled, status, statusLabel: STATUS_LABEL[status], detail, lastSuccessAt: config.lastSuccessAt, deviceLabel: config.deviceLabel };
  };
  const emit = () => {
    const next = compute();
    if (!cached || JSON.stringify(cached) !== JSON.stringify(next)) {
      cached = next;
      for (const l of listeners) l();
    }
  };

  async function trigger(manual = false): Promise<void> {
    if (running) {
      again = { manual: manual || (again !== false && again.manual) };
      return;
    }
    running = true;
    emit();
    try {
      let guard = 0;
      let next: { manual: boolean } | false = { manual };
      while (next && guard++ < 3) {
        again = false;
        const result = await withLock(() => run(options.deps(), { manual: next ? next.manual : false }));
        last = { status: result.status, detail: result.detail };
        next = again;
      }
    } catch (error) {
      console.error('기록 동기화 실패:', error);
      last = { status: 'error', detail: '동기화하는 중 오류가 났어요. 로컬 기록은 그대로예요.' };
    } finally {
      running = false;
      emit();
    }
  }

  const clearPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    snapshot(): LogSyncSnapshot {
      return (cached ??= compute());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** 앱 시작·탭이 다시 보일 때 */
    pull(): Promise<void> {
      return readConfig(options.deps()).enabled ? trigger(false) : Promise.resolve();
    },
    /** 로컬 기록이 바뀌었다: 5초 뒤 push */
    markDirty(): void {
      if (!readConfig(options.deps()).enabled) return;
      clearPending();
      timer = setTimer(() => {
        timer = null;
        void trigger(false);
      }, debounceMs);
    },
    /** 탭이 숨겨진다: 기다리던 push가 있으면 지금 한다 */
    flush(): Promise<void> {
      if (timer === null) return Promise.resolve();
      clearPending();
      return trigger(false);
    },
    /** 「지금 동기화」 */
    syncNow(): Promise<void> {
      clearPending();
      return trigger(true);
    },
    setEnabled(enabled: boolean): void {
      setSyncEnabled(options.deps(), enabled);
      last = null;
      if (!enabled) clearPending();
      emit();
      if (enabled) void trigger(true);
    },
    setDeviceLabel(label: string): void {
      writeConfig(options.deps(), { deviceLabel: label });
      emit();
    },
    /** 오래 쉰 기기: 서버 문서를 검토했다 */
    finishReview(): void {
      acknowledgeReview(options.deps());
      last = null;
      emit();
      void trigger(true);
    },
    stop(): void {
      clearPending();
    },
  };
}

export type LogSyncController = ReturnType<typeof createLogSyncController>;

let singleton: LogSyncController | null = null;
export function getLogSyncController(): LogSyncController {
  if (!singleton) {
    singleton = createLogSyncController({
      deps: browserDeps,
      withLock: <T,>(fn: () => Promise<T>): Promise<T> => {
        const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as LockManager | undefined;
        return locks ? (locks.request('letterbookxd-log-sync', fn) as Promise<T>) : fn();
      },
    });
  }
  return singleton;
}

let started = false;
/** 앱 시작 시 한 번: 시작 pull, 탭 보임/숨김, 기록 변경 신호를 연결한다 */
export function startLogSync(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  const controller = getLogSyncController();
  onLogsChanged(() => controller.markDirty());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void controller.pull();
    else void controller.flush();
  });
  void controller.pull();
}

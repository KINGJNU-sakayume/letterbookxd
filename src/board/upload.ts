/**
 * 보드 목록을 Life Hub에 올리기: `PUT /letterbookxd/v1/board` (life-hub docs/P7_BOARD.md 5장).
 *
 * - 타일에 영향을 주는 변화가 생기면 올린다. **10분에 한 번 이하**: 마지막 시도에서 10분이 안 지났으면 그때 한 번.
 * - 내용 비교: 마지막으로 성공한 본문의 sha256(`generated_at` 빼고). 같으면 보내지 않는다.
 *   단, 마지막 성공이 하루보다 오래됐으면 같아도 보낸다(보드의 '오래됨'은 Hub가 받은 시각 기준).
 * - 보낼 것이 남은 채 앱이 닫히면 '보낼 것 있음'(pending)이 localStorage에 남아 다음 실행에서 나간다.
 * - 403 insufficient_scope: 토큰을 지우지 않고 '다시 연결 필요'만 표시한다(remote.boardRequest).
 * - 400·413: 이 앱 쪽 버그. 같은 내용은 다시 보내지 않고 개발자 콘솔에만 남긴다. 네트워크 오류·5xx: 다음 기회에.
 * - 올리지 않는 경우: 연결 안 됨, `allowed()`가 false(미리보기 주소, 동기화로 합치기 전), 기록이 없음.
 * 실패는 앱의 다른 기능을 막지 않는다(던지지 않는다).
 */
import { boardRequest, hasBoardScope, isConnected, LifeHubError, type Deps } from '../lifehub/remote';
import { buildBoardTiles, hasBoardData, type BoardSource } from './tiles';

export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_BYTES = 64 * 1024;
const STATE_KEY = 'letterbookxd.board.v1';

/** localStorage에 두는 업로드 상태 (개인 데이터 아님) */
export interface BoardUploadState {
  /** 마지막으로 성공한 본문의 sha256 (generated_at 제외) */
  sha: string | null;
  sentAt: number | null;
  /** 마지막으로 보낸 시각(성공·실패 모두). 10분 제한의 기준 */
  attemptAt: number | null;
  /** 보낼 것 있음 */
  pending: boolean;
  /** 400·413으로 거절된 본문의 sha. 같은 내용은 다시 보내지 않는다 */
  rejectedSha: string | null;
  /** insufficient_scope를 받았다 (다시 연결 필요) */
  needsReconnect: boolean;
}
const EMPTY: BoardUploadState = { sha: null, sentAt: null, attemptAt: null, pending: false, rejectedSha: null, needsReconnect: false };

export function readBoardState(deps: Pick<Deps, 'storage'>): BoardUploadState {
  try {
    const raw = deps.storage.getItem(STATE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<BoardUploadState>) : {};
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      sha: typeof v.sha === 'string' ? v.sha : null,
      sentAt: n(v.sentAt),
      attemptAt: n(v.attemptAt),
      pending: v.pending === true,
      rejectedSha: typeof v.rejectedSha === 'string' ? v.rejectedSha : null,
      needsReconnect: v.needsReconnect === true,
    };
  } catch {
    return { ...EMPTY };
  }
}
function writeBoardState(deps: Pick<Deps, 'storage'>, patch: Partial<BoardUploadState>): BoardUploadState {
  const next = { ...readBoardState(deps), ...patch };
  try {
    deps.storage.setItem(STATE_KEY, JSON.stringify(next));
  } catch { /* 저장 실패가 앱을 막지 않는다 */ }
  return next;
}

/** 설정 화면 안내: 보드 권한이 없는 연결이라 다시 연결해야 한다 */
export function boardNeedsReconnect(deps: Pick<Deps, 'storage'>): boolean {
  return isConnected(deps) && readBoardState(deps).needsReconnect && !hasBoardScope(deps);
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export type BoardResult =
  | 'saved' | 'unchanged' | 'ignored' | 'same' | 'scheduled' | 'not_connected' | 'not_allowed' | 'empty'
  | 'no_scope' | 'rejected' | 'retry' | 'busy';

export interface BoardUploaderOptions {
  deps: () => Deps;
  /** 앱 상태 (동기화로 합친 뒤의 기록 + 카탈로그) */
  load: () => Promise<BoardSource>;
  /** false면 올리지 않고 '보낼 것 있음'만 남긴다 (미리보기·예시 주소, 동기화로 합치기 전) */
  allowed: () => boolean;
  /** 토큰이 사라졌다 (다른 403, 갱신 뒤에도 401) */
  onLost?: () => void;
  /** needsReconnect 등 상태가 바뀌었다 */
  onStatus?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  log?: (message: string) => void;
}

export function createBoardUploader(options: BoardUploaderOptions) {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const log = options.log ?? ((m: string) => console.error(m));
  let running = false;
  let again = false;
  let timer: unknown = null;

  const schedule = (ms: number) => {
    if (timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      void run();
    }, Math.max(0, ms));
  };

  async function pass(): Promise<BoardResult> {
    const deps = options.deps();
    if (!isConnected(deps)) return 'not_connected';
    if (!options.allowed()) {
      writeBoardState(deps, { pending: true });
      return 'not_allowed';
    }
    const source = await options.load();
    if (!hasBoardData(source.records)) {
      writeBoardState(deps, { pending: false });
      return 'empty';
    }
    const now = deps.now();
    const manifest = buildBoardTiles(source, now);
    const { generated_at: _ignored, ...content } = manifest;
    void _ignored;
    const sha = hex(await deps.sha256(new TextEncoder().encode(JSON.stringify(content))));
    let st = readBoardState(deps);
    if (st.rejectedSha === sha) {
      writeBoardState(deps, { pending: false });
      return 'rejected';
    }
    if (st.sha === sha && st.sentAt !== null && now - st.sentAt < RESEND_AFTER_MS && now >= st.sentAt) {
      writeBoardState(deps, { pending: false });
      return 'same';
    }
    const wait = st.attemptAt === null || st.attemptAt > now ? 0 : st.attemptAt + MIN_INTERVAL_MS - now;
    if (wait > 0) {
      writeBoardState(deps, { pending: true });
      schedule(wait);
      return 'scheduled';
    }
    const body = JSON.stringify(manifest);
    if (new TextEncoder().encode(body).length > MAX_BYTES) {
      log(`보드 목록이 64 KiB를 넘어 올리지 않았어요 (${new TextEncoder().encode(body).length} B).`);
      writeBoardState(deps, { pending: false, rejectedSha: sha });
      return 'rejected';
    }
    st = writeBoardState(deps, { pending: true, attemptAt: now });

    let response: Response;
    try {
      response = await boardRequest(deps, body);
    } catch (e) {
      if (e instanceof LifeHubError && e.kind === 'no_scope') {
        writeBoardState(deps, { needsReconnect: true });
        options.onStatus?.();
        return 'no_scope';
      }
      if (e instanceof LifeHubError && e.kind === 'not_connected') {
        options.onLost?.();
        return 'not_connected';
      }
      return 'retry';
    }
    if (response.ok) {
      const reply = (await response.json().catch(() => null)) as { unchanged?: unknown; ignored?: unknown } | null;
      writeBoardState(deps, { sha, sentAt: now, pending: false, rejectedSha: null, needsReconnect: false });
      if (st.needsReconnect) options.onStatus?.();
      return reply?.unchanged === true ? 'unchanged' : reply?.ignored === true ? 'ignored' : 'saved';
    }
    if (response.status === 400 || response.status === 413) {
      const detail = await response.text().catch(() => '');
      log(`Life Hub가 보드 목록을 거절했어요 (${response.status}). 같은 내용은 다시 보내지 않아요. ${detail.slice(0, 300)}`);
      writeBoardState(deps, { pending: false, rejectedSha: sha });
      return 'rejected';
    }
    return 'retry';
  }

  async function run(): Promise<BoardResult> {
    if (running) {
      again = true;
      return 'busy';
    }
    running = true;
    let result: BoardResult = 'retry';
    try {
      let guard = 0;
      do {
        again = false;
        result = await pass();
      } while (again && guard++ < 2);
    } catch (error) {
      log(`보드 목록을 올리지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
      result = 'retry';
    } finally {
      running = false;
    }
    return result;
  }

  return {
    /** 타일에 영향을 주는 변화가 생겼다 / 앱을 열었다 (둘 다 같은 규칙) */
    changed: run,
    /** 지난 실행에서 못 보낸 것이 있는지 */
    hasPending: () => readBoardState(options.deps()).pending,
    stop(): void {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

export type BoardUploader = ReturnType<typeof createBoardUploader>;

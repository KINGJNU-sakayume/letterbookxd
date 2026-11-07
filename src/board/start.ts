/**
 * 보드 목록 업로드를 앱에 연결한다 (main.tsx, startLogSync 다음에 한 번).
 *
 * 여러 기기: 기록은 Hub 동기화로 맞춰지므로, 기기 동기화가 켜진 기기는 **시작 동기화가 성공해 합친 뒤에만** 올린다.
 * 동기화가 꺼진 연결(제안만)이면 이 기기의 기록이 전부라 바로 올린다. 그 뒤로는
 * 기록 변경 · 동기화 완료 · 카탈로그 편집 때마다 같은 규칙(upload.ts)으로 올린다.
 */
import { getDb } from '../storage/db';
import { getCatalog, subscribeCatalog } from '../services/catalogSource';
import { onLogsChanged } from '../domain/sync/changeSignal';
import { browserDeps, connectAvailable } from '../lifehub/remote';
import { getLogSyncController } from '../lifehub/logSyncController';
import { refreshConnection, useHubStore } from '../lifehub/hubStore';
import { createBoardUploader, type BoardUploader } from './upload';

let uploader: BoardUploader | null = null;

export function startBoardUpload(): void {
  if (uploader || typeof window === 'undefined') return;
  const controller = getLogSyncController();
  let merged = false;
  // 동기화가 켜져 있으면 시작 pull이 이미 돌고 있다(startLogSync). 그 결과를 기다린다.
  let prev = controller.snapshot();
  if (!prev.enabled) merged = true;

  const settled = () => {
    const snap = controller.snapshot();
    if (!snap.enabled) return true;
    return merged && snap.status === 'on';
  };

  uploader = createBoardUploader({
    deps: browserDeps,
    load: async () => ({ records: await getDb().logs.toArray(), catalog: await getCatalog() }),
    allowed: () => connectAvailable(window.location) && settled(),
    onLost: refreshConnection,
    onStatus: () => useHubStore.setState({ rev: useHubStore.getState().rev + 1 }),
  });
  const kick = () => void uploader?.changed();

  controller.subscribe(() => {
    const snap = controller.snapshot();
    const finished = prev.status === 'syncing' && snap.status !== 'syncing';
    const turnedOff = prev.enabled && !snap.enabled;
    prev = snap;
    if (finished && snap.status === 'on') merged = true;
    if (finished || turnedOff) kick();
  });
  onLogsChanged(kick);
  subscribeCatalog(kick);
  if (merged) kick();
}

// node:test용 묶음. esbuild로 .test-dist/app.js 한 파일로 번들한다 (모듈 상태를 한 벌만 두기 위해).
export { useLogStore } from '../../src/store/logStore';
export { useBookStore } from '../../src/store/bookStore';
export { getDb, resetDbForTests, selectDbForTests } from '../../src/storage/db';
export { setNowForTests, computeStamp, nextStamp, noteServerTime as noteServerTimeForTests } from '../../src/storage/clock';
export {
  discardCatalogEdits, getCatalog, getCatalogOverride, getCatalogStatus, mutateCatalog,
  replaceCatalogOverride, seriesInfoForWork, setBundledCatalogLoader,
} from '../../src/services/catalogSource';
export {
  fetchCatalogRows, fetchWorksBySeriesId, insertEdition, insertWork, updateWork, deleteWork, upsertFlowchart,
} from '../../src/services/db';
export { hashCatalog, normalizeCatalog, serializeCatalog, emptyCatalog } from '../../src/catalog/model';
export { decideSeriesCompletion, decideSetCompletion } from '../../src/domain/logs/cascade';
export { LOG_ID_PATTERN, validateLogRecord } from '../../src/domain/logs/records';
export {
  buildBackup, parseBackup, parseImportFile, planImport, resolvePlan,
} from '../../src/domain/backup/backup';
export { DB_NAME, closeDbForTests } from '../../src/storage/db';
export {
  asIsbn, buildNlkUrl, getLookupKey, LookupError, LookupKeyMissingError, nlkErrorMessage, parseNlkResponse,
  parsePageCount, searchBooks, setLookupKey,
} from '../../src/services/bookLookup';
export {
  canonicalJson, mergeLogState, mergeStates, pruneTombstones, safeTargetKey, sameState, validateTombstone, TOMBSTONE_KEEP_MS,
} from '../../src/domain/sync/merge';
export { applyRemoteState, readLocalState, reconcileCompletions } from '../../src/store/logSyncApply';
export {
  normalizeDeviceLabel, readConfig, runLogSyncPass, setSyncEnabled, writeConfig,
  MAX_ATTEMPTS, STALE_AFTER_MS, SYNC_MAX_BYTES,
} from '../../src/lifehub/logSync';
export { findStaleRemovals, summarizeMerge } from '../../src/domain/sync/staleReview';
export { prepareReview, applyReview } from '../../src/lifehub/logSyncReview';
export { readServerFloor } from '../../src/storage/clock';
export { createLogSyncController } from '../../src/lifehub/logSyncController';
export { isConnected, mayHaveSyncScope, SYNC_SCOPE, INBOX_SCOPE, SCOPE, syncRequest } from '../../src/lifehub/remote';
export { ensureSyncOn } from '../../src/lifehub/logSyncController';
export { deriveHubView, formatSyncTime } from '../../src/lifehub/hubStatus';
export { useHubStore } from '../../src/lifehub/hubStore';
export { ProposalStrip, LifeHubPanel } from '../../src/lifehub/LifeHubPanel';
export { LifeHubSection } from '../../src/lifehub/LifeHubSection';
export { AccountMenu } from '../../src/components/layout/AccountMenu';
export {
  buildBoardTiles, clip, coverOf, hasBoardData, monoOf, shortDate, IMAGE_ORIGINS, LINK_ORIGINS, APP_HREF,
} from '../../src/board/tiles';
export {
  createBoardUploader, readBoardState, boardNeedsReconnect, MIN_INTERVAL_MS, RESEND_AFTER_MS,
} from '../../src/board/upload';
export { BOARD_SCOPE, BOARD_URL, boardRequest } from '../../src/lifehub/remote';

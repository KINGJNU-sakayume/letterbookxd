// node:test용 묶음. esbuild로 .test-dist/app.js 한 파일로 번들한다 (모듈 상태를 한 벌만 두기 위해).
export { useLogStore } from '../../src/store/logStore';
export { useBookStore } from '../../src/store/bookStore';
export { getDb, resetDbForTests } from '../../src/storage/db';
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
  buildBackup, parseBackup, parseCsv, parseImportFile, parseSupabaseLogsCsv, pgTimestampToIso, planImport, resolvePlan,
} from '../../src/domain/backup/backup';

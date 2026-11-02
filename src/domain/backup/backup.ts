import { normalizeCatalog, type CatalogOverride } from '../../catalog/model';
import { pickLogRecord, targetKey, validateLogRecord, type LogRecord } from '../logs/records';

// 백업 파일 형식과 불러오기 계획. 저장소를 건드리지 않는 순수 함수만 둔다.

export const BACKUP_APP = 'letterbookxd';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  logs: LogRecord[];
  catalogOverrides?: CatalogOverride;
}

export function buildBackup(logs: LogRecord[], catalogOverride: CatalogOverride | null, now = new Date()): BackupFile {
  const sorted = logs.map(pickLogRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), logs: sorted };
  if (catalogOverride) file.catalogOverrides = catalogOverride;
  return file;
}

export function backupFileName(now = new Date()): string {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return `letterbookxd-backup-${d}.json`;
}

/** 불러올 수 있게 정리된 내용 */
export interface ImportSource {
  kind: 'backup';
  logs: LogRecord[];
  catalogOverride: CatalogOverride | null;
  /** 건너뛴 행과 주의할 점 */
  warnings: string[];
  exportedAt: string | null;
}

export type ParseResult = { ok: true; source: ImportSource } | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 파일을 읽지 못했습니다.' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: '백업 파일 형식이 아닙니다.' };
  const d = data as Record<string, unknown>;
  if (d.app !== BACKUP_APP) return { ok: false, error: '책장(letterbookxd) 백업 파일이 아닙니다.' };
  if (d.version !== BACKUP_VERSION) return { ok: false, error: `지원하지 않는 백업 버전입니다 (${String(d.version)}).` };
  if (!Array.isArray(d.logs)) return { ok: false, error: '백업 파일에 기록 목록(logs)이 없습니다.' };

  const warnings: string[] = [];
  const logs: LogRecord[] = [];
  d.logs.forEach((row, i) => {
    const problem = validateLogRecord(row);
    if (problem) warnings.push(`${i + 1}번째 기록을 건너뜁니다: ${problem}`);
    else logs.push(pickLogRecord(row as LogRecord));
  });

  let catalogOverride: CatalogOverride | null = null;
  if (d.catalogOverrides !== undefined && d.catalogOverrides !== null) {
    const o = d.catalogOverrides as Partial<CatalogOverride>;
    try {
      if (typeof o.baseHash !== 'string' || typeof o.updatedAt !== 'string') throw new Error('baseHash·updatedAt이 없습니다.');
      catalogOverride = { catalog: normalizeCatalog(o.catalog), baseHash: o.baseHash, updatedAt: o.updatedAt };
    } catch (err) {
      warnings.push(`카탈로그 편집본을 건너뜁니다: ${err instanceof Error ? err.message : '형식 오류'}`);
    }
  }

  return {
    ok: true,
    source: {
      kind: 'backup',
      logs,
      catalogOverride,
      warnings,
      exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : null,
    },
  };
}

/** 파일 내용(BOM·앞 공백 허용)을 백업으로 읽는다 */
export function parseImportFile(text: string): ParseResult {
  return parseBackup(text.replace(/^\uFEFF/, '').trimStart());
}

// --- 불러오기 계획 ---

export interface ImportConflict {
  existing: LogRecord;
  incoming: LogRecord;
  /** same-id: 같은 id인데 내용이 다름, same-target: 다른 id로 같은 권·세트·시리즈를 가리킴 */
  reason: 'same-id' | 'same-target';
}

export interface ImportPlan {
  added: LogRecord[];
  unchanged: LogRecord[];
  conflicts: ImportConflict[];
}

function sameContent(a: LogRecord, b: LogRecord): boolean {
  return JSON.stringify(pickLogRecord(a)) === JSON.stringify(pickLogRecord(b));
}

export function planImport(existing: LogRecord[], incoming: LogRecord[]): ImportPlan {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byTarget = new Map(existing.map((r) => [targetKey(r), r]));
  const plan: ImportPlan = { added: [], unchanged: [], conflicts: [] };
  const seenTargets = new Set<string>();

  for (const r of incoming) {
    const key = targetKey(r);
    if (seenTargets.has(key)) continue; // 같은 파일 안 중복은 처음 것만
    seenTargets.add(key);
    const sameId = byId.get(r.id);
    if (sameId) {
      if (sameContent(sameId, r)) plan.unchanged.push(r);
      else plan.conflicts.push({ existing: sameId, incoming: r, reason: 'same-id' });
      continue;
    }
    const sameTarget = byTarget.get(key);
    if (sameTarget) plan.conflicts.push({ existing: sameTarget, incoming: r, reason: 'same-target' });
    else plan.added.push(r);
  }
  return plan;
}

/** skip: 충돌은 지금 기록을 유지, overwrite: 들어온 기록으로 바꿈 */
export function resolvePlan(plan: ImportPlan, mode: 'skip' | 'overwrite'): { put: LogRecord[]; deleteIds: string[] } {
  if (mode === 'skip') return { put: plan.added, deleteIds: [] };
  return {
    put: [...plan.added, ...plan.conflicts.map((c) => c.incoming)],
    deleteIds: plan.conflicts.filter((c) => c.reason === 'same-target').map((c) => c.existing.id),
  };
}

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
  kind: 'backup' | 'supabase-csv';
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

// --- Supabase 대시보드에서 받은 logs CSV ---

/** RFC 4180 CSV (따옴표, 따옴표 안 줄바꿈, "" 이스케이프) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** Postgres timestamptz 텍스트("2026-01-02 03:04:05.678+00")를 ISO로 */
export function pgTimestampToIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const normalized = v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const blank = (v: string | undefined) => v === undefined || v === '' || v.toLowerCase() === 'null';
const str = (v: string | undefined) => (blank(v) ? null : (v as string));
const bool = (v: string | undefined) => !blank(v) && /^(true|t|1)$/i.test((v as string).trim());
const num = (v: string | undefined) => {
  if (blank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseSupabaseLogsCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, error: 'CSV가 비어 있습니다.' };
  const header = rows[0].map((h) => h.trim());
  for (const required of ['id', 'log_type', 'created_at']) {
    if (!header.includes(required)) return { ok: false, error: `Supabase logs 테이블 CSV가 아닙니다 (${required} 열이 없음).` };
  }
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i < 0 ? undefined : r[i];
  };

  const warnings: string[] = [];
  const logs: LogRecord[] = [];
  const userIds = new Set<string>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const userId = str(col(r, 'user_id'));
    if (userId) userIds.add(userId);
    const logType = str(col(r, 'log_type')) as LogRecord['logType'] | null;
    const createdAt = pgTimestampToIso(col(r, 'created_at') ?? '');
    const updatedAt = pgTimestampToIso(col(r, 'updated_at') ?? '') ?? createdAt;
    const rawState = str(col(r, 'reading_state'));
    const readingState = logType === 'volume'
      ? ((rawState ?? (bool(col(r, 'watched')) ? 'completed' : 'unread')) as LogRecord['readingState'])
      : null;
    const autoRaw = col(r, 'auto_generated');
    const record = {
      id: str(col(r, 'id')) ?? '',
      logType: logType as LogRecord['logType'],
      volumeId: str(col(r, 'volume_id')),
      editionSetId: str(col(r, 'edition_set_id')),
      workId: str(col(r, 'work_id')),
      seriesId: str(col(r, 'series_id')),
      readingState,
      currentPage: num(col(r, 'current_page')),
      liked: bool(col(r, 'liked')),
      rating: num(col(r, 'rating')),
      // 예전 rowToSetLog처럼 값이 비어 있는 세트 완독은 자동 생성으로 본다
      autoGenerated: blank(autoRaw) ? logType === 'set_completion' : bool(autoRaw),
      createdAt: createdAt ?? '',
      updatedAt: updatedAt ?? '',
    } as LogRecord;
    const problem = validateLogRecord(record);
    if (problem) warnings.push(`${line}행을 건너뜁니다: ${problem}`);
    else logs.push(record);
  });

  if (userIds.size > 1) {
    warnings.push(`CSV에 사용자(user_id)가 ${userIds.size}명 섞여 있습니다. 모두 이 기기의 기록으로 불러옵니다. 필요하면 대시보드에서 내 user_id로 걸러서 다시 내보내 주세요.`);
  }

  return { ok: true, source: { kind: 'supabase-csv', logs, catalogOverride: null, warnings, exportedAt: null } };
}

/** 파일 내용을 보고 백업 JSON인지 Supabase CSV인지 고른다 */
export function parseImportFile(text: string): ParseResult {
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{')) return parseBackup(head);
  return parseSupabaseLogsCsv(text);
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

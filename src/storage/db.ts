import Dexie, { type Table } from 'dexie';
import type { LogRecord } from '../domain/logs/records';
import type { CatalogOverride } from '../catalog/model';
import type { Tombstone } from '../domain/sync/merge';

/** 이 기기(브라우저)에만 저장되는 데이터 */
export interface CatalogOverrideRow extends CatalogOverride {
  key: 'current';
}

/** 이 기기 전용 설정 (예: 도서 검색 인증키). 백업에 넣지 않는다. */
export interface SettingRow {
  key: string;
  value: unknown;
}

export class LetterbookDb extends Dexie {
  logs!: Table<LogRecord, string>;
  catalogOverride!: Table<CatalogOverrideRow, string>;
  settings!: Table<SettingRow, string>;
  /** 지운 기록의 흔적 (기기 동기화용). 백업 파일에는 넣지 않는다. */
  tombstones!: Table<Tombstone, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      logs: 'id, logType, volumeId, editionSetId, workId, seriesId',
      catalogOverride: 'key',
    });
    this.version(2).stores({
      settings: 'key',
    });
    // v3: 묘비 테이블만 더한다. logs·settings 데이터는 건드리지 않는다.
    this.version(3).stores({
      tombstones: 'id, targetKey',
    });
  }
}

export const DB_NAME = 'letterbookxd';

let dbName = DB_NAME;
let instance: LetterbookDb | null = null;

/** 처음 쓸 때 연다 (테스트에서 fake-indexeddb를 먼저 깔 수 있도록) */
export function getDb(): LetterbookDb {
  if (!instance) instance = new LetterbookDb(dbName);
  return instance;
}

/** 테스트용: 연결만 닫는다 (다음 getDb()에서 다시 연다) */
export function closeDbForTests(): void {
  instance?.close();
  instance = null;
}

/** 테스트용: 연결을 닫고 DB를 지운다 */
export async function resetDbForTests(): Promise<void> {
  if (instance) {
    instance.close();
    instance = null;
  }
  await Dexie.delete(dbName);
}

/** 테스트용: 다른 이름의 DB(다른 기기)로 바꾼다. 연결만 닫고 지우지는 않는다. */
export function selectDbForTests(name: string = DB_NAME): void {
  instance?.close();
  instance = null;
  dbName = name;
}

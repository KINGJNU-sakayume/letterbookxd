import Dexie, { type Table } from 'dexie';
import type { LogRecord } from '../domain/logs/records';
import type { CatalogOverride } from '../catalog/model';

/** 이 기기(브라우저)에만 저장되는 데이터 */
export interface CatalogOverrideRow extends CatalogOverride {
  key: 'current';
}

/** 이 기기 전용 설정 (예: 도서 검색 인증키). 백업에 넣지 않는다. */
export interface SettingRow {
  key: string;
  value: unknown;
}

class LetterbookDb extends Dexie {
  logs!: Table<LogRecord, string>;
  catalogOverride!: Table<CatalogOverrideRow, string>;
  settings!: Table<SettingRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      logs: 'id, logType, volumeId, editionSetId, workId, seriesId',
      catalogOverride: 'key',
    });
    this.version(2).stores({
      settings: 'key',
    });
  }
}

export const DB_NAME = 'letterbookxd';

let instance: LetterbookDb | null = null;

/** 처음 쓸 때 연다 (테스트에서 fake-indexeddb를 먼저 깔 수 있도록) */
export function getDb(): LetterbookDb {
  if (!instance) instance = new LetterbookDb(DB_NAME);
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
  await Dexie.delete(DB_NAME);
}

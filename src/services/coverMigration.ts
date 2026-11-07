// 관리 화면 「표지 바꾸기」의 순수 부분: 대상 고르기, 결과 판정, 카탈로그에 반영.
// 호출은 kakaoCover.lookupKakaoCover, 저장은 catalogSource.mutateCatalog가 한다.

import type { CatalogData } from '../catalog/model';
import { bestKakaoCover, KAKAO_ORIGINAL_ORIGIN, KAKAO_THUMB_ORIGIN, type KakaoCover } from './kakaoCover';

export const ALADIN_ORIGIN = 'https://image.aladin.co.kr';

/** 'aladin': 알라딘 표지를 카카오로 바꾸기. 'recheck': 이미 카카오인 표지를 다시 확인(주소가 바뀌었으면 갱신). */
export type CoverMode = 'aladin' | 'recheck';

export interface CoverTarget {
  editionId: string;
  workId: string;
  title: string;
  publisher: string;
  volume: string;
  isbn: string;
  oldUrl: string;
}

const originOf = (url: string | null | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};
const isbnOk = (isbn: string | null | undefined) => /^(\d{13}|\d{9}[\dX])$/i.test((isbn ?? '').replace(/[-\s]/g, ''));

export function coverTargets(catalog: Pick<CatalogData, 'works' | 'editions'>, mode: CoverMode): CoverTarget[] {
  const works = new Map(catalog.works.map((w) => [w.id, w]));
  const wanted = mode === 'aladin' ? [ALADIN_ORIGIN] : [KAKAO_ORIGINAL_ORIGIN, KAKAO_THUMB_ORIGIN];
  return catalog.editions
    .filter((e) => isbnOk(e.isbn) && wanted.includes(originOf(e.cover_url) ?? ''))
    .map((e) => ({
      editionId: e.id,
      workId: e.work_id,
      title: works.get(e.work_id)?.title ?? '(작품 없음)',
      publisher: e.publisher ?? '',
      volume: e.volume_number ?? '',
      isbn: e.isbn.replace(/[-\s]/g, ''),
      oldUrl: e.cover_url,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.publisher.localeCompare(b.publisher, 'ko') || a.volume.localeCompare(b.volume, 'ko', { numeric: true }));
}

export type CoverOutcome =
  | { kind: 'found'; newUrl: string; original: boolean }
  | { kind: 'same' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

/** 조회 결과를 판정한다. 같은 주소면 'same'(다시 확인에서 바뀐 것 없음). */
export function judgeCover(oldUrl: string, found: KakaoCover | null): CoverOutcome {
  const next = bestKakaoCover(found);
  if (!next) return { kind: 'not_found' };
  if (next === oldUrl) return { kind: 'same' };
  return { kind: 'found', newUrl: next, original: !!found?.cover && next === found.cover };
}

export interface CoverChange { editionId: string; oldUrl: string; newUrl: string }

/**
 * 고른 변경을 카탈로그 사본에 반영한다. 그 사이 표지가 바뀐 판본은 건너뛴다.
 * 작품 대표 표지가 옛 주소와 같으면 함께 바꾼다. 바꾼 판본 수를 돌려준다.
 */
export function applyCoverChanges(draft: Pick<CatalogData, 'works' | 'editions'>, changes: CoverChange[]): number {
  let n = 0;
  for (const c of changes) {
    const e = draft.editions.find((x) => x.id === c.editionId);
    if (!e || e.cover_url !== c.oldUrl) continue;
    e.cover_url = c.newUrl;
    n++;
    for (const w of draft.works) if (w.representative_cover_url === c.oldUrl) w.representative_cover_url = c.newUrl;
  }
  return n;
}

/** 결과를 커밋 메모로 남길 수 있게 텍스트로 */
export function coverReport(
  rows: Array<CoverTarget & { outcome: CoverOutcome; applied: boolean }>,
  at: string,
): string {
  const label = (r: CoverTarget) => `${r.title} · ${r.publisher}${r.volume && r.volume !== '1' ? ` ${r.volume}권` : ''} (ISBN ${r.isbn})`;
  const changed = rows.filter((r) => r.applied);
  const notFound = rows.filter((r) => r.outcome.kind === 'not_found');
  const errors = rows.filter((r) => r.outcome.kind === 'error');
  const lines = [
    `# 표지 바꾸기 결과 (${at})`,
    '',
    `대상 ${rows.length}권 · 바꿈 ${changed.length}권 · 못 찾음 ${notFound.length}권 · 오류 ${errors.length}권`,
    '',
    '## 바꾼 책',
    ...changed.map((r) => `- ${label(r)}\n  옛 주소: ${r.oldUrl}\n  새 주소: ${r.outcome.kind === 'found' ? r.outcome.newUrl : ''}`),
    '',
    '## 못 찾은 책',
    ...notFound.map((r) => `- ${label(r)}`),
  ];
  if (errors.length) lines.push('', '## 오류', ...errors.map((r) => `- ${label(r)}: ${r.outcome.kind === 'error' ? r.outcome.message : ''}`));
  return lines.join('\n') + '\n';
}

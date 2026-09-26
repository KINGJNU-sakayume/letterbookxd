/**
 * DB 행을 화면에서 쓰는 Work/EditionSet/Volume 모양으로 바꾸는 공통 함수
 */
import type { Work, EditionSet, Volume } from '../types';
import type { DbWork, DbEdition, EditionGroup } from '../services/db';
import { createEditionSetRef, createVolumeRef } from '../domain/books/identity';

export function groupKey(workId: string, publisher: string): string {
  return createEditionSetRef(workId, publisher);
}

export function dbWorkToWork(w: DbWork): Work {
  return {
    id: w.id,
    title: w.title,
    author: w.author,
    publishedYear: 0,
    description: w.description || '',
    coverImageUrl: '',
    genre: w.genre || '미분류',
    lists: w.lists || [],
    translations: buildWorkTranslations(w),
  };
}

export function buildWorkTranslations(w: DbWork) {
  const list: { key: string; label: string; text: string }[] = [];
  if (w.ai_translation) list.push({ key: 'ai', label: 'AI 번역', text: w.ai_translation });
  return list;
}

export function groupToEditionSet(g: EditionGroup, workId: string): EditionSet {
  return {
    id: groupKey(workId, g.publisher),
    workId,
    publisher: g.publisher,
    coverImageUrl: g.editions[0]?.cover_url ?? '',
    publishedYear: 0,
  };
}

export function editionToVolume(e: DbEdition, workId: string): Volume {
  const setId = groupKey(workId, e.publisher);
  const volLabel = e.volume_number ? e.volume_number : '1';
  return {
    id: createVolumeRef(e.id),
    editionSetId: setId,
    volumeNumber: parseInt(volLabel) || 1,
    title: volLabel,
  };
}

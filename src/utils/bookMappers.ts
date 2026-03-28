/**
 * [M-6] BookDetailPage, SeriesPage에서 중복 정의되던 헬퍼 함수 공통화
 */
import type { Work, EditionSet, Volume } from '../types';
import type { DbWork, DbEdition, EditionGroup } from '../services/db';

export function groupKey(workId: string, publisher: string): string {
  return `${workId}::${publisher}`;
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
    id: `vol-${e.id}`,
    editionSetId: setId,
    volumeNumber: parseInt(volLabel) || 1,
    title: volLabel,
  };
}

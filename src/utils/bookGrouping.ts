import type { AladinBook } from '../services/api';
import type { Work, EditionSet, Volume } from '../types';

export interface GroupedBookData {
  works: Work[];
  editionSets: EditionSet[];
  volumes: Volume[];
}

function cleanAuthor(author: string): string {
  return author.split(/[,(]/)[0].trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*-.*$/, '')
    .trim();
}

function normalizeKey(str: string): string {
  return str.replace(/\s+/g, '').toLowerCase();
}

function extractVolumeNumber(title: string): number {
  const numMatch = title.match(/(\d+)\s*$/);
  if (numMatch) return parseInt(numMatch[1], 10);
  if (/상$/.test(title.trim())) return 1;
  if (/중$/.test(title.trim())) return 2;
  if (/하$/.test(title.trim())) return 3;
  return 1;
}

function slugify(str: string): string {
  return str.replace(/\s+/g, '-').replace(/[^\w가-힣ぁ-ゟァ-ヿ一-鿿-]/g, '').toLowerCase();
}

export function groupBooks(flatBooks: AladinBook[]): GroupedBookData {
  const workMap = new Map<string, Work>();
  const editionSetMap = new Map<string, EditionSet>();
  const volumes: Volume[] = [];

  for (const book of flatBooks) {
    const pureAuthor = cleanAuthor(book.author);
    const pureTitle = cleanTitle(book.title);
    const workKey = `${normalizeKey(pureAuthor)}::${normalizeKey(pureTitle)}`;

    if (!workMap.has(workKey)) {
      const workId = `work-${slugify(pureAuthor)}-${slugify(pureTitle)}`;
      const pubYear = book.pubDate ? parseInt(book.pubDate.slice(0, 4), 10) : 0;
      workMap.set(workKey, {
        id: workId,
        title: pureTitle,
        author: pureAuthor,
        publishedYear: pubYear,
        description: book.description,
        coverImageUrl: book.cover,
        genre: book.categoryName || '소설',
      });
    }

    const work = workMap.get(workKey)!;
    const editionKey = `${workKey}::${normalizeKey(book.publisher)}`;

    if (!editionSetMap.has(editionKey)) {
      const editionId = `es-${slugify(pureAuthor)}-${slugify(pureTitle)}-${slugify(book.publisher)}`;
      const pubYear = book.pubDate ? parseInt(book.pubDate.slice(0, 4), 10) : 0;
      editionSetMap.set(editionKey, {
        id: editionId,
        workId: work.id,
        publisher: book.publisher,
        coverImageUrl: book.cover,
        publishedYear: pubYear,
      });
    }

    const edition = editionSetMap.get(editionKey)!;
    const volumeNumber = extractVolumeNumber(book.title);
    const volumeId = `vol-${book.isbn}`;

    const isSingleVolume =
      flatBooks.filter((b) => {
        return (
          normalizeKey(cleanAuthor(b.author)) === normalizeKey(pureAuthor) &&
          normalizeKey(cleanTitle(b.title)) === normalizeKey(pureTitle) &&
          b.publisher === book.publisher
        );
      }).length === 1;

    volumes.push({
      id: volumeId,
      editionSetId: edition.id,
      volumeNumber,
      title: isSingleVolume ? `${work.title} (단권)` : book.title,
    });
  }

  return {
    works: Array.from(workMap.values()),
    editionSets: Array.from(editionSetMap.values()),
    volumes,
  };
}

/**
 * Finding a proposed book in 책장's catalogue. Never guesses: anything less than one clear answer is
 * returned as choices for the owner. Structural types only (no imports), so the tests can compile this
 * file on its own; CatalogWork from the catalogue store satisfies them.
 */

export interface MatchEdition { id: string; volume_number: string | null; publisher: string | null }
export interface MatchWork { id: string; title: string; author: string; editions: MatchEdition[] }
export interface BookQuery { title: string; author: string | null; publisher: string | null; volume: number | null }

/** NFKC, lower case, no spaces or punctuation: "죄와 벌" = "죄와벌", "THE Idiot" = "the idiot". */
export const normalizeTitle = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const authorMatches = (work: MatchWork, author: string | null) => {
  if (!author) return true;
  const a = normalizeTitle(author);
  const w = normalizeTitle(work.author);
  return a.length > 0 && (w.includes(a) || a.includes(w));
};

/** Works the proposal may mean. `exact` is set only when exactly one work has the same title (and author). */
export function findWorks<W extends MatchWork>(q: BookQuery, works: W[]): { exact: W | null; choices: W[] } {
  const title = normalizeTitle(q.title);
  const sameTitle = works.filter((w) => normalizeTitle(w.title) === title);
  const exact = sameTitle.filter((w) => authorMatches(w, q.author));
  if (exact.length === 1) return { exact: exact[0], choices: exact };
  if (exact.length > 1) return { exact: null, choices: exact };
  // Nothing with that exact title: titles containing it (or contained in it), by the author if given.
  const near = works
    .filter((w) => {
      const t = normalizeTitle(w.title);
      return title.length >= 2 && (t.includes(title) || title.includes(t)) && authorMatches(w, q.author);
    })
    .slice(0, 8);
  return { exact: null, choices: near.length ? near : sameTitle.slice(0, 8) };
}

/** Publishers (edition sets) of a work, with the one the proposal names (or the only one) preselected. */
export function publishersOf(work: MatchWork, q: BookQuery): { publishers: string[]; preselected: string | null } {
  const publishers = Array.from(new Set(work.editions.map((e) => e.publisher ?? ''))).sort((a, b) => a.localeCompare(b, 'ko'));
  if (publishers.length === 1) return { publishers, preselected: publishers[0] };
  if (q.publisher) {
    const wanted = normalizeTitle(q.publisher);
    const hits = publishers.filter((p) => normalizeTitle(p) === wanted);
    if (hits.length === 1) return { publishers, preselected: hits[0] };
  }
  return { publishers, preselected: null };
}

const volumeOf = (e: MatchEdition) => parseInt(e.volume_number || '1', 10) || 1;

/** Volumes of one edition set in order, with the proposed (or the only) volume preselected. */
export function volumesOf<E extends MatchEdition>(work: { editions: E[] }, publisher: string, volume: number | null): { volumes: E[]; preselected: E | null } {
  const volumes = work.editions
    .filter((e) => (e.publisher ?? '') === publisher)
    .sort((a, b) => (a.volume_number ?? '').localeCompare(b.volume_number ?? '', undefined, { numeric: true }));
  if (volumes.length === 1) return { volumes, preselected: volumes[0] };
  if (volume !== null) {
    const hits = volumes.filter((e) => volumeOf(e) === volume);
    if (hits.length === 1) return { volumes, preselected: hits[0] };
  }
  return { volumes, preselected: null };
}

/** Noon in Korea on the stated day keeps the calendar day right in the owner's time zone. */
export const dayToIso = (day: string) => new Date(`${day}T12:00:00+09:00`).toISOString();

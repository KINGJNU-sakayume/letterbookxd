export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 쉼표로 구분된 장르 문자열을 태그 목록으로 (통계 계산과 같은 규칙). */
export function splitGenre(genre: string | null | undefined): string[] {
  return (genre ?? '').split(',').map((t) => t.trim()).filter(Boolean);
}

export function progressPercent(current: number | null | undefined, total: number | null | undefined): number | null {
  if (!total || current == null) return null;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

/** '1' → '1권', '상' → '상권', '2권' → '2권' */
export function volumeLabel(volumeNumber: string | null | undefined): string {
  const v = (volumeNumber ?? '').trim();
  if (!v) return '';
  return v.endsWith('권') ? v : `${v}권`;
}

export function compareKo(a: string, b: string): number {
  return a.localeCompare(b, 'ko');
}

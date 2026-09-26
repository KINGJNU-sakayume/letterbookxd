const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const CONSONANTS_ONLY = /^[ㄱ-ㅎ\s]+$/;

/** '죄와 벌' → 'ㅈㅇ ㅂ' */
export function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST
      ? CHOSUNG[Math.floor((code - SYLLABLE_FIRST) / 588)]
      : ch;
  }
  return out;
}

function compact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

/** 띄어쓰기를 무시하고, 자음만 입력하면 초성으로 비교한다. */
export function matchesQuery(text: string, query: string): boolean {
  const q = compact(query);
  if (!q) return true;
  if (compact(text).includes(q)) return true;
  return CONSONANTS_ONLY.test(query) && compact(toChosung(text)).includes(q);
}

/** 검색 결과 정렬용 점수 (낮을수록 앞). 일치하지 않으면 null. */
export function matchRank(text: string, query: string): number | null {
  const q = compact(query);
  if (!q) return null;
  const t = compact(text);
  if (t.startsWith(q)) return 0;
  if (t.includes(q)) return 1;
  if (CONSONANTS_ONLY.test(query)) {
    const c = compact(toChosung(text));
    if (c.startsWith(q)) return 2;
    if (c.includes(q)) return 3;
  }
  return null;
}

/** 원문에서 그대로 찾을 수 있는 경우에만 강조 범위를 돌려준다. */
export function highlightRange(text: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const start = text.toLowerCase().indexOf(q);
  return start === -1 ? null : [start, start + q.length];
}

/**
 * 끝 글자 받침에 맞춰 조사를 붙인다. josa('데미안', '을', '를') → '데미안을'
 * 한글이나 숫자로 끝나지 않으면 '을(를)'처럼 둘 다 적는다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  // 닫는 따옴표·괄호는 건너뛰고 실제 끝 글자를 본다
  const ch = word.replace(/[\s’'"”」』)\]]+$/, '').slice(-1);
  const code = ch.charCodeAt(0);
  let hasFinal: boolean | null = null;
  if (code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST) hasFinal = (code - SYLLABLE_FIRST) % 28 !== 0;
  else if (/[0-9]/.test(ch)) hasFinal = '013678'.includes(ch);
  if (hasFinal === null) return `${word}${withFinal}(${withoutFinal})`;
  return word + (hasFinal ? withFinal : withoutFinal);
}

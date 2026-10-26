export interface DiffPiece {
  text: string;
  /** 기준 번역에 없는 어절 */
  changed: boolean;
}

export interface TranslationDiff {
  pieces: DiffPiece[];
  changed: number;
  total: number;
}

// 어절 수가 이보다 크게 곱해지면 비교하지 않는다 (첫 문단 길이에서는 닿지 않는 안전선)
const MAX_CELLS = 250_000;

const stripMarks = (word: string) => word.replace(/[,.·“”‘’"'()]/g, '');

/**
 * 띄어쓰기로 나눈 어절 단위로 두 번역의 공통 부분(LCS)을 찾아, target 에서 공통이 아닌 어절을 표시한다.
 * base 가 없거나 너무 길면 표시 없이 그대로 돌려준다.
 */
export function diffAgainst(base: string | null | undefined, target: string): TranslationDiff {
  const parts = target.split(/(\s+)/);
  const words = target.match(/\S+/g) ?? [];
  const baseWords = (base ?? '').match(/\S+/g) ?? [];

  let shared: Set<number> | null = null;
  if (baseWords.length > 0 && baseWords.length * words.length <= MAX_CELLS) {
    shared = commonIndexes(baseWords.map(stripMarks), words.map(stripMarks));
  }

  let wordIndex = 0;
  let changed = 0;
  const pieces = parts
    .filter((p) => p !== '')
    .map((text) => {
      if (/^\s+$/.test(text)) return { text, changed: false };
      const idx = wordIndex++;
      const isChanged = shared !== null && !shared.has(idx);
      if (isChanged) changed++;
      return { text, changed: isChanged };
    });

  return { pieces, changed, total: words.length };
}

/** a 와 b 의 최장 공통 부분열에 들어가는 b 쪽 위치 */
function commonIndexes(a: string[], b: string[]): Set<number> {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const keep = new Set<number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      keep.add(j - 1);
      i--;
      j--;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return keep;
}

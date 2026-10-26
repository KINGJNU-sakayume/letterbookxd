/** 먹 한 가지의 순차 단계(tokens: --color-map-1..5). 밝을수록 적다: 단조 명도, 인접 ΔL 0.12, 밝은 끝도 종이와 구별된다. */
export const MAP_RAMP = ['var(--color-map-1)', 'var(--color-map-2)', 'var(--color-map-3)', 'var(--color-map-4)', 'var(--color-map-5)'];
export const NO_DATA = 'var(--color-map-empty)';

export function rampColor(count: number, max: number): string {
  if (count <= 0) return NO_DATA;
  const step = Math.ceil((count / Math.max(max, 1)) * MAP_RAMP.length) - 1;
  return MAP_RAMP[Math.min(MAP_RAMP.length - 1, Math.max(0, step))];
}

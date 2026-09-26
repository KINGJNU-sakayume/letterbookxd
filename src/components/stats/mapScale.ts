/** 한 색상(이끼색)의 순차 단계. 밝을수록 적다. dataviz 검증: 단조 명도, 인접 ΔL ≥ 0.06, 밝은 끝 2:1 이상. */
export const MAP_RAMP = ['#9dbb78', '#7fa257', '#638a3d', '#4a6f28', '#35551a'];
export const NO_DATA = '#e3dccd';

export function rampColor(count: number, max: number): string {
  if (count <= 0) return NO_DATA;
  const step = Math.ceil((count / Math.max(max, 1)) * MAP_RAMP.length) - 1;
  return MAP_RAMP[Math.min(MAP_RAMP.length - 1, Math.max(0, step))];
}

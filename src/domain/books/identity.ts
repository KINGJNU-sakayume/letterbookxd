export interface LegacyEditionSetRef {
  workId: string;
  publisher: string;
}

/**
 * Compatibility layer for the current composite edition-set identifier.
 * UI code must not construct or split this value directly.
 * A future DB-backed edition_set UUID can replace the implementation here.
 */
export function createEditionSetRef(workId: string, publisher: string): string {
  return `${workId}::${publisher}`;
}

export function parseEditionSetRef(ref: string): LegacyEditionSetRef {
  const idx = ref.indexOf('::');
  if (idx === -1) return { workId: ref, publisher: '' };
  return { workId: ref.slice(0, idx), publisher: ref.slice(idx + 2) };
}

export function createVolumeRef(editionId: string): string {
  return `vol-${editionId}`;
}

export function parseVolumeRef(ref: string): string {
  return ref.startsWith('vol-') ? ref.slice(4) : ref;
}

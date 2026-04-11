export function parseEditionSetId(editionSetId: string): { workId: string; publisher: string } {
  const sep = '::';
  const idx = editionSetId.indexOf(sep);
  if (idx === -1) return { workId: editionSetId, publisher: '' };
  return { workId: editionSetId.slice(0, idx), publisher: editionSetId.slice(idx + sep.length) };
}

export function parseVolumeId(volumeId: string): string {
  return volumeId.replace('vol-', '');
}

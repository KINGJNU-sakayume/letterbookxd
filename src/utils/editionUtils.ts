import { parseEditionSetRef, parseVolumeRef } from '../domain/books/identity';

export function parseEditionSetId(editionSetId: string): { workId: string; publisher: string } {
  return parseEditionSetRef(editionSetId);
}

export function parseVolumeId(volumeId: string): string {
  return parseVolumeRef(volumeId);
}

import { create } from 'zustand';
import type { Work, EditionSet, Volume } from '../types';
import type { GroupedBookData } from '../utils/bookGrouping';

interface BookStore {
  works: Work[];
  editionSets: EditionSet[];
  volumes: Volume[];
  setGroupedData: (data: GroupedBookData) => void;
  getWorkById: (id: string) => Work | undefined;
  getEditionSetsByWorkId: (workId: string) => EditionSet[];
  getVolumesByEditionSetId: (editionSetId: string) => Volume[];
}

export const useBookStore = create<BookStore>((set, get) => ({
  works: [],
  editionSets: [],
  volumes: [],
  setGroupedData: (data) =>
    set((state) => ({
      works: mergeById(state.works, data.works),
      editionSets: mergeById(state.editionSets, data.editionSets),
      volumes: mergeById(state.volumes, data.volumes),
    })),
  getWorkById: (id) => get().works.find((w) => w.id === id),
  getEditionSetsByWorkId: (workId) =>
    get().editionSets.filter((e) => e.workId === workId),
  getVolumesByEditionSetId: (editionSetId) =>
    get().volumes.filter((v) => v.editionSetId === editionSetId),
}));

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((i) => [i.id, i]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

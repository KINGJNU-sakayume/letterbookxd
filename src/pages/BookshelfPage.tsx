import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { useLogStore } from '../store/logStore';
import { StarRating } from '../components/ui/StarRating';
import { BookCover } from '../components/ui/BookCover';
import { supabase } from '../lib/supabase';

interface WorkMeta {
  id: string;
  title: string;
  author: string;
  representative_cover_url: string | null;
}

interface EditionMeta {
  id: string;
  work_id: string;
  publisher: string;
  cover_url: string;
  volume_number: string;
}

function parseEditionSetId(editionSetId: string): { workId: string; publisher: string } {
  const sep = '::';
  const idx = editionSetId.indexOf(sep);
  if (idx === -1) return { workId: editionSetId, publisher: '' };
  return { workId: editionSetId.slice(0, idx), publisher: editionSetId.slice(idx + sep.length) };
}

function parseVolumeId(volumeId: string): string {
  return volumeId.replace('vol-', '');
}

export function BookshelfPage() {
  const { volumeLogs, setCompletionLogs, isLoading } = useLogStore();
  const navigate = useNavigate();

  const [works, setWorks] = useState<Map<string, WorkMeta>>(new Map());
  const [editions, setEditions] = useState<Map<string, EditionMeta>>(new Map());
  const [metaLoading, setMetaLoading] = useState(false);

  // [H-3] 로그 변경마다 전체 재fetch 방지 — 마운트 시 1회만 fetch
  useEffect(() => {
    const fetchMeta = async () => {
      setMetaLoading(true);
      const [worksRes, editionsRes] = await Promise.all([
        supabase.from('works').select('id, title, author, representative_cover_url'),
        supabase.from('editions').select('id, work_id, publisher, cover_url, volume_number'),
      ]);

      const workMap = new Map<string, WorkMeta>();
      (worksRes.data ?? []).forEach(w => workMap.set(w.id, w as WorkMeta));
      setWorks(workMap);

      const editionMap = new Map<string, EditionMeta>();
      (editionsRes.data ?? []).forEach(e => editionMap.set(e.id, e as EditionMeta));
      setEditions(editionMap);

      setMetaLoading(false);
    };

    fetchMeta();
  }, []); // 빈 의존성 — 마운트 시 1회

  const uniqueCompletions = Array.from(
    new Map(setCompletionLogs.map(log => [log.editionSetId, log])).values()
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const allVolumeRecords = [...volumeLogs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-stone-400" />
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-900 mb-1">내 책장</h1>
          <p className="text-stone-500 text-sm">
            {volumeLogs.length}권 기록 · {uniqueCompletions.length}세트 완독
          </p>
        </div>

        {metaLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-stone-300" />
          </div>
        )}

        {!metaLoading && uniqueCompletions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-4">완독한 세트</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {uniqueCompletions.map((cl) => {
                const work = works.get(cl.workId);
                const { publisher } = parseEditionSetId(cl.editionSetId);
                const targetEditions = Array.from(editions.values()).filter(e => e.work_id === cl.workId && e.publisher === publisher);
                const firstEdition = targetEditions.find(e => e.volume_number === '1') || targetEditions[0];
                const coverSrc = firstEdition?.cover_url || work?.representative_cover_url || '';

                return (
                  <button key={cl.id} onClick={() => navigate(`/book/${cl.workId}`)} className="group text-left">
                    <BookCover src={coverSrc} alt={work?.title ?? ''} className="w-full shadow-sm group-hover:-translate-y-1 transition-transform" />
                    <div className="mt-2.5">
                      <p className="text-[13px] font-bold text-stone-900 line-clamp-1">{work?.title}</p>
                      <p className="text-[11px] text-stone-500 uppercase">{publisher}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <StarRating rating={cl.rating} size="sm" readonly />
                        {cl.liked && <Heart size={12} className="text-rose-500 fill-rose-500" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!metaLoading && allVolumeRecords.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-4">권별 기록</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {allVolumeRecords.map((vl) => {
                const work = works.get(vl.workId);
                const edition = editions.get(parseVolumeId(vl.volumeId));
                const coverSrc = edition?.cover_url || work?.representative_cover_url || '';
                const { publisher } = parseEditionSetId(vl.editionSetId);

                return (
                  <button key={vl.id} onClick={() => navigate(`/book/${vl.workId}`)} className="group text-left">
                    <BookCover src={coverSrc} alt={work?.title ?? ''} className="w-full shadow-sm group-hover:-translate-y-1 transition-transform" />
                    <div className="mt-2.5">
                      <p className="text-[13px] font-bold text-stone-900 line-clamp-1">
                        {work?.title} <span className="text-stone-500 font-normal">{edition?.volume_number}</span>
                      </p>
                      <p className="text-[11px] text-stone-500 uppercase">{publisher}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <StarRating rating={vl.rating} size="sm" readonly />
                        {vl.liked && <Heart size={12} className="text-rose-500 fill-rose-500" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

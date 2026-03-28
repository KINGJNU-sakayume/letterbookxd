import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart, Loader2, Trash2, Edit2, AlertCircle, X, Calendar, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

const OWNER_ID = import.meta.env.VITE_OWNER_ID;

interface LogEntry {
  id: string;
  created_at: string;
  rating: number;
  liked: boolean;
  work_id: string;
  volume_id: string | null;
  edition_set_id: string | null;
  log_type: string;
  displayData?: {
    title: string;
    author: string;
    publisher: string;
    cover_url: string;
    volume_number: string;
  };
}

function parseEditionSetId(editionSetId: string | null): { workId: string; publisher: string } {
  if (!editionSetId) return { workId: '', publisher: '' };
  const sep = '::';
  const idx = editionSetId.indexOf(sep);
  if (idx === -1) return { workId: editionSetId, publisher: '' };
  return { workId: editionSetId.slice(0, idx), publisher: editionSetId.slice(idx + sep.length) };
}

function parseVolumeId(volumeId: string | null): string {
  if (!volumeId) return '';
  return volumeId.replace('vol-', '');
}

export function ReadingLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editLiked, setEditLiked] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function fetchAndMapLogs() {
      try {
        setLoading(true);
        const { data: rawLogs, error: logError } = await supabase
          .from('logs').select('*').eq('user_id', OWNER_ID).order('created_at', { ascending: false });

        if (logError) throw logError;

        const [worksRes, editionsRes] = await Promise.all([
          supabase.from('works').select('id, title, author, representative_cover_url'),
          supabase.from('editions').select('id, work_id, publisher, cover_url, volume_number'),
        ]);

        const workMap = new Map<string, { title: string; author: string; representative_cover_url: string | null }>();
        worksRes.data?.forEach(w => workMap.set(w.id, w));
        const editionMap = new Map<string, { id: string; work_id: string; publisher: string; cover_url: string; volume_number: string }>();
        editionsRes.data?.forEach(e => editionMap.set(e.id, e));
        const allEditions = editionsRes.data || [];

        const mappedLogs: LogEntry[] = (rawLogs || []).reduce((acc: LogEntry[], log) => {
          const work = workMap.get(log.work_id);
          const { publisher: extractedPublisher } = parseEditionSetId(log.edition_set_id);
          const publisherEditions = allEditions.filter(e => e.work_id === log.work_id && e.publisher === extractedPublisher);
          const isSingleVolume = publisherEditions.length === 1;

          if (isSingleVolume && log.log_type === 'set_completion') return acc;

          let coverSrc = work?.representative_cover_url || '';
          let finalPublisher = extractedPublisher;
          let volumeNumStr = '';

          if (log.log_type === 'set_completion') {
            const firstEdition = publisherEditions[0];
            if (firstEdition?.cover_url) coverSrc = firstEdition.cover_url;
            volumeNumStr = '전권 완독';
          } else {
            const edition = editionMap.get(parseVolumeId(log.volume_id));
            if (edition) {
              coverSrc = edition.cover_url || coverSrc;
              finalPublisher = edition.publisher || extractedPublisher;
              volumeNumStr = isSingleVolume ? '' : `${edition.volume_number}권`;
            }
          }

          acc.push({
            ...log,
            displayData: {
              title: work?.title || '알 수 없는 작품',
              author: work?.author || '작가 미상',
              publisher: finalPublisher,
              cover_url: coverSrc,
              volume_number: volumeNumStr,
            },
          });
          return acc;
        }, []);

        setLogs(mappedLogs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAndMapLogs();
  }, []);

  // [H-1] 볼륨 로그 삭제 시 연관된 set_completion도 함께 제거
  const confirmDelete = async () => {
    if (!deletingLogId) return;
    const targetLog = logs.find(l => l.id === deletingLogId);
    try {
      await supabase.from('logs').delete().eq('id', deletingLogId);

      if (targetLog?.log_type === 'volume' && targetLog.edition_set_id) {
        await supabase
          .from('logs')
          .delete()
          .eq('user_id', OWNER_ID)
          .eq('edition_set_id', targetLog.edition_set_id)
          .eq('log_type', 'set_completion');
      }

      setLogs(prev => {
        const updated = prev.filter(l => l.id !== deletingLogId);
        // 연관 set_completion 로그도 UI에서 제거
        if (targetLog?.log_type === 'volume' && targetLog.edition_set_id) {
          return updated.filter(l => !(l.log_type === 'set_completion' && l.edition_set_id === targetLog.edition_set_id));
        }
        return updated;
      });
      setDeletingLogId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (log: LogEntry) => {
    setEditingLog(log);
    setEditRating(log.rating);
    setEditLiked(log.liked);
    setEditDate(log.created_at.split('T')[0]);
  };

  const handleUpdateLog = async () => {
    if (!editingLog) return;
    setIsUpdating(true);
    try {
      await supabase.from('logs').update({
        rating: editRating,
        liked: editLiked,
        created_at: new Date(editDate).toISOString(),
      }).eq('id', editingLog.id);

      setLogs(prev => prev.map(l =>
        l.id === editingLog.id
          ? { ...l, rating: editRating, liked: editLiked, created_at: new Date(editDate).toISOString() }
          : l
      ));
      setEditingLog(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-stone-300" size={32} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 border-b border-stone-200 pb-6">
          <h1 className="text-3xl font-serif font-bold text-stone-900">독서 기록</h1>
          <p className="text-stone-500 mt-2 font-serif italic text-sm">내가 걸어온 문장의 궤적들</p>
        </header>

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-widest text-stone-400 bg-stone-50/50 border-b border-stone-200">
                <th className="py-4 px-6 font-semibold text-center w-24">날짜</th>
                <th className="py-4 px-2 font-semibold w-16 text-center">표지</th>
                <th className="py-4 px-6 font-semibold">도서 정보</th>
                <th className="py-4 px-6 font-semibold text-center w-32">별점</th>
                <th className="py-4 px-6 text-center w-16 text-rose-400"><Heart size={14} className="mx-auto" /></th>
                <th className="py-4 px-6 text-center w-24">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.map((log) => {
                const date = new Date(log.created_at);
                const month = date.toLocaleString('ko-KR', { month: 'short' });
                const day = date.getDate().toString().padStart(2, '0');
                const display = log.displayData!;

                return (
                  <tr key={log.id} className="group hover:bg-stone-50/50 transition-colors">
                    <td className="py-5 px-6 font-serif text-center text-stone-700">
                      <span className="block text-[10px] text-stone-400 uppercase leading-none mb-1">{month}</span>
                      <span className="text-xl font-medium">{day}</span>
                    </td>
                    <td className="py-5 px-2">
                      <div className="w-12 h-16 bg-stone-100 rounded shadow-sm overflow-hidden mx-auto">
                        <img src={display.cover_url} alt={display.title} className="w-full h-full object-cover" />
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <button onClick={() => navigate(`/book/${log.work_id}`)} className="font-bold text-stone-800 hover:text-stone-600 text-[15px] text-left">
                        {display.title}
                      </button>
                      <div className="text-[11px] text-stone-400 mt-1 uppercase tracking-tight font-medium">
                        {display.author} · {display.publisher} {display.volume_number ? `· ${display.volume_number}` : ''}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-center">
                      <div className="flex justify-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} size={12} className={s <= (log.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-stone-200'} />
                        ))}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-center">
                      {log.liked && <Heart size={15} className="mx-auto text-rose-500 fill-rose-500" />}
                    </td>
                    <td className="py-5 px-6 text-center text-stone-400">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEditModal(log)} className="p-1.5 hover:text-stone-700 bg-white rounded-md border border-stone-200 shadow-sm"><Edit2 size={13} /></button>
                        <button onClick={() => setDeletingLogId(log.id)} className="p-1.5 hover:text-rose-600 bg-white rounded-md border border-stone-200 shadow-sm"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] w-full max-w-[380px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="relative pt-12 pb-8 px-6 flex flex-col items-center border-b border-stone-50">
              <button onClick={() => setEditingLog(null)} className="absolute top-6 right-6 text-stone-300 hover:text-stone-600 transition-colors"><X size={24} /></button>
              <div className="w-28 h-40 bg-stone-100 rounded-lg shadow-xl overflow-hidden mb-6 transform -rotate-1">
                <img src={editingLog.displayData?.cover_url} alt="표지" className="w-full h-full object-cover" />
              </div>
              <h3 className="font-serif text-xl font-bold text-stone-900 text-center px-4 leading-tight">{editingLog.displayData?.title}</h3>
              <p className="text-sm text-stone-500 mt-1">{editingLog.displayData?.author}</p>
              <div className="mt-3 text-[10px] text-stone-400 uppercase tracking-widest font-bold">
                {editingLog.displayData?.publisher} {editingLog.displayData?.volume_number}
              </div>
            </div>
            <div className="p-8 space-y-10">
              <div className="flex flex-col items-center">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setEditRating(star)} className="transition-transform active:scale-90 hover:scale-110">
                      <Star size={32} className={star <= editRating ? 'text-amber-400 fill-amber-400' : 'text-stone-100'} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-6 px-2">
                <div className="flex items-center gap-3 bg-stone-50 px-4 py-2.5 rounded-2xl border border-stone-100 flex-1">
                  <Calendar size={16} className="text-stone-400" />
                  <input
                    type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                    className="bg-transparent text-sm text-stone-700 focus:outline-none w-full font-medium"
                  />
                </div>
                <button
                  onClick={() => setEditLiked(!editLiked)}
                  className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all ${
                    editLiked ? 'bg-rose-50 border-rose-100 text-rose-500 shadow-sm shadow-rose-100' : 'bg-stone-50 border-stone-100 text-stone-300 hover:text-stone-400'
                  }`}
                >
                  <Heart size={22} className={editLiked ? 'fill-rose-500' : ''} />
                </button>
              </div>
            </div>
            <div className="p-6 bg-stone-50/50">
              <button
                onClick={handleUpdateLog} disabled={isUpdating}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl text-sm font-bold hover:bg-stone-800 shadow-lg shadow-stone-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                완료하기
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingLogId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-rose-50 rounded-full mb-4 mx-auto text-rose-500"><AlertCircle size={24} /></div>
            <h3 className="text-lg font-bold text-stone-900 text-center mb-2">기록을 삭제할까요?</h3>
            <p className="text-stone-500 text-sm text-center mb-6 leading-relaxed">
              이 동작은 되돌릴 수 없으며,<br />기록이 완전히 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingLogId(null)} className="flex-1 py-3 text-sm font-medium text-stone-500 bg-stone-100 rounded-xl">취소</button>
              <button onClick={confirmDelete} className="flex-1 py-3 text-sm font-medium text-white bg-rose-500 rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

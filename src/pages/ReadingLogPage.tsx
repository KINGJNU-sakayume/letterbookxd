import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart, Loader2, Trash2, Edit2, AlertCircle, X, Calendar, Check, ChevronDown } from 'lucide-react';
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

type SortOption = 'date' | 'rating' | 'author';

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

  // Filter state
  const [minStarFilter, setMinStarFilter] = useState<number | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [sortOpen, setSortOpen] = useState(false);

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

  const confirmDelete = async () => {
    if (!deletingLogId) return;
    const targetLog = logs.find(l => l.id === deletingLogId);
    try {
      await supabase.from('logs').delete().eq('id', deletingLogId);
      if (targetLog?.log_type === 'volume' && targetLog.edition_set_id) {
        await supabase.from('logs').delete()
          .eq('user_id', OWNER_ID)
          .eq('edition_set_id', targetLog.edition_set_id)
          .eq('log_type', 'set_completion');
      }
      setLogs(prev => {
        const updated = prev.filter(l => l.id !== deletingLogId);
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

  // Unique authors from logs
  const uniqueAuthors = Array.from(new Set(logs.map(l => l.displayData?.author).filter(Boolean))) as string[];

  // Apply filters and sort
  let filteredLogs = logs.filter(l => {
    if (minStarFilter !== null && (l.rating ?? 0) < minStarFilter) return false;
    if (authorFilter && l.displayData?.author !== authorFilter) return false;
    return true;
  });

  if (sortOption === 'rating') {
    filteredLogs = [...filteredLogs].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  } else if (sortOption === 'author') {
    filteredLogs = [...filteredLogs].sort((a, b) =>
      (a.displayData?.author ?? '').localeCompare(b.displayData?.author ?? '', 'ko')
    );
  }
  // 'date' uses server order (already sorted by created_at desc)

  // Group by year-month
  const grouped: { key: string; label: string; entries: LogEntry[] }[] = [];
  const groupMap = new Map<string, LogEntry[]>();
  filteredLogs.forEach(log => {
    const d = new Date(log.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(log);
  });
  groupMap.forEach((entries, key) => {
    const [year, month] = key.split('-');
    grouped.push({ key, label: `${year}년 ${parseInt(month)}월`, entries });
  });

  const sortLabels: Record<SortOption, string> = {
    date: '완독일순',
    rating: '별점 높은순',
    author: '작가명순',
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
        <header className="mb-8 border-b border-stone-200 pb-6">
          <h1 className="text-3xl font-serif font-bold text-stone-900">독서 기록</h1>
        </header>

        {/* Filter & sort bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {/* Active filters as dismissible tags */}
          {minStarFilter !== null && (
            <span
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border cursor-pointer"
              style={{ backgroundColor: '#E6F1FB', color: '#185FA5', borderColor: '#B5D4F4' }}
              onClick={() => setMinStarFilter(null)}
            >
              ★ {minStarFilter}점 이상
              <X size={13} />
            </span>
          )}
          {authorFilter && (
            <span
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border cursor-pointer"
              style={{ backgroundColor: '#E6F1FB', color: '#185FA5', borderColor: '#B5D4F4' }}
              onClick={() => setAuthorFilter('')}
            >
              {authorFilter}
              <X size={13} />
            </span>
          )}

          {/* Star filter buttons */}
          <div className="flex items-center gap-1 ml-auto">
            {[3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setMinStarFilter(minStarFilter === star ? null : star)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  minStarFilter === star
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
              >
                ★ {star}+
              </button>
            ))}

            {/* Author filter */}
            {uniqueAuthors.length > 0 && (
              <select
                value={authorFilter}
                onChange={e => setAuthorFilter(e.target.value)}
                className="px-2.5 py-1 rounded-lg text-xs border border-stone-200 bg-white text-stone-600 outline-none"
              >
                <option value="">작가 전체</option>
                {uniqueAuthors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortOpen(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-stone-600 border border-stone-200 rounded-lg hover:border-stone-400 bg-white transition-colors"
              >
                {sortLabels[sortOption]}
                <ChevronDown size={12} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-10 min-w-[100px] py-1">
                  {(Object.entries(sortLabels) as [SortOption, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setSortOption(key); setSortOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        sortOption === key ? 'text-stone-900 font-medium bg-stone-50' : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {grouped.length === 0 && (
          <div className="text-center py-20 text-stone-400">
            <p className="text-sm">조건에 맞는 기록이 없습니다.</p>
          </div>
        )}

        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-stone-700">{group.label}</h2>
                <span className="text-xs text-stone-400">· {group.entries.length}권</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>

              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[580px]">
                  <tbody className="divide-y divide-stone-100">
                    {group.entries.map((log) => {
                      const d = new Date(log.created_at);
                      const day = d.getDate();
                      const display = log.displayData!;

                      return (
                        <tr key={log.id} className="group hover:bg-stone-50/50 transition-colors">
                          <td className="py-4 px-5 font-serif text-center w-12 text-stone-700 shrink-0">
                            <span className="text-lg font-medium">{day}일</span>
                          </td>
                          <td className="py-4 px-2 w-14">
                            <div className="w-10 h-14 bg-stone-100 rounded shadow-sm overflow-hidden mx-auto">
                              <img src={display.cover_url} alt={display.title} className="w-full h-full object-cover" />
                            </div>
                          </td>
                          <td className="py-4 px-4 flex-1">
                            <button onClick={() => navigate(`/book/${log.work_id}`)} className="font-medium text-stone-800 hover:text-stone-600 text-sm text-left line-clamp-1">
                              {display.title}
                            </button>
                            <div className="text-[11px] text-stone-400 mt-0.5">
                              {display.author} · {display.publisher}{display.volume_number ? ` · ${display.volume_number}` : ''}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center w-28">
                            {log.rating ? (
                              <div className="flex justify-center gap-0.5">
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Star key={s} size={12} className={s <= (log.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-stone-200'} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-stone-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="py-4 px-3 text-center w-10">
                            {log.liked && <Heart size={14} className="mx-auto text-rose-500 fill-rose-500" />}
                          </td>
                          <td className="py-4 px-4 text-center w-20">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => openEditModal(log)} className="p-1.5 hover:text-stone-700 bg-white rounded-md border border-stone-200 shadow-sm text-stone-400 transition-colors">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => setDeletingLogId(log.id)} className="p-1.5 hover:text-rose-600 bg-white rounded-md border border-stone-200 shadow-sm text-stone-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] w-full max-w-[380px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="relative pt-12 pb-8 px-6 flex flex-col items-center border-b border-stone-50">
              <button onClick={() => setEditingLog(null)} className="absolute top-6 right-6 text-stone-300 hover:text-stone-600 transition-colors">
                <X size={24} />
              </button>
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
                  {[1, 2, 3, 4, 5].map(star => (
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
                    type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
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

      {/* Delete confirm */}
      {deletingLogId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-rose-50 rounded-full mb-4 mx-auto text-rose-500">
              <AlertCircle size={24} />
            </div>
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

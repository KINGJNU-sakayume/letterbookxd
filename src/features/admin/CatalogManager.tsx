import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Loader2, Pencil, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WorkRow {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  lists: string[] | null;
}
interface EditionRow {
  id: string;
  work_id: string;
  publisher: string;
  isbn: string;
  page_count: number;
  volume_number: string;
  cover_url: string;
}

export function CatalogManager() {
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingWork, setEditingWork] = useState<WorkRow | null>(null);
  const [editingEdition, setEditingEdition] = useState<EditionRow | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [worksRes, editionsRes] = await Promise.all([
      supabase.from('works').select('id, title, author, genre, description, lists').order('title'),
      supabase.from('editions').select('id, work_id, publisher, isbn, page_count, volume_number, cover_url').order('publisher'),
    ]);
    if (worksRes.error) throw worksRes.error;
    if (editionsRes.error) throw editionsRes.error;
    setWorks((worksRes.data ?? []) as WorkRow[]);
    setEditions((editionsRes.data ?? []) as EditionRow[]);
    setLoading(false);
  }

  useEffect(() => { load().catch(console.error); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return works;
    return works.filter(work =>
      work.title.toLowerCase().includes(needle) ||
      work.author.toLowerCase().includes(needle)
    );
  }, [works, query]);

  async function saveWork() {
    if (!editingWork) return;
    const { error } = await supabase.from('works').update({
      title: editingWork.title,
      author: editingWork.author,
      genre: editingWork.genre,
      description: editingWork.description,
      lists: editingWork.lists,
    }).eq('id', editingWork.id);
    if (error) throw error;
    setEditingWork(null);
    await load();
  }

  async function deleteWork(work: WorkRow) {
    if (!confirm('"' + work.title + '" 작품과 연결된 판본/독서기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    const workEditions = editions.filter(edition => edition.work_id === work.id);
    const editionIds = workEditions.map(edition => 'vol-' + edition.id);
    if (editionIds.length) await supabase.from('logs').delete().in('volume_id', editionIds);
    await supabase.from('logs').delete().eq('work_id', work.id);
    await supabase.from('editions').delete().eq('work_id', work.id);
    const { error } = await supabase.from('works').delete().eq('id', work.id);
    if (error) throw error;
    await load();
  }

  async function saveEdition() {
    if (!editingEdition) return;
    const { error } = await supabase.from('editions').update({
      publisher: editingEdition.publisher,
      isbn: editingEdition.isbn,
      page_count: editingEdition.page_count,
      volume_number: editingEdition.volume_number,
      cover_url: editingEdition.cover_url,
    }).eq('id', editingEdition.id);
    if (error) throw error;
    setEditingEdition(null);
    await load();
  }

  async function deleteEdition(edition: EditionRow) {
    if (!confirm(edition.publisher + ' ' + (edition.volume_number || '') + ' 판본을 삭제할까요?')) return;
    await supabase.from('logs').delete().eq('volume_id', 'vol-' + edition.id);
    const remaining = editions.filter(item =>
      item.id !== edition.id &&
      item.work_id === edition.work_id &&
      item.publisher === edition.publisher
    );
    if (remaining.length === 0) {
      await supabase.from('logs')
        .delete()
        .eq('edition_set_id', edition.work_id + '::' + edition.publisher)
        .eq('log_type', 'set_completion');
    }
    const { error } = await supabase.from('editions').delete().eq('id', edition.id);
    if (error) throw error;
    await load();
  }

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-stone-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">데이터 관리</h2>
          <p className="text-sm text-stone-500">작품 {works.length}개 · 판본 {editions.length}개</p>
        </div>
        <div className="relative w-64 max-w-full">
          <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="작품/작가 검색" className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
        {filtered.map(work => {
          const workEditions = editions.filter(edition => edition.work_id === work.id);
          const isOpen = expanded === work.id;
          return (
            <div key={work.id} className="bg-white">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(isOpen ? null : work.id)} className="text-stone-400">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{work.title}</p>
                  <p className="text-xs text-stone-500">{work.author} · 판본 {workEditions.length}</p>
                </div>
                <button onClick={() => setEditingWork({ ...work })} className="p-2 text-stone-400 hover:text-stone-800"><Pencil size={14} /></button>
                <button onClick={() => deleteWork(work)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
              {isOpen && (
                <div className="bg-stone-50 px-4 py-3 ml-9 space-y-2">
                  {workEditions.map(edition => (
                    <div key={edition.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-stone-700 flex-1">
                        {edition.publisher} {edition.volume_number ? '· ' + edition.volume_number + '권' : ''}
                      </span>
                      <span className="text-[11px] text-stone-400">{edition.page_count || 0}p</span>
                      <button onClick={() => setEditingEdition({ ...edition })} className="p-1.5 text-stone-400 hover:text-stone-800"><Pencil size={13} /></button>
                      <button onClick={() => deleteEdition(edition)} className="p-1.5 text-stone-400 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {!workEditions.length && <p className="text-xs text-stone-400">등록된 판본이 없습니다.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingWork && (
        <Modal title="작품 수정" onClose={() => setEditingWork(null)} onSave={() => saveWork().catch(console.error)}>
          <EditField label="제목" value={editingWork.title} onChange={value => setEditingWork({ ...editingWork, title: value })} />
          <EditField label="작가" value={editingWork.author} onChange={value => setEditingWork({ ...editingWork, author: value })} />
          <EditField label="장르" value={editingWork.genre ?? ''} onChange={value => setEditingWork({ ...editingWork, genre: value })} />
          <EditField label="리스트 (쉼표)" value={(editingWork.lists ?? []).join(', ')} onChange={value => setEditingWork({ ...editingWork, lists: value.split(',').map(item => item.trim()).filter(Boolean) })} />
          <label className="block text-sm text-stone-600">소개</label>
          <textarea value={editingWork.description ?? ''} onChange={event => setEditingWork({ ...editingWork, description: event.target.value })} className="w-full min-h-28 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </Modal>
      )}

      {editingEdition && (
        <Modal title="판본 수정" onClose={() => setEditingEdition(null)} onSave={() => saveEdition().catch(console.error)}>
          <EditField label="출판사" value={editingEdition.publisher} onChange={value => setEditingEdition({ ...editingEdition, publisher: value })} />
          <EditField label="ISBN" value={editingEdition.isbn} onChange={value => setEditingEdition({ ...editingEdition, isbn: value })} />
          <EditField label="권수" value={editingEdition.volume_number} onChange={value => setEditingEdition({ ...editingEdition, volume_number: value })} />
          <EditField label="쪽수" type="number" value={String(editingEdition.page_count ?? 0)} onChange={value => setEditingEdition({ ...editingEdition, page_count: Number(value) || 0 })} />
          <EditField label="표지 URL" value={editingEdition.cover_url} onChange={value => setEditingEdition({ ...editingEdition, cover_url: value })} />
        </Modal>
      )}
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-stone-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
    </label>
  );
}

function Modal({ title, children, onClose, onSave }: { title: string; children: ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-stone-900">{title}</h3>
          <button onClick={onClose} className="text-stone-400"><X size={18} /></button>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-stone-200 rounded-lg">취소</button>
          <button onClick={onSave} className="px-4 py-2 text-sm bg-stone-900 text-white rounded-lg">저장</button>
        </div>
      </div>
    </div>
  );
}

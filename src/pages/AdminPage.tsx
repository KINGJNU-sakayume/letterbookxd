import { useState, useEffect } from 'react';
import { PlusCircle, PenTool, BookOpen, Library, Search, Loader2, CheckCircle2, AlertCircle, Layers, GitBranch, Database, Pencil, Trash2, Save, X } from 'lucide-react';
import { fetchAllWorks, insertWork, insertEdition, extractVolumeFromTitle, getAladinDetail } from '../services/db';
import { buildAladinFetchUrl } from '../services/api';
import { supabase } from '../lib/supabase';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowchartEditor } from '../components/flowchart';
import type { DbWork } from '../services/db';
import { Field, TextArea, StatusDisplay, type StatusMsg } from '../components/admin/FormControls';

type Tab = 'manage' | 'work' | 'edition' | 'author' | 'series' | 'flowchart';

// [M-1] series 타입 정의
interface SeriesItem {
  id: string;
  title: string;
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('manage');

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">관리자 큐레이션</h1>
          <p className="text-sm text-stone-500">작품, 판본, 작가 및 시리즈 데이터를 직접 등록합니다.</p>
        </div>
        <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto hide-scrollbar">
          <TabBtn active={tab === 'manage'} onClick={() => setTab('manage')} icon={<Database size={15} />} label="데이터 관리" />
          <TabBtn active={tab === 'work'} onClick={() => setTab('work')} icon={<BookOpen size={15} />} label="작품 추가" />
          <TabBtn active={tab === 'edition'} onClick={() => setTab('edition')} icon={<Library size={15} />} label="판본 추가" />
          <TabBtn active={tab === 'author'} onClick={() => setTab('author')} icon={<PenTool size={15} />} label="작가 추가" />
          <TabBtn active={tab === 'series'} onClick={() => setTab('series')} icon={<Layers size={15} />} label="시리즈 추가" />
          <TabBtn active={tab === 'flowchart'} onClick={() => setTab('flowchart')} icon={<GitBranch size={15} />} label="플로우차트 편집" />
        </div>
        <div className={`bg-white rounded-xl border border-stone-200 shadow-sm ${tab === 'flowchart' ? 'p-0 overflow-hidden' : 'p-6'}`}>
          {tab === 'manage' ? <ManageLibraryPanel />
           : tab === 'work' ? <WorkForm />
           : tab === 'edition' ? <EditionForm />
           : tab === 'author' ? <AuthorForm />
           : tab === 'series' ? <SeriesForm />
           : <FlowchartEditorWrapper />}
        </div>
      </div>
    </main>
  );
}

interface ManageWork {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  editions: { id: string }[];
}

function ManageLibraryPanel() {
  const [works, setWorks] = useState<ManageWork[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ManageWork | null>(null);
  const [draft, setDraft] = useState({ title: '', author: '', genre: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from('works')
      .select('id,title,author,genre,description,editions(id)')
      .order('title');
    if (error) setStatus({ type: 'error', text: error.message });
    else setWorks((data ?? []) as ManageWork[]);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  function openEdit(work: ManageWork) {
    setEditing(work);
    setDraft({
      title: work.title,
      author: work.author,
      genre: work.genre ?? '',
      description: work.description ?? '',
    });
  }

  async function saveEdit() {
    if (!editing || !draft.title.trim() || !draft.author.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('works').update({
      title: draft.title.trim(),
      author: draft.author.trim(),
      genre: draft.genre.trim() || null,
      description: draft.description.trim() || null,
    }).eq('id', editing.id);
    setSaving(false);
    if (error) {
      setStatus({ type: 'error', text: error.message });
      return;
    }
    setEditing(null);
    setStatus({ type: 'success', text: '작품 정보를 수정했습니다.' });
    await reload();
  }

  async function deleteWork(work: ManageWork) {
    if (!window.confirm(`"${work.title}" 작품과 연결된 판본/기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setSaving(true);
    const { error: logsError } = await supabase.from('logs').delete().eq('work_id', work.id);
    if (logsError) { setStatus({ type: 'error', text: logsError.message }); setSaving(false); return; }
    const { error: editionsError } = await supabase.from('editions').delete().eq('work_id', work.id);
    if (editionsError) { setStatus({ type: 'error', text: editionsError.message }); setSaving(false); return; }
    const { error } = await supabase.from('works').delete().eq('id', work.id);
    setSaving(false);
    if (error) setStatus({ type: 'error', text: error.message });
    else {
      setStatus({ type: 'success', text: `"${work.title}"을 삭제했습니다.` });
      await reload();
    }
  }

  const filtered = works.filter(w =>
    !query.trim() || `${w.title} ${w.author} ${w.genre ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-stone-900">작품 데이터 관리</h2>
          <p className="text-xs text-stone-500 mt-1">등록된 작품을 검색하고 수정·삭제합니다.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="제목·작가 검색"
            className="pl-9 pr-3 py-2 rounded-lg border border-stone-300 text-sm outline-none focus:ring-2 focus:ring-stone-400" />
        </div>
      </div>
      <StatusDisplay status={status} />
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-stone-400" /></div>
      ) : (
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="max-h-[480px] overflow-y-auto divide-y divide-stone-100">
            {filtered.map(work => (
              <div key={work.id} className="p-3 flex items-center gap-3 bg-white hover:bg-stone-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{work.title}</p>
                  <p className="text-xs text-stone-500 truncate">{work.author} · 판본 {work.editions?.length ?? 0}개{work.genre ? ` · ${work.genre}` : ''}</p>
                </div>
                <button onClick={()=>openEdit(work)} className="p-2 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900" title="수정"><Pencil size={14}/></button>
                <button onClick={()=>deleteWork(work)} disabled={saving} className="p-2 rounded-lg border border-stone-200 text-stone-400 hover:text-rose-600" title="삭제"><Trash2 size={14}/></button>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-stone-400 text-center py-10">검색 결과가 없습니다.</p>}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[70] bg-stone-900/50 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-stone-900">작품 수정</h3>
              <button onClick={()=>setEditing(null)} className="text-stone-400"><X size={18}/></button>
            </div>
            <div className="space-y-4">
              <Field label="제목 *" name="title" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} />
              <Field label="작가 *" name="author" value={draft.author} onChange={e=>setDraft(d=>({...d,author:e.target.value}))} />
              <Field label="장르" name="genre" value={draft.genre} onChange={e=>setDraft(d=>({...d,genre:e.target.value}))} />
              <TextArea label="작품 소개" name="description" value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} rows={5} />
            </div>
            <button onClick={saveEdit} disabled={saving} className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowchartEditorWrapper() {
  return (
    <ReactFlowProvider>
      <FlowchartEditor />
    </ReactFlowProvider>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
        active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {icon}{label}
    </button>
  );
}

function WorkForm() {
  const [form, setForm] = useState({
    title: '', author: '', genre: '', lists: '', description: '', ai_translation: '',
    series_id: '', series_order: '',
  });
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]); // [M-1] 타입 명시
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  useEffect(() => {
    async function fetchSeries() {
      const { data } = await supabase.from('series').select('id, title').order('title');
      if (data) setSeriesList(data as SeriesItem[]);
    }
    fetchSeries();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (e.target instanceof HTMLTextAreaElement) {
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setStatus({ type: 'error', text: '제목과 저자는 필수입니다.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const listArray = form.lists.split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        title: form.title, author: form.author, genre: form.genre,
        description: form.description, ai_translation: form.ai_translation,
        lists: listArray,
        series_id: form.series_id || null,
        series_order: form.series_order ? parseFloat(form.series_order) : null,
      };
      const work = await insertWork(payload as Parameters<typeof insertWork>[0]);
      setStatus({ type: 'success', text: `"${work.title}" 작품이 등록되었습니다.` });
      setForm({ title: '', author: '', genre: '', lists: '', description: '', ai_translation: '', series_id: '', series_order: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '등록 실패' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <Field label="작품 제목 *" name="title" value={form.title} onChange={handleChange} placeholder="예: 닥터 지바고" />
      <Field label="저자 *" name="author" value={form.author} onChange={handleChange} placeholder="예: 보리스 파스테르나크" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="장르" name="genre" value={form.genre} onChange={handleChange} placeholder="예: 러시아 소설" />
        <Field label="리스트 (쉼표로 구분)" name="lists" value={form.lists} onChange={handleChange} placeholder="예: 세계문학전집, 스테디셀러" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 bg-stone-50 rounded-xl border border-stone-100">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">시리즈 선택 (선택)</label>
          <select
            name="series_id" value={form.series_id} onChange={handleChange}
            className="w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            <option value="">-- 단권이거나 시리즈 아님 --</option>
            {seriesList.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">시리즈 내 순서 (선택)</label>
          <input
            type="number" step="0.5" name="series_order" value={form.series_order} onChange={handleChange}
            placeholder="예: 1, 1.5, 2" disabled={!form.series_id}
            className="w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:opacity-50 disabled:bg-stone-200"
          />
        </div>
      </div>
      <TextArea label="작품 소개" name="description" value={form.description} onChange={handleChange} placeholder="내용이 많아지면 박스가 자동으로 늘어납니다..." rows={3} />
      <TextArea label="AI 번역 문단" name="ai_translation" value={form.ai_translation} onChange={handleChange} placeholder="AI 번역 문단을 입력하세요..." rows={3} />
      <StatusDisplay status={status} />
      <div className="pt-2">
        <button type="submit" disabled={loading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-all shadow-md">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
          작품 등록하기
        </button>
      </div>
    </form>
  );
}

function SeriesForm() {
  const [form, setForm] = useState({ title: '', author: '', genre: '', description: '', cover_url: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (e.target instanceof HTMLTextAreaElement) {
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setStatus({ type: 'error', text: '시리즈 제목과 원작자는 필수입니다.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const { error } = await supabase.from('series').insert([{
        title: form.title, author: form.author, genre: form.genre,
        description: form.description, cover_url: form.cover_url || null,
      }]);
      if (error) throw error;
      setStatus({ type: 'success', text: `"${form.title}" 시리즈가 생성되었습니다!` });
      setForm({ title: '', author: '', genre: '', description: '', cover_url: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '등록 실패' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <Field label="시리즈명 *" name="title" value={form.title} onChange={handleChange} placeholder="예: 얼음과 불의 노래" />
      <Field label="원작자 *" name="author" value={form.author} onChange={handleChange} placeholder="예: 조지 R.R. 마틴" />
      <Field label="시리즈 장르" name="genre" value={form.genre} onChange={handleChange} placeholder="예: 다크 판타지, 원작소설" />
      <Field label="대표 표지 URL (선택)" name="cover_url" value={form.cover_url} onChange={handleChange} placeholder="비워두면 1부 표지가 자동 적용됩니다." />
      <TextArea label="시리즈 세계관 설명" name="description" value={form.description} onChange={handleChange} placeholder="시리즈 전체를 아우르는 배경이나 줄거리를 입력하세요..." rows={4} />
      <StatusDisplay status={status} />
      <div className="pt-2">
        <button type="submit" disabled={loading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-all shadow-md">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
          시리즈 생성하기
        </button>
      </div>
    </form>
  );
}

function EditionForm() {
  const [works, setWorks] = useState<DbWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(true);
  const [form, setForm] = useState({ work_id: '', publisher: '', isbn: '', cover_url: '', excerpt: '', volume_number: '', page_count: '' });
  const [isbnQuery, setIsbnQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [searchResults, setSearchResults] = useState<AladinBookResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchAllWorks().then(setWorks).finally(() => setWorksLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  // [H-2] cors-anywhere → vite proxy(/aladin-api) 사용
  async function handleSearch() {
    const query = isbnQuery.trim();
    if (!query) return;
    setIsSearching(true);
    setSearchResults([]);
    setStatus(null);
    try {
      const params = new URLSearchParams({
        Query: query, QueryType: 'Keyword',
        MaxResults: '10', start: '1', SearchTarget: 'Book', output: 'js', Version: '20131101',
      });
      const response = await fetch(buildAladinFetchUrl('ItemSearch.aspx', params));
      const data = await response.json();
      if (data.item && data.item.length > 0) {
        setSearchResults(data.item);
        setStatus({ type: 'success', text: `"${query}" 검색 결과 ${data.item.length}건을 찾았습니다.` });
      } else {
        setStatus({ type: 'error', text: '검색 결과가 없습니다.' });
      }
    } catch (err) {
      console.error('검색 에러:', err);
      setStatus({ type: 'error', text: '알라딘 API 호출 중 오류가 발생했습니다.' });
    } finally {
      setIsSearching(false);
    }
  }

  const handleSelectBook = async (book: AladinBookResult) => {
    const isbn = book.isbn13 || book.isbn;
    const suggested = extractVolumeFromTitle(book.title);
    setForm((f) => ({ ...f, isbn, publisher: book.publisher, cover_url: book.cover.replace('coversum', 'cover500'), volume_number: suggested || '', page_count: '' }));
    setSearchResults([]);
    setIsbnQuery(book.title);
    setStatus({ type: 'success', text: '상세 정보(쪽수)를 가져오는 중...' });
    try {
      const detail = await getAladinDetail(isbn);
      if (detail && detail.page_count) {
        setForm(f => ({ ...f, page_count: detail.page_count.toString() }));
        setStatus({ type: 'success', text: `"${book.title}" 정보를 가져왔습니다. (${detail.page_count}쪽)` });
      } else {
        setStatus({ type: 'error', text: '쪽수 정보를 가져오지 못했습니다. 수동으로 입력해 주세요.' });
      }
    } catch {
      setStatus({ type: 'error', text: '상세 정보 조회 중 오류가 발생했습니다.' });
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.work_id) { setStatus({ type: 'error', text: '작품을 선택해주세요.' }); return; }
    if (!form.publisher.trim() || !form.isbn.trim()) { setStatus({ type: 'error', text: '출판사와 ISBN은 필수입니다.' }); return; }
    setLoading(true);
    setStatus(null);
    try {
      const submissionData = { ...form, page_count: form.page_count ? parseInt(form.page_count, 10) : 0 };
      await insertEdition(submissionData);
      setStatus({ type: 'success', text: `판본이 등록되었습니다. (${submissionData.page_count}p)` });
      setForm({ work_id: form.work_id, publisher: '', isbn: '', cover_url: '', excerpt: '', volume_number: '', page_count: '' });
      setIsbnQuery('');
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '등록 실패' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1.5">작품 선택 *</label>
        {worksLoading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500"><Loader2 size={14} className="animate-spin" /> 불러오는 중...</div>
        ) : (
          <select name="work_id" value={form.work_id} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400">
            <option value="">작품을 선택하세요</option>
            {works.map((w) => <option key={w.id} value={w.id}>{w.title} — {w.author}</option>)}
          </select>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1.5">도서 검색 (제목/저자)</label>
        <div className="flex gap-2 relative">
          <input
            type="text" value={isbnQuery} onChange={(e) => setIsbnQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
            placeholder="책 제목 또는 저자 입력"
            className="flex-1 px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <button type="button" onClick={handleSearch} disabled={isSearching} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors">
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}검색
          </button>
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {searchResults.map((book) => (
                <button key={book.isbn13 || book.isbn} type="button" onClick={() => handleSelectBook(book)} className="w-full flex items-center gap-3 p-3 hover:bg-stone-50 border-b border-stone-100 last:border-0 text-left transition-colors">
                  <img src={book.cover} alt="" className="w-10 h-14 object-cover rounded shadow-sm shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">{book.title}</p>
                    <p className="text-[11px] text-stone-500 truncate">{book.author} | {book.publisher}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="ISBN *" name="isbn" value={form.isbn} onChange={handleChange} placeholder="978..." />
        <Field label="출판사 *" name="publisher" value={form.publisher} onChange={handleChange} placeholder="민음사" />
        <Field label="쪽수" name="page_count" value={form.page_count} onChange={handleChange} placeholder="예: 450" />
        <Field label="권수" name="volume_number" value={form.volume_number} onChange={handleChange} placeholder="1, 상, 하" />
      </div>
      <Field label="표지 이미지 URL" name="cover_url" value={form.cover_url} onChange={handleChange} placeholder="https://..." />
      {form.cover_url && (
        <div className="flex items-center gap-3 p-3 bg-stone-100 rounded-lg">
          <img src={form.cover_url} alt="표지 미리보기" className="h-20 object-contain rounded shadow-sm" />
          <span className="text-xs text-stone-500">표지 미리보기</span>
        </div>
      )}
      <TextArea label="이 판본의 번역 문단" name="excerpt" value={form.excerpt} onChange={handleChange} placeholder="이 판본 번역자의 첫 문단을 입력하세요..." rows={5} />
      <StatusDisplay status={status} />
      <button type="submit" disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}판본 등록
      </button>
    </form>
  );
}

// [M-1] 알라딘 검색 결과 타입 정의
interface AladinBookResult {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
}

function AuthorForm() {
  const [form, setForm] = useState({ name: '', birth_death: '', country: '', awards: '', bio: '', photo_url: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (e.target instanceof HTMLTextAreaElement) {
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setStatus({ type: 'error', text: '작가 이름은 필수입니다.' }); return; }
    setLoading(true);
    setStatus(null);
    try {
      const awardArray = form.awards.split(',').map(s => s.trim()).filter(Boolean);
      const { error } = await supabase.from('authors').upsert({ ...form, awards: awardArray }, { onConflict: 'name' });
      if (error) throw error;
      setStatus({ type: 'success', text: `"${form.name}" 작가 정보가 저장되었습니다.` });
      setForm({ name: '', birth_death: '', country: '', awards: '', bio: '', photo_url: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '등록 실패' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <Field label="작가 이름 *" name="name" value={form.name} onChange={handleChange} placeholder="예: 표도르 도스토옙스키" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="생몰년도" name="birth_death" value={form.birth_death} onChange={handleChange} placeholder="예: 1821 — 1881" />
        <Field label="국가" name="country" value={form.country} onChange={handleChange} placeholder="예: 러시아" />
      </div>
      <Field label="수상 내역 (쉼표로 구분)" name="awards" value={form.awards} onChange={handleChange} placeholder="예: 노벨문학상, 부커상" />
      <Field label="작가 사진 URL" name="photo_url" value={form.photo_url} onChange={handleChange} placeholder="https://..." />
      {form.photo_url && (
        <div className="flex items-center gap-3 p-3 bg-stone-100 rounded-lg">
          <img src={form.photo_url} alt="미리보기" className="h-20 w-16 object-cover rounded shadow-sm" />
          <span className="text-xs text-stone-500">사진 미리보기</span>
        </div>
      )}
      <TextArea label="작가 소개" name="bio" value={form.bio} onChange={handleChange} placeholder="작가의 생애나 문학적 특징을 입력하세요..." rows={4} />
      <StatusDisplay status={status} />
      <button type="submit" disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}작가 정보 저장
      </button>
    </form>
  );
}

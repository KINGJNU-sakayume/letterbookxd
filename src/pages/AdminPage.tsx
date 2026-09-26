import { useState, useEffect, useMemo, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { fetchAllWorks, insertWork, insertEdition, extractVolumeFromTitle, getAladinDetail } from '../services/db';
import { buildAladinFetchUrl } from '../services/api';
import { supabase } from '../lib/supabase';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowchartEditor } from '../components/flowchart';
import type { DbWork } from '../services/db';
import { Field, TextArea, SelectField, StatusDisplay, FormHeader, type StatusMsg } from '../components/admin/FormControls';
import { Page, PageHeader } from '../components/layout/Page';
import { Tabs } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { useConfirm } from '../components/ui/confirm';
import { BookCover } from '../components/ui/BookCover';
import { Portrait } from '../components/ui/Portrait';
import { PageLoader, Spinner } from '../components/ui/States';
import { useAuthStore } from '../store/authStore';
import { useCatalogStore } from '../store/catalogStore';
import { toast } from '../store/toastStore';
import { josa, matchesQuery } from '../lib/hangul';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Tab = 'manage' | 'work' | 'edition' | 'author' | 'series' | 'flowchart';

const TABS: { value: Tab; label: string; description: string }[] = [
  { value: 'manage', label: '작품 목록', description: '등록된 작품을 찾아 고치거나 지웁니다.' },
  { value: 'work', label: '작품 추가', description: '새 작품을 서가에 올립니다. 판본은 다음 단계에서 붙입니다.' },
  { value: 'edition', label: '판본 추가', description: '알라딘에서 책을 찾아 출판사별 판본과 권을 붙입니다.' },
  { value: 'author', label: '작가 추가', description: '같은 이름이 있으면 덮어씁니다.' },
  { value: 'series', label: '시리즈 추가', description: '여러 작품을 묶는 시리즈를 만듭니다.' },
  { value: 'flowchart', label: '읽기 순서', description: '작가별 추천 읽기 순서를 그립니다.' },
];

interface SeriesItem {
  id: string;
  title: string;
}

/** 서가 데이터가 바뀌면 둘러보기·검색 목록을 다시 불러온다 */
function refreshCatalog() {
  void useCatalogStore.getState().reload();
}

function autoGrow(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  if (e.target instanceof HTMLTextAreaElement) {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }
}

export function AdminPage() {
  useDocumentTitle('서가 관리');
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'manage';
  const current = TABS.find((t) => t.value === tab)!;
  const { session, signOut } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);

  function select(next: Tab) {
    setParams(next === 'manage' ? {} : { tab: next }, { replace: true });
  }

  async function handleSignOut() {
    setSigningOut(true);
    const ok = await signOut();
    setSigningOut(false);
    if (!ok) toast('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
  }

  return (
    <Page>
      <PageHeader
        title="서가 관리"
        description="작품, 판본, 작가, 시리즈와 읽기 순서를 고칩니다."
        actions={
          <div className="flex items-center gap-3 text-[13.5px] text-ink-muted">
            <span className="hidden truncate sm:inline">{session?.user.email}</span>
            <button type="button" disabled={signingOut} onClick={() => void handleSignOut()} className="btn btn-secondary btn-sm">
              {signingOut && <Spinner />}
              로그아웃
            </button>
          </div>
        }
      />

      <div className="lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[200px_minmax(0,1fr)] 2xl:gap-16">
        <nav aria-label="관리 메뉴" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {TABS.map((t) => {
              const active = t.value === tab;
              return (
                <li key={t.value}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => select(t.value)}
                    className={`relative w-full py-[7px] pl-3 text-left text-[14.5px] transition-colors ${
                      active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <span aria-hidden className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full ${active ? 'bg-ink' : 'bg-transparent'}`} />
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <Tabs label="관리 메뉴" className="mb-6 lg:hidden" value={tab} onChange={select} items={TABS.map((t) => ({ value: t.value, label: t.label }))} />
          {tab === 'flowchart' ? (
            <>
              <FormHeader title={current.label} description={current.description} />
              <div className="panel overflow-hidden">
                <ReactFlowProvider>
                  <FlowchartEditor />
                </ReactFlowProvider>
              </div>
            </>
          ) : (
            <>
              <FormHeader title={current.label} description={current.description} />
              {tab === 'manage' ? <ManageLibraryPanel />
                : tab === 'work' ? <WorkForm />
                : tab === 'edition' ? <EditionForm />
                : tab === 'author' ? <AuthorForm />
                : <SeriesForm />}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function FormLayout({ fields, aside, footer }: { fields: ReactNode; aside?: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid gap-x-12 gap-y-8 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 max-w-4xl space-y-5">
        {fields}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">{footer}</div>
      </div>
      {aside && <aside className="min-w-0 2xl:sticky 2xl:top-24 2xl:self-start">{aside}</aside>}
    </div>
  );
}

function PreviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel p-5">
      <p className="mb-4 text-[12.5px] font-medium text-ink-faint">{title}</p>
      {children}
    </div>
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
  const confirm = useConfirm();

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

  async function saveEdit(e?: FormEvent) {
    e?.preventDefault();
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
    setStatus({ type: 'success', text: `“${draft.title.trim()}” 정보를 고쳤습니다.` });
    refreshCatalog();
    await reload();
  }

  async function deleteWork(work: ManageWork) {
    const ok = await confirm({
      title: `${josa(`“${work.title}”`, '을', '를')} 지울까요?`,
      description: '이 작품의 판본과 모든 읽기 기록이 함께 지워지며 되돌릴 수 없습니다.',
      confirmLabel: '영구히 지우기',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    const { error: logsError } = await supabase.from('logs').delete().eq('work_id', work.id);
    if (logsError) { setStatus({ type: 'error', text: logsError.message }); setSaving(false); return; }
    const { error: editionsError } = await supabase.from('editions').delete().eq('work_id', work.id);
    if (editionsError) { setStatus({ type: 'error', text: editionsError.message }); setSaving(false); return; }
    const { error } = await supabase.from('works').delete().eq('id', work.id);
    setSaving(false);
    if (error) setStatus({ type: 'error', text: error.message });
    else {
      setStatus({ type: 'success', text: `${josa(`“${work.title}”`, '을', '를')} 지웠습니다.` });
      refreshCatalog();
      await reload();
    }
  }

  const filtered = useMemo(
    () => works.filter(w => !query.trim() || matchesQuery(`${w.title} ${w.author} ${w.genre ?? ''}`, query.trim())),
    [works, query],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-line bg-paper-raised px-3 transition-colors focus-within:border-ink-soft sm:max-w-sm">
          <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="제목, 작가, 분류로 찾기"
            aria-label="작품 찾기"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint"
          />
        </div>
        <p className="tnum text-[13.5px] text-ink-muted">{loading ? '불러오는 중' : `${filtered.length} / ${works.length}편`}</p>
        <Link to="?tab=work" replace className="btn btn-primary btn-sm ml-auto">작품 추가</Link>
      </div>
      <StatusDisplay status={status} />
      {loading ? (
        <PageLoader />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-ink-faint">
                <th scope="col" className="px-4 py-2.5 font-medium">제목</th>
                <th scope="col" className="px-4 py-2.5 font-medium">작가</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">분류</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">판본</th>
                <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">관리</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map(work => (
                <tr key={work.id} className="transition-colors hover:bg-paper">
                  <td className="max-w-0 px-4 py-2.5">
                    <Link to={`/book/${work.id}`} className="block truncate text-[14.5px] font-semibold text-ink decoration-line-strong underline-offset-4 hover:underline">{work.title}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-[14px] text-ink-soft">{work.author}</td>
                  <td className="hidden max-w-[16rem] truncate px-4 py-2.5 text-[13px] text-ink-muted xl:table-cell">{work.genre || '—'}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[14px] text-ink-soft">{work.editions?.length ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex gap-0.5">
                      <button type="button" onClick={() => openEdit(work)} className="btn-icon h-8 w-8" aria-label={`${work.title} 고치기`}><Pencil size={14} /></button>
                      <button type="button" onClick={() => void deleteWork(work)} disabled={saving} className="btn-icon h-8 w-8 hover:text-seal" aria-label={`${work.title} 지우기`}><Trash2 size={14} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-10 text-center text-[14px] text-ink-muted">맞는 작품이 없습니다.</p>}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="작품 고치기"
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost">취소</button>
            <button type="submit" form="edit-work-form" disabled={saving || !draft.title.trim() || !draft.author.trim()} className="btn btn-primary">
              {saving && <Spinner className="border-paper/40 border-t-paper-raised" />}
              저장
            </button>
          </>
        }
      >
        <form id="edit-work-form" onSubmit={saveEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="제목" required name="title" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
            <Field label="작가" required name="author" value={draft.author} onChange={e => setDraft(d => ({ ...d, author: e.target.value }))} />
          </div>
          <Field label="분류" name="genre" value={draft.genre} onChange={e => setDraft(d => ({ ...d, genre: e.target.value }))} hint="쉼표로 나눕니다. 예: 러시아, 고전" />
          <TextArea label="작품 소개" name="description" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} rows={6} />
        </form>
      </Dialog>
    </div>
  );
}

function WorkForm() {
  const [form, setForm] = useState({
    title: '', author: '', genre: '', lists: '', description: '', ai_translation: '',
    series_id: '', series_order: '',
  });
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
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
    autoGrow(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setStatus({ type: 'error', text: '제목과 작가는 꼭 적어야 합니다.' });
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
      setStatus({ type: 'success', text: `${josa(`“${work.title}”`, '을', '를')} 올렸습니다. 이제 판본을 붙여 주세요.` });
      setForm({ title: '', author: '', genre: '', lists: '', description: '', ai_translation: '', series_id: '', series_order: '' });
      refreshCatalog();
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '올리지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormLayout
        fields={
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="제목" required name="title" value={form.title} onChange={handleChange} placeholder="닥터 지바고" />
              <Field label="작가" required name="author" value={form.author} onChange={handleChange} placeholder="보리스 파스테르나크" />
              <Field label="분류" name="genre" value={form.genre} onChange={handleChange} placeholder="러시아, 고전" hint="쉼표로 나눕니다. 나라 이름을 넣으면 통계 지도에 잡힙니다." />
              <Field label="목록" name="lists" value={form.lists} onChange={handleChange} placeholder="세계문학전집, 노벨 연구소 선정 최고의 책" hint="쉼표로 나눕니다." />
            </div>
            <div className="grid gap-5 rounded-md border border-line-soft bg-paper p-4 sm:grid-cols-2">
              <SelectField label="시리즈" name="series_id" value={form.series_id} onChange={handleChange}>
                <option value="">시리즈에 속하지 않음</option>
                {seriesList.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </SelectField>
              <div>
                <label htmlFor="series-order" className="field-label">시리즈 안 순서</label>
                <input
                  id="series-order"
                  type="number" step="0.5" name="series_order" value={form.series_order} onChange={handleChange}
                  placeholder="1, 1.5, 2" disabled={!form.series_id}
                  className="field"
                />
              </div>
            </div>
            <TextArea label="작품 소개" name="description" value={form.description} onChange={handleChange} rows={5} />
            <TextArea label="AI 번역 문단" name="ai_translation" value={form.ai_translation} onChange={handleChange} rows={4} hint="작품 화면의 ‘번역 비교’에 판본별 번역과 나란히 나옵니다." />
            <StatusDisplay status={status} />
          </>
        }
        footer={
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
            {loading && <Spinner className="border-paper/40 border-t-paper-raised" />}
            작품 올리기
          </button>
        }
        aside={
          <PreviewCard title="미리보기">
            <BookCover src={null} alt="" title={form.title || '제목'} author={form.author || '작가'} className="w-36" />
            <p className="mt-4 font-serif text-[20px] font-bold leading-snug text-ink">{form.title || '제목'}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{form.author || '작가'}</p>
          </PreviewCard>
        }
      />
    </form>
  );
}

function SeriesForm() {
  const [form, setForm] = useState({ title: '', author: '', genre: '', description: '', cover_url: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    autoGrow(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setStatus({ type: 'error', text: '시리즈 이름과 작가는 꼭 적어야 합니다.' });
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
      setStatus({ type: 'success', text: `“${form.title}” 시리즈를 만들었습니다.` });
      setForm({ title: '', author: '', genre: '', description: '', cover_url: '' });
      refreshCatalog();
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '만들지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormLayout
        fields={
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="시리즈 이름" required name="title" value={form.title} onChange={handleChange} placeholder="얼음과 불의 노래" />
              <Field label="작가" required name="author" value={form.author} onChange={handleChange} placeholder="조지 R. R. 마틴" />
              <Field label="분류" name="genre" value={form.genre} onChange={handleChange} placeholder="미국, 판타지" hint="쉼표로 나눕니다." />
              <Field label="대표 표지 주소" type="url" name="cover_url" value={form.cover_url} onChange={handleChange} placeholder="https://" hint="비워 두면 1부 표지를 씁니다." />
            </div>
            <TextArea label="시리즈 소개" name="description" value={form.description} onChange={handleChange} rows={5} />
            <StatusDisplay status={status} />
          </>
        }
        footer={
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
            {loading && <Spinner className="border-paper/40 border-t-paper-raised" />}
            시리즈 만들기
          </button>
        }
        aside={
          <PreviewCard title="표지 미리보기">
            <BookCover src={form.cover_url || null} alt="" title={form.title || '시리즈'} author={form.author} className="w-36" />
          </PreviewCard>
        }
      />
    </form>
  );
}

// 알라딘 검색 결과
interface AladinBookResult {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
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

  const sortedWorks = useMemo(() => [...works].sort((a, b) => a.title.localeCompare(b.title, 'ko')), [works]);
  const selectedWork = works.find(w => w.id === form.work_id);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    autoGrow(e);
  }

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
      } else {
        setStatus({ type: 'error', text: '검색 결과가 없습니다.' });
      }
    } catch (err) {
      console.error('검색 에러:', err);
      setStatus({ type: 'error', text: '알라딘 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
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
    setStatus({ type: 'success', text: '쪽수를 가져오는 중입니다.' });
    try {
      const detail = await getAladinDetail(isbn);
      if (detail && detail.page_count) {
        setForm(f => ({ ...f, page_count: detail.page_count.toString() }));
        setStatus({ type: 'success', text: `“${book.title}” 정보를 채웠습니다. (${detail.page_count}쪽)` });
      } else {
        setStatus({ type: 'error', text: '쪽수를 가져오지 못했습니다. 직접 적어 주세요.' });
      }
    } catch {
      setStatus({ type: 'error', text: '상세 정보를 가져오지 못했습니다.' });
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.work_id) { setStatus({ type: 'error', text: '작품을 먼저 골라 주세요.' }); return; }
    if (!form.publisher.trim() || !form.isbn.trim()) { setStatus({ type: 'error', text: '출판사와 ISBN은 꼭 적어야 합니다.' }); return; }
    setLoading(true);
    setStatus(null);
    try {
      const submissionData = { ...form, page_count: form.page_count ? parseInt(form.page_count, 10) : 0 };
      await insertEdition(submissionData);
      setStatus({ type: 'success', text: `판본을 붙였습니다. (${submissionData.page_count}쪽)` });
      setForm({ work_id: form.work_id, publisher: '', isbn: '', cover_url: '', excerpt: '', volume_number: '', page_count: '' });
      setIsbnQuery('');
      refreshCatalog();
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '붙이지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormLayout
        fields={
          <>
            {worksLoading ? (
              <p className="flex items-center gap-2 text-[14px] text-ink-muted"><Spinner /> 작품 목록을 불러오는 중</p>
            ) : (
              <SelectField label="작품" name="work_id" value={form.work_id} onChange={handleChange}>
                <option value="">판본을 붙일 작품을 고르세요</option>
                {sortedWorks.map((w) => <option key={w.id} value={w.id}>{w.title} — {w.author}</option>)}
              </SelectField>
            )}

            <div>
              <label htmlFor="aladin-query" className="field-label">알라딘에서 찾기</label>
              <div className="flex gap-2">
                <input
                  id="aladin-query"
                  type="search"
                  value={isbnQuery}
                  onChange={(e) => setIsbnQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                  placeholder="책 제목이나 작가"
                  className="field flex-1"
                />
                <button type="button" onClick={handleSearch} disabled={isSearching} className="btn btn-secondary h-auto px-4">
                  {isSearching ? <Spinner /> : <Search size={15} aria-hidden />}
                  찾기
                </button>
              </div>
              {searchResults.length > 0 && (
                <ul className="panel mt-2 max-h-80 divide-y divide-line-soft overflow-y-auto" aria-label="알라딘 검색 결과">
                  {searchResults.map((book) => (
                    <li key={book.isbn13 || book.isbn}>
                      <button type="button" onClick={() => handleSelectBook(book)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-paper">
                        <BookCover src={book.cover} alt="" title={book.title} className="w-9 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">{book.title}</span>
                          <span className="block truncate text-[12.5px] text-ink-muted">{book.author} · {book.publisher}</span>
                        </span>
                        <span className="tnum hidden shrink-0 text-[12px] text-ink-faint sm:inline">{book.isbn13 || book.isbn}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="ISBN" required name="isbn" value={form.isbn} onChange={handleChange} placeholder="978…" inputMode="numeric" />
              <Field label="출판사" required name="publisher" value={form.publisher} onChange={handleChange} placeholder="민음사" />
              <Field label="쪽수" name="page_count" value={form.page_count} onChange={handleChange} placeholder="450" inputMode="numeric" />
              <Field label="권" name="volume_number" value={form.volume_number} onChange={handleChange} placeholder="1, 상, 하" hint="한 권짜리면 비워 둡니다." />
            </div>
            <Field label="표지 이미지 주소" type="url" name="cover_url" value={form.cover_url} onChange={handleChange} placeholder="https://" />
            <TextArea label="이 판본의 첫 문단" name="excerpt" value={form.excerpt} onChange={handleChange} rows={5} hint="작품 화면의 ‘번역 비교’에 출판사 이름으로 나옵니다." />
            <StatusDisplay status={status} />
          </>
        }
        footer={
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
            {loading && <Spinner className="border-paper/40 border-t-paper-raised" />}
            판본 붙이기
          </button>
        }
        aside={
          <PreviewCard title="판본 미리보기">
            <BookCover src={form.cover_url || null} alt="" title={selectedWork?.title ?? '작품'} author={selectedWork?.author} className="w-36" />
            <p className="mt-4 font-serif text-[18px] font-bold leading-snug text-ink">{selectedWork?.title ?? '작품을 고르세요'}</p>
            <p className="tnum mt-1 text-[13.5px] text-ink-muted">
              {[form.publisher, form.volume_number && `${form.volume_number}권`, form.page_count && `${form.page_count}쪽`].filter(Boolean).join(' · ') || '출판사 · 권 · 쪽수'}
            </p>
          </PreviewCard>
        }
      />
    </form>
  );
}

function AuthorForm() {
  const [form, setForm] = useState({ name: '', birth_death: '', country: '', awards: '', bio: '', photo_url: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    autoGrow(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setStatus({ type: 'error', text: '작가 이름은 꼭 적어야 합니다.' }); return; }
    setLoading(true);
    setStatus(null);
    try {
      const awardArray = form.awards.split(',').map(s => s.trim()).filter(Boolean);
      const { error } = await supabase.from('authors').upsert({ ...form, awards: awardArray }, { onConflict: 'name' });
      if (error) throw error;
      setStatus({ type: 'success', text: `${form.name} 작가 정보를 저장했습니다.` });
      setForm({ name: '', birth_death: '', country: '', awards: '', bio: '', photo_url: '' });
      refreshCatalog();
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '저장하지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormLayout
        fields={
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="작가 이름" required name="name" value={form.name} onChange={handleChange} placeholder="표도르 도스토옙스키" hint="작품에 적은 작가 이름과 똑같이 적어야 연결됩니다." />
              <Field label="생몰년" name="birth_death" value={form.birth_death} onChange={handleChange} placeholder="1821 — 1881" />
              <Field label="나라" name="country" value={form.country} onChange={handleChange} placeholder="러시아" />
              <Field label="수상" name="awards" value={form.awards} onChange={handleChange} placeholder="노벨문학상, 부커상" hint="쉼표로 나눕니다." />
            </div>
            <Field label="사진 주소" type="url" name="photo_url" value={form.photo_url} onChange={handleChange} placeholder="https://" />
            <TextArea label="작가 소개" name="bio" value={form.bio} onChange={handleChange} rows={5} />
            <StatusDisplay status={status} />
          </>
        }
        footer={
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
            {loading && <Spinner className="border-paper/40 border-t-paper-raised" />}
            작가 정보 저장
          </button>
        }
        aside={
          <PreviewCard title="미리보기">
            <Portrait src={form.photo_url || null} name={form.name || '작가'} className="aspect-[3/4] w-36" />
            <p className="mt-4 font-serif text-[20px] font-bold text-ink">{form.name || '작가 이름'}</p>
            <p className="tnum mt-1 text-[13.5px] text-ink-muted">{[form.birth_death, form.country].filter(Boolean).join(' · ') || '생몰년 · 나라'}</p>
          </PreviewCard>
        }
      />
    </form>
  );
}

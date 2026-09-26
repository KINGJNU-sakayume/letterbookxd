import { useState } from 'react';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildAladinFetchUrl } from '../../services/api';
import { extractVolumeFromTitle, getAladinDetail } from '../../services/db';

interface AladinResult {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  description?: string;
  categoryName?: string;
}

function cleanAuthor(author: string) {
  return author.split(/[,(]/)[0].trim();
}

function cleanTitle(title: string) {
  return title.replace(/\[[^\]]*\]/g, '').replace(/\s+-\s+.*$/, '').trim();
}

function normalize(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function QuickAddBook() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AladinResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingIsbn, setSavingIsbn] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        Query: query.trim(),
        QueryType: 'Keyword',
        MaxResults: '20',
        start: '1',
        SearchTarget: 'Book',
        Cover: 'Big',
        output: 'js',
        Version: '20131101',
      });
      const response = await fetch(buildAladinFetchUrl('ItemSearch.aspx', params));
      if (!response.ok) throw new Error('알라딘 검색 실패');
      const data = await response.json();
      setResults((data.item ?? []) as AladinResult[]);
      if (!data.item?.length) setMessage('검색 결과가 없습니다.');
    } catch (error) {
      console.error(error);
      setMessage('검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  }

  async function addBook(book: AladinResult) {
    const isbn = book.isbn13 || book.isbn;
    setSavingIsbn(isbn);
    setMessage('');
    try {
      const title = cleanTitle(book.title);
      const author = cleanAuthor(book.author);
      const [{ data: works, error: worksError }, { data: duplicateEdition }] = await Promise.all([
        supabase.from('works').select('id, title, author'),
        supabase.from('editions').select('id').eq('isbn', isbn).maybeSingle(),
      ]);
      if (worksError) throw worksError;
      if (duplicateEdition) {
        setMessage('이미 같은 ISBN의 판본이 등록되어 있습니다.');
        return;
      }

      let workId = (works ?? []).find(work =>
        normalize(work.title) === normalize(title) &&
        normalize(work.author) === normalize(author)
      )?.id as string | undefined;

      if (!workId) {
        const { data: newWork, error: workError } = await supabase
          .from('works')
          .insert({
            title,
            author,
            genre: book.categoryName ?? '',
            lists: [],
            description: book.description ?? '',
            ai_translation: '',
          })
          .select('id')
          .single();
        if (workError) throw workError;
        workId = newWork.id;
      }

      const { error: authorError } = await supabase
        .from('authors')
        .upsert({ name: author }, { onConflict: 'name' });
      if (authorError) console.warn('작가 upsert 실패:', authorError);

      const detail = await getAladinDetail(isbn);
      const { error: editionError } = await supabase.from('editions').insert({
        work_id: workId,
        publisher: book.publisher,
        isbn,
        excerpt: null,
        cover_url: book.cover?.replace('coversum', 'cover500') ?? '',
        volume_number: extractVolumeFromTitle(book.title),
        page_count: detail?.page_count ?? 0,
      });
      if (editionError) throw editionError;

      setMessage('"' + title + '" 판본을 등록했습니다.');
      setResults(current => current.filter(item => (item.isbn13 || item.isbn) !== isbn));
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : '등록 중 오류가 발생했습니다.');
    } finally {
      setSavingIsbn(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">빠른 도서 등록</h2>
        <p className="text-sm text-stone-500 mt-1">
          알라딘에서 찾은 도서를 선택하면 기존 작품을 자동 탐색하고 작품·작가·판본을 한 번에 저장합니다.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && (event.preventDefault(), search())}
          placeholder="제목, 저자, ISBN 검색"
          className="flex-1 px-3 py-2.5 rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-stone-300"
        />
        <button type="button" onClick={search} disabled={searching} className="px-4 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}검색
        </button>
      </div>
      {message && (
        <div className="px-4 py-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700 flex items-center gap-2">
          <CheckCircle2 size={15} /> {message}
        </div>
      )}
      <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
        {results.map(book => {
          const isbn = book.isbn13 || book.isbn;
          return (
            <div key={isbn} className="p-3 bg-white flex gap-3 items-center">
              <img src={book.cover} alt="" className="w-11 h-16 object-cover rounded shadow-sm shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 line-clamp-1">{book.title}</p>
                <p className="text-xs text-stone-500 mt-1 line-clamp-1">{book.author}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">{book.publisher} · {isbn}</p>
              </div>
              <button type="button" onClick={() => addBook(book)} disabled={savingIsbn === isbn} className="shrink-0 px-3 py-2 rounded-lg border border-stone-300 text-sm font-medium hover:bg-stone-50 disabled:opacity-50">
                {savingIsbn === isbn ? '저장 중…' : '이 책 등록'}
              </button>
            </div>
          );
        })}
        {!results.length && !searching && <div className="p-8 text-center text-sm text-stone-400">검색 결과를 선택해 바로 등록할 수 있습니다.</div>}
      </div>
    </div>
  );
}

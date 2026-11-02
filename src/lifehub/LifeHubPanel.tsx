import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/ui/Dialog';
import { StarRating } from '../components/ui/StarRating';
import { toast } from '../store/toastStore';
import { useLogStore } from '../store/logStore';
import { useCatalogStore, type CatalogEdition, type CatalogWork } from '../store/catalogStore';
import { ensureWorkLoaded } from '../services/bookCache';
import { createEditionSetRef, createVolumeRef } from '../domain/books/identity';
import { dayToIso, findWorks, publishersOf, volumesOf } from './resolve';
import {
  beginConnect, browserDeps, completeStoredCallback, connectAvailable, disconnect, isConnected, LifeHubError,
  rejectLocally, rememberReceipt, sync, type ReadingProposal,
} from './remote';

/** One token exchange per page load, even when effects run twice (StrictMode). */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

const STATE_LABEL = { reading: '읽는 중', completed: '완독' } as const;
const describe = (p: ReadingProposal) =>
  [
    p.title + (p.volume ? ` ${p.volume}권` : ''),
    p.author,
    STATE_LABEL[p.state] + (p.currentPage ? ` · ${p.currentPage}쪽` : ''),
    p.rating ? `별 ${p.rating}개` : null,
    p.liked ? '인생책' : null,
    p.date,
  ].filter(Boolean).join(' · ');

interface Form { state: 'reading' | 'completed'; page: string; rating: number | null; liked: boolean; date: string }

function ReviewDialog({ proposal, onClose, onSaved }: { proposal: ReadingProposal; onClose: () => void; onSaved: () => void }) {
  const works = useCatalogStore((s) => s.works);
  const query = proposal;
  const found = useMemo(() => findWorks(query, works), [query, works]);
  const [work, setWork] = useState<CatalogWork | null>(found.exact);
  const [publisher, setPublisher] = useState<string | null>(() => (found.exact ? publishersOf(found.exact, query).preselected : null));
  const [edition, setEdition] = useState<CatalogEdition | null>(() => {
    if (!found.exact) return null;
    const pub = publishersOf(found.exact, query).preselected;
    return pub === null ? null : volumesOf(found.exact, pub, query.volume).preselected;
  });
  const [form, setForm] = useState<Form>({
    state: proposal.state, page: proposal.currentPage ? String(proposal.currentPage) : '',
    rating: proposal.rating, liked: proposal.liked, date: proposal.date ?? '',
  });
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const existing = useLogStore((s) => (edition ? s.volumeLogs.find((l) => l.volumeId === createVolumeRef(edition.id)) : undefined));

  const pickWork = (w: CatalogWork) => {
    setWork(w);
    const pub = publishersOf(w, query).preselected;
    setPublisher(pub);
    setEdition(pub === null ? null : volumesOf(w, pub, query.volume).preselected);
  };
  const pickPublisher = (pub: string) => {
    setPublisher(pub);
    setEdition(work ? volumesOf(work, pub, query.volume).preselected : null);
  };

  const pageNumber = form.page.trim() === '' ? null : Number(form.page);
  const pageInvalid = pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 20000);
  const dateInvalid = form.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(form.date);

  async function approve() {
    if (!work || publisher === null || !edition || pageInvalid || dateInvalid) return;
    setBusy(true);
    try {
      await ensureWorkLoaded(work.id);
      const volumeId = createVolumeRef(edition.id);
      const store = useLogStore.getState();
      const before = store.getVolumeLog(volumeId);
      await store.upsertVolumeLog({
        volumeId, editionSetId: createEditionSetRef(work.id, publisher), workId: work.id, logType: 'volume',
        readingState: form.state,
        currentPage: form.state === 'reading' ? pageNumber ?? before?.currentPage ?? null : before?.currentPage ?? null,
        liked: form.state === 'completed' ? form.liked || (before?.liked ?? false) : before?.liked ?? false,
        rating: form.state === 'completed' ? form.rating ?? before?.rating ?? null : before?.rating ?? null,
      });
      const saved = useLogStore.getState().getVolumeLog(volumeId);
      if (!saved || saved.readingState !== form.state) return; // the store already showed the error
      if (form.state === 'completed' && form.date) {
        await useLogStore.getState().updateLogMetadata(saved.id, { rating: saved.rating, liked: saved.liked, createdAt: dayToIso(form.date) });
      }
      rememberReceipt(proposal.key, saved.id, browserDeps());
      toast(`${work.title}${edition.volume_number && edition.volume_number !== '1' ? ` ${edition.volume_number}권` : ''}: ${STATE_LABEL[form.state]}으로 기록했습니다.`);
      onSaved();
    } catch (err) {
      console.error('Life Hub 제안 기록 실패:', err);
      toast('기록하지 못했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const publishers = work ? publishersOf(work, query).publishers : [];
  const volumes = work && publisher !== null ? volumesOf(work, publisher, query.volume).volumes : [];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Claude가 제안한 독서 기록"
      description={describe(proposal)}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" disabled={busy || !work || publisher === null || !edition || pageInvalid || dateInvalid} onClick={() => void approve()}>
            {busy ? '기록 중' : '확인하고 기록'}
          </button>
        </div>
      }
    >
      <div className="space-y-5 text-[14.5px]">
        {proposal.note && <p className="rounded-md bg-paper-sunken px-3 py-2 text-ink-muted">“{proposal.note}”</p>}

        <fieldset>
          <legend className="field-label">작품</legend>
          {found.choices.length === 0 ? (
            <p className="text-ink-muted">
              카탈로그에서 「{proposal.title}」을 찾지 못했습니다. 작품을 추가한 뒤 다시 검토하세요.
              <> <Link to="/admin" className="underline underline-offset-2">관리 화면으로</Link></>
            </p>
          ) : (
            <ul className="space-y-1">
              {found.choices.map((w) => (
                <li key={w.id}>
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`${uid}-work`} checked={work?.id === w.id} onChange={() => pickWork(w)} />
                    <span>{w.title} <span className="text-ink-muted">· {w.author}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {work && publishers.length > 1 && (
          <div>
            <label className="field-label" htmlFor={`${uid}-pub`}>판본</label>
            <select id={`${uid}-pub`} className="field field-select" value={publisher ?? ''} onChange={(e) => pickPublisher(e.target.value)}>
              <option value="" disabled>판본을 고르세요</option>
              {publishers.map((p) => <option key={p} value={p}>{p || '출판사 없음'}</option>)}
            </select>
          </div>
        )}

        {work && publisher !== null && volumes.length > 1 && (
          <div>
            <label className="field-label" htmlFor={`${uid}-vol`}>권</label>
            <select id={`${uid}-vol`} className="field field-select" value={edition?.id ?? ''} onChange={(e) => setEdition(volumes.find((v) => v.id === e.target.value) ?? null)}>
              <option value="" disabled>권을 고르세요</option>
              {volumes.map((v) => <option key={v.id} value={v.id}>{v.volume_number || '1'}권</option>)}
            </select>
          </div>
        )}

        {edition && (
          <>
            {existing && existing.readingState !== 'unread' && (
              <p className="text-[13px] text-ink-muted">지금 기록: {STATE_LABEL[existing.readingState]}{existing.currentPage ? ` · ${existing.currentPage}쪽` : ''}{existing.rating ? ` · 별 ${existing.rating}개` : ''}</p>
            )}
            <fieldset className="flex gap-4">
              <legend className="field-label">상태</legend>
              {(['reading', 'completed'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5">
                  <input type="radio" name={`${uid}-state`} checked={form.state === s} onChange={() => setForm((f) => ({ ...f, state: s }))} />
                  {STATE_LABEL[s]}
                </label>
              ))}
            </fieldset>
            {form.state === 'reading' ? (
              <div>
                <label className="field-label" htmlFor={`${uid}-page`}>읽은 쪽</label>
                <input id={`${uid}-page`} type="number" inputMode="numeric" min={1} className="field tnum w-32" value={form.page} aria-invalid={pageInvalid}
                  onChange={(e) => setForm((f) => ({ ...f, page: e.target.value }))} />
              </div>
            ) : (
              <>
                <div>
                  <span className="field-label">별점</span>
                  <StarRating rating={form.rating} onChange={(rating) => setForm((f) => ({ ...f, rating }))} />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.liked} onChange={(e) => setForm((f) => ({ ...f, liked: e.target.checked }))} />
                  인생책
                </label>
                <div>
                  <label className="field-label" htmlFor={`${uid}-date`}>완독일</label>
                  <input id={`${uid}-date`} type="date" className="field w-44" value={form.date} aria-invalid={dateInvalid}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** On the bookshelf (signed in): connect Life Hub and review Claude's reading proposals. */
export function LifeHubPanel() {
  const [connected, setConnected] = useState(() => isConnected(browserDeps()));
  const [proposals, setProposals] = useState<ReadingProposal[]>([]);
  const [reviewing, setReviewing] = useState<ReadingProposal | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    if (!isConnected(browserDeps())) return;
    setSyncing(true);
    try {
      const result = await sync(browserDeps());
      setProposals(result.proposals);
      setMessage(result.conflicts ? `${result.conflicts}개 제안은 Life Hub와 상태가 다릅니다. 책장 기록은 그대로입니다.` : null);
    } catch (e) {
      if (e instanceof LifeHubError && e.kind === 'not_connected') {
        setConnected(false);
        setProposals([]);
      }
      setMessage(e instanceof Error ? e.message : '동기화하지 못했습니다.');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    finishCallback()
      .then((done) => {
        if (!active) return;
        if (done) {
          setConnected(true);
          toast('Life Hub에 연결했습니다.');
        }
        void runSync();
      })
      .catch((e: unknown) => { if (active) setMessage(e instanceof Error ? e.message : 'Life Hub에 연결하지 못했습니다.'); });
    return () => { active = false; };
  }, [runSync]);

  const canConnect = connectAvailable(window.location);
  if (!connected && !message && proposals.length === 0) {
    return (
      <p className="mb-6 text-[13px] text-ink-muted">
        Claude에게 말한 독서 기록을 제안으로 받을 수 있습니다.{' '}
        <button type="button" className="underline underline-offset-2 disabled:opacity-50" disabled={!canConnect}
          onClick={() => void beginConnect(browserDeps()).then((url) => window.location.assign(url)).catch((e: unknown) => setMessage(e instanceof Error ? e.message : '연결을 시작하지 못했습니다.'))}>
          Life Hub 연결
        </button>
      </p>
    );
  }

  return (
    <section className="panel mb-8 px-5 py-4" aria-label="Life Hub 제안">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-serif text-[18px] font-bold">Claude가 제안한 기록 {proposals.length > 0 && <span className="tnum text-[14px] text-ink-muted">{proposals.length}</span>}</h2>
        <div className="ml-auto flex gap-1">
          {connected ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" disabled={syncing} onClick={() => void runSync()}>{syncing ? '동기화 중' : '동기화'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { disconnect(browserDeps()); setConnected(false); setProposals([]); setMessage('Life Hub 연결을 해제했습니다.'); }}>연결 해제</button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" disabled={!canConnect}
              onClick={() => void beginConnect(browserDeps()).then((url) => window.location.assign(url)).catch((e: unknown) => setMessage(e instanceof Error ? e.message : '연결을 시작하지 못했습니다.'))}>
              Life Hub 연결
            </button>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-[13px] text-ink-muted" role="status">{message}</p>}
      {connected && proposals.length === 0 && !syncing && <p className="mt-2 text-[13px] text-ink-muted">검토할 제안이 없습니다.</p>}
      {proposals.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft">
          {proposals.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0 flex-1 text-[14.5px]">{describe(p)}</span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewing(p)}>검토</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  rejectLocally(p.key, browserDeps());
                  setProposals((old) => old.filter((x) => x.key !== p.key));
                  toast('제안을 거절했습니다. 기록은 바뀌지 않았습니다.');
                  void runSync();
                }}>거절</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {reviewing && (
        <ReviewDialog
          key={reviewing.key}
          proposal={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setProposals((old) => old.filter((x) => x.key !== reviewing.key));
            setReviewing(null);
            void runSync();
          }}
        />
      )}
    </section>
  );
}

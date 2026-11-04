import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/ui/Dialog';
import { StarRating } from '../components/ui/StarRating';
import { toast } from '../store/toastStore';
import { useLogStore } from '../store/logStore';
import { useCatalogStore, type CatalogEdition, type CatalogWork } from '../store/catalogStore';
import { createVolumeRef } from '../domain/books/identity';
import { findWorks, publishersOf, volumesOf } from './resolve';
import { recordProposal } from './apply';
import type { ReadingProposal } from './remote';
import { markReviewed, rejectProposal, useHubStore } from './hubStore';

const STATE_LABEL = { reading: '읽는 중', completed: '완독' } as const;
const volumeLabel = (e: CatalogEdition) => (e.volume_number && e.volume_number !== '1' ? ` ${e.volume_number}권` : '');
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
      const ok = await recordProposal(proposal.key, work, publisher, edition, {
        state: form.state, page: pageNumber, rating: form.rating, liked: form.liked, date: form.date || null,
      });
      if (!ok) return; // the store already showed the error
      toast(`${work.title}${volumeLabel(edition)}: ${STATE_LABEL[form.state]}으로 기록했습니다.`);
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
      title={proposal.status === 'approved' ? 'Claude에서 승인한 독서 기록' : 'Claude가 제안한 독서 기록'}
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

/**
 * 책장 위: Claude 제안이 1건 이상일 때만 한 줄 띠. 0건이면 아무것도 그리지 않는다.
 * 「검토」를 누르면 띠 아래로 제안 목록이 펼쳐지고, 목록의 「검토」가 검토 대화상자를 연다.
 */
export function ProposalStrip({ proposals, onReject, onSaved, defaultOpen = false }: {
  proposals: ReadingProposal[];
  onReject: (p: ReadingProposal) => void;
  onSaved: (key: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [reviewing, setReviewing] = useState<ReadingProposal | null>(null);
  const listId = useId();
  if (proposals.length === 0) return null;

  return (
    <section className="mb-6" aria-label="Life Hub 제안">
      <div className="flex items-center gap-3 rounded-control bg-paper-sunken px-4 py-2 text-[13.5px] text-ink-soft">
        <span className="min-w-0 flex-1">Claude가 제안한 기록 <span className="tnum">{proposals.length}</span>건</span>
        <button type="button" className="underline underline-offset-2" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
          검토
        </button>
      </div>
      {open && (
        <ul id={listId} className="mt-3 divide-y divide-line-soft">
          {proposals.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0 flex-1 text-[14.5px]">
                {p.status === 'approved' && <span className="mr-2 rounded bg-paper-sunken px-1.5 py-0.5 text-[12px] text-ink-muted">Claude에서 승인함{p.needsAppReview ? ' · 확인 필요' : ''}</span>}
                {describe(p)}
              </span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewing(p)}>검토</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReject(p)}>거절</button>
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
            onSaved(reviewing.key);
            setReviewing(null);
          }}
        />
      )}
    </section>
  );
}

/** 책장 위 자리: 제안 스토어를 읽어 띠를 그린다 (제안 가져오기는 App 수준에서 돈다) */
export function LifeHubPanel() {
  const proposals = useHubStore((s) => s.proposals);
  return <ProposalStrip proposals={proposals} onReject={rejectProposal} onSaved={markReviewed} />;
}

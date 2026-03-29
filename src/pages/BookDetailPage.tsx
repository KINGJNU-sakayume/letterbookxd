import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, BookText, Loader2, Languages, Star } from 'lucide-react';
import { BookCover } from '../components/ui/BookCover';
import { VolumeRow } from '../components/book/VolumeRow';
import { SetReviewPanel } from '../components/book/SetReviewPanel';
import { useLogStore } from '../store/logStore';
import { useBookStore } from '../store/bookStore';
import { supabase } from '../lib/supabase';
import { fetchWorkById, fetchEditionsByWorkId, groupEditionsByPublisher } from '../services/db';
import type { DbWork, DbEdition, EditionGroup } from '../services/db';
// [M-6] 공통 헬퍼 import
import {
  groupKey,
  dbWorkToWork,
  buildWorkTranslations,
  groupToEditionSet,
  editionToVolume,
} from '../utils/bookMappers';

export function BookDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();

  const [dbWork, setDbWork] = useState<DbWork | null>(null);
  const [dbEditions, setDbEditions] = useState<DbEdition[]>([]);
  const [editionGroups, setEditionGroups] = useState<EditionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [repEditionId, setRepEditionId] = useState<string | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');
  const [activeTranslation, setActiveTranslation] = useState<string>('');

  const { setGroupedData } = useBookStore();
  const { getSetCompletionLog } = useLogStore();

  useEffect(() => {
    if (!workId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);

    Promise.all([fetchWorkById(workId), fetchEditionsByWorkId(workId)])
      .then(([w, eds]) => {
        if (!w) { setNotFound(true); return; }
        setDbWork(w);
        setRepEditionId(w.representative_edition_id ?? null);
        setDbEditions(eds);

        const groups = groupEditionsByPublisher(eds);
        setEditionGroups(groups);

        setGroupedData({
          works: [dbWorkToWork(w)],
          editionSets: groups.map((g) => groupToEditionSet(g, w.id)),
          volumes: eds.map((e) => editionToVolume(e, w.id)),
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [workId, setGroupedData]);

  useEffect(() => {
    if (editionGroups.length > 0 && !selectedPublisher) {
      const representativeEdition = dbEditions.find(e => e.id === repEditionId);
      if (representativeEdition) {
        setSelectedPublisher(representativeEdition.publisher);
      } else {
        setSelectedPublisher(editionGroups[0].publisher);
      }
    }
  }, [editionGroups, selectedPublisher, repEditionId, dbEditions]);

  async function handleSetRepresentative(editionId: string) {
    if (!workId || savingCover) return;
    setSavingCover(true);
    try {
      const { error } = await supabase
        .from('works')
        .update({ representative_edition_id: editionId })
        .eq('id', workId);
      if (error) throw error;
      setRepEditionId(editionId);
    } catch (err) {
      console.error('대표 설정 실패:', err);
      alert('대표 설정 중 오류가 발생했습니다.');
    } finally {
      setSavingCover(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-stone-400" />
      </main>
    );
  }

  if (notFound || !dbWork) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 mb-4">작품을 찾을 수 없습니다.</p>
          <button onClick={() => navigate('/')} className="text-sm text-stone-700 underline">홈으로 돌아가기</button>
        </div>
      </main>
    );
  }

  const selectedGroup = editionGroups.find((g) => g.publisher === selectedPublisher);

  const displayCoverUrl = (() => {
    if (selectedPublisher) {
      const pubGroup = editionGroups.find(g => g.publisher === selectedPublisher);
      if (pubGroup?.editions[0]?.cover_url) return pubGroup.editions[0].cover_url;
    }
    const repEdition = dbEditions.find(e => e.id === repEditionId);
    return repEdition?.cover_url || dbEditions[0]?.cover_url || '';
  })();

  const workTranslations = buildWorkTranslations(dbWork);
  const editionTranslations = editionGroups
    .map((g) => {
      const firstExcerpt = g.editions.find((e) => e.excerpt)?.excerpt ?? '';
      return firstExcerpt
        ? { key: `pub-${g.publisher}`, label: `${g.publisher} 번역`, text: firstExcerpt }
        : null;
    })
    .filter((t): t is { key: string; label: string; text: string } => t !== null);

  const allTranslations = [...workTranslations, ...editionTranslations];
  const activeKey = activeTranslation || allTranslations[0]?.key || '';
  const activeText = allTranslations.find((t) => t.key === activeKey)?.text ?? '';
  const hasMultiplePublishers = editionGroups.length > 1;

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors mb-8"
        >
          <ArrowLeft size={16} />돌아가기
        </button>

        <div className="flex flex-col sm:flex-row gap-8 mb-10">
          <div className="w-36 sm:w-44 shrink-0 mx-auto sm:mx-0">
            <BookCover src={displayCoverUrl} alt={dbWork.title} className="w-full shadow-md transition-all duration-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 leading-tight mb-2">{dbWork.title}</h1>
            <Link to={`/author/${encodeURIComponent(dbWork.author)}`} className="inline-block group mb-3">
              <p className="text-lg text-stone-600 group-hover:text-stone-900 transition-colors">
                {dbWork.author}
                <span className="text-xs ml-2 opacity-0 group-hover:opacity-100 text-stone-400 transition-opacity">작가 정보 ↗</span>
              </p>
            </Link>
            <div className="flex items-center gap-4 text-sm text-stone-500 mb-5 pb-4 border-b border-stone-100">
              <span className="flex items-center gap-1">
                <BookText size={14} />
                {editionGroups.length}개 출판사 · {dbEditions.length}개 판본
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {dbWork.genre && (
                <span className="px-2.5 py-0.5 bg-stone-800 text-white text-[11px] font-bold rounded uppercase tracking-wider">
                  {dbWork.genre}
                </span>
              )}
              {dbWork.lists?.map((list) => (
                <span key={list} className="px-2 py-0.5 border border-stone-200 bg-white text-stone-500 text-[11px] rounded hover:border-stone-400 transition-colors">
                  {list}
                </span>
              ))}
            </div>
            <div className="relative">
              <p className="text-stone-700 leading-relaxed font-serif text-base sm:text-lg break-keep whitespace-pre-wrap max-w-2xl">
                {dbWork.description || '등록된 작품 소개가 없습니다.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section>
              {hasMultiplePublishers && (
                <>
                  <h2 className="text-base font-semibold text-stone-800 mb-3">출판사별 판본</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {editionGroups.map((g) => {
                      const setId = groupKey(dbWork.id, g.publisher);
                      const setComplete = !!getSetCompletionLog(setId);
                      return (
                        <button
                          key={g.publisher}
                          onClick={() => { setSelectedPublisher(g.publisher); setActiveTranslation(''); }}
                          className={`relative px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                            selectedPublisher === g.publisher
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500 hover:bg-stone-50'
                          }`}
                        >
                          {g.publisher}
                          <span className={`ml-1.5 text-xs ${selectedPublisher === g.publisher ? 'text-stone-300' : 'text-stone-400'}`}>
                            {g.editions.length}권
                          </span>
                          {setComplete && (
                            <span className="absolute -top-1.5 -right-1.5">
                              <CheckCircle2 size={14} className="text-emerald-500 fill-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {selectedGroup && (() => {
                const setId = groupKey(dbWork.id, selectedGroup.publisher);
                const setComplete = !!getSetCompletionLog(setId);
                const volCount = selectedGroup.editions.length;
                const isSingle = volCount === 1;
                const firstEditionId = selectedGroup.editions[0]?.id;
                const isRepresentative = repEditionId === firstEditionId;

                return (
                  <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
                    <div className="flex items-center justify-between px-4 py-3 bg-stone-800">
                      <h3 className="text-sm font-semibold text-white">
                        {hasMultiplePublishers ? `${selectedGroup.publisher} 판본` : dbWork.title}
                      </h3>
                      {setComplete && <CheckCircle2 size={16} className="text-emerald-400" />}
                    </div>
                    <div className="px-4 py-2 bg-stone-100 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500">
                      <span>{isSingle ? '단권 구성' : `${volCount}권 구성`}</span>
                      {firstEditionId && hasMultiplePublishers && (
                        <button
                          onClick={() => handleSetRepresentative(firstEditionId)}
                          disabled={savingCover || isRepresentative}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                            isRepresentative
                              ? 'text-amber-600 bg-amber-50 font-medium cursor-default'
                              : 'text-stone-500 hover:text-amber-600 hover:bg-amber-50'
                          }`}
                        >
                          <Star size={11} className={isRepresentative ? 'fill-amber-500 text-amber-500' : ''} />
                          {isRepresentative ? '대표 표지' : '대표 지정'}
                        </button>
                      )}
                    </div>
                    <div className="p-1">
                      {selectedGroup.editions.map((edition) => (
                        <VolumeRow
                          key={edition.id}
                          volume={editionToVolume(edition, dbWork.id)}
                          label={isSingle ? dbWork.title : `${dbWork.title} ${edition.volume_number}권`}
                          workId={dbWork.id}
                          editionSetId={setId}
                          isSingleVolume={isSingle}
                          totalPages={edition.page_count || undefined}
                        />
                      ))}
                    </div>
                    {!isSingle && setComplete && (
                      <div className="px-3 pb-3 border-t border-stone-50 pt-3">
                        <SetReviewPanel
                          editionSetId={setId}
                          workId={dbWork.id}
                          publisher={selectedGroup.publisher}
                          title={dbWork.title}
                          isSinglePublisher={!hasMultiplePublishers}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          </div>

          {allTranslations.length > 0 && (
            <div className="lg:col-span-1">
              <h2 className="text-base font-semibold text-stone-800 mb-3">번역 비교</h2>
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
                  <Languages size={16} className="text-stone-600" />
                  <span className="text-sm font-semibold text-stone-800">번역 비교</span>
                </div>
                <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 border-b border-stone-100">
                  {allTranslations.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTranslation(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeKey === t.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="px-4 py-4 min-h-[100px]">
                  {activeText && (
                    <p key={activeKey} className="text-sm text-stone-700 leading-relaxed font-serif">
                      {activeText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

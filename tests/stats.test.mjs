import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../.test-dist/computeStats.js';

const base = {
  works: [{ id:'w1', title:'책', author:'작가', genre:'한국, 고전', lists:[], representative_edition_id:'e1' }],
  editions: [
    { id:'e1', work_id:'w1', publisher:'출판사', cover_url:'', page_count:100 },
    { id:'e2', work_id:'w1', publisher:'출판사', cover_url:'', page_count:120 },
  ],
  seriesTotal: 2,
};

test('reading 상태는 완독 통계에 포함하지 않는다', () => {
  const stats = computeStats({ ...base, logs:[{ log_type:'volume', volume_id:'vol-e1', reading_state:'reading', created_at:'2026-01-01T00:00:00Z' }] }, 'all');
  assert.equal(stats.totalWorks, 0);
  assert.equal(stats.totalPages, 0);
});

test('전체 월별 완독은 한 번만 집계한다', () => {
  const logs=[{ log_type:'set_completion', work_id:'w1', edition_set_id:'w1::출판사', rating:5, liked:true, created_at:'2026-03-15T00:00:00Z' }];
  const stats=computeStats({ ...base, logs }, 'all');
  assert.equal(stats.monthlyDist[2].count, 1);
});

test('시리즈 완주 분모와 분자를 구분한다', () => {
  const logs=[{ log_type:'series_completion', created_at:'2026-03-15T00:00:00Z' }];
  const stats=computeStats({ ...base, logs }, 'all');
  assert.equal(stats.seriesCompletedCount,1);
  assert.equal(stats.seriesTotalCount,2);
});

test('한 권짜리 판본의 별점과 인생책은 권 기록에서 가져온다', () => {
  const data = {
    works: [{ id:'w2', title:'단권', author:'작가', genre:'한국', lists:[], representative_edition_id:'e3' }],
    editions: [{ id:'e3', work_id:'w2', publisher:'출판사', cover_url:'', page_count:200 }],
    seriesTotal: 0,
    logs: [
      { log_type:'volume', work_id:'w2', volume_id:'vol-e3', edition_set_id:'w2::출판사', reading_state:'completed', rating:4, liked:true, created_at:'2026-03-15T00:00:00Z' },
      { log_type:'set_completion', work_id:'w2', edition_set_id:'w2::출판사', rating:null, liked:false, created_at:'2026-03-15T00:00:00Z' },
    ],
  };
  const stats = computeStats(data, 'all');
  assert.equal(stats.avgRating, '4.0');
  assert.equal(stats.ratingDist[3].count, 1);
  assert.equal(stats.lifeBookCount, 1);
});

test('여러 권짜리 판본은 권별 별점이 아니라 세트 별점을 쓴다', () => {
  const logs = [
    { log_type:'volume', work_id:'w1', volume_id:'vol-e1', edition_set_id:'w1::출판사', reading_state:'completed', rating:5, liked:true, created_at:'2026-03-01T00:00:00Z' },
    { log_type:'volume', work_id:'w1', volume_id:'vol-e2', edition_set_id:'w1::출판사', reading_state:'completed', rating:5, liked:false, created_at:'2026-03-10T00:00:00Z' },
    { log_type:'set_completion', work_id:'w1', edition_set_id:'w1::출판사', rating:3, liked:false, created_at:'2026-03-10T00:00:00Z' },
  ];
  const stats = computeStats({ ...base, logs }, 'all');
  assert.equal(stats.avgRating, '3.0');
  assert.equal(stats.lifeBookCount, 0);
});

test('다른 나라 이름을 품은 나라는 긴 이름으로 묶는다', () => {
  const data = {
    works: [{ id:'w9', title:'책', author:'작가', genre:'인도네시아, 현대', lists:[], representative_edition_id:'e9' }],
    editions: [{ id:'e9', work_id:'w9', publisher:'출판사', cover_url:'', page_count:100 }],
    seriesTotal: 0,
    logs: [{ log_type:'set_completion', work_id:'w9', edition_set_id:'w9::출판사', created_at:'2026-01-01T00:00:00Z' }],
  };
  const stats = computeStats(data, 'all');
  assert.ok(stats.countryDataMap['인도네시아']);
  assert.equal(stats.countryDataMap['인도'], undefined);
});

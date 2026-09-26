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

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../.test-dist/computeStats.js';

const base = {
  works: [
    { id: 'w1', title: 'A', author: 'Author', genre: '러시아 소설', lists: [] },
    { id: 'w2', title: 'B', author: 'Author', genre: '프랑스 소설', lists: [] },
  ],
  editions: [
    { id: 'e1', work_id: 'w1', publisher: 'P1', page_count: 100 },
    { id: 'e2', work_id: 'w2', publisher: 'P2', page_count: 200 },
  ],
  seriesTotal: 3,
};

test('reading-state volume is not counted as completed pages or work', () => {
  const stats = computeStats({
    ...base,
    logs: [
      { id: 'l1', log_type: 'volume', work_id: 'w1', volume_id: 'vol-e1', reading_state: 'reading', created_at: '2026-01-01T00:00:00Z' },
    ],
  }, 'all');

  assert.equal(stats.totalWorks, 0);
  assert.equal(stats.totalPages, 0);
});

test('all-time monthly completions are counted once', () => {
  const stats = computeStats({
    ...base,
    logs: [
      { id: 'v1', log_type: 'volume', work_id: 'w1', volume_id: 'vol-e1', reading_state: 'completed', created_at: '2026-02-01T00:00:00Z' },
      { id: 's1', log_type: 'set_completion', work_id: 'w1', edition_set_id: 'w1::P1', created_at: '2026-02-01T00:00:00Z' },
    ],
  }, 'all');

  assert.equal(stats.monthlyDist[1].count, 1);
  assert.equal(stats.totalWorks, 1);
  assert.equal(stats.totalPages, 100);
});

test('series counts keep completed and total separate', () => {
  const stats = computeStats({
    ...base,
    logs: [
      { id: 'series1', log_type: 'series_completion', series_id: 's1', created_at: '2026-03-01T00:00:00Z' },
    ],
  }, 'all');

  assert.equal(stats.seriesCompletedCount, 1);
  assert.equal(stats.seriesTotalCount, 3);
  assert.equal(stats.seriesCompletionRate, 33);
});

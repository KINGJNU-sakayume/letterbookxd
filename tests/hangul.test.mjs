import test from 'node:test';
import assert from 'node:assert/strict';
import { toChosung, matchesQuery, matchRank, highlightRange, josa } from '../.test-dist/hangul.js';

test('초성을 뽑는다', () => {
  assert.equal(toChosung('죄와 벌'), 'ㅈㅇ ㅂ');
  assert.equal(toChosung('1984'), '1984');
});

test('띄어쓰기와 대소문자를 무시하고, 자음만 치면 초성으로 찾는다', () => {
  assert.ok(matchesQuery('죄와 벌', '죄와벌'));
  assert.ok(matchesQuery('카라마조프가의 형제들', 'ㅎㅈㄷ'));
  assert.ok(matchesQuery('THE Idiot', 'idiot'));
  assert.ok(!matchesQuery('죄와 벌', 'ㅎㅈ'));
});

test('앞머리 일치를 먼저 둔다', () => {
  assert.ok(matchRank('데미안', '데미') < matchRank('헤르만 헤세의 데미안', '데미'));
  assert.equal(matchRank('데미안', '싯다'), null);
});

test('원문에서 그대로 찾을 때만 강조 범위를 준다', () => {
  assert.deepEqual(highlightRange('죄와 벌', '와 벌'), [1, 4]);
  assert.equal(highlightRange('죄와 벌', 'ㅈㅇ'), null);
});

test('받침에 맞춰 조사를 고른다', () => {
  assert.equal(josa('데미안', '을', '를'), '데미안을');
  assert.equal(josa('싯다르타', '을', '를'), '싯다르타를');
  assert.equal(josa('‘죄와 벌’', '과', '와'), '‘죄와 벌’과');
  assert.equal(josa('1984', '을', '를'), '1984를');
  assert.equal(josa('Kafka', '을', '를'), 'Kafka을(를)');
});

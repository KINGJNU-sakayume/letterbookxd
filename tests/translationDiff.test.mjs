import test from 'node:test';
import assert from 'node:assert/strict';
import { diffAgainst } from '../.test-dist/translationDiff.js';

const changedWords = (d) => d.pieces.filter((p) => p.changed).map((p) => p.text);

test('기준이 없으면 아무것도 표시하지 않는다', () => {
  const d = diffAgainst(null, '7월 초 몹시 무더운 저녁');
  assert.equal(d.changed, 0);
  assert.equal(d.total, 5);
  assert.equal(d.pieces.map((p) => p.text).join(''), '7월 초 몹시 무더운 저녁');
});

test('같은 번역은 달라진 어절이 없다', () => {
  const d = diffAgainst('한 청년이 골방에서 나와', '한 청년이 골방에서 나와');
  assert.equal(d.changed, 0);
});

test('기준에 없는 어절만 표시하고, 순서가 같은 어절은 그대로 둔다', () => {
  const d = diffAgainst('한 청년이 골방에서 거리로 나와', '한 청년이 하숙방에서 거리로 나와');
  assert.deepEqual(changedWords(d), ['하숙방에서']);
  assert.equal(d.total, 5);
});

test('쉼표와 따옴표는 같은 어절로 본다', () => {
  const d = diffAgainst('7월 초 무더운 저녁 무렵', '7월 초, 무더운 저녁 무렵,');
  assert.equal(d.changed, 0);
});

test('줄바꿈과 띄어쓰기를 그대로 돌려준다', () => {
  const text = '첫 문단입니다.\n\n둘째 문단입니다.';
  const d = diffAgainst('다른 글', text);
  assert.equal(d.pieces.map((p) => p.text).join(''), text);
  assert.equal(d.total, 4);
});

test('너무 긴 글은 비교하지 않는다', () => {
  const long = Array.from({ length: 600 }, (_, i) => `단어${i}`).join(' ');
  const d = diffAgainst(long, long + ' 끝');
  assert.equal(d.changed, 0);
});

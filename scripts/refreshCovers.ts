// 매달 GitHub Actions(.github/workflows/refresh-covers.yml)가 돌리는 카카오 표지 다시 확인.
// src/data/catalog.json의 카카오 표지(t1.daumcdn.net·search1.kakaocdn.net)를 같은 ISBN으로 다시 찾아, 주소가 바뀐 것만 고친다.
// 카카오 운영정책(캐시한 데이터는 최신으로 유지)을 지키기 위한 갱신이다. 키는 환경 변수 KAKAO_REST_API_KEY(Actions secret)로만 받는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeCatalog, serializeCatalog } from '../src/catalog/model';
import { refreshCovers } from '../src/services/coverMigration';
import { lookupKakaoCover } from '../src/services/kakaoCover';

const FILE = 'src/data/catalog.json';
const key = process.env.KAKAO_REST_API_KEY?.trim();
if (!key) {
  console.log('KAKAO_REST_API_KEY가 없어 표지 갱신을 건너뜁니다. (Settings → Secrets and variables → Actions)');
  process.exit(0);
}

const before = readFileSync(FILE, 'utf8');
const catalog = normalizeCatalog(JSON.parse(before));
try {
  const r = await refreshCovers(catalog, (isbn) => lookupKakaoCover(isbn, { key }));
  console.log(`카카오 표지 ${r.checked}개 확인 · 바뀜 ${r.changed.length} · 못 찾음 ${r.notFound.length} · 오류 ${r.errors.length}`);
  for (const c of r.changed) console.log(`- 갱신 ${c.editionId}: ${c.oldUrl} → ${c.newUrl}`);
  for (const t of r.notFound) console.log(`- 못 찾음 ${t.title} · ${t.publisher} ${t.volume} (ISBN ${t.isbn}) — 기존 주소 유지`);
  for (const e of r.errors) console.log(`- 오류 ${e.title} (ISBN ${e.isbn}): ${e.message} — 기존 주소 유지`);
  const after = serializeCatalog(catalog);
  if (after !== before) {
    writeFileSync(FILE, after);
    console.log(`${FILE}을 고쳤습니다.`);
  } else {
    console.log('바뀐 것이 없습니다.');
  }
} catch (err) {
  console.error('표지 갱신 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
}

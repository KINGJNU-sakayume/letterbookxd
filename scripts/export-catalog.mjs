#!/usr/bin/env node
// Supabase에 있던 공개 카탈로그(works, editions, series, authors, author_flowcharts)를
// src/data/catalog.json으로 내려받는다. 한 번만 쓰는 이전용 스크립트다.
//
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<anon key> node scripts/export-catalog.mjs
//   (선택) --out path/to/catalog.json
//
// 카탈로그 테이블은 RLS가 "public read"라 anon 키로 읽을 수 있다. 개인 기록(logs)은 읽지 않는다.
// 키는 환경변수로만 받고, 출력하거나 파일에 쓰지 않는다. 의존성 없음 (Node 18+의 fetch).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const TABLES = [
  ['works', 'works'],
  ['editions', 'editions'],
  ['series', 'series'],
  ['authors', 'authors'],
  ['flowcharts', 'author_flowcharts'],
];
const PAGE = 1000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL과 SUPABASE_ANON_KEY 환경변수가 필요합니다.');
  console.error('예) SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... node scripts/export-catalog.mjs');
  process.exit(1);
}
const out = resolve(arg('--out', 'src/data/catalog.json'));

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

const catalog = { version: 1 };
for (const [name, table] of TABLES) {
  const rows = await fetchAll(table);
  catalog[name] = rows.sort(byId);
  console.log(`${table}: ${rows.length}행`);
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`→ ${out}`);
console.log('확인 후 커밋하세요. (기록·키는 이 파일에 들어가지 않습니다)');

/**
 * 식약처 식품영양성분DB 의 '품목대표' 줄을 모두 받아 lib/nutrition/mfds-reps.json 으로 적는다.
 *
 *   npm run nutrition:reps
 *
 * 품목대표는 식약처가 품목마다 하나씩 정해 둔 표준값이다(쌀밥 · 달걀_삶은것 · 바나나, 생것 …) — 전체 33만 줄 가운데
 * 8,800줄쯤. 음식 검색이 맨 위에 보여줄 것이 대개 이것인데, 포털에 '품목대표만' 달라고 하면 결과가 100줄이 안 될 때
 * DB 전체를 훑어 4초가 걸린다(2026-09-30 실측 — 한 번 검색에 이런 호출이 두세 번 필요했다). 그래서 통째로 받아
 * 앱에 넣어 두고 거기서 찾는다(lib/nutrition/mfds-reps.ts). 상품(30만 줄)은 그대로 포털에 묻는다.
 *
 * 식약처가 DB 를 고치면(한 해 한두 번) 다시 돌린다. 500줄씩 18번쯤 부른다(1~2분). 인증키는 .env 의 FOOD_API_KEY.
 * 공공누리 자료 — 출처는 화면의 검색 결과 밑에 적혀 있다.
 *
 * 적는 모양(작게 — 앱 서버가 통째로 읽는다):
 *   { fetchedAt, total, rows: [ [식품코드, 이름, 기준량, 1회 중량, kcal, 탄수화물, 단백질, 지방], … ] }
 *   값은 포털이 준 글자 그대로(빈 칸은 ''). 분류(음식 · 가공식품 · 원재료성)는 식품코드 첫 글자(D · P · R)로 안다.
 */
import { writeFileSync } from 'node:fs';

const ENDPOINT =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03';
const ROWS = 500; // 포털이 받는 가장 큰 쪽
const OUT = 'lib/nutrition/mfds-reps.json';

const raw = process.env.FOOD_API_KEY?.trim();
if (!raw) {
  console.error('FOOD_API_KEY 가 없습니다(.env).');
  process.exit(1);
}
const key = raw.includes('%') ? decodeURIComponent(raw) : raw;

/** 한 쪽 — 실패하면 세 번까지 다시. 주소에는 인증키가 있어 오류에 주소를 적지 않는다 */
async function page(no) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(no));
  url.searchParams.set('numOfRows', String(ROWS));
  url.searchParams.set('type', 'json');
  url.searchParams.set('DB_CLASS_NM', '품목대표');
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const json = JSON.parse(await res.text());
      if (json?.header?.resultCode !== '00') {
        throw new Error(
          `결과 코드 ${json?.header?.resultCode} ${json?.header?.resultMsg ?? ''}`
        );
      }
      return { total: Number(json.body.totalCount), items: json.body.items ?? [] };
    } catch (e) {
      const why = e instanceof Error ? e.message.split(key).join('***') : String(e);
      if (attempt >= 3) throw new Error(`${no}쪽을 받지 못했습니다 — ${why}`);
      console.warn(`  ${no}쪽 다시(${attempt}) — ${why}`);
    }
  }
}

const str = (v) => (v == null ? '' : String(v).trim());

const first = await page(1);
/* 전체 수가 터무니없으면(0 · 읽지 못함 · 거름이 안 먹혀 33만 줄) 받지 않는다 — 좋은 파일을 덮어쓰지 않게 */
if (!(first.total >= 8000 && first.total <= 20000)) {
  console.error(`품목대표 전체 수가 이상합니다(${first.total}) — 받지 않았습니다.`);
  process.exit(1);
}
const pages = Math.ceil(first.total / ROWS);
console.log(`품목대표 ${first.total}줄 · ${pages}쪽`);
const items = [...first.items];
for (let no = 2; no <= pages; no++) {
  const p = await page(no);
  items.push(...p.items);
  console.log(`  ${no}/${pages}쪽 · ${items.length}줄`);
}

const seen = new Set();
const rows = [];
let withMaker = 0;
for (const it of items) {
  const cd = str(it.FOOD_CD);
  const name = str(it.FOOD_NM_KR);
  if (!cd || !name || seen.has(cd)) continue;
  seen.add(cd);
  if (str(it.MAKER_NM) && str(it.MAKER_NM) !== '해당없음') withMaker += 1;
  rows.push([
    cd,
    name,
    str(it.SERVING_SIZE),
    str(it.Z10500),
    str(it.AMT_NUM1),
    str(it.AMT_NUM6),
    str(it.AMT_NUM3),
    str(it.AMT_NUM4),
  ]);
}
/* 식품코드 순 — 포털의 DB 순서(음식 → 가공식품 → 원재료성)와 같고, 다시 받아도 파일이 덜 흔들린다 */
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

if (rows.length < first.total * 0.98) {
  console.error(
    `받은 줄(${rows.length})이 전체(${first.total})보다 너무 적어 적지 않았습니다.`
  );
  process.exit(1);
}

const out = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  total: rows.length,
  rows,
};
writeFileSync(
  OUT,
  `{"fetchedAt":${JSON.stringify(out.fetchedAt)},"total":${out.total},"rows":[\n${rows
    .map((r) => JSON.stringify(r))
    .join(',\n')}\n]}\n`
);
const by = { D: 0, P: 0, R: 0 };
for (const r of rows) by[r[0][0]] = (by[r[0][0]] ?? 0) + 1;
console.log(
  `${OUT} — ${rows.length}줄(음식 ${by.D} · 가공식품 ${by.P} · 원재료성 ${by.R}), 제조사가 적힌 줄 ${withMaker}`
);

/**
 * 과거 영상 가져오기 묶기(lib/pitch-import.ts) + 영상 머리 날짜 읽기(lib/pitch-lab-file.ts) 셀프테스트 — npm run pitch-import:test
 */
import {
  GROUP_MAX,
  groupItems,
  importDateOf,
  needsDateCheck,
  setGroupDate,
  splitOut,
  type ImportItem,
} from '../lib/pitch-import.ts';
import { readLabFileFacts } from '../lib/pitch-lab-file.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/* 한국 시각 2026-10-16 21:00 = UTC 12:00 */
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const utc = (y: number, m: number, d: number, h: number) => Date.UTC(y, m - 1, d, h);

console.log('[날짜 읽는 차례]');
check(
  '① creationdate — 한국 날짜로',
  importDateOf({ startMs: utc(2026, 10, 3, 5), timeSource: 'apple' }, NOW, NOW).date ===
    '2026-10-03'
);
check(
  '① UTC 16시는 한국 다음 날',
  importDateOf({ startMs: utc(2026, 10, 3, 16), timeSource: 'apple' }, NOW, NOW)
    .date === '2026-10-04'
);
check(
  '② mvhd 가 출처로 남음',
  importDateOf({ startMs: utc(2026, 9, 1, 1), timeSource: 'mvhd' }, NOW, NOW).source ===
    'mvhd'
);
const fromFile = importDateOf(null, utc(2026, 8, 20, 3), NOW);
check(
  '③ 머리 없으면 파일 시각 · file 출처',
  fromFile.date === '2026-08-20' && fromFile.source === 'file'
);
check(
  '③ 파일 시각이 오늘이면 못 믿어 없음',
  importDateOf(null, NOW - 60_000, NOW).date === null
);
check(
  '③ 파일 시각이 미래면 없음',
  importDateOf(null, NOW + 86_400_000, NOW).date === null
);
check(
  '④ 아무것도 없으면 null · null',
  importDateOf({ startMs: null, timeSource: null }, 0, NOW).date === null
);
check(
  '확인 띠 — file · null 만',
  needsDateCheck({ source: 'file' }) &&
    needsDateCheck({ source: null }) &&
    !needsDateCheck({ source: 'apple' }) &&
    !needsDateCheck({ source: 'mvhd' })
);

console.log('[묶기]');
const item = (
  id: number,
  date: string | null,
  source: ImportItem['source'] = 'apple'
): ImportItem => ({
  id,
  name: `v${id}.mov`,
  date,
  source: date ? source : null,
});
const items = [
  item(0, '2026-10-03'),
  item(1, '2026-10-03'),
  item(2, '2026-10-03'),
  item(3, '2026-09-20'),
  item(4, null),
  item(5, '2026-10-03'),
  item(6, '2026-10-03'),
  item(7, null),
];
const groups = groupItems(items);
check(
  '같은 날 5개 → 2 · 2 · 1, 날짜 없는 둘은 각각',
  groups.length === 6,
  groups.map((g) => `${g.date}:${g.items.length}`).join(' ')
);
check('오래된 날이 먼저', groups[0].date === '2026-09-20');
check(
  '같은 날 안은 고른 차례',
  groups[1].items.map((i) => i.id).join(',') === '0,1' &&
    groups[2].items.map((i) => i.id).join(',') === '2,5'
);
check(
  '한 묶음은 GROUP_MAX 를 안 넘음',
  groups.every((g) => g.items.length <= GROUP_MAX) && GROUP_MAX === 2
);
check(
  '날짜 없는 묶음은 끝에 · 제 묶음',
  groups.slice(-2).every((g) => g.date === null && g.items.length === 1)
);
check('열쇠가 겹치지 않음', new Set(groups.map((g) => g.key)).size === groups.length);
check('빈 입력 → 빈 묶음', groupItems([]).length === 0);

console.log('[따로 빼기 · 날짜 고치기]');
const split = splitOut(groups, 1);
check(
  '[따로] → 묶음 하나 늘고 그 영상만 제 묶음',
  split.length === 7 && split[2].items.length === 1 && split[2].items[0].id === 1
);
check(
  '[따로] 한 묶음은 바로 뒤에 · 날짜 같음',
  split[2].date === '2026-10-03' && split[1].items.map((i) => i.id).join(',') === '0'
);
check('혼자인 묶음은 [따로]해도 그대로', splitOut(groups, 3).length === groups.length);
check('없는 번호는 그대로', splitOut(groups, 99).length === groups.length);
check(
  '[따로] 뒤에도 열쇠가 겹치지 않음',
  new Set(split.map((g) => g.key)).size === split.length
);
const dated = setGroupDate(groups, groups[1].key, '2026-10-05');
check(
  '묶음 날짜 고치기는 묶음 전체 + 안의 영상',
  dated[1].date === '2026-10-05' && dated[1].items.every((i) => i.date === '2026-10-05')
);
check('다른 묶음은 그대로', dated[2].date === '2026-10-03');
check('원본은 안 바뀜(순수)', groups[1].date === '2026-10-03');

console.log('[영상 머리에서 날짜 읽기 — 가짜 mov 바이트]');
const MAC_EPOCH = 2082844800;
function box(type: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(8 + body.length));
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  return out;
}
function mvhd(createdUnixSec: number): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(new ArrayBuffer(100));
  const dv = new DataView(body.buffer);
  dv.setUint32(4, createdUnixSec + MAC_EPOCH); /* creation */
  dv.setUint32(8, createdUnixSec + MAC_EPOCH); /* modification */
  dv.setUint32(12, 600); /* timescale */
  dv.setUint32(16, 6000); /* duration 10초 */
  return box('mvhd', body);
}
const created = Math.floor(utc(2026, 10, 3, 5) / 1000);
const fake = new Blob([
  box('ftyp', new TextEncoder().encode('qt  ')),
  box('moov', mvhd(created)),
  box('mdat', new Uint8Array(new ArrayBuffer(32))),
]);
const facts = await readLabFileFacts(fake);
check(
  'mvhd 시각을 읽음',
  facts?.startMs === created * 1000 && facts?.timeSource === 'mvhd',
  String(facts?.startMs)
);
check('길이 10초', facts?.durationSec === 10);
check('→ 날짜 2026-10-03', importDateOf(facts, NOW, NOW).date === '2026-10-03');
const noTime = new Blob([
  box('ftyp', new TextEncoder().encode('isom')),
  box('moov', mvhd(0)),
]);
const facts0 = await readLabFileFacts(noTime);
check(
  '시각 0 인 파일은 머리 시각 없음 → 파일 시각으로',
  facts0?.startMs == null &&
    importDateOf(facts0, utc(2026, 8, 20, 3), NOW).source === 'file'
);
const junk = new Blob(['junk']);
check('영상 아닌 파일은 null', (await readLabFileFacts(junk)) === null);

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);

/**
 * '내 영상' 갤러리 규칙(lib/my-videos.ts) 셀프테스트 — npm run my-videos:test
 *
 * 합치기(경로 하나 = 카드 하나) · 지운 영상 숨김 · 날짜 묶음 · 찾기(어디서 찾았나) · 메모 다듬기, 그리고 소스 모양으로
 * 부하 계산이 이 표를 읽지 않는지 · 읽기가 본인 것만 · 관리자 자료(보정용)를 빼는지 본다. 운영 DB 는 읽지도 쓰지도 않는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import {
  EMPTY_VIDEO_FILTER,
  chunkRows,
  clearChip,
  filterChips,
  isFilterActive,
  monthIndex,
  periodRange,
  recordTypes,
  sortRows,
  type VideoFilter,
  FEEL_NOTE_MAX,
  checkNewVideo,
  cleanFeelNote,
  filterVideos,
  groupByDate,
  groupByMonth,
  isGalleryPath,
  mergeVideos,
  type MyVideoLog,
  type MyVideoRow,
} from '../lib/my-videos.ts';
import { applyOverrides, createFavQueue, createNoteQueue, pruneOverrides, type NoteSent, type Override } from '../native/src/videos/edits.ts';
import {
  bothMarked,
  clampTo,
  clockText,
  commonRange,
  driftOf,
  navBack,
  navCompare,
  navOpenPick,
  navPickNext,
  navRealign,
  navRestore,
  navStart,
  navSwipeOk,
  relText,
  sceneStep,
  sideTimes,
  type CompareNav,
} from '../native/src/videos/compare-math.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
function walk(dir: string): string[] {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );
}

const U = 'u1';
const phone = (n: number) => `${U}/local-${'0'.repeat(7)}${n}-aaaa-bbbb-cccc-dddddddddddd`;
const log = (over: Partial<MyVideoLog>): MyVideoLog => ({
  id: 'l1',
  kind: 'pitch',
  date: '2026-10-20',
  type: '불펜',
  count: 30,
  memo: null,
  cuesGood: [],
  cuesBad: [],
  ...over,
});
const row = (over: Partial<MyVideoRow>): MyVideoRow => ({
  path: phone(1),
  storage: 'phone',
  sport: 'pitch',
  capturedDate: null,
  capturedSource: 'unknown',
  origin: 'album',
  feelNote: null,
  revisit: false,
  durationSec: null,
  createdAt: '2026-10-26T01:00:00.000Z',
  ...over,
});

console.log('\n[1] 합치기 — 경로 하나에 카드 하나');
{
  const items = mergeVideos({
    rows: [row({ path: phone(1), feelNote: '하체가 먼저 나갔다', capturedDate: '2026-10-21', capturedSource: 'header' })],
    logs: [
      { log: log({ id: 'a', memo: '총평: 제구 좋음', date: '2026-10-21' }), paths: [phone(1), phone(2)] },
      { log: log({ id: 'b', date: '2026-10-22' }), paths: [phone(1)] },
    ],
    clips: [{ path: phone(3), clip: { pitchId: 'p', sessionId: 's', date: '2026-10-23', kmh: 132, pitchType: '직구' } }],
  });
  check('카드 수 = 서로 다른 경로 수(3)', items.length === 3, String(items.length));
  const one = items.find((i) => i.path === phone(1))!;
  check('같은 경로가 기록 둘에 걸리면 한 카드에 기록 2개', one.logs.length === 2);
  check('영상 메모는 줄의 것, 기록 총평을 복제하지 않는다', one.note === '하체가 먼저 나갔다' && one.logs[0].memo === '총평: 제구 좋음');
  check('줄이 있으면 saved · 날짜는 줄의 촬영 날짜', one.saved && one.date === '2026-10-21' && one.dateSource === 'header');
  const two = items.find((i) => i.path === phone(2))!;
  check('줄 없는 기록 영상 — saved 아님 · 날짜는 기록 · 출처 log', !two.saved && two.date === '2026-10-21' && two.dateSource === 'log' && two.origin === 'log' && two.note === null);
  const three = items.find((i) => i.path === phone(3))!;
  check('측정 클립 — 출처 velocityClip · 구속 · 투구', three.origin === 'velocityClip' && three.clip?.kmh === 132 && three.sport === 'pitch');
  check('폰 경로는 phone, 서버 경로는 server', one.storage === 'phone' && mergeVideos({ rows: [], logs: [{ log: log({}), paths: [`${U}/abc.mp4`] }], clips: [] })[0].storage === 'server');
  const hit = mergeVideos({ rows: [], logs: [{ log: log({ kind: 'hit', type: '티배팅' }), paths: [phone(4)] }], clips: [] })[0];
  check('타격 기록 영상은 타격', hit.sport === 'hit');
}

console.log('\n[2] 숨김 · 빼는 것');
{
  const items = mergeVideos({
    rows: [],
    deleted: [phone(1)],
    logs: [{ log: log({}), paths: [phone(1), `${U}/pitch-lab/9/side.mov`, `${U}/swing-lab/9/side.mov`] }],
    clips: [],
  });
  check('지운 영상은 기록이 아직 쥐어도 안 보인다', !items.some((i) => i.path === phone(1)));
  check('3D 분석 샘플 폴더는 갤러리에 없다', items.length === 0 && !isGalleryPath(`${U}/pitch-lab/1/a.mov`));
}

console.log('\n[3] 차례 · 날짜 묶음');
{
  const items = mergeVideos({
    rows: [
      row({ path: phone(1), capturedDate: null, createdAt: '2026-10-25T00:00:00.000Z' }),
      row({ path: phone(2), capturedDate: '2026-10-20', capturedSource: 'manual' }),
      row({ path: phone(3), capturedDate: '2026-10-24', capturedSource: 'camera', createdAt: '2026-10-24T01:00:00.000Z' }),
      row({ path: phone(4), capturedDate: '2026-10-24', capturedSource: 'camera', createdAt: '2026-10-24T05:00:00.000Z' }),
      row({ path: phone(5), capturedDate: null, createdAt: '2026-10-26T00:00:00.000Z' }),
    ],
    logs: [],
    clips: [],
  });
  check('최근 날짜부터, 같은 날은 늦게 만든 것부터, 모름은 맨 끝', items.map((i) => i.path).join() === [phone(4), phone(3), phone(2), phone(5), phone(1)].join());
  const groups = groupByDate(filterVideos(items, EMPTY_VIDEO_FILTER));
  check('묶음 넷(10-24 · 10-20 · 모름)과 수', groups.map((g) => `${g.date}:${g.rows.length}`).join() === '2026-10-24:2,2026-10-20:1,null:2');
}

console.log('\n[4] 찾기 — 영상 메모 · 기록 총평 둘 다, 어디서 찾았는지');
{
  const items = mergeVideos({
    rows: [
      row({ path: phone(1), feelNote: '릴리스가 늦었다', revisit: true }),
      row({ path: phone(2), sport: 'hit', feelNote: '타이밍 빨랐다' }),
    ],
    logs: [{ log: log({ memo: '오늘은 릴리스 감이 좋았다', cuesGood: ['제구'], date: '2026-10-26' }), paths: [phone(3)] }],
    clips: [],
  });
  const f = (text: string, over = {}) => filterVideos(items, { ...EMPTY_VIDEO_FILTER, text, ...over });
  const rel = f('릴리스');
  check('같은 낱말이 영상 메모 · 총평 둘에서 찾힌다', rel.length === 2);
  check('영상 메모에서 찾으면 note', rel.find((r) => r.item.path === phone(1))?.where === 'note');
  check('총평에서 찾으면 memo', rel.find((r) => r.item.path === phone(3))?.where === 'memo');
  check('감각 칩도 찾는다', f('제구')[0]?.where === 'cue');
  check('날짜 글로 찾는다(10월 26일)', f('10월 26일').some((r) => r.item.path === phone(3)));
  check('날짜 모름 영상도 메모로 찾는다', f('늦었다').length === 1 && f('늦었다')[0].item.date === null);
  check('띄어 쓴 낱말은 모두 맞아야(AND)', f('릴리스 타이밍').length === 0 && f('릴리스 늦었다').length === 1);
  check('종목 고르개', f('', { sport: 'hit' }).length === 1 && f('', { sport: 'pitch' }).length === 2);
  check('즐겨찾기만(revisit 칸 그대로)', f('', { favoriteOnly: true }).map((r) => r.item.path).join() === phone(1));
  check('대소문자 · 공백 무시', filterVideos(mergeVideos({ rows: [row({ feelNote: 'Hip  Lead' })], logs: [], clips: [] }), { ...EMPTY_VIDEO_FILTER, text: ' hip lead ' }).length === 1);
}

console.log('\n[4-2] 기간 — 양끝 포함 · 월말 · 연말 · 윤년 · 날짜 모름');
{
  const r = (kind: 'all' | '7d' | 'thisMonth' | 'lastMonth' | 'custom' | 'unknown', today: string, from?: string, to?: string) =>
    periodRange({ kind, from, to }, today);
  check('최근 7일 = 오늘 포함 7일(월 넘김)', JSON.stringify(r('7d', '2026-03-03')) === JSON.stringify({ from: '2026-02-25', to: '2026-03-03', unknownOnly: false }));
  check('윤년 2월 끝(2024-03-02 의 7일 = 02-25 ~)', r('7d', '2024-03-02').from === '2024-02-25' && r('lastMonth', '2024-03-15').to === '2024-02-29');
  check('평년 2월 끝 28일', r('lastMonth', '2026-03-01').to === '2026-02-28');
  check('지난달 — 1월이면 지난해 12월', JSON.stringify(r('lastMonth', '2026-01-10')) === JSON.stringify({ from: '2025-12-01', to: '2025-12-31', unknownOnly: false }));
  check('이번 달 — 1일 ~ 말일', r('thisMonth', '2026-10-26').from === '2026-10-01' && r('thisMonth', '2026-10-26').to === '2026-10-31');
  check('직접 기간 — 거꾸로 고르면 바꿔 끼움', r('custom', '2026-10-26', '2026-10-20', '2026-10-01').from === '2026-10-01');
  const items = mergeVideos({
    rows: [
      row({ path: phone(1), capturedDate: '2026-10-01', capturedSource: 'header' }),
      row({ path: phone(2), capturedDate: '2026-10-31', capturedSource: 'header' }),
      row({ path: phone(3), capturedDate: '2026-11-01', capturedSource: 'header' }),
      row({ path: phone(4), capturedDate: null }),
      row({ path: phone(5), capturedDate: '2025-10-26', capturedSource: 'header' }),
    ],
    logs: [],
    clips: [],
  });
  const per = (kind: 'all' | 'thisMonth' | 'unknown' | 'custom', from?: string, to?: string) =>
    filterVideos(items, { ...EMPTY_VIDEO_FILTER, period: { kind, from, to } }, '2026-10-26').map((x) => x.item.path);
  check('이번 달 — 10/01 · 10/31 양끝 포함, 11/01 · 날짜 모름 · 작년은 빠짐', per('thisMonth').join() === [phone(2), phone(1)].join());
  check('날짜 모름은 전체 기간에서 맨 끝에 보인다', per('all').at(-1) === phone(4));
  check('날짜 모름만', per('unknown').join() === phone(4));
  check('기간에는 날짜 모름을 안 넣는다', !per('custom', '2020-01-01', '2030-01-01').includes(phone(4)));
  const yearWords = filterVideos(items, { ...EMPTY_VIDEO_FILTER, text: '10월 26일' }).map((x) => x.item.path);
  const y2025 = filterVideos(items, { ...EMPTY_VIDEO_FILTER, text: '2025 10월' }).map((x) => x.item.path);
  check("'10월 26일'은 해마다 · '2025 10월'은 그해로", yearWords.includes(phone(5)) && y2025.join() === phone(5));
}

console.log('\n[4-3] 기록 종류 · 연결 여부 · 여러 기록 · 정렬 · 칩');
{
  const items = mergeVideos({
    rows: [row({ path: phone(9), capturedDate: '2026-10-20', capturedSource: 'header', feelNote: '혼자 찍음' })],
    logs: [
      { log: log({ id: 'a', type: '캐치볼', date: '2026-10-21' }), paths: [phone(1)] },
      { log: log({ id: 'b', type: '불펜', date: '2026-10-22' }), paths: [phone(1)] },
      { log: log({ id: 'c', type: '경기', date: '2026-10-23' }), paths: [phone(2)] },
    ],
    clips: [],
  });
  const f = (over: Partial<VideoFilter>) => filterVideos(items, { ...EMPTY_VIDEO_FILTER, ...over }).map((x) => x.item.path);
  check('기록 여럿 중 뒤의 기록 종류로도 찾는다(logs[0]만 안 봄)', f({ types: ['불펜'] }).join() === phone(1));
  check('종류 여럿은 어느 하나', f({ types: ['불펜', '경기'] }).length === 2);
  check('기록 연결됨 · 연결 없음', f({ linked: 'linked' }).length === 2 && f({ linked: 'unlinked' }).join() === phone(9));
  check('복합(종류 × 연결 × 기간)', f({ types: ['경기'], linked: 'linked', period: { kind: 'custom', from: '2026-10-23', to: '2026-10-23' } }).join() === phone(2));
  check('같은 영상은 기록이 둘이어도 한 번만 센다', f({}).length === 3);
  check('기록 종류 목록은 실제 데이터에서', recordTypes(items).map((t) => t.type).sort().join() === ['경기', '불펜', '캐치볼'].sort().join());
  const all = filterVideos(items, EMPTY_VIDEO_FILTER);
  check('오래된 순 — 오래된 날부터', sortRows(all, 'old').map((x) => x.item.path).join() === [phone(9), phone(1), phone(2)].join());
  const withUnknown = filterVideos(mergeVideos({ rows: [row({ path: phone(7) }), row({ path: phone(8), capturedDate: '2026-01-01', capturedSource: 'header' })], logs: [], clips: [] }), EMPTY_VIDEO_FILTER);
  check('오래된 순에도 날짜 모름은 맨 끝', sortRows(withUnknown, 'old').at(-1)?.item.path === phone(7) && sortRows(withUnknown, 'new').at(-1)?.item.path === phone(7));
  const busy: VideoFilter = { ...EMPTY_VIDEO_FILTER, text: '릴리스', sport: 'pitch', favoriteOnly: true, period: { kind: '7d' }, types: ['불펜'], linked: 'linked' };
  const chips = filterChips(busy, '2026-10-26');
  check('켜진 조건마다 칩 하나', chips.length === 6 && chips.some((c) => c.label === '즐겨찾기'));
  const cleared = chips.reduce((acc, c) => clearChip(acc, c.key), busy);
  check('칩을 다 지우면 처음 조건', !isFilterActive(cleared) && JSON.stringify(cleared) === JSON.stringify(EMPTY_VIDEO_FILTER));
  check('검색 결과에 걸린 글 조각', filterVideos(items, { ...EMPTY_VIDEO_FILTER, text: '혼자' })[0]?.snippet?.includes('혼자') === true);
  const fav = mergeVideos({ rows: [row({ path: phone(1), revisit: true }), row({ path: phone(2), revisit: false })], logs: [], clips: [] });
  check('즐겨찾기만 보는 중 끈 영상은 조건을 바꿀 때까지 자리에(keep)', filterVideos(fav, { ...EMPTY_VIDEO_FILTER, favoriteOnly: true }, undefined, new Set([phone(2)])).length === 2);
  check('그리드 줄 자르기', chunkRows([1, 2, 3, 4, 5], 2).map((r) => r.length).join() === '2,2,1' && chunkRows([1], 0).length === 1);
  const mi = monthIndex(items, filterVideos(items, { ...EMPTY_VIDEO_FILTER, types: ['경기'] }));
  check('월 바로 가기 — 전체 수와 조건에 맞는 수', mi.length === 1 && mi[0].ym === '2026-10' && mi[0].total === 3 && mi[0].shown === 1);
}

console.log('\n[4-4] 즐겨찾기 — 연타 · 실패 · 새로고침이 되돌리지 않음');
{
  type Call = { want: boolean; resolve: (r: { ok: true; revisit: boolean } | { ok: false; error: string }) => void };
  const calls: Call[] = [];
  const shown: boolean[] = [];
  const fails: string[] = [];
  const q = createFavQueue({
    send: (_p, want) => new Promise((resolve) => calls.push({ want, resolve })),
    show: (_p, v) => shown.push(v),
    fail: (_p, e) => fails.push(e),
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  let cur = false;
  cur = q.toggle('a', cur); // true — 보냄
  cur = q.toggle('a', cur); // false
  cur = q.toggle('a', cur); // true
  check('연타 중에는 한 번에 하나만 보낸다', calls.length === 1 && calls[0].want === true);
  calls[0].resolve({ ok: true, revisit: true });
  await flush();
  check('마지막 뜻(켬)이 첫 보냄과 같으면 더 안 보낸다 · 보이는 값 켬', calls.length === 1 && shown.at(-1) === true);
  cur = q.toggle('a', true); // false
  cur = q.toggle('a', cur); // true
  cur = q.toggle('a', cur); // false
  calls[1].resolve({ ok: true, revisit: false });
  await flush();
  check('보내는 사이 바뀐 뜻이 첫 보냄과 같으면 끝', calls.length === 2 && shown.at(-1) === false);
  cur = q.toggle('a', false); // true 보냄
  cur = q.toggle('a', cur); // false 로 바꿈
  calls[2].resolve({ ok: true, revisit: true });
  await flush();
  check('보내는 사이 뜻이 바뀌면 끝난 뒤 마지막 뜻을 한 번 더', calls.length === 4 && calls[3].want === false);
  calls[3].resolve({ ok: false, error: '신호 없음' });
  await flush();
  check('실패하면 서버가 마지막으로 받은 값(켬)으로 되돌리고 알린다', shown.at(-1) === true && fails.length === 1);

  const ov = new Map<string, Override>([['a', { revisit: true, done: 100 }], ['b', { note: '새 메모', done: null }]]);
  const stale = [{ path: 'a', note: null, revisit: false }, { path: 'b', note: '옛 메모', revisit: false }];
  const shownStale = applyOverrides(stale, ov);
  check('고침 전에 떠난 목록 답은 고친 값으로 덮어 보인다', shownStale[0].revisit === true && shownStale[1].note === '새 메모');
  pruneOverrides(ov, 50);
  check('고침이 끝나기 전에 떠난 답으로는 안 놓는다', ov.has('a'));
  pruneOverrides(ov, 200);
  check('끝난 뒤 떠난 답이 오면 놓는다 · 아직 보내는 중인 것은 둔다', !ov.has('a') && ov.has('b'));
}

console.log('\n[5] 메모 다듬기');
check('빈 글 · 공백은 null', cleanFeelNote('   ') === null && cleanFeelNote(undefined) === null && cleanFeelNote(3) === null);
check('겹친 공백 하나로', cleanFeelNote(' 하체가\n\n먼저 ') === '하체가 먼저');
check(`${FEEL_NOTE_MAX}자에서 자른다(한글 기준)`, [...(cleanFeelNote('가'.repeat(300)) ?? '')].length === FEEL_NOTE_MAX);

console.log('\n[5-2] 영상만 저장 — 폰이 보낸 칸 다듬기');
{
  const ok = (raw: unknown) => checkNewVideo(raw, U, '2026-10-26');
  const base = { clientId: 'abcd1234-ef', path: phone(1), sport: 'hit', origin: 'camera', capturedDate: '2026-10-25', capturedSource: 'camera', feelNote: '  좋았다 ' };
  const good = ok(base);
  check('맞는 칸은 그대로', 'value' in good && good.value.sport === 'hit' && good.value.capturedDate === '2026-10-25' && good.value.feelNote === '좋았다' && good.value.capturedSource === 'camera');
  check('남의 폴더 경로는 막는다', 'error' in ok({ ...base, path: `u2/local-1234` }));
  check('.. · 3D 샘플 폴더는 막는다', 'error' in ok({ ...base, path: `${U}/../x` }) && 'error' in ok({ ...base, path: `${U}/pitch-lab/1/a.mov` }));
  check('번호가 없거나 이상하면 막는다', 'error' in ok({ ...base, clientId: '' }) && 'error' in ok({ ...base, clientId: 'a b' }));
  const future = ok({ ...base, capturedDate: '2026-10-27' });
  check('오늘보다 뒤 날짜는 모름으로', 'value' in future && future.value.capturedDate === null && future.value.capturedSource === 'unknown');
  const odd = ok({ ...base, sport: 'golf', origin: 'x', durationSec: -1, width: 'w' });
  check('모르는 종목 · 출처 · 숫자는 기본값', 'value' in odd && odd.value.sport === 'pitch' && odd.value.origin === 'album' && odd.value.durationSec === null && odd.value.width === null);
}

console.log('\n[5-3] 많은 영상 — 0 · 1 · 10 · 100 · 500 · 1,000 · 5,000개 (이 컴퓨터의 순수 함수 시간 — 폰 그리기 · 장면 그림 · 다리 비용은 아님)');
{
  const day = (i: number) => `202${5 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
  const p = (i: number) => `${U}/local-${String(i).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`;
  const make = (n: number) => {
    const logN = Math.floor(n * 0.4);
    const logs = Array.from({ length: logN }, (_, i) => ({ log: log({ id: `l${i}`, date: day(i), type: i % 3 ? '불펜' : '경기', memo: i % 7 ? null : '릴리스 늦음' }), paths: [p(i), p(i + logN)].slice(0, n - i > logN ? 2 : 1) }));
    const rows = Array.from({ length: n - logN * 2 > 0 ? n - logN * 2 : 0 }, (_, i) => row({ path: p(2 * logN + i), feelNote: i % 3 ? null : '하체 먼저', capturedDate: i % 10 ? day(i) : null, revisit: i % 5 === 0 }));
    return mergeVideos({ rows, logs, clips: [] });
  };
  const time = (fn: () => unknown) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };
  const report: string[] = [];
  let worst = 0;
  for (const n of [0, 1, 10, 100, 500, 1000, 5000]) {
    const items = make(n);
    const tDefault = time(() => chunkRows(groupByDate(sortRows(filterVideos(items, EMPTY_VIDEO_FILTER, '2026-10-26'), 'new')), 2));
    const tSearch = time(() => filterVideos(items, { ...EMPTY_VIDEO_FILTER, text: '릴리스 늦음' }, '2026-10-26'));
    const tCombo = time(() => filterVideos(items, { ...EMPTY_VIDEO_FILTER, sport: 'pitch', favoriteOnly: false, types: ['불펜'], linked: 'linked', period: { kind: 'custom', from: '2025-03-01', to: '2026-06-30' } }, '2026-10-26'));
    const tMonth = time(() => monthIndex(items, filterVideos(items, EMPTY_VIDEO_FILTER, '2026-10-26')));
    const tSwap = time(() => {
      const g = groupByDate(filterVideos(items, EMPTY_VIDEO_FILTER, '2026-10-26'));
      g.map((x) => chunkRows(x.rows, 3));
      g.map((x) => chunkRows(x.rows, 1));
    });
    /* 즐겨찾기 칸은 달로 묶는다 · 돌아올 때는 경로로 그 자리를 찾는다(갤러리 locate 와 같은 일) */
    const tFav = time(() => groupByMonth(sortRows(filterVideos(items, { ...EMPTY_VIDEO_FILTER, favoriteOnly: true }, '2026-10-26'), 'new')).map((g) => chunkRows(g.rows, 2)));
    const want = items[Math.floor(items.length / 2)]?.path;
    const tBack = time(() => {
      const g = groupByDate(sortRows(filterVideos(items, EMPTY_VIDEO_FILTER, '2026-10-26'), 'new')).map((x) => chunkRows(x.rows, 2));
      g.findIndex((rows) => rows.some((r) => r.some((x) => x.item.path === want)));
    });
    worst = Math.max(worst, tDefault, tSearch, tCombo, tMonth, tSwap, tFav, tBack);
    report.push(
      `${n}개: 기본 ${tDefault.toFixed(1)} · 검색 ${tSearch.toFixed(1)} · 복합 ${tCombo.toFixed(1)} · 월 ${tMonth.toFixed(1)} · 보기 바꿈 ${tSwap.toFixed(1)} · 즐겨찾기 달 묶음 ${tFav.toFixed(1)} · 복귀 자리 찾기 ${tBack.toFixed(1)}ms`
    );
    if (n === 5000) check('5,000개 카드 수가 맞다', items.length === 5000, String(items.length));
  }
  console.log(report.map((r) => `       ${r}`).join('\n'));
  check('가장 느린 계산도 200ms 밑(이 컴퓨터) — 폰이 몇 배 느려도 검색 한 번에 1초 밑', worst < 200, `${worst.toFixed(1)}ms`);
}

console.log('\n[6] 소스 모양 — 부하 · 계정 · 관리자 자료');
{
  const engine = [...walk('lib/report'), ...walk('lib/engine'), 'lib/pitch-stats.ts'].filter((f) => f.endsWith('.ts'));
  const readers = engine.filter((f) => /userVideo|UserVideo/.test(src(f)));
  check('부하 · 추천 계산(lib/report · lib/engine · pitch-stats)은 UserVideo 를 읽지 않는다', readers.length === 0, readers.join(', '));
  const load = src('lib/my-videos-load.ts');
  const finds = load.match(/\.findMany\(\{\s*where: \{[^}]*/g) ?? [];
  check('목록 읽기 셋이 모두 userId 로 거른다', finds.length === 3 && finds.every((w) => /where: \{ userId/.test(w)), String(finds.length));
  check('구속 측정 클립 · 시도 클립 · 녹화 조각은 갤러리에 안 넣는다(김민 2026-10-27)', !/velocityPitch|velocityAttempt|velocityRecording/.test(load));
  for (const f of ['app/api/pitch-log/video-url/route.ts', 'app/api/pitch-log/thumb-url/route.ts'])
    check(`${f} 는 본인 기록 어디에 붙은 영상이든 주소를 준다(referencedPaths) — 내 영상 · 타격 기록 영상도`, src(f).includes('referencedPaths(requested)') && src(f).includes('isOwnedBy(p, user.id)'));
  const action = src('app/actions/my-videos.ts');
  check('고치기는 로그인 · 본인 경로만', action.includes('getCurrentUser()') && action.includes('isOwnedBy(path, user.id)'));
  check('갤러리 동작은 기록을 만들거나 지우지 않는다', !/prisma\.(pitchLog|hittingLog)\.(create|delete|upsert)/.test(action));
  check(
    '기록에 쓰는 것은 영상 목록(videoPaths)뿐 — 투구수 · 강도 · 스윙 수 · 총평은 안 쓴다(부하 그대로)',
    !/\b(pitchCount|intensity|effortPct|swings|memo|sessionType)\s*:(?!\s*true\b)/.test(action)
  );
  for (const fn of ['linkMyVideo', 'unlinkMyVideo', 'deleteMyVideo']) {
    const body = action.slice(action.indexOf(`export async function ${fn}`));
    check(`${fn} 는 로그인한 사람의 갤러리 영상만(galleryItem)`, body.slice(0, 700).includes('getCurrentUser()') && body.slice(0, 900).includes('galleryItem(user.id'));
  }
  const unlink = action.slice(action.indexOf('export async function unlinkMyVideo'), action.indexOf('export async function deleteMyVideo'));
  check('연결 해제는 영상 줄을 남긴다(keepRow) · 파일은 안 지운다', unlink.includes('keepRow(') && !/deleteUnreferenced|deleteVideos/.test(unlink));
  const del = action.slice(action.indexOf('export async function deleteMyVideo'));
  check('영상 지우기는 구속 측정 클립을 막고, 대표 영상 · 지운 표시를 같이 한다', del.includes('item.clip') && del.includes('dailyFeaturedVideo.deleteMany') && del.includes('deletedAt'));
  check('앱 입구(rpc 허용 목록)에 있다', src('app/api/rpc/registry.ts').includes("'my-videos': myVideos"));
  check(
    '앱 목록의 keyExtractor 는 묶음 머리 줄(영상 없음)에서도 안 터진다(onViewableItemsChanged)',
    /keyExtractor=\{[\s\S]{0,300}\.item\?\.path/.test(src('native/src/videos/gallery.tsx')) &&
      /viewableItems\.flatMap[\s\S]{0,300}\?\.item\?\.path/.test(src('native/src/videos/gallery.tsx'))
  );
  const gallery = ['native/src/app/my-videos/index.tsx', 'native/src/videos/gallery.tsx', 'native/src/videos/gallery-parts.tsx', 'native/src/app/my-videos/view.tsx', 'native/src/app/pitch/compare.tsx'].map(src).join('\n');
  check("화면 글에 '다시 볼'이 남지 않았다(이름은 '즐겨찾기')", !gallery.includes('다시 볼'));
  check('즐겨찾기 별은 추가 · 해제 이름과 선택 상태를 읽어 준다', gallery.includes("'즐겨찾기에서 해제'") && gallery.includes("'즐겨찾기에 추가'") && gallery.includes('accessibilityState={{ selected: on }}'));
  check('목록은 가상화(SectionList) · 줄 자리 계산(getItemLayout) — 다 그리기(map)로 안 돌아감', /<SectionList/.test(gallery) && gallery.includes('getItemLayout'));
  check('즐겨찾기 저장은 줄이 있으면 그 줄만(목록 전체 안 읽음)', /findUnique\([\s\S]{0,120}userId_path[\s\S]{0,400}userVideo\.update/.test(action));
  check('지우기 참조 검사가 UserVideo 를 본다', src('lib/video-refs.ts').includes('prisma.userVideo.findMany'));
}

console.log('\n[7] 비교 시간 셈 — 공통 구간 · 0초 기준 · 끝');
{
  check('null 과 0초 기준을 가른다(0초도 짚은 것)', bothMarked({ a: 0, b: 0 }) && !bothMarked({ a: null, b: 0 }) && !bothMarked({ a: 0, b: null }));
  const r = commonRange(2, 1, 10, 6);
  check('공통 구간 = max(−ma,−mb) ~ min(da−ma, db−mb)', r?.min === -1 && r?.max === 5, JSON.stringify(r));
  const z = commonRange(0, 0, 5, 3);
  check('둘 다 0초 기준이면 0 ~ 짧은 쪽 길이', z?.min === 0 && z?.max === 3, JSON.stringify(z));
  const end = commonRange(5, 3, 5, 3);
  check('기준이 영상 끝이어도 앞쪽 구간은 남는다', end?.min === -3 && end?.max === 0, JSON.stringify(end));
  check('길이를 모르거나 0 이면 구간 없음(NaN 을 안 만든다)', commonRange(1, 1, null, 4) === null && commonRange(1, 1, 0, 4) === null && commonRange(NaN, 1, 4, 4) === null);
  /* 시안 검증과 같은 예 — A 4.6초 · B 2.3초 기준, B 12초 끝에서 A 는 14.3초 */
  const ex = commonRange(4.6, 2.3, 20, 12);
  const at = ex ? sideTimes(ex.max, 4.6, 2.3) : null;
  check('B 끝에서 함께 멈출 때 A 자리 = A 기준 + 상대 시간', !!at && Math.abs(at.b - 12) < 1e-9 && Math.abs(at.a - 14.3) < 1e-9, JSON.stringify(at));
  check('구간 밖은 끝으로 붙인다', clampTo(-9, { min: -1, max: 5 }) === -1 && clampTo(9, { min: -1, max: 5 }) === 5 && clampTo(2, { min: -1, max: 5 }) === 2);
  check('어긋남 = B 상대 − A 상대', driftOf(5, 3, 2, 1) === -1 && driftOf(3, 2, 2, 1) === 0);
  check('장면 걸음은 영상이 알린 간격, 모르거나 이상하면 1/60', sceneStep(30) === 1 / 30 && sceneStep(240) === 1 / 240 && sceneStep(0) === 1 / 60 && sceneStep(1000) === 1 / 60 && sceneStep(null) === 1 / 60);
  check('시각 글', clockText(0) === '0:00.00' && clockText(3.2) === '0:03.20' && clockText(65.456) === '1:05.46' && clockText(null) === '—' && clockText(NaN) === '—', clockText(65.456));
  check("상대 시간 글 — 반올림한 0 은 '−0.0' 이 아니다", relText(-0.4) === '−0.4초' && relText(1.24) === '+1.2초' && relText(-0.04) === '+0.0초', relText(-0.04));
}

console.log('\n[8] 비교 단계 오가기 — 뒤로 길에 고리가 없다 · 취소는 직전 비교로');
{
  type S = { nav: CompareNav; snap: boolean };
  const key = (x: S) => `${x.nav.stage}|${x.nav.pickFrom}|${x.nav.alignFrom}|${x.snap}`;
  const back = (x: S): S | 'exit' => {
    const r = navBack(x.nav, x.snap);
    if (r.to === 'exit') return 'exit';
    if (r.to === 'restore') return { nav: navRestore(x.nav), snap: false };
    return { nav: r.nav, snap: x.snap };
  };
  const moves = (x: S): S[] => {
    const out: S[] = [];
    if (x.nav.stage !== 'pick') out.push({ nav: navOpenPick(x.nav), snap: x.nav.stage === 'compare' ? true : x.snap });
    if (x.nav.stage === 'pick') {
      out.push({ nav: navPickNext(x.nav), snap: x.snap });
      if (x.snap) out.push({ nav: navRestore(x.nav), snap: false });
    }
    if (x.nav.stage === 'compare') out.push({ nav: navRealign(x.nav), snap: true });
    if (x.nav.stage === 'align') out.push({ nav: navCompare(x.nav), snap: false });
    const b = back(x);
    if (b !== 'exit') out.push(b);
    return out;
  };
  const seen = new Map<string, S>();
  const queue: S[] = [
    { nav: navStart(false), snap: false },
    { nav: navStart(true), snap: false },
  ];
  while (queue.length) {
    const x = queue.shift() as S;
    if (seen.has(key(x))) continue;
    seen.set(key(x), x);
    queue.push(...moves(x));
  }
  let worstBack = 0;
  const loops: string[] = [];
  for (const x of seen.values()) {
    let cur: S | 'exit' = x;
    const path = new Set<string>();
    let n = 0;
    while (cur !== 'exit') {
      const k: string = key(cur);
      if (path.has(k)) {
        loops.push(key(x));
        break;
      }
      path.add(k);
      cur = back(cur);
      n++;
    }
    worstBack = Math.max(worstBack, n);
  }
  check('어느 단계에서든 뒤로만 눌러 들어온 곳에 닿는다(고리 없음)', loops.length === 0, loops.join(' · '));
  check('뒤로는 많아야 네 번(고르기 → 맞추기 → 고르기 → 비교 → 들어온 곳)', worstBack <= 4, `${worstBack}번 · 상태 ${seen.size}개`);
  const swipeBad = [...seen.values()].filter((x) => navSwipeOk(x.nav) && back(x) !== 'exit').map(key);
  check('밀어서 뒤로가 켜진 단계는 뒤로가 곧 들어온 곳', swipeBad.length === 0, swipeBad.join(' · '));

  const walk2 = (steps: ((x: S) => S | 'exit')[], from: S) => steps.reduce<S | 'exit'>((x, f) => (x === 'exit' ? 'exit' : f(x)), from);
  const open = (x: S): S => ({ nav: navOpenPick(x.nav), snap: x.nav.stage === 'compare' ? true : x.snap });
  const next = (x: S): S => ({ nav: navPickNext(x.nav), snap: x.snap });
  const go = (x: S): S => ({ nav: navCompare(x.nav), snap: false });
  const re = (x: S): S => ({ nav: navRealign(x.nav), snap: true });
  const mine: S = { nav: navStart(false), snap: false };
  const log: S = { nav: navStart(true), snap: false };
  const st = (x: S | 'exit') => (x === 'exit' ? 'exit' : `${x.nav.stage}${x.snap ? '+snap' : ''}`);
  check('내 영상: 처음 고르기의 뒤로는 상세', st(back(mine)) === 'exit');
  check('처음 맞추기의 뒤로는 고르기, 그 뒤로는 상세', st(walk2([next, back], mine)) === 'pick' && st(walk2([next, back, back], mine)) === 'exit');
  check('완성된 비교의 뒤로는 상세', st(walk2([next, go, back], mine)) === 'exit');
  check('비교 → 장면 다시 맞추기 → 뒤로 = 직전 비교', st(walk2([next, go, re, back], mine)) === 'compare');
  check('비교 → B 바꾸기 → 뒤로 = 직전 비교', st(walk2([next, go, open, back], mine)) === 'compare');
  check('비교 → B 바꾸기 → 새 B 맞추기 → 뒤로 → 뒤로 = 직전 비교', st(walk2([next, go, open, next, back, back], mine)) === 'compare');
  check('고르기에서 온 맞추기의 B 바꾸기는 고르기를 쌓지 않는다(뒤로 한 번에 상세)', st(walk2([next, open, back], mine)) === 'exit');
  check('다시 맞추기 → B 바꾸기 → 뒤로 → 뒤로 = 직전 비교', st(walk2([next, go, re, open, back, back], mine)) === 'compare');
  check('투구 기록(2분할)에서 들어오면 맞추기의 뒤로는 그 목록', st(back(log)) === 'exit' && st(walk2([open, back, back], log)) === 'exit');
}

console.log('\n[9] 메모 저장 줄 — 마지막 글이 이긴다 · 늦은 답 · 실패는 메모만 · 로그아웃');
{
  const sends: { path: string; note: string | null; resolve: (r: NoteSent) => void }[] = [];
  const shown: [string, string | null, boolean][] = [];
  const q = createNoteQueue({
    send: (path, note) => new Promise<NoteSent>((resolve) => sends.push({ path, note, resolve })),
    show: (p, n, d) => shown.push([p, n, d]),
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const r1 = q.save('v1', '첫 글', '예전');
  const r2 = q.save('v1', '둘째', '예전');
  const r3 = q.save('v1', '셋째', '예전');
  check('한 영상은 한 번에 하나만 보낸다', sends.length === 1 && sends[0].note === '첫 글');
  sends[0].resolve({ ok: true, note: '첫 글' });
  const o1 = await r1;
  await flush();
  check('앞 답은 더 새 글이 있으면 superseded(화면을 덮지 않음)', o1.ok && o1.superseded === true && !shown.some(([, n, d]) => d && n === '첫 글'));
  check('기다리던 글은 마지막 것 하나만 보낸다', sends.length === 2 && sends[1].note === '셋째');
  sends[1].resolve({ ok: false, error: '신호' });
  const [o2, o3] = await Promise.all([r2, r3]);
  check('실패하면 둘 다 실패로 알리고', !o2.ok && !o3.ok);
  check('보이는 메모는 서버가 마지막으로 받은 글로(즐겨찾기는 안 건드림)', shown[shown.length - 1][1] === '첫 글' && shown[shown.length - 1][2] === true);
  const r4 = q.save('v2', ' 하체  먼저 ', null);
  sends[2].resolve({ ok: true, note: '하체 먼저' });
  const o4 = await r4;
  check('서버가 다듬은 글을 그대로 보인다', o4.ok && o4.note === '하체 먼저' && shown[shown.length - 1][1] === '하체 먼저');
  const r5 = q.save('v3', '로그아웃 전', null);
  q.reset();
  /* 보내던 중에 로그아웃 — 답이 와도 버린다 */
  sends[3].resolve({ ok: true, note: '로그아웃 전' });
  const o5 = await r5;
  await flush();
  check('로그아웃하면 기다리던 저장은 버린다(dropped) · 늦은 답이 화면에 안 붙는다', !!o5.dropped && !shown.some(([p, , d]) => p === 'v3' && d));
}

console.log('\n[10] 즐겨찾기 달 묶음');
{
  const it = (date: string | null) => ({ item: { date } as unknown as Parameters<typeof groupByMonth>[0][number]['item'] });
  const g = groupByMonth([it('2026-10-03'), it('2026-10-01'), it('2026-09-30'), it(null)]);
  check('같은 달끼리 · 날짜 모름은 따로', g.length === 3 && g[0].date === '2026-10' && g[0].rows.length === 2 && g[1].date === '2026-09' && g[2].date === null, JSON.stringify(g.map((x) => [x.date, x.rows.length])));
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);

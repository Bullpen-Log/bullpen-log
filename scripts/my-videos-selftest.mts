/**
 * '내 영상' 갤러리 규칙(lib/my-videos.ts) 셀프테스트 — npm run my-videos:test
 *
 * 합치기(경로 하나 = 카드 하나) · 지운 영상 숨김 · 날짜 묶음 · 찾기(어디서 찾았나) · 메모 다듬기, 그리고 소스 모양으로
 * 부하 계산이 이 표를 읽지 않는지 · 읽기가 본인 것만 · 관리자 자료(보정용)를 빼는지 본다. 운영 DB 는 읽지도 쓰지도 않는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import {
  EMPTY_VIDEO_FILTER,
  FEEL_NOTE_MAX,
  checkNewVideo,
  cleanFeelNote,
  filterVideos,
  groupByDate,
  isGalleryPath,
  mergeVideos,
  type MyVideoLog,
  type MyVideoRow,
} from '../lib/my-videos.ts';

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
  check('다시 보기만', f('', { revisitOnly: true }).map((r) => r.item.path).join() === phone(1));
  check('대소문자 · 공백 무시', filterVideos(mergeVideos({ rows: [row({ feelNote: 'Hip  Lead' })], logs: [], clips: [] }), { ...EMPTY_VIDEO_FILTER, text: ' hip lead ' }).length === 1);
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

console.log('\n[5-3] 많은 영상 — 합치기 · 찾기 · 묶기가 화면을 멈추지 않는가');
{
  const day = (i: number) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
  const p = (i: number) => `${U}/local-${String(i).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`;
  const logs = Array.from({ length: 2000 }, (_, i) => ({ log: log({ id: `l${i}`, date: day(i), memo: i % 7 ? null : '릴리스 늦음' }), paths: [p(i), p(i + 2000)] }));
  const clips = Array.from({ length: 1000 }, (_, i) => ({ path: p(4000 + i), clip: { pitchId: `p${i}`, sessionId: 's', date: day(i), kmh: 120, pitchType: null } }));
  const rows = Array.from({ length: 1000 }, (_, i) => row({ path: p(i), feelNote: i % 3 ? null : '하체 먼저', capturedDate: day(i) }));
  const t0 = performance.now();
  const items = mergeVideos({ rows, logs, clips });
  const hits = filterVideos(items, { ...EMPTY_VIDEO_FILTER, text: '릴리스 늦음' });
  const groups = groupByDate(filterVideos(items, EMPTY_VIDEO_FILTER));
  const ms = performance.now() - t0;
  check('영상 5,000개 — 카드 수가 맞다', items.length === 5000, String(items.length));
  check('찾기 · 묶기가 결과를 낸다', hits.length > 0 && groups.length > 0 && groups.length <= 336);
  check('합치기 + 찾기 + 묶기가 300ms 안(폰은 몇 배 느려도 1초 밑)', ms < 300, `${Math.round(ms)}ms`);
}

console.log('\n[6] 소스 모양 — 부하 · 계정 · 관리자 자료');
{
  const engine = [...walk('lib/report'), ...walk('lib/engine'), 'lib/pitch-stats.ts'].filter((f) => f.endsWith('.ts'));
  const readers = engine.filter((f) => /userVideo|UserVideo/.test(src(f)));
  check('부하 · 추천 계산(lib/report · lib/engine · pitch-stats)은 UserVideo 를 읽지 않는다', readers.length === 0, readers.join(', '));
  const load = src('lib/my-videos-load.ts');
  const finds = load.match(/\.findMany\(\{\s*where: \{[^}]*/g) ?? [];
  check('목록 읽기 넷이 모두 userId 로 거른다', finds.length === 4 && finds.every((w) => /where: \{ userId/.test(w)), String(finds.length));
  check('보정용 세션 클립은 뺀다', load.includes('forCalibration: false'));
  check('광각 클립 · 시도 클립 · 녹화 조각은 안 읽는다', !/wideClipPath|velocityAttempt|velocityRecording/.test(load));
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
  check('지우기 참조 검사가 UserVideo 를 본다', src('lib/video-refs.ts').includes('prisma.userVideo.findMany'));
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);

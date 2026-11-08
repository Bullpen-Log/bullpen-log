/**
 * 투구 기록 퀵스텝의 규칙(native/src/pitch/entry-model.ts) 시험 — 화면(quick-step.tsx)이 그대로 쓰는 순수 함수만 본다.
 * 실행: npm run native-pitch-entry:test
 * 실제 저장 · 네트워크 · 권한 · 기기 저장소는 이 시험이 보지 못한다(그건 실기기에서).
 */
import assert from 'node:assert/strict';
import {
  bumpCount,
  buildEntry,
  countError,
  draftKey,
  fatigueLabel,
  findCreated,
  firstStep,
  initialForm,
  linkStatus,
  matchesEntry,
  measuredFrom,
  readDraftBody,
  restLoses,
  retryableLink,
  saveProblem,
  speedText,
  speedValue,
  stepProblem,
  switchSpeedUnit,
  toggleCue,
  typeSpeed,
  type EntryForm,
  type EntrySource,
} from '~/pitch/entry-model';
import type { PitchLog } from '~/pitch/api';
import type { LogPrefill, VelocitySessionView } from '@/lib/velocity-meta';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const ok = (v: unknown, m: string) => {
  assert.ok(v, m);
  n++;
};

const log = (p: Partial<PitchLog> = {}): PitchLog => ({
  id: 'L1',
  date: '2026-10-29T00:00:00.000Z',
  sessionType: '불펜',
  pitchCount: 30,
  intensity: 7,
  effortPct: 70,
  maxVelocity: null,
  avgVelocity: null,
  memo: null,
  videoPaths: [],
  satisfaction: null,
  cuesGood: [],
  cuesBad: [],
  createdAt: '2026-10-29T03:00:00.000Z',
  ...p,
});
const NEW: EntrySource = { kind: 'new' };
const build = (f: EntryForm, source: EntrySource = NEW, videoPaths: string[] = []) => buildEntry(f, { date: '2026-10-29', source, videoPaths });

/* 1) 빈 신규 — 종류 · 공 수 · 피로 기본값 없음, 단계 검사 */
{
  const f = initialForm(NEW, 'kmh');
  eq([f.type, f.count, f.effortPct], ['', '', null], '새 기록은 비어서 시작');
  eq(firstStep(NEW, f), 0, '종류부터');
  eq(stepProblem(f, 0)?.field, 'type', '종류 안 고르면 다음 막힘');
  eq(stepProblem({ ...f, type: '불펜' }, 1)?.field, 'count', '공 수 빈칸');
  eq(stepProblem({ ...f, type: '불펜', count: '30' }, 2)?.field, 'effort', '피로 안 고름');
  eq(saveProblem({ ...f, type: '불펜', count: '30' }, 'kmh', 'km/h')?.step, 2, '저장 때 피로 없으면 그 단계로');
}

/* 2) 불펜 30구 · 피로 7 → 저장 몸(7 = 70%) */
{
  const f: EntryForm = { ...initialForm(NEW, 'kmh'), type: '불펜', count: '30', effortPct: 70 };
  eq(saveProblem(f, 'kmh', 'km/h'), null, '정상 입력은 통과');
  const e = build(f);
  eq([e.sessionType, e.pitchCount, e.effortPct, e.maxVelocity, e.avgVelocity], ['불펜', 30, 70, null, null], '저장값');
  ok(!('intensity' in e) && !('velocitySessionIds' in e) && !('baseVideoPaths' in e), '새 기록엔 옛 칸 · 측정 · 기준 영상 없음');
  eq([e.satisfaction, e.cuesGood, e.cuesBad], [null, [], []], '불펜은 만족도 칸을 보낸다(비었으면 비움)');
  eq(fatigueLabel(70), '7/10 · 꽤 지침', '피로 글');
}

/* 4) 잘못된 공 수 — 빈 값 · 0 · 음수 · 소수 · 문자 섞임 · 501 */
for (const [t, why] of [
  ['', '빈 값'],
  ['0', '0'],
  ['-3', '음수'],
  ['30.5', '소수'],
  ['30.', '소수점만'],
  ['30abc', '문자 섞임'],
  ['501', '501'],
  [' ', '공백'],
] as const) {
  ok(countError(t) != null, `공 수 '${t}'(${why})는 막힘`);
  const f: EntryForm = { ...initialForm(NEW, 'kmh'), type: '불펜', count: t, effortPct: 70 };
  eq(saveProblem(f, 'kmh', 'km/h')?.step, 1, `'${t}'은 저장 안 됨 — 공 수 단계로`);
}
eq(countError('500'), null, '500 은 됨');
eq(countError('1'), null, '1 은 됨');
eq(bumpCount('', 1), '1', '빈칸에서 + 는 1');
eq(bumpCount('', 10), '10', '빈칸에서 +10');
eq(bumpCount('1', -1), '1', '1 밑으로 안 내림');
eq(bumpCount('', -1), '', '빈칸에서 − 는 그대로');
eq(bumpCount('30abc', 5), '30abc', '틀린 글자는 버튼이 바꾸지 않음(고치게)');
eq(bumpCount('495', 10), '505', '500 을 넘기면 그대로 두고(잘라 내지 않음)');
ok(countError('505') != null, '…오류로 알린다');

/* 9) 구속 — 선택 · 평균 > 최고 · 범위 · 단위 오가기 */
{
  const base: EntryForm = { ...initialForm(NEW, 'kmh'), type: '불펜', count: '30', effortPct: 70 };
  eq(saveProblem(base, 'kmh', 'km/h'), null, '구속 없어도 됨');
  eq(build(base).maxVelocity, null, '빈 구속은 null');
  const bad = { ...base, max: typeSpeed('120', 'kmh'), avg: typeSpeed('130', 'kmh') };
  eq(saveProblem(bad, 'kmh', 'km/h')?.field, 'speed', '평균 > 최고는 막힘');
  eq(saveProblem({ ...base, max: typeSpeed('20', 'kmh') }, 'kmh', 'km/h')?.field, 'speed', '30 밑 막힘');
  eq(saveProblem({ ...base, max: typeSpeed('13O', 'kmh') }, 'kmh', 'km/h')?.field, 'speed', '숫자 아닌 글자 막힘(버리지 않음)');
  /* mph 로 친 82 → km/h 132(소수 한 자리) */
  const mph = { ...base, max: typeSpeed('82', 'mph') };
  eq(build(mph).maxVelocity, 132, 'mph 82 → 132km/h');
  /* 단위를 열 번 오가도 값이 안 변함 */
  let f = mph.max;
  let unit: 'kmh' | 'mph' = 'mph';
  for (let i = 0; i < 10; i++) {
    unit = unit === 'mph' ? 'kmh' : 'mph';
    f = switchSpeedUnit(f, unit);
  }
  const v = speedValue(f);
  eq('kmh' in v ? v.kmh : null, 132, '단위 열 번 오가도 132');
  eq(speedText(f, 'mph'), '82', 'mph 로 보이면 82');
  /* 받은 값(기록)은 손대지 않으면 그대로 — 반올림하지 않는다 */
  const edit = initialForm({ kind: 'edit', log: log({ maxVelocity: 131.37 }) }, 'mph');
  const e2 = build(edit, { kind: 'edit', log: log({ maxVelocity: 131.37 }) });
  eq(e2.maxVelocity, 131.37, '손대지 않은 기록 구속은 그대로');
}

/* 8) 감각 — 한쪽에만 */
{
  const f: EntryForm = { ...initialForm(NEW, 'kmh'), good: ['릴리스'], bad: [] };
  const a = toggleCue(f, '릴리스', 'bad');
  eq(a, { good: [], bad: ['릴리스'] }, '아쉬움으로 옮기면 좋았던 것에서 빠짐');
  const catchball: EntryForm = { ...initialForm(NEW, 'kmh'), type: '캐치볼', count: '20', effortPct: 30, satisfaction: 4, good: ['제구'] };
  ok(!('satisfaction' in build(catchball)), '캐치볼은 만족도 칸을 안 보냄(서버가 비움)');
}

/* 10) 휴식 */
{
  const f: EntryForm = { ...initialForm(NEW, 'kmh'), type: '휴식', memo: '이동일' };
  eq(saveProblem(f, 'kmh', 'km/h'), null, '휴식은 공 수 · 피로 없이 저장');
  const e = build(f);
  eq([e.pitchCount, e.effortPct, e.maxVelocity, e.avgVelocity], [0, null, null, null], '휴식 저장값');
  eq(restLoses({ ...initialForm(NEW, 'kmh'), type: '불펜', count: '30', effortPct: 70 }), ['투구 수', '팔의 피로'], '바꾸면 잃는 것을 알림');
  eq(restLoses(initialForm(NEW, 'kmh')), [], '빈 폼은 묻지 않음');
  /* 영상이 붙은 기록을 휴식으로 바꿔도 영상은 그대로 보낸다(지우지 않음) */
  const withVideo = log({ videoPaths: ['u/a.mov'] });
  const restEdit = build({ ...initialForm({ kind: 'edit', log: withVideo }, 'kmh'), type: '휴식' }, { kind: 'edit', log: withVideo }, ['u/a.mov']);
  eq([restEdit.videoPaths, restEdit.baseVideoPaths], [['u/a.mov'], ['u/a.mov']], '휴식으로 바꿔도 영상 유지');
  /* 휴식 → 투구로 고치기는 같은 기록(PATCH) — 몸에 id 는 부르는 쪽이, 저장값은 투구로 */
  const r = log({ sessionType: '휴식', pitchCount: 0, intensity: 0, effortPct: null });
  const fr = initialForm({ kind: 'edit', log: r }, 'kmh');
  eq([fr.type, fr.count, fr.effortPct], ['휴식', '', null], '쉬는 날 기록 채우기');
}

/* 11) 옛 기록 — 8.5 · 0.5 · intensity 만 있는 기록의 메모만 고치기 */
{
  const l85 = log({ intensity: 9, effortPct: 85 });
  const f85 = initialForm({ kind: 'edit', log: l85 }, 'kmh');
  eq(f85.effortPct, 85, '85% 는 85 그대로(9 로 반올림 안 함)');
  eq(fatigueLabel(85), '8.5/10 · 다 씀', '8.5 표시');
  eq(build({ ...f85, memo: '메모만' }, { kind: 'edit', log: l85 }).effortPct, 85, '메모만 고쳐도 85 유지');
  const l5 = log({ intensity: 1, effortPct: 5 });
  eq(build(initialForm({ kind: 'edit', log: l5 }, 'kmh'), { kind: 'edit', log: l5 }).effortPct, 5, '5%(0.5) 유지');
  const old = log({ intensity: 8, effortPct: null });
  const fo = initialForm({ kind: 'edit', log: old }, 'kmh');
  eq(fo.effortPct, 80, '옛 1~10 은 ×10 으로 채움');
  const eo = build({ ...fo, memo: '메모만' }, { kind: 'edit', log: old });
  ok(!('effortPct' in eo) && eo.intensity === 8, '옛 기록 강도를 안 바꾸면 옛 1~10 을 보냄(서버가 % 를 비운 채 둠)');
  const ec = build({ ...fo, effortPct: 60 }, { kind: 'edit', log: old });
  ok(ec.effortPct === 60 && !('intensity' in ec), '바꾸면 새 % 로');
  eq(firstStep({ kind: 'edit', log: old }, fo), 2, '고치기는 마지막 단계에서 연다');
  eq(build(fo, { kind: 'edit', log: old }).date, '2026-10-29', '날짜는 그 기록의 날 그대로');
}

/* 5 · 6) 측정 출처 — 측정 18구 → 전체 35구, 표본 · 못 잰 공 · 종류 없음 */
{
  const pitch = (kmh: number, excluded = false) => ({ id: `p${kmh}`, kmh, result: null, releaseDxCm: null, releaseDyCm: null, ...(excluded ? { excluded } : {}) });
  const sessions = [
    { id: 'S1', createdAt: '2026-10-29T01:00:00.000Z', pitchLogId: null, pitches: Array.from({ length: 10 }, (_, i) => pitch(120 + i)) },
    { id: 'S2', createdAt: '2026-10-29T02:00:00.000Z', pitchLogId: null, pitches: [...Array.from({ length: 6 }, (_, i) => pitch(110 + i)), pitch(150, true), pitch(151, true)] },
  ] as unknown as VelocitySessionView[];
  const pf: LogPrefill = { sessionIds: ['S1', 'S2'], sessionType: null, pitchCount: 18, effortPct: null, maxVelocity: 129, avgVelocity: 120.3, missed: 3 };
  const m = measuredFrom(pf, sessions);
  eq([m.measured, m.sample, m.missed, m.maxKmh, m.avgKmh], [18, 16, 3, 129, 120.3], '서버 값 그대로 · 평균 표본은 제외 공 빼고');
  const src: EntrySource = { kind: 'measured', m };
  const f = initialForm(src, 'kmh');
  eq([f.type, f.count, f.effortPct], ['', '18', null], '종류 없으면 비움(불펜 안 고름) · 공 수는 측정 수 · 피로 없으면 고르게');
  eq(firstStep(src, f), 0, '종류가 없으면 종류부터');
  const typed = initialForm({ kind: 'measured', m: { ...m, sessionType: '불펜', effortPct: 80 } }, 'kmh');
  eq([typed.type, typed.effortPct, firstStep({ kind: 'measured', m: { ...m, sessionType: '불펜' } }, typed)], ['불펜', 80, 1], '종류 · 피로가 있으면 유지, 공 수 확인부터');
  const total = { ...typed, count: '35' };
  const e = build(total, { kind: 'measured', m });
  eq([e.pitchCount, e.maxVelocity, e.avgVelocity, e.velocitySessionIds], [35, 129, 120.3, ['S1', 'S2']], '전체 35구 · 측정 평균은 그대로(35로 나누지 않음) · 세션 이음');
  ok(!('velocitySessionIds' in build({ ...total, type: '휴식' }, { kind: 'measured', m })), '휴식으로 바꾸면 측정을 잇지 않음');
  eq(initialForm({ kind: 'measured', m: { ...m, effortPct: 3 } }, 'kmh').effortPct, null, '범위 밖 피로는 쓰지 않음');
}

/* 7) 저장 성공 · 연결 결과 따로 */
{
  eq(linkStatus(null, []), 'none', '측정 없음');
  eq(linkStatus(null, ['S1']), 'unknown', '답에 연결 결과 없음 = 확인 못 함');
  eq(linkStatus({ requested: ['S1'], linked: ['S1'], failed: [] }, ['S1']), 'linked', '연결됨');
  const part = { requested: ['S1', 'S2'], linked: ['S1'], failed: [{ id: 'S2', reason: 'error' as const }] };
  eq(linkStatus(part, ['S1', 'S2']), 'partial', '일부');
  ok(retryableLink(part), 'DB 오류는 다시 시도');
  ok(!retryableLink({ requested: ['S2'], linked: [], failed: [{ id: 'S2', reason: 'other' }] }), '다른 기록에 이미 이어진 것은 다시 해도 안 됨');
}

/* 13) 답을 못 받음 — 보내기 전에 없던 기록 중 같은 값만 '저장됨' */
{
  const f: EntryForm = { ...initialForm(NEW, 'kmh'), type: '불펜', count: '30', effortPct: 70, memo: ' 좋았음 ' };
  const e = build(f);
  const before = new Set(['A']);
  const sameOld = log({ id: 'A', memo: '좋았음' });
  const made = log({ id: 'B', memo: '좋았음' });
  eq(findCreated([sameOld], e, before), null, '보내기 전부터 있던 같은 값 기록은 내 것이 아님');
  eq(findCreated([sameOld, made], e, before)?.id, 'B', '새로 생긴 같은 값 기록 = 방금 저장한 것');
  eq(findCreated([log({ id: 'C', pitchCount: 31, memo: '좋았음' })], e, before), null, '값이 다르면 아님');
  ok(matchesEntry(made, e), '메모 앞뒤 빈칸은 서버처럼 자름');
  ok(!matchesEntry({ ...made, effortPct: 85 }, e), '피로만 다르면 저장 완료로 오판하지 않음');
  /* 서버는 칩을 정해진 차례로 저장한다(cleanCues) — 누른 차례가 달라도 같은 기록 */
  const cued = { ...e, cuesGood: ['밸런스', '릴리스'] };
  ok(matchesEntry({ ...made, cuesGood: ['릴리스', '밸런스'] }, cued), '칩 차례가 달라도 저장된 기록으로 찾음');
  ok(!matchesEntry({ ...made, cuesGood: ['릴리스'] }, cued), '칩이 빠지면 다른 기록');
}

/* 15) 초안 — 계정 · 날짜 · 기록이 맞을 때만, 7일, 옛 꼴은 쓰지 않음 */
{
  const now = Date.parse('2026-10-29T10:00:00Z');
  const form = { ...initialForm(NEW, 'kmh'), type: '불펜', count: '30' };
  const body = { v: 2, owner: 'U1', date: '2026-10-29', recordId: null, savedAt: now - 1000, step: 1, form };
  eq(readDraftBody(body, { owner: 'U1', date: '2026-10-29', recordId: null }, now)?.form.count, '30', '같은 계정이면 채움');
  eq(readDraftBody(body, { owner: 'U2', date: '2026-10-29', recordId: null }, now), null, '다른 계정 초안은 안 씀');
  eq(readDraftBody(body, { owner: 'U1', date: '2026-10-28', recordId: null }, now), null, '다른 날 초안은 안 씀');
  eq(readDraftBody(body, { owner: 'U1', date: '2026-10-29', recordId: 'L1' }, now), null, '다른 기록 초안은 안 씀');
  eq(readDraftBody({ ...body, savedAt: now - 8 * 864e5 }, { owner: 'U1', date: '2026-10-29', recordId: null }, now), null, '7일 지나면 안 씀');
  eq(readDraftBody({ savedAt: now, form: { type: '불펜', count: '30' } }, { owner: 'U1', date: '2026-10-29', recordId: null }, now), null, '계정 칸 없는 옛 초안은 안 씀');
  ok(draftKey('U1', '2026-10-29', null).startsWith('pitch-draft:v2:U1:'), '열쇠에 계정');
}

console.log(`투구 기록 퀵스텝 규칙 ${n}개 통과`);

/**
 * 프로그램 상세 → 운동 완료(2026-10-30 확정 시안 01~09) 계약 시험 — `npm run program-workout:test`.
 *
 * 화면 모양을 베끼지 않는다. 지키는 것은 데이터 · 저장 계약이다:
 *   1. 종료 뒤 결과 가르기(lib/workout/finish-state.ts) — 기준 미달 · 다음 세션 · 전체 완료 · 아직 처리 안 됨 · 확인 불가, 강도 · 메모 저장 여부
 *   2. 프로그램 개요(programOutline · variantKindOf · usedVariants perWeek) — 주 2 · 3번이 같은 기준으로, 합집합을 하루 구성처럼 쓰지 않게
 *   3. 서버 동작의 쓰기 경계(소스 모양) — 등록 요청 번호 · 자물쇠, 워밍업 조건부 갱신, 종료 영수증 · 읽기 전용 조회, 강도 1~10 숫자
 *   4. 앱 화면의 경계(소스 모양) — 준비 · 상세는 쓰지 않음, 강도 슬라이더 초기 null, 값 검사가 대기열보다 먼저, 세트를 한 세트로 합치지 않음
 */
import { readFileSync } from 'node:fs';
import { finishNoteOf, noteStateOf, programStateOf } from '../lib/workout/finish-state.ts';
import {
  ACCESSORY_KEYS,
  PROGRAMS,
  ROTATING_VARIANTS,
  audienceOf,
  programOutline,
  readSessionProgram,
  usedVariants,
  variantKindOf,
  type PerWeek,
} from '../lib/program/program.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  실패 ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ─────────── 1. 종료 뒤 결과 ─────────── */
console.log('[1] 종료 뒤 결과 — 기준 미달과 처리 실패를 가른다');
{
  const base = { day: 3, totalDays: 12, label: '3번 세션 · A 날', nextLabel: '4번 세션 · B 날', name: '5/3/1', planned: 11, needed: 6 };
  const st = (logged: number, row: { nextDay: number; status: string } | null, sessionStatus = 'FINISHED') =>
    programStateOf({ ...base, logged, row, sessionStatus }).state;
  check('기준 미달(5/11, 필요 6) → below — 회차 줄과 상관없이', st(5, { nextDay: 3, status: 'active' }) === 'below');
  check('기준 미달인데 건너뛰기로 nextDay 가 넘어가도 below', st(5, { nextDay: 4, status: 'active' }) === 'below');
  check('기준 충족 + 일차 넘어감 → advanced', st(6, { nextDay: 4, status: 'active' }) === 'advanced');
  check('기준 충족 + 아직 같은 일차(뒤처리 실패) → pending', st(6, { nextDay: 3, status: 'active' }) === 'pending');
  check('기준 충족 + 회차 줄 없음(그만둠 · 다른 회차) → unknown', st(6, null) === 'unknown');
  check('기준 충족 + 그만둔 줄 → unknown', st(6, { nextDay: 3, status: 'stopped' }) === 'unknown');
  check('아직 열린 판은 pending 이 아니다(마치지 않았다)', st(6, { nextDay: 3, status: 'active' }, 'ACTIVE') === 'unknown');
  check(
    '마지막 세션 · 끝난 줄 → done',
    programStateOf({ ...base, day: 12, logged: 6, row: { nextDay: 13, status: 'done' }, sessionStatus: 'FINISHED' }).state === 'done'
  );
  check('처방 세트가 0 이면 넘기지 않는다(below)', programStateOf({ ...base, planned: 0, needed: 0, logged: 0, row: { nextDay: 3, status: 'active' }, sessionStatus: 'FINISHED' }).state === 'below');

  const at = '2026-10-30T10:00:00.000Z';
  check('제출 없음 → none', noteStateOf(null, null).state === 'none');
  check('강도 없이 마침 → none(기존 줄은 그대로 보임)', noteStateOf({ intensity: null, memo: null, at }, { intensity: 4, memo: '옛 메모' }).state === 'none');
  check('제출 7 · 저장 없음 → pending', noteStateOf({ intensity: 7, memo: null, at }, null).state === 'pending');
  check('제출 7 · 저장 7 → saved', noteStateOf({ intensity: 7, memo: null, at }, { intensity: 7, memo: '옛 메모' }).state === 'saved');
  check('제출 4 · 저장 4 → saved(3/5/7/9 로 반올림하지 않음)', [1, 4, 6, 8, 10].every((n) => noteStateOf({ intensity: n, memo: null, at }, { intensity: n, memo: null }).state === 'saved'));
  check('제출 8 · 저장 7(옛 값) → pending', noteStateOf({ intensity: 8, memo: null, at }, { intensity: 7, memo: null, updatedAt: new Date('2026-10-30T09:00:00Z') }).state === 'pending');
  check('제출 뒤 다른 곳에서 고친 줄이 이긴다 → saved', noteStateOf({ intensity: 8, memo: null, at }, { intensity: 5, memo: null, updatedAt: new Date('2026-10-30T11:00:00Z') }).state === 'saved');
  check('메모를 같이 냈으면 메모까지 같아야 saved', noteStateOf({ intensity: 6, memo: '무릎', at }, { intensity: 6, memo: null }).state === 'pending');

  check('finishNote 읽기 — 1~10 정수만', finishNoteOf({ finishNote: { intensity: 4, memo: ' 좋음 ', at } })?.intensity === 4 && finishNoteOf({ finishNote: { intensity: 4, memo: ' 좋음 ', at } })?.memo === '좋음');
  check('finishNote 읽기 — 0 · 11 · 4.5 는 버린다', [0, 11, 4.5].every((n) => finishNoteOf({ finishNote: { intensity: n, memo: null, at } })?.intensity === null));
  check('finishNote 없음 → null', finishNoteOf({ themeKey: 'lower', exercises: [] }) === null);
  check('판의 회차 번호(rowId)를 읽는다 · 옛 판은 없음', readSessionProgram({ key: '531', day: 2, week: 1, rowId: 'r1' })?.rowId === 'r1' && readSessionProgram({ key: '531', day: 2, week: 1 })?.rowId === undefined);
}

/* ─────────── 2. 프로그램 개요 ─────────── */
console.log('[2] 프로그램 개요 — 주 빈도마다 같은 기준, 합집합을 하루 구성처럼 쓰지 않는다');
for (const def of PROGRAMS) {
  for (const pw of def.perWeek as readonly PerWeek[]) {
    const o = programOutline(def, pw);
    check(`${def.id} 주${pw} — 개요가 있다`, o != null);
    if (!o) continue;
    check(`${def.id} 주${pw} — 총 세션 = 주 × 횟수`, o.totalDays === def.weeks * pw, o.totalDays);
    check(`${def.id} 주${pw} — 첫 주 세션 수 = 주당 횟수`, o.sessions.length === pw);
    check(`${def.id} 주${pw} — 주차 칸 = 주 수, 칸마다 세션 = 주당 횟수`, o.weekRows.length === def.weeks && o.weekRows.every((w) => w.days.length === pw));
    const used = new Set(usedVariants(def, pw));
    check(`${def.id} 주${pw} — 고를 수 있는 칸은 그 횟수에서 쓰는 칸뿐(보조 메뉴는 고르지 않음)`, o.sessions.every((s) => s.items.every((it) => it.kind === 'assist' || used.has(it.variant))));
    check(`${def.id} 주${pw} — 보조 메뉴 칸은 늘 보조`, o.sessions.every((s) => s.items.every((it) => !ACCESSORY_KEYS.includes(it.variant) || it.kind === 'assist')));
    check(`${def.id} 주${pw} — 그 횟수 칸 ⊆ 모든 횟수 합집합`, [...used].every((v) => usedVariants(def).includes(v)));
    for (const s of o.sessions) for (const it of s.items) {
      if (audienceOf(def) === 'basics') check(`${def.id} 기본기 — 모든 칸이 세션마다`, it.kind === 'rotating');
      else if (ROTATING_VARIANTS.includes(it.variant) && it.kind !== 'assist') check(`${def.id} ${it.variant} — 돌리는 칸`, it.kind === 'rotating');
    }
  }
  check(`${def.id} — 없는 주당 횟수는 null`, programOutline(def, (def.perWeek.includes(2) ? 4 : 2) as PerWeek) === null || def.perWeek.includes(2));
  for (const v of usedVariants(def)) {
    const k = variantKindOf(def, v);
    check(`${def.id} ${v} — 칸 성격이 셋 중 하나`, k === 'main' || k === 'rotating' || k === 'assist');
  }
}

/* ─────────── 3. 서버 동작의 쓰기 경계(소스) ─────────── */
console.log('[3] 서버 동작 — 등록 · 워밍업 · 종료 · 강도의 쓰기 경계');
{
  const program = src('app/actions/program.ts');
  const startBody = program.slice(program.indexOf('export async function startProgram('), program.indexOf('/** 등록 요청 번호를 담는 칸'));
  check('등록 — 한 사람 자물쇠(pg_advisory_xact_lock)', /pg_advisory_xact_lock\(hashtextextended\(\$\{`program-start:\$\{user\.id\}`\}/.test(startBody));
  check('등록 — 같은 요청 번호면 새로 안 만든다(exists 보다 먼저)', startBody.indexOf("requestOf(existing.pinned) === requestId") > 0 && startBody.indexOf("requestOf(existing.pinned) === requestId") < startBody.indexOf("return 'exists' as const"));
  check('등록 — 확인한 구성과 다르면 등록하지 않는다(changed)', /code: 'changed', changed/.test(startBody) && startBody.indexOf("code: 'changed'") < startBody.indexOf('prisma.$transaction'));
  check('등록 — 다른 진행 프로그램을 멈추지 않는다(모르는 키 줄만 정리)', !/status: 'stopped'[^\n]*endReason: 'stopped'/.test(startBody));
  const status = program.slice(program.indexOf('export async function loadProgramStartStatus('), program.indexOf('/** 시트에서 고른 장비'));
  check('등록 결과 조회 — 같은 자물쇠를 기다린 뒤 읽는다', /pg_advisory_xact_lock/.test(status));
  check('등록 결과 조회 — 쓰지 않는다', !/\.(create|update|updateMany|upsert|delete)\(/.test(status));
  check('구성 · 후보 — 준비 화면의 생년월일로 나이를 본다', /ageOfDraft\(user\.birthDate, input\.birthDate\)/.test(program.slice(program.indexOf('export async function programChoices('), program.indexOf('export async function previewPinned('))));
  check('판에 회차 번호를 싣는다(rowId)', /rowId: row\.id/.test(program));
  check('일차 넘기기 — 회차 번호가 있으면 그 줄만', /program\.rowId\s*\?\s*\{ id: program\.rowId/.test(src('lib/program/advance.ts')));

  const workout = src('app/actions/workout.ts');
  const warm = workout.slice(workout.indexOf('export async function finishWarmup('), workout.indexOf('/* ------------------------------ 세트'));
  check('워밍업 — 시작 시각이 비어 있을 때만 찍는다(조건부)', /updateMany\(\{\s*where: \{ id: session\.id, userId: user\.id, status: 'ACTIVE', mainStartedAt: null \}/.test(warm));
  check('워밍업 — 이 판 루틴의 운동만 받는다', /warmupIdsOf\(session\)/.test(warm));
  check('워밍업 — 보낸 판 번호를 쓴다', /input\.sessionId/.test(warm));
  const fin = workout.slice(workout.indexOf('export async function finishSession('), workout.indexOf('/** 마치기의 답을 못 받았을 때'));
  check('종료(앱) — 정확한 판 번호만', /where: \{ id: input\.sessionId, userId: user\.id \}/.test(fin) && !/activeSession\(/.test(fin));
  check('종료(앱) — 마친 판이면 다시 닫지 않고 뒤처리만', /if \(session\.status === 'ACTIVE'\) await closeSession/.test(fin) && /recoverFollowUps\(closed\)/.test(fin));
  const st = workout.slice(workout.indexOf('export async function finishStatus('), workout.indexOf('/** 마친 판의 뒤처리(일차 · 강도)를 다시'));
  check('종료 상태 조회 — 쓰지 않는다', !/\.(create|update|updateMany|upsert|delete)\(|recoverFollowUps|closeSession/.test(st));
  check('종료 — 제출한 강도 · 메모를 닫기와 같은 쓰기에 남긴다(finishNote)', /finishNote: \{ \.\.\.note, at: appNow\(\)\.toISOString\(\) \}/.test(workout));
  check('종료 — 메모만은 받지 않는다(조용히 버리지 않고 오류)', /if \(memo && intensity == null\) return \{ error/.test(workout));
  const rate = workout.slice(workout.indexOf('export async function rateWorkoutEffort('), workout.indexOf('/* ---------------------------- 목록 고치기'));
  check('완료 뒤 강도 — 1~10 정수를 그대로 받는다', /Number\.isInteger\(input\.intensity\) && input\.intensity >= 1 && input\.intensity <= 10/.test(rate));
  check('완료 뒤 강도 — 옛 칩(effort)도 받는다', /intensityOfEffort\(input\?\.effort\)/.test(rate));
  check('완료 뒤 강도 — 이미 남긴 값이 있으면 덮지 않는다', /if \(existing\) return \{ ok: true, intensity: existing\.intensity, existing: true \}/.test(rate));

  const finishLib = src('lib/workout/finish.ts');
  check('그날 강도 쓰기 — 빈 메모로 덮지 않는다', /update: \{ intensity, \.\.\.\(text \? \{ memo: text \} : \{\}\) \}/.test(finishLib));
  check('완료 요약 읽기 — 쓰지 않는다', !/\.(create|update|updateMany|upsert|delete)\(/.test(src('lib/workout/done-load.ts')));
  check('완료 요약 — 실제 세트(원래 번호 · RIR)를 싣는다', /sets: sets\s*\.filter\(\(x\) => x\.exerciseId === summary\.exerciseId\)\s*\.map\(\(x\) => \(\{ setNo: x\.setNo, weightKg: x\.weightKg, reps: x\.reps, holdSeconds: x\.holdSeconds, rir: x\.rir \}\)\)/.test(src('lib/workout/done-load.ts')));
}

/* ─────────── 4. 앱 화면의 경계(소스) ─────────── */
console.log('[4] 앱 화면 — 준비 · 상세는 쓰지 않고, 슬라이더는 null 로 시작, 검사는 대기열보다 먼저');
{
  const detail = src('native/src/app/training/program/[id].tsx');
  check('상세 — 등록 · 세션 열기를 부르지 않는다', !/program\.startProgram|startProgramWorkout|workout\.startWorkout/.test(detail));
  const today = src('native/src/app/training/program-today.tsx');
  check('오늘 준비 — 판을 직접 열지 않는다(운동 화면의 ?start=program)', !/rpc[^(]*\(['"]program\.startProgramWorkout/.test(today) && /params: \{ start: 'program' \}/.test(today));
  check('오늘 준비 — 추천 하나를 모든 세트에 복제하지 않는다', /const perSet = row\.sets\.some\(\(x\) => x\.kg != null\)/.test(today));
  const start = src('native/src/app/training/program-start.tsx');
  check('등록 — 요청 번호 · 구성 확인을 같이 보낸다', /requestId,\s*confirm: true/.test(start));
  check('등록 — 답을 못 받으면 결과부터 묻는다', /program\.loadProgramStartStatus/.test(start));

  const slider = src('native/src/workout/intensity-slider.tsx');
  check('슬라이더 — 정수 1~10', /const MIN = 1;/.test(slider) && /const MAX = 10;/.test(slider) && /Math\.round/.test(slider));
  check('슬라이더 — 효과에서 값을 고르지 않는다(초기 null 유지)', !/useEffect\([^]*?onChange\(/.test(slider.slice(slider.indexOf('useEffect('), slider.indexOf('const pick'))));
  check('슬라이더 — 선택 해제 · 조절 역할', /onChange\(null\)/.test(slider) && /accessibilityRole="adjustable"/.test(slider));
  const finishSheet = src('native/src/workout/finish-sheet.tsx');
  check('종료 확인 — 숫자 열 칸 · 칩 대신 슬라이더', /<IntensitySlider/.test(finishSheet) && !/Array\.from\(\{ length: 10 \}/.test(finishSheet));
  check('종료 확인 — 메모만이면 알리고 막는다', /memoNeedsIntensity/.test(finishSheet) && /pending\.length === 0 && !memoNeedsIntensity/.test(finishSheet));
  const done = src('native/src/app/workout-done.tsx');
  check('완료 — 강도는 숫자로 저장(칩 없음)', /'workout\.rateWorkoutEffort', \{\s*sessionId: data\.sessionId,\s*intensity: draft,/.test(done) && !/EFFORT_LEVELS/.test(done));
  check('완료 — 종료를 다시 부르지 않는다', !/workout\.finishWorkout|workout\.finishSession/.test(done));
  check('완료 — 최고 중량과 횟수를 한 세트로 묶지 않는다', !/× \$\{/.test(done.slice(done.indexOf('function rowSummary'), done.indexOf('function metaLine'))));
  const run = src('native/src/app/workout.tsx');
  const save = run.slice(run.indexOf('  const save = () => {'), run.indexOf("  /** '몇 개 더?' 답"));
  check('세트 — 값 검사(한도)가 대기열보다 먼저', save.indexOf('AMOUNT_LIMITS.weightKg') > 0 && save.indexOf('AMOUNT_LIMITS.weightKg') < save.indexOf('outbox.add('));
  check('세트 — 새 세트 뒤 무게는 두고 횟수만 비운다', /setCount\(''\);\s*setField\('count'\);/.test(save));
  check('세트 — 운동마다 안 남긴 입력을 따로 둔다', /drafts\.current\.set\(ex\.id/.test(run) && /drafts\.current\.get\(target\.id\)/.test(run));
  check('종료 — 답을 못 받으면 판 상태부터(finishStatus)', /'workout\.finishStatus'/.test(run) && /setPhase\('unknown'\);\s*void checkFinish\(\);/.test(run));
  check('세트 빼기 — 서버와 같은 열쇠로 견준 뒤에만', /'workout\.sessionSets'/.test(run) && run.indexOf("'workout.sessionSets'") < run.indexOf('outbox.drop(p);'));
  const outbox = src('native/src/workout/outbox.ts');
  check('대기열 — 폰 저장 실패를 따로 알린다', /persistFailed = true/.test(outbox) && /persistFailed: \(\) => persistFailed/.test(outbox));
  const warm = src('native/src/app/warmup.tsx');
  check('워밍업 — 줄마다 세고 보낼 때는 id 한 번', /rowKey\(card, ex\)/.test(warm) && /new Set\(\s*data\.cards\.flatMap/.test(warm));
  check('워밍업 — 체크 초안은 계정 · 판 · 날짜에 묶는다', /\$\{PREFIX\}\$\{outboxOwner\(\) \?\? 'anon'\}:\$\{data\.sessionId \?\? 'na'\}:\$\{data\.dateKey \?\? ''\}/.test(warm));
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail > 0) process.exit(1);

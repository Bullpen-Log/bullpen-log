/**
 * 통합 시험 — 카테고리 사이를 오가는 약속(docs/architecture/06-integration-tests.md).
 *
 * 각 카테고리의 셀프테스트는 제 안쪽만 본다. 이 시험은 한 카테고리가 내놓은 값을 다른 카테고리가 그대로 받는지를 본다 — 체크인 3판이
 * 근육통을 안 묻게 된 뒤 엔진 규칙이 조용히 꺼졌던 것(2026-10-16 통합 검토)이 이런 틈에서 났다.
 *
 * 운영 DB 에 쓰지도 읽지도 않는다(개발 DB = 운영 DB). 순수 계산을 가짜 기록으로 돌리고, 코드 모양은 소스를 읽어 본다.
 * check = 깨지면 실패(끝 코드 1). gap = 알려진 빈틈(사용자 결정 · 고칠 차례 대기) — 보여 주기만 하고 실패로 세지 않는다.
 * 빈틈을 고치면 gap 이 '고쳐짐'을 알린다 — 그때 check 로 옮긴다.
 *
 *   npm run integration:test
 */
import { readFileSync, readdirSync } from 'node:fs';
import { buildFacts, type CheckinLike } from '../lib/report/facts.ts';
import { buildPitchPlan, dailyPitchCap, YOUTH_AGE_THRESHOLD, YOUTH_REST_TABLE_THROUGH_AGE } from '../lib/report/plan.ts';
import { buildDayState } from '../lib/engine/day-state.ts';
import {
  CHECKIN_PARTS,
  LOW_CONDITION_THRESHOLD,
  conditionBand,
  sorenessFromParts,
  type CheckinPartKey,
} from '../lib/checkin.ts';
import { effortFields, readEffortInput } from '../lib/pitch-effort.ts';
import { effortPctOf, shiftDateKey, toDateKey } from '../lib/pitch-stats.ts';
import { validateSessionType } from '../lib/session-type.ts';
import { logPrefillOf, unloggedSessions, type VelocitySessionView } from '../lib/velocity-meta.ts';
import { ageBand } from '../lib/nutrition/age.ts';
import { FEATURE_HOME, SETUP_PATH, featureOfPath, isSetupPath } from '../lib/feature-locks.ts';
import { MOBILE_TABS, NAV_GROUPS, applyLocks } from '../lib/nav.ts';

let passed = 0;
let failed = 0;
let gaps = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

/** 알려진 빈틈 — still 이 참이면 아직 남음(실패로 안 셈), 거짓이면 고쳐졌다고 알린다 */
function gap(name: string, still: boolean, detail = '') {
  if (still) gaps++;
  console.log(`  ${still ? '빈틈' : '고쳐짐 → check 로 옮길 것'} ${name}${still && detail ? ` — ${detail}` : ''}`);
}

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const TODAY = new Date('2026-06-15T09:00:00+09:00');
const TODAY_KEY = '2026-06-15';

/** gather.ts 가 체크인 3판 줄을 facts 로 옮기는 것과 같은 모양(근육통은 적은 값이 없으면 몸 그림으로 어림) */
function v3Checkin(parts: Partial<Record<CheckinPartKey, string>>, condition = 7): CheckinLike {
  const filled = Object.fromEntries(CHECKIN_PARTS.map((p) => [p.key, parts[p.key] ?? '정상'])) as Record<
    CheckinPartKey,
    string
  >;
  return {
    date: TODAY_KEY,
    ...filled,
    condition,
    sleep: '보통',
    sleepQuality: 3,
    preferredParts: [],
    preferredWorkout: null,
    sleepHours: null,
    soreness: sorenessFromParts(filled),
  };
}

function facts(extra: Partial<Parameters<typeof buildFacts>[0]> = {}) {
  return buildFacts({ nickname: '통합', age: 22, heightCm: 180, logs: [], checkins: [], memos: [], today: TODAY, ...extra });
}

function dayStateOf(f: ReturnType<typeof facts>) {
  return buildDayState({ facts: f, plan: buildPitchPlan(f) });
}

/* ─────────────────────── 1. 체크인 3판 → 트레이닝 엔진(오늘 상태 한 장) ─────────────────────── */
console.log('\n[1] 체크인 3판 → 트레이닝 엔진 — 몸 그림이 근육통 규칙까지 닿는가');
{
  const sore4 = dayStateOf(facts({ checkins: [v3Checkin({ lowerBody: '뻐근', lowerBack: '뻐근', shoulder: '뻐근', wrist: '뻐근' })] }));
  const sore3 = dayStateOf(facts({ checkins: [v3Checkin({ lowerBody: '뻐근', lowerBack: '뻐근', wrist: '뻐근' })] }));
  const fine = dayStateOf(facts({ checkins: [v3Checkin({})] }));
  check('네 부위가 뻐근하면 오늘 상태가 근육통 심함(회복 날 규칙의 입력)', sore4.body.soreSevere === true);
  check('세 부위면 근육통 많이(센 운동 빼기), 심함은 아님', sore3.body.soreMany === true && sore3.body.soreSevere === false);
  check('다 괜찮으면 근육통 규칙이 안 켜진다', fine.body.soreMany === false && fine.body.soreSevere === false);
}

/* ─────────────────────── 2. 트레이닝 탭 카드 → 엔진 ─────────────────────── */
console.log('\n[2] 트레이닝 탭 카드 → 엔진 — 체크인이 없어도 카드 답이 닿는가');
{
  const s = dayStateOf(facts({ todayPrefs: { preferredParts: ['하체'], preferredWorkout: '회복' } }));
  check('체크인 없이 카드에서 회복을 고르면 오늘 상태가 회복을 안다', s.body.preferredWorkout === '회복');
}

/* ─────────────────────── 3. 투구 강도 — 쓰는 규칙과 읽는 규칙 ─────────────────────── */
console.log('\n[3] 투구 강도 — 저장(%와 1~10 같이)과 읽기(엔진 · 영양 · 화면)가 같은 값을 보는가');
{
  const roundTrip = Array.from({ length: 20 }, (_, i) => (i + 1) * 5).every((pct) => effortPctOf(effortFields(pct)) === pct);
  check('5~100% 를 저장 규칙으로 쓰고 읽기 규칙으로 읽으면 같은 % 다', roundTrip);
  check('옛 1~10 만 있는 기록은 × 10 으로 읽는다', effortPctOf({ intensity: 9, effortPct: null }) === 90);
}

/* ─────────────────────── 4. 구속 측정 → 투구 기록 ─────────────────────── */
console.log('\n[4] 구속 측정 → 투구 기록 — 측정으로 채운 값을 투구 기록 저장 규칙이 받는가');
{
  const session = {
    id: 's1',
    createdAt: '2026-06-15T01:00:00.000Z',
    pitchLogId: null,
    sessionType: '불펜',
    effortPct: 85,
    pitches: [120, 125, 123].map((kmh) => ({ kmh, result: null, releaseDxCm: null, releaseDyCm: null })),
  } as unknown as VelocitySessionView;
  const fill = logPrefillOf(unloggedSessions([session], []));
  const type = fill?.sessionType ? validateSessionType(fill.sessionType) : { error: '없음' };
  const effort = readEffortInput({ effortPct: fill?.effortPct }, false);
  check(
    '채운 종류 · 체감 강도가 투구 기록 저장 규칙을 그대로 지난다',
    fill != null && !('error' in type) && !('error' in effort) && effort.effortPct === 85
  );
  check(
    '측정을 기록으로 남기면(세션이 이어지면) 다시 권하지 않는다',
    unloggedSessions([{ ...session, pitchLogId: 'log1' }], []).length === 0
  );
}

/* ─────────────────────── 5. 날짜 — 한국 날짜 하나 ─────────────────────── */
console.log('\n[5] 날짜 — 모든 카테고리의 \'오늘\'이 한국 날짜인가');
{
  check('한국 0시 30분은 그날(UTC 로는 전날)', toDateKey(new Date('2026-10-16T00:30:00+09:00')) === '2026-10-16');
  check('한국 23시 30분도 그날', toDateKey(new Date('2026-10-16T23:30:00+09:00')) === '2026-10-16');
  check('달 넘김 · 해 넘김', shiftDateKey('2026-10-31', 1) === '2026-11-01' && shiftDateKey('2026-01-01', -1) === '2025-12-31');
  check(
    'DB 날짜 칸(@db.Date = 한국 날짜의 UTC 자정) 왕복',
    ['2026-01-01', '2026-10-16', '2028-02-29'].every((k) => new Date(`${k}T00:00:00.000Z`).toISOString().slice(0, 10) === k)
  );
  const utcToday = ['app', 'components']
    .flatMap((dir) => walk(dir))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(src(f)));
  gap('화면에서 오늘을 UTC 로 셈(한국 0~9시에 어제가 됨)', utcToday.length > 0, utcToday.join(', '));
}

/* ─────────────────────── 6. 기능 잠금 ↔ 메뉴 ─────────────────────── */
console.log('\n[6] 기능 잠금 ↔ 메뉴 — 잠금 표 하나를 메뉴 · 탭 · 페이지가 같이 보는가');
{
  const items = [...NAV_GROUPS.flatMap((g) => g.items), ...MOBILE_TABS];
  const wrong = items.filter((i) => i.lock && featureOfPath(i.href) !== i.lock).map((i) => i.href);
  check('잠금 꼬리표가 달린 메뉴는 그 주소가 같은 기능에 속한다', wrong.length === 0, wrong.join(', '));
  const all = { pitch: true, training: true, nutrition: true } as const;
  const locked = applyLocks(items, all).filter((i) => i.locked);
  check('모두 잠그면 잠긴 메뉴는 모두 첫 설정 화면으로 간다', locked.length > 0 && locked.every((i) => isSetupPath(i.href)));
  check(
    '첫 설정 화면 · 탭 홈은 제 기능에 속하고, 설정 화면은 잠금에서 빠진다',
    (Object.keys(SETUP_PATH) as (keyof typeof SETUP_PATH)[]).every(
      (k) => featureOfPath(SETUP_PATH[k]) === k && featureOfPath(FEATURE_HOME[k]) === k && isSetupPath(SETUP_PATH[k])
    )
  );
}

/* ─────────────────────── 7. 서버 동작 — 주인 확인 ─────────────────────── */
console.log('\n[7] 서버 동작 · API — 모든 쓰기 입구가 로그인한 사람을 확인하는가');
{
  const AUTH = /\b(getCurrentUser|requireUser|requireAdmin|assertAdmin|requireAdminUser)\(/;
  /* 로그인 전에 부르는 것 — 가입 · 로그인 · 로그아웃 */
  const PUBLIC = new Set(['auth.ts:checkSignupEmail', 'auth.ts:signup', 'auth.ts:login', 'auth.ts:logout']);
  const open: string[] = [];
  let seen = 0;
  for (const f of readdirSync(new URL('../app/actions/', import.meta.url))) {
    if (!/\.tsx?$/.test(f)) continue;
    const text = src(`app/actions/${f}`);
    /* 함수 몸통 = 다음 export 앞까지 — 서버 동작 파일은 export 함수가 차례로 놓인다 */
    const parts = text.split(/\nexport async function /).slice(1);
    for (const body of parts) {
      const name = body.slice(0, body.search(/[(<]/));
      seen++;
      if (PUBLIC.has(`${f}:${name}`)) continue;
      /* 같은 파일 안 도우미(ensureUser 꼴)를 거치면 그 도우미가 확인한다 — 이름에 user · admin 이 든 도우미를 부르면 넘긴다 */
      if (!AUTH.test(body) && !/\b(own|ensure|load)\w*(User|Admin|Owner)\w*\(/.test(body)) open.push(`${f}:${name}`);
    }
  }
  /* 함수를 하나도 못 읽으면 시험이 아무것도 안 본 것 — 지금 백몇십 개 */
  check(`app/actions 의 export 함수는 모두 로그인 확인을 거친다(읽은 함수 ${seen}개)`, seen > 100 && open.length === 0, open.join(', '));
  const routes = walk('app/api').filter((f) => f.endsWith('route.ts'));
  const OPEN_ROUTES = new Set(['app/api/session/clear/route.ts', 'app/api/sim-offset/route.ts', 'app/api/library/bundle/route.ts']);
  const unchecked = routes.filter((r) => !OPEN_ROUTES.has(r) && !AUTH.test(src(r)));
  check(
    `API 경로도 로그인 확인(로그아웃 · 시험 시계 · 굽기 전용 열쇠 셋은 따로, 읽은 경로 ${routes.length}개)`,
    routes.length > 10 && unchecked.length === 0,
    unchecked.join(', ')
  );
}

/* ─────────────────────── 8. 쓰기 뒤 다시 그리기 ─────────────────────── */
console.log('\n[8] 쓰기 뒤 다시 그리기 — 기록을 바꾸는 입구가 화면을 새로 그리게 하는가');
{
  const WRITE = /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$transaction\(/;
  const REFRESH = /\b(revalidatePath|revalidateTag|updateTag|refresh)\(/;
  const files = [
    ...readdirSync(new URL('../app/actions/', import.meta.url)).map((f) => `app/actions/${f}`),
    ...walk('app/api').filter((f) => f.endsWith('route.ts')),
  ].filter((f) => /\.tsx?$/.test(f));
  const silent = files.filter((f) => WRITE.test(src(f)) && !REFRESH.test(src(f)));
  gap('기록을 바꾸는데 다시 그리기를 안 부르는 파일(다른 탭 · /coach 가 30초 옛 값)', silent.length > 0, silent.join(', '));
}

/* ─────────────────────── 9. 결정 대기 — 나이 · 컨디션 ─────────────────────── */
console.log('\n[9] 결정 대기 — 카테고리마다 다른 기준(docs/architecture README D3 · D4)');
{
  const rows = [12, 13, 14, 15, 16, 17, 18, 19, 20].map((age) => ({
    age,
    training: age < YOUTH_AGE_THRESHOLD ? '성장기' : '성인',
    rest: age <= YOUTH_REST_TABLE_THROUGH_AGE ? '어린 표' : '15~18 표',
    cap: dailyPitchCap(age) == null ? '없음' : `${dailyPitchCap(age)}구`,
    nutrition: ageBand(age),
  }));
  console.log('    나이 | 트레이닝 | 휴식표 | 투구 한도 | 영양');
  for (const r of rows) console.log(`    ${r.age} | ${r.training} | ${r.rest} | ${r.cap} | ${r.nutrition}`);
  /* 한 번 성인이면 나이가 늘어도 성인 — 기준마다 뒤집히는 자리가 한 번뿐이어야 한다 */
  const once = (xs: boolean[]) => xs.filter((x, i) => i > 0 && x !== xs[i - 1]).length <= 1;
  check(
    '나이가 늘면 기준마다 성장기 → 성인으로 한 번만 바뀐다',
    once(rows.map((r) => r.training === '성장기')) &&
      once(rows.map((r) => r.rest === '어린 표')) &&
      once(rows.map((r) => r.cap !== '없음')) &&
      once(rows.map((r) => r.nutrition !== 'adult'))
  );
  const mixed = rows.filter((r) => (r.training === '성인') !== (r.nutrition === 'adult')).map((r) => r.age);
  gap('트레이닝은 성인인데 영양은 청소년인 나이(D3 — 근거가 달라 일부러일 수 있음)', mixed.length > 0, mixed.join(' · ') + '세');
  gap(
    "컨디션 4 — 화면 띠는 '보통'인데 엔진은 낮은 날(D4)",
    conditionBand(4) === 'normal' && 4 <= LOW_CONDITION_THRESHOLD,
    `LOW_CONDITION_THRESHOLD ${LOW_CONDITION_THRESHOLD}`
  );
  gap(
    '체중 — 프로필 수정은 User 만, 영양 탭은 DailyNutrition 만 쓴다(D5, DB 를 거쳐 순수 시험 밖)',
    !/dailyNutrition/.test(src('app/actions/profile.ts')),
    'app/actions/profile.ts'
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패, 알려진 빈틈 ${gaps}개`);
process.exit(failed === 0 ? 0 : 1);

/** 폴더 안 파일 경로(저장소 기준, / 구분) */
function walk(dir: string): string[] {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );
}

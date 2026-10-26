/**
 * 통합 시험 — 카테고리 사이를 오가는 약속(docs/architecture/06-integration-tests.md).
 *
 * 각 카테고리의 셀프테스트는 제 안쪽만 본다. 이 시험은 한 카테고리가 내놓은 값을 다른 카테고리가 그대로 받는지를 본다 — 체크인 3판이
 * 근육통을 안 묻게 된 뒤 엔진 규칙이 조용히 꺼졌던 것(2026-10-16 통합 검토)이 이런 틈에서 났다.
 *
 * 운영 DB 에 쓰지도 읽지도 않는다(개발 DB = 운영 DB). 순수 계산을 가짜 기록으로 돌리고, 코드 모양은 소스를 읽어 본다.
 * check = 깨지면 실패(끝 코드 1). 처음(2026-10-16)엔 결정 · 고칠 차례를 기다리는 '알려진 빈틈' 다섯을 따로 보였는데, 같은 날 모두
 * 고치거나 정해 check 로 옮겼다 — 새 빈틈이 생기면 그때 보여 주기만 하는 도우미를 다시 둔다.
 *
 *   npm run integration:test
 */
import { readFileSync, readdirSync } from 'node:fs';
import { buildFacts, type CheckinLike } from '../lib/report/facts.ts';
import {
  buildPitchPlan,
  dailyPitchCap,
  YOUTH_AGE_THRESHOLD,
  YOUTH_REST_TABLE_THROUGH_AGE,
} from '../lib/report/plan.ts';
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
import {
  logPrefillOf,
  unloggedSessions,
  type VelocitySessionView,
} from '../lib/velocity-meta.ts';
import { ageBand } from '../lib/nutrition/age.ts';
import {
  FEATURE_HOME,
  SETUP_PATH,
  featureOfPath,
  isSetupPath,
} from '../lib/feature-locks.ts';
import { MOBILE_TABS, NAV_GROUPS, applyLocks } from '../lib/nav.ts';
import { APP_API_LEVEL, MIN_APP_API, appApiLevelOf } from '../lib/app-api.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(
    `  ${ok ? 'OK  ' : '실패'} ${name}${!ok && detail ? ` — ${detail}` : ''}`
  );
}

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf-8');
const TODAY = new Date('2026-06-15T09:00:00+09:00');
const TODAY_KEY = '2026-06-15';

/** gather.ts 가 체크인 3판 줄을 facts 로 옮기는 것과 같은 모양(근육통은 적은 값이 없으면 몸 그림으로 어림) */
function v3Checkin(
  parts: Partial<Record<CheckinPartKey, string>>,
  condition = 7
): CheckinLike {
  const filled = Object.fromEntries(
    CHECKIN_PARTS.map((p) => [p.key, parts[p.key] ?? '정상'])
  ) as Record<CheckinPartKey, string>;
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
  return buildFacts({
    nickname: '통합',
    age: 22,
    heightCm: 180,
    logs: [],
    checkins: [],
    memos: [],
    today: TODAY,
    ...extra,
  });
}

function dayStateOf(f: ReturnType<typeof facts>) {
  return buildDayState({ facts: f, plan: buildPitchPlan(f) });
}

/* ─────────────────────── 1. 체크인 3판 → 트레이닝 엔진(오늘 상태 한 장) ─────────────────────── */
console.log('\n[1] 체크인 3판 → 트레이닝 엔진 — 몸 그림이 근육통 규칙까지 닿는가');
{
  const sore4 = dayStateOf(
    facts({
      checkins: [
        v3Checkin({
          lowerBody: '뻐근',
          lowerBack: '뻐근',
          shoulder: '뻐근',
          wrist: '뻐근',
        }),
      ],
    })
  );
  const sore3 = dayStateOf(
    facts({
      checkins: [v3Checkin({ lowerBody: '뻐근', lowerBack: '뻐근', wrist: '뻐근' })],
    })
  );
  const fine = dayStateOf(facts({ checkins: [v3Checkin({})] }));
  check(
    '네 부위가 뻐근하면 오늘 상태가 근육통 심함(회복 날 규칙의 입력)',
    sore4.body.soreSevere === true
  );
  check(
    '세 부위면 근육통 많이(센 운동 빼기), 심함은 아님',
    sore3.body.soreMany === true && sore3.body.soreSevere === false
  );
  check(
    '다 괜찮으면 근육통 규칙이 안 켜진다',
    fine.body.soreMany === false && fine.body.soreSevere === false
  );
}

/* ─────────────────────── 2. 트레이닝 탭 카드 → 엔진 ─────────────────────── */
console.log('\n[2] 트레이닝 탭 카드 → 엔진 — 체크인이 없어도 카드 답이 닿는가');
{
  const s = dayStateOf(
    facts({ todayPrefs: { preferredParts: ['하체'], preferredWorkout: '회복' } })
  );
  check(
    '체크인 없이 카드에서 회복을 고르면 오늘 상태가 회복을 안다',
    s.body.preferredWorkout === '회복'
  );
}

/* ─────────────────────── 3. 투구 강도 — 쓰는 규칙과 읽는 규칙 ─────────────────────── */
console.log(
  '\n[3] 투구 강도 — 저장(%와 1~10 같이)과 읽기(엔진 · 영양 · 화면)가 같은 값을 보는가'
);
{
  const roundTrip = Array.from({ length: 20 }, (_, i) => (i + 1) * 5).every(
    (pct) => effortPctOf(effortFields(pct)) === pct
  );
  check('5~100% 를 저장 규칙으로 쓰고 읽기 규칙으로 읽으면 같은 % 다', roundTrip);
  check(
    '옛 1~10 만 있는 기록은 × 10 으로 읽는다',
    effortPctOf({ intensity: 9, effortPct: null }) === 90
  );
}

/* ─────────────────────── 4. 구속 측정 → 투구 기록 ─────────────────────── */
console.log(
  '\n[4] 구속 측정 → 투구 기록 — 측정으로 채운 값을 투구 기록 저장 규칙이 받는가'
);
{
  const session = {
    id: 's1',
    createdAt: '2026-06-15T01:00:00.000Z',
    pitchLogId: null,
    sessionType: '불펜',
    effortPct: 85,
    pitches: [120, 125, 123].map((kmh) => ({
      kmh,
      result: null,
      releaseDxCm: null,
      releaseDyCm: null,
    })),
  } as unknown as VelocitySessionView;
  const fill = logPrefillOf(unloggedSessions([session], []));
  const type = fill?.sessionType
    ? validateSessionType(fill.sessionType)
    : { error: '없음' };
  const effort = readEffortInput({ effortPct: fill?.effortPct }, false);
  check(
    '채운 종류 · 체감 강도가 투구 기록 저장 규칙을 그대로 지난다',
    fill != null &&
      !('error' in type) &&
      !('error' in effort) &&
      effort.effortPct === 85
  );
  check(
    '측정을 기록으로 남기면(세션이 이어지면) 다시 권하지 않는다',
    unloggedSessions([{ ...session, pitchLogId: 'log1' }], []).length === 0
  );
}

/* ─────────────────────── 5. 날짜 — 한국 날짜 하나 ─────────────────────── */
console.log("\n[5] 날짜 — 모든 카테고리의 '오늘'이 한국 날짜인가");
{
  check(
    '한국 0시 30분은 그날(UTC 로는 전날)',
    toDateKey(new Date('2026-10-16T00:30:00+09:00')) === '2026-10-16'
  );
  check(
    '한국 23시 30분도 그날',
    toDateKey(new Date('2026-10-16T23:30:00+09:00')) === '2026-10-16'
  );
  check(
    '달 넘김 · 해 넘김',
    shiftDateKey('2026-10-31', 1) === '2026-11-01' &&
      shiftDateKey('2026-01-01', -1) === '2025-12-31'
  );
  check(
    'DB 날짜 칸(@db.Date = 한국 날짜의 UTC 자정) 왕복',
    ['2026-01-01', '2026-10-16', '2028-02-29'].every(
      (k) => new Date(`${k}T00:00:00.000Z`).toISOString().slice(0, 10) === k
    )
  );
  const utcToday = ['app', 'components']
    .flatMap((dir) => walk(dir))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(src(f)));
  check(
    '화면이 오늘을 UTC 로 세지 않는다(한국 0~9시에 어제가 됨 — toDateKey 로)',
    utcToday.length === 0,
    utcToday.join(', ')
  );
}

/* ─────────────────────── 6. 기능 잠금 ↔ 메뉴 ─────────────────────── */
console.log('\n[6] 기능 잠금 ↔ 메뉴 — 잠금 표 하나를 메뉴 · 탭 · 페이지가 같이 보는가');
{
  const items = [...NAV_GROUPS.flatMap((g) => g.items), ...MOBILE_TABS];
  const wrong = items
    .filter((i) => i.lock && featureOfPath(i.href) !== i.lock)
    .map((i) => i.href);
  check(
    '잠금 꼬리표가 달린 메뉴는 그 주소가 같은 기능에 속한다',
    wrong.length === 0,
    wrong.join(', ')
  );
  const all = { pitch: true, training: true, nutrition: true } as const;
  const locked = applyLocks(items, all).filter((i) => i.locked);
  check(
    '모두 잠그면 잠긴 메뉴는 모두 첫 설정 화면으로 간다',
    locked.length > 0 && locked.every((i) => isSetupPath(i.href))
  );
  check(
    '첫 설정 화면 · 탭 홈은 제 기능에 속하고, 설정 화면은 잠금에서 빠진다',
    (Object.keys(SETUP_PATH) as (keyof typeof SETUP_PATH)[]).every(
      (k) =>
        featureOfPath(SETUP_PATH[k]) === k &&
        featureOfPath(FEATURE_HOME[k]) === k &&
        isSetupPath(SETUP_PATH[k])
    )
  );
}

/* ─────────────────────── 7. 서버 동작 — 주인 확인 ─────────────────────── */
console.log('\n[7] 서버 동작 · API — 모든 쓰기 입구가 로그인한 사람을 확인하는가');
{
  /* coachOrg · myMember 는 lib/org/app-access.ts 의 앱 팀 · 레슨장 권한(getCurrentUser 를 부른다 — 바로 밑에서 확인) */
  const AUTH =
    /\b(getCurrentUser|requireUser|requireAdmin|assertAdmin|requireAdminUser|requireMaster|coachOrg|myMember)\(/;
  const appAccess = src('lib/org/app-access.ts');
  check(
    '앱 팀 · 레슨장 권한(coachOrg · myMember)이 로그인을 본다',
    (appAccess.match(/getCurrentUser\(\)/g) ?? []).length >= 2 && appAccess.includes('isMasterUser(user)')
  );
  /* 로그인 전에 부르는 것 — 가입 · 로그인 · 로그아웃 */
  const PUBLIC = new Set([
    'auth.ts:checkSignupEmail',
    'auth.ts:signup',
    'auth.ts:login',
    'auth.ts:logout',
    /* 보호자 리포트 — 로그인 없이 토큰 + 네 자리 코드로 연다(app/(report)) */
    'org-report.ts:verifyGuardianCode',
    /* 코드 · QR 로그인(2026-10-21 7단계) — PC 가 로그인 전에 코드를 만들고 묻는다. 승인(approve)은 requireUser */
    'login-ticket.ts:createLoginTicket',
    'login-ticket.ts:claimLoginTicket',
  ]);
  const open: string[] = [];
  let seen = 0;
  /* 함수 몸통 = 다음 최상위 function 앞까지 — export 든 아니든(파일 안 도우미 admin() · writeNotice 꼴도) */
  const FN = /^(export )?(?:async )?function (\w+)/gm;
  const fns: { file: string; name: string; exported: boolean; body: string }[] = [];
  for (const f of readdirSync(new URL('../app/actions/', import.meta.url))) {
    if (!/\.tsx?$/.test(f)) continue;
    const text = src(`app/actions/${f}`);
    const heads = [...text.matchAll(FN)];
    heads.forEach((m, i) =>
      fns.push({
        file: f,
        name: m[2],
        exported: !!m[1],
        body: text.slice(m.index, heads[i + 1]?.index ?? text.length),
      })
    );
  }
  /* 확인을 거치는 함수 = 몸통이 직접 확인하거나, 확인을 거치는 다른 함수(같은 파일 도우미 · 다른 동작 파일의 export)를 부름.
     이름이 겹치면 모두 확인할 때만 믿는다. 한 단계씩 넓혀 더 늘지 않을 때까지 */
  const guarded = new Set(
    fns.filter((x) => AUTH.test(x.body)).map((x) => `${x.file}:${x.name}`)
  );
  const byName = new Map<string, typeof fns>();
  for (const x of fns) byName.set(x.name, [...(byName.get(x.name) ?? []), x]);
  for (let grew = true; grew;) {
    grew = false;
    for (const x of fns) {
      const key = `${x.file}:${x.name}`;
      if (guarded.has(key)) continue;
      const calls = [...x.body.slice(x.body.indexOf('{')).matchAll(/\b(\w+)\(/g)].map(
        (m) => m[1]
      );
      const viaGuarded = calls.some((c) => {
        const defs = (byName.get(c) ?? []).filter(
          (d) => d.file === x.file || d.exported
        );
        return defs.length > 0 && defs.every((d) => guarded.has(`${d.file}:${d.name}`));
      });
      if (viaGuarded) {
        guarded.add(key);
        grew = true;
      }
    }
  }
  for (const x of fns.filter(
    (x) => x.exported && /^export async function/.test(x.body)
  )) {
    seen++;
    const key = `${x.file}:${x.name}`;
    if (PUBLIC.has(key)) continue;
    /* 같은 파일 안 도우미(ensureUser 꼴)를 거치면 그 도우미가 확인한다 — 이름에 user · admin 이 든 도우미를 부르면 넘긴다 */
    if (
      !guarded.has(key) &&
      !/\b(own|ensure|load)\w*(User|Admin|Owner)\w*\(/.test(x.body)
    )
      open.push(key);
  }
  /* 함수를 하나도 못 읽으면 시험이 아무것도 안 본 것 — 지금 백몇십 개 */
  check(
    `app/actions 의 export 함수는 모두 로그인 확인을 거친다(읽은 함수 ${seen}개)`,
    seen > 100 && open.length === 0,
    open.join(', ')
  );
  const routes = walk('app/api').filter((f) => f.endsWith('route.ts'));
  /* /api/rpc 는 허용 목록의 서버 액션을 부를 뿐이고 로그인은 그 액션이 확인한다(바로 위 시험) — [12] 가 따로 본다 */
  const OPEN_ROUTES = new Set([
    'app/api/session/clear/route.ts',
    'app/api/sim-offset/route.ts',
    'app/api/library/bundle/route.ts',
    'app/api/rpc/[action]/route.ts',
    /* 새 앱 화면 코드 업데이트 — 앱이 켜지며(로그인 전) 묻는다. 읽기만이고 주는 것은 모두에게 같은 앱 코드(lib/app-update.ts) */
    'app/api/app-update/route.ts',
    /* 앱 업데이트 올리기 — 굽기 전용 열쇠로만(lib/build-token.ts, /api/library/bundle 과 같은 열쇠) */
    'app/api/app-update/publish/route.ts',
  ]);
  const unchecked = routes.filter((r) => !OPEN_ROUTES.has(r) && !AUTH.test(src(r)));
  check(
    `API 경로도 로그인 확인(로그아웃 · 시험 시계 · 굽기 전용 열쇠 · 앱 업데이트는 따로, 읽은 경로 ${routes.length}개)`,
    routes.length > 10 && unchecked.length === 0,
    unchecked.join(', ')
  );
}

/* ─────────────────────── 8. 쓰기 뒤 다시 그리기 ─────────────────────── */
console.log(
  '\n[8] 쓰기 뒤 다시 그리기 — 기록을 바꾸는 입구가 화면을 새로 그리게 하는가'
);
{
  const WRITE =
    /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$transaction\(/;
  const REFRESH = /\b(revalidatePath|revalidateTag|updateTag|refresh)\(/;
  /*
   * 서버 동작만 본다 — API 경로(app/api)는 부르는 화면이 router.refresh(lib/quiet-refresh.ts)로 다시 그리고, 그것이 브라우저의 화면 캐시
   * 전체를 비운다(경로 쪽 revalidate 는 브라우저 캐시에 안 닿는다). 다시 그리기가 없어도 되는 파일은 까닭과 함께 여기 둔다.
   */
  const NO_REFRESH: Record<string, string> = {
    'app/actions/auth.ts':
      '가입 · 로그인 · 로그아웃 · 탈퇴는 redirect 로 새 화면을 연다, 비밀번호는 화면에 안 보인다',
    'app/actions/exercise-note.ts':
      '운동 중 화면이 받은 메모로 바로 고친다(onSaved) — 다시 그리면 진행 중인 판이 흔들린다',
    'app/actions/org-report.ts':
      '보호자 코드 확인은 redirect 로 같은 주소를 다시 연다 — 쿠키가 바뀌어 새로 그려진다',
    'app/actions/push.ts':
      '앱이 부르는 알림 기기 등록(RPC) — 웹 화면이 없고, 기기 목록(/sinker/sharing)은 들어갈 때 새로 읽는다',
    'app/actions/login-ticket.ts':
      '코드 로그인 — PC 는 2초마다 묻는 RPC 로, 폰은 redirect 로 같은 주소를 다시 열어 새로 그린다',
  };
  const files = readdirSync(new URL('../app/actions/', import.meta.url))
    .map((f) => `app/actions/${f}`)
    .filter((f) => /\.tsx?$/.test(f));
  const silent = files.filter(
    (f) => WRITE.test(src(f)) && !REFRESH.test(src(f)) && !(f in NO_REFRESH)
  );
  check(
    `기록을 바꾸는 서버 동작 파일은 다시 그리기를 부르거나 까닭이 적혀 있다(읽은 파일 ${files.length}개)`,
    files.length > 20 && silent.length === 0,
    silent.join(', ')
  );
}

/* ─────────────────────── 9. 결정 대기 — 나이 · 컨디션 ─────────────────────── */
console.log('\n[9] 정한 기준 — 나이 띠(D3 그대로) · 컨디션 4(D4) · 체중(D5)');
{
  const rows = [12, 13, 14, 15, 16, 17, 18, 19, 20].map((age) => ({
    age,
    training: age < YOUTH_AGE_THRESHOLD ? '성장기' : '성인',
    rest: age <= YOUTH_REST_TABLE_THROUGH_AGE ? '어린 표' : '15~18 표',
    cap: dailyPitchCap(age) == null ? '없음' : `${dailyPitchCap(age)}구`,
    nutrition: ageBand(age),
  }));
  console.log('    나이 | 트레이닝 | 휴식표 | 투구 한도 | 영양');
  for (const r of rows)
    console.log(`    ${r.age} | ${r.training} | ${r.rest} | ${r.cap} | ${r.nutrition}`);
  /* 한 번 성인이면 나이가 늘어도 성인 — 기준마다 뒤집히는 자리가 한 번뿐이어야 한다 */
  const once = (xs: boolean[]) =>
    xs.filter((x, i) => i > 0 && x !== xs[i - 1]).length <= 1;
  check(
    '나이가 늘면 기준마다 성장기 → 성인으로 한 번만 바뀐다',
    once(rows.map((r) => r.training === '성장기')) &&
      once(rows.map((r) => r.rest === '어린 표')) &&
      once(rows.map((r) => r.cap !== '없음')) &&
      once(rows.map((r) => r.nutrition !== 'adult'))
  );
  const mixed = rows
    .filter((r) => (r.training === '성인') !== (r.nutrition === 'adult'))
    .map((r) => r.age);
  /*
   * D3 — 2026-10-16 사용자: 트레이닝 성장기 선(16)은 그대로. 영양은 국내 섭취기준의 청소년(만 17세까지), 투구 한도는 공식 투구 지침의 고교 구간이라
   * 근거가 달라 일부러 다르다. 어긋나는 나이가 16 · 17세에서 늘거나 줄면(기준 하나를 바꿈) 여기서 알린다 — 그때 다시 정한다.
   */
  check(
    '트레이닝은 성인 · 영양은 청소년인 나이는 16 · 17세뿐(일부러 다름 — D3 그대로)',
    mixed.join() === '16,17',
    mixed.join(' · ') + '세'
  );
  /* D4 — 화면 띠 '아파요'의 끝 = 엔진의 낮은 날 문턱. 4 를 고르면 화면도 '아파요'다 */
  check(
    `컨디션 1~10 에서 화면 '아파요' 띠와 엔진의 낮은 날(${LOW_CONDITION_THRESHOLD} 이하)이 같다(D4)`,
    Array.from({ length: 10 }, (_, i) => i + 1).every(
      (n) => (conditionBand(n) === 'sick') === n <= LOW_CONDITION_THRESHOLD
    )
  );
  /* D5 — 가장 최근 기록 하나: 프로필에서 고치면 오늘 체중 기록에도, 영양 탭에서 오늘 적으면 프로필 몸무게에도(DB 를 거쳐 소스로 본다) */
  const nutritionSrc = src('app/actions/nutrition.ts');
  const setWeightSrc = nutritionSrc.slice(
    nutritionSrc.indexOf('export async function setWeight')
  );
  check(
    '체중 — 프로필 수정이 오늘 체중 기록을, 영양 탭의 오늘 체중이 프로필 몸무게를 같이 쓴다(D5)',
    /dailyNutrition\.upsert/.test(src('app/actions/profile.ts')) &&
      setWeightSrc
        .slice(0, setWeightSrc.indexOf('\nexport '))
        .includes('prisma.user.update({ where: { id: user.id }, data: { weightKg } })')
  );
}

/* ─────────────────────── 10. 다시 보낸 저장 — 두 번 남지 않기 ─────────────────────── */
console.log(
  '\n[10] 다시 보낸 저장 — 끊긴 응답에 다시 누르거나 두 번 눌러도 기록이 하나인가'
);
{
  const fnBody = (file: string, name: string) => {
    const text = src(file);
    const at = text.indexOf(`export async function ${name}`);
    const next = text.indexOf('\nexport ', at + 1);
    return at < 0 ? '' : text.slice(at, next < 0 ? undefined : next);
  };
  const velocity = fnBody('app/actions/velocity.ts', 'saveVelocitySession');
  check(
    '구속 측정 저장 — 방금 같은 세션(같은 날 · 같은 잰 값)이 있으면 새로 안 만든다',
    velocity.includes('recentSameSession(') &&
      velocity.indexOf('recentSameSession(') <
        velocity.indexOf('velocitySession.create(')
  );
  check(
    '투구 기록 저장 — 2분 안 같은 값이면 새로 안 만든다',
    /DUPLICATE_WINDOW_MS/.test(src('app/api/pitch-log/route.ts'))
  );
  check(
    '운동 마치기 — 아직 진행 중인 판일 때만 마친다(두 번 보내도 운동 시간이 한 번만 더해짐)',
    /updateMany\(\{\s*where: \{ id: session\.id, status: 'ACTIVE' \}/.test(
      fnBody('app/actions/workout.ts', 'finishWorkout')
    )
  );
}

/* ─────────────────────── 11. 탈퇴 — 남는 것 없이 ─────────────────────── */
console.log(
  '\n[11] 탈퇴 · 회원 지우기 — 두 입구가 같은 길이고, 사람과 이어지지 않은 표도 정해 두었는가'
);
{
  check(
    '본인 탈퇴 · 관리자의 회원 지우기가 같은 함수(lib/delete-user.ts deleteUserCompletely)',
    /deleteUserCompletely\(/.test(src('app/actions/auth.ts')) &&
      /deleteUserCompletely\(/.test(src('app/actions/admin.ts'))
  );
  /*
   * userId 칸은 있는데 관계(@relation)가 하나도 없는 표 — User 를 지워도 Prisma 가 찾아 지우지 않는다. 그런 표는 지우는 함수가 직접 지우거나
   * (deleteMany), 팀 자료라 남긴다고 여기 적어야 한다. 새 표를 더하고 안 정하면 이 시험이 알린다.
   */
  const KEEP = new Set(['VelocityCalibRun', 'ShootCheck']);
  const helper = src('lib/delete-user.ts');
  const loose = [
    ...src('prisma/schema.prisma').matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm),
  ]
    .filter(
      ([, , body]) => /^\s+userId\s+String\b/m.test(body) && !/@relation\(/.test(body)
    )
    .map(([, name]) => name);
  const undecided = loose.filter(
    (n) =>
      !KEEP.has(n) &&
      !helper.includes(`prisma.${n[0].toLowerCase()}${n.slice(1)}.deleteMany`)
  );
  check(
    `사람과 이어지지 않은 표(${loose.join(' · ')})는 탈퇴 때 지우거나 남긴다고 정해져 있다`,
    loose.length > 0 && undecided.length === 0,
    undecided.join(', ')
  );
}

/* ─────────────────────── 12. 앱 입구(/api/rpc) ─────────────────────── */
console.log(
  '\n[12] 앱 입구 — 아이폰 앱(native/)이 부르는 /api/rpc 가 웹과 같은 서버 액션 · 약속 번호를 쓰는가'
);
{
  const route = src('app/api/rpc/[action]/route.ts');
  const registry = src('app/api/rpc/registry.ts');
  /* 서버 액션 파일을 새로 만들고 허용 목록에 안 넣으면 앱에서 'unknown-action' — 화면 조각을 돌려주는 analysis.tsx 만 뺀다 */
  const actionFiles = readdirSync(new URL('../app/actions/', import.meta.url)).filter(
    (f) => f.endsWith('.ts')
  );
  const missing = actionFiles.filter(
    (f) => !registry.includes(`from '@/app/actions/${f.slice(0, -3)}'`)
  );
  check(
    `서버 액션 파일 ${actionFiles.length}개가 모두 허용 목록에 있다`,
    actionFiles.length > 20 && missing.length === 0,
    missing.join(', ')
  );
  check(
    '약속 번호가 낮거나 머리가 없으면 액션을 부르기 전에 426(옛 판 앱 · 남의 사이트에서 쿠키로 부르기 막기)',
    route.indexOf('MIN_APP_API') > -1 &&
      route.indexOf('status: 426') > -1 &&
      route.indexOf('status: 426') < route.indexOf('fn(...args)')
  );
  check(
    '이름 고르기는 모듈 자신의 export 만, 모듈 이름도 허용 목록 자신의 것만(프로토타입 이름 제외)',
    /Object\.hasOwn\(mod, name\)/.test(route) &&
      /Object\.hasOwn\(RPC_MODULES, key\)/.test(route)
  );
  check(
    'redirect() · notFound() 를 삼키지 않고 앱이 알아듣는 답으로 바꾼다',
    route.includes("'NEXT_REDIRECT;'") && route.includes("'NEXT_HTTP_ERROR_FALLBACK;'")
  );
  check(
    '약속 번호 읽기: 없음 · 글자 · 0 · 음수는 0, 숫자는 그 수',
    [
      appApiLevelOf(null),
      appApiLevelOf('abc'),
      appApiLevelOf('0'),
      appApiLevelOf('-3'),
      appApiLevelOf('2'),
    ].join() === '0,0,0,0,2' && APP_API_LEVEL >= MIN_APP_API
  );
}

/* ─────────────────────── 13. 앱 카메라 두 벌 ─────────────────────── */
console.log(
  '\n[13] 앱 카메라 — Capacitor 앱과 Expo 앱(native/)의 공 알아채기가 같은가'
);
{
  /*
   * 두 앱이 같이 쓰이는 동안 공 알아채기(MotionTrigger)가 앱마다 다르면 구속 측정이 앱마다 달라진다 — 그 구간(BALL_TRIGGER)만 글자까지
   * 견준다. 녹화 · 장면 넘기기 · 진단 같은 카메라 길은 새 앱만 일부러 바꿨다(10-20 Phase A/C — 알아채기 줄 · 녹화기 다시 열기 · 버린 까닭),
   * 옛 앱(mobile/)은 굳힌 기준이라 손대지 않는다. 예전엔 '카메라 둘' 뒤 전체를 견줘 늘 실패했다. mobile/ 을 지우면 이 검사도 지운다.
   */
  const section = (text: string) =>
    text.slice(
      text.indexOf('// BALL_TRIGGER_BEGIN'),
      text.indexOf('// BALL_TRIGGER_END')
    );
  const a = section(src('mobile/ios/App/App/DualCameraPlugin.swift'));
  const b = section(src('native/modules/dual-camera/ios/DualCameraCore.swift'));
  const line = a.split('\n').findIndex((l, i) => l !== b.split('\n')[i]);
  check(
    'mobile/…/DualCameraPlugin.swift 와 native/…/DualCameraCore.swift 의 공 알아채기(BALL_TRIGGER) 구간이 글자까지 같다',
    a.length > 10_000 && a === b,
    line < 0 ? '' : `${line + 1}번째 줄부터 다름 — 두 파일을 같이 고친다`
  );
}

console.log(
  '\n[14] 영상 지우기 — 기록 · 공을 지우거나 영상을 뺄 때, 다른 기록이 쓰는 영상은 남기는가(내 영상 P0)'
);
{
  /*
   * 같은 영상을 투구 기록 · 타격 일지 · 구속 측정 공 · 내 영상이 같이 쓸 수 있다. 예전엔 기록을 지우면 경로를 묻지 않고 지웠다.
   * 투구 영상 · 클립을 다루는 서버 파일은 deleteVideos 를 직접 부르지 않고 lib/video-refs.ts deleteUnreferenced 를 거친다.
   */
  const SERVER = [
    'app/api/pitch-log/route.ts',
    'app/api/pitch-log/discard/route.ts',
    'app/actions/velocity.ts',
    'app/actions/velocity-admin.ts',
    'lib/velocity-sync.ts',
  ];
  for (const f of SERVER) {
    const text = src(f);
    check(
      `${f} 는 영상을 deleteUnreferenced 로만 지운다`,
      !/\bdeleteVideos\(/.test(text) && /deleteUnreferenced\(/.test(text)
    );
  }
  const refs = src('lib/video-refs.ts');
  for (const table of ['pitchLog', 'hittingLog', 'velocityPitch', 'velocityAttempt', 'velocityRecordingPart', 'userVideo']) {
    check(`lib/video-refs.ts 가 ${table} 의 참조를 본다`, refs.includes(`prisma.${table}.findMany`));
  }
  /*
   * 앱(native/): 저장된 기록에 붙었던 폰 영상은 서버에 물어(removePhoneOrphans) 안 쓰는 것만 지운다. 바로 지워도 되는 곳은
   * 방금 만들어 아무 기록도 모르는 파일뿐이다 — 아래 목록. 새로 LocalVideo.remove 를 부르면 여기에 까닭과 함께 더한다.
   */
  const FRESH_ONLY = new Set([
    'native/src/pitch/api.ts', // removePhoneOrphans 자신
    'native/src/pitch/attach.ts', // 경로를 못 받은 방금 넣은 파일
    'native/src/app/pitch/import.tsx', // 넣다 막힌 방금 넣은 파일
    'native/src/app/pitch/edit.tsx', // dropUnsaved(서버에 물음) · 이 폼에서 새로 넣은 것(fresh)
    'native/src/velocity/session.ts', // 붙이지 못한 방금 옮긴 클립
    'native/src/app/my-videos/new.tsx', // 영상만 저장 화면에서 [버리기] — 방금 넣고 아직 저장 안 한 파일
    'native/src/lib/cap-bridge.ts', // 웹뷰 다리(웹이 discardPhoneVideos 로 거른다)
  ]);
  const removers = walk('native/src').filter((f) => /\.tsx?$/.test(f) && /LocalVideo\.remove\(/.test(src(f)));
  const stray = removers.filter((f) => !FRESH_ONLY.has(f));
  check('앱에서 폰 영상을 바로 지우는 곳은 정해 둔 곳뿐이다', stray.length === 0, stray.join(', '));
  for (const f of ['native/src/app/pitch/[date].tsx', 'native/src/pitch/velocity-day.tsx']) {
    check(`${f} 는 지운 기록의 폰 영상을 removePhoneOrphans 로 지운다`, src(f).includes('removePhoneOrphans('));
  }
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);

/** 폴더 안 파일 경로(저장소 기준, / 구분) */
function walk(dir: string): string[] {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), {
    withFileTypes: true,
  }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );
}

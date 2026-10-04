/**
 * 근력 · 파워 프로그램 규칙 자체 검사 — lib/program/program.ts · lib/program/next-weight.ts.
 *
 *   npm run program:test
 *
 * DB 를 쓰지 않는다(개발 DB = 운영 DB 라 시험용 기록을 만들지 않는다). 숫자표 · 하루 만들기 · 시작 자격 ·
 * 운동 고정 · 오늘 판정 · 일차 넘기기 · 무게 추천과 그 문구를 본다. 설계: docs/designs/pitcher-strength-power-programs.md
 */
import {
  TOTAL_DAYS,
  checkEligibility,
  dayLabel,
  daySlotOrder,
  dayVariants,
  decideToday,
  finishLine,
  isContrastPower,
  pickCaution,
  pickPinned,
  prescriptionLine,
  readPinned,
  readSessionProgram,
  shouldAdvance,
  slotPrescription,
  variantCandidates,
  warmupLine,
  weekOfDay,
  CAUTION_TEXT,
  REST_TEXT,
  type PinnableExercise,
  type TodaySignals,
} from '../lib/program/program.ts';
import {
  reasonText,
  roundForDisplay,
  suggestWeight,
  weightKindOf,
  weightTag,
  type HistoryEntry,
  type WeightInput,
} from '../lib/program/next-weight.ts';
import {
  freezeProgramExercise,
  mergeReopened,
  programSwapEntry,
  readFrozenPlan,
  type FrozenExercise,
  type FrozenPlan,
} from '../lib/workout/session-plan.ts';

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
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ── 1) 숫자표 · 하루 만들기 ─────────────────────────────── */
console.log('\n1) 숫자표 · 하루 만들기');
check('24회', TOTAL_DAYS === 24);
check(
  '1~3일 1주, 22~24일 8주',
  weekOfDay(1) === 1 && weekOfDay(3) === 1 && weekOfDay(4) === 2 && weekOfDay(24) === 8
);
{
  const r = slotPrescription('bigLower', 'squat', 3);
  check(
    '3주 큰 하체 4×5 · 여유2',
    r.sets === 4 && r.reps === 5 && r.reserve === 2 && !r.light
  );
  const r7 = slotPrescription('bigLower', 'squat', 7);
  check(
    '7주 큰 하체 5×3 · 여유1(U1.1)',
    r7.sets === 5 && r7.reps === 3 && r7.reserve === 1
  );
  const r4 = slotPrescription('pushPull', 'push', 4);
  check(
    '4주는 가벼운 주 2×8 · 여유4',
    r4.light && r4.sets === 2 && r4.reps === 8 && r4.reserve === 4
  );
  check(
    '파워 · 몸통은 여유 없음',
    slotPrescription('power', 'jump', 2).reserve === null &&
      slotPrescription('core', 'antiRotation', 2).reserve === null
  );
  check(
    '5주 몸통 3×5',
    eq(
      [
        slotPrescription('core', 'rotationalThrow', 5).sets,
        slotPrescription('core', 'rotationalThrow', 5).reps,
      ],
      [3, 5]
    )
  );
}
{
  const d1 = dayVariants(1);
  const d2 = dayVariants(2);
  check(
    '홀수 날 = 스쿼트 · 밀기 · 점프',
    d1.bigLower === 'squat' && d1.pushPull === 'push' && d1.power === 'jump'
  );
  check(
    '짝수 날 = 힌지 · 당기기 · 메디신볼',
    d2.bigLower === 'hinge' && d2.pushPull === 'pull' && d2.power === 'medball'
  );
  check(
    '몸통 1~4주 항회전, 5~8주 회전 던지기',
    dayVariants(12).core === 'antiRotation' &&
      dayVariants(13).core === 'rotationalThrow'
  );
  let a = 0;
  for (let d = 1; d <= TOTAL_DAYS; d++) if (dayVariants(d).bigLower === 'squat') a++;
  check('A · B 가 12번씩', a === 12);
}
check('2주는 파워가 맨 앞', daySlotOrder(4)[0] === 'power');
check(
  '5~7주는 큰 하체 뒤에 파워(대비)',
  eq(daySlotOrder(13).slice(0, 2), ['bigLower', 'power']) && isContrastPower(19)
);
check(
  '8주(가벼운 주)는 다시 파워가 앞',
  daySlotOrder(22)[0] === 'power' && !isContrastPower(22)
);
check('일차 이름', dayLabel(8) === '3주차 · 2일차', dayLabel(8));
check(
  '처방 한 줄',
  prescriptionLine(slotPrescription('bigLower', 'squat', 3)) ===
    '4세트 × 5회 · 2개 남기고'
);
check(
  '가벼운 주 한 줄',
  prescriptionLine(slotPrescription('bigLower', 'squat', 4)) ===
    '2세트 × 5회 · 가볍게 · 4개 남기고'
);
check(
  '파워 한 줄',
  prescriptionLine(slotPrescription('power', 'jump', 1)) ===
    '3세트 × 3회 · 최대 속도 · 충분히 쉬고'
);
check(
  '한쪽 운동은 좌우 각각',
  prescriptionLine(slotPrescription('singleLeg', 'singleLeg', 2), true) ===
    '3세트 × 8회 (좌우 각각) · 2개 남기고'
);

/* ── 2) 시작 자격 ─────────────────────────────── */
console.log('\n2) 시작 자격');
const full = ['바벨', '덤벨', '메디신볼', '박스', '벤치'];
const base = {
  age: 24,
  trainingLevel: '중급',
  season: 'off' as const,
  ownedEquipment: full,
};
check('다 맞으면 시작', checkEligibility(base).ok);
{
  const r = checkEligibility({ ...base, age: null });
  check('생년월일 없음 → 물음', !r.ok && r.kind === 'ask' && r.step === 'birth');
  const r17 = checkEligibility({ ...base, age: 17 });
  check('만 17세 → 막힘', !r17.ok && r17.kind === 'blocked');
  const rLv = checkEligibility({ ...base, trainingLevel: null });
  check('경력 없음 → 물음', !rLv.ok && rLv.kind === 'ask' && rLv.step === 'level');
  const rIn = checkEligibility({ ...base, trainingLevel: '입문' });
  check('입문 → 막힘', !rIn.ok && rIn.kind === 'blocked');
  const rS = checkEligibility({ ...base, season: 'in' });
  check('시즌 중 → 막힘', !rS.ok && rS.kind === 'blocked');
  const rR = checkEligibility({ ...base, season: 'rehab' });
  check('재활 → 막힘', !rR.ok && rR.kind === 'blocked');
  const rE = checkEligibility({ ...base, ownedEquipment: [] });
  check(
    '장비 안 고름 → 물음(모두로 보지 않음)',
    !rE.ok && rE.kind === 'ask' && rE.step === 'equipment'
  );
  const rM = checkEligibility({ ...base, ownedEquipment: ['바벨', '덤벨'] });
  check(
    '메디신볼 없음 → 막힘, 조사',
    !rM.ok && rM.kind === 'blocked' && rM.reason.startsWith('메디신볼이'),
    !rM.ok && rM.kind === 'blocked' ? rM.reason : ''
  );
}

/* ── 3) 운동 고정 ─────────────────────────────── */
console.log('\n3) 운동 고정');
const ex = (
  id: string,
  title: string,
  category: string,
  movementPattern: string | null,
  equipment: string[],
  intensity = '높음',
  difficulty: string | null = '중급',
  perSide = false
): PinnableExercise => ({
  id,
  title,
  category,
  movementPattern,
  equipment,
  intensity,
  difficulty,
  perSide,
});
const lib: PinnableExercise[] = [
  ex('gob', '고블렛 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨'], '중간', '초급'),
  ex('dfs', '덤벨 프론트 스쿼트', '하체 스트렝스', '스쿼트', ['덤벨']),
  ex('bsq', '바벨 스쿼트', '하체 스트렝스', '스쿼트', ['바벨']),
  ex(
    'fsq',
    '바벨 프론트 스쿼트',
    '하체 스트렝스',
    '스쿼트',
    ['바벨'],
    '매우 높음',
    '상급'
  ),
  ex(
    'csq',
    '고블렛 커시 스쿼트',
    '하체 스트렝스',
    '스쿼트',
    ['덤벨'],
    '높음',
    '중급',
    true
  ),
  ex('rdl', '바벨 RDL', '하체 스트렝스', '힌지', ['바벨']),
  ex('bp', '벤치프레스', '상체 스트렝스', '밀기', ['바벨', '벤치']),
  ex('dbp', '덤벨 프레스', '상체 스트렝스', '밀기', ['덤벨', '벤치'], '높음', '초급'),
  ex(
    'row',
    '원 암 덤벨로우',
    '상체 스트렝스',
    '당기기',
    ['덤벨', '벤치'],
    '중간',
    '초급',
    true
  ),
  ex('brow', '바벨 로우', '상체 스트렝스', '당기기', ['바벨']),
  ex('pull', '풀업', '상체 스트렝스', '당기기', ['철봉']),
  ex('rl', '덤벨 리버스 런지', '하체 스트렝스', '런지', ['덤벨'], '중간', '초급', true),
  ex('bj', '박스 점프', '파워', '스쿼트', ['박스']),
  ex('broad', '브로드 점프', '파워', '스쿼트', ['맨몸']),
  ex('slam', '오버헤드 메디신볼 슬램', '파워', '회전', ['메디신볼'], '높음', '초급'),
  ex('chest', '톨 닐링 메디신볼 체스트 패스', '파워', '밀기', ['메디신볼'], '중간'),
  ex('pal', '밴드 팔로프 프레스', '코어', null, ['밴드'], '낮음', '초급', true),
  ex('twist', '메디신볼 러시안 트위스트', '코어', null, ['메디신볼'], '낮음', '초급'),
  ex('carry', '편측 파머스 캐리', '코어', null, ['덤벨'], '중간', '초급', true),
  ex('bug', '데드버그', '코어', null, ['맨몸'], '낮음', '초급'),
];
{
  const sq = variantCandidates('squat', lib, full, '중급').map((e) => e.id);
  check(
    '스쿼트: 바벨 먼저, 한쪽 · 중간 강도 빠짐',
    sq[0] === 'bsq' && !sq.includes('csq') && !sq.includes('gob'),
    sq.join(',')
  );
  const sqBeginner = variantCandidates('squat', lib, full, '초급').map((e) => e.id);
  check('초급이면 상급 운동 빠짐', !sqBeginner.includes('fsq'), sqBeginner.join(','));
  const sqNoBar = variantCandidates('squat', lib, ['덤벨', '메디신볼'], '중급').map(
    (e) => e.id
  );
  check(
    '바벨이 없으면 바벨 운동 안 고름',
    sqNoBar.length > 0 && sqNoBar.every((id) => id !== 'bsq' && id !== 'fsq'),
    sqNoBar.join(',')
  );
  const pull = variantCandidates('pull', lib, full, '중급').map((e) => e.id);
  check(
    '당기기: 철봉 없으면 풀업 빠짐, 두 손 먼저',
    !pull.includes('pull') && pull[0] === 'brow',
    pull.join(',')
  );
  const pins = pickPinned(lib, full, '중급');
  check(
    '9개 중 라이브러리로 채울 수 있는 것은 다 채움',
    [
      'squat',
      'hinge',
      'push',
      'pull',
      'singleLeg',
      'jump',
      'medball',
      'antiRotation',
      'rotationalThrow',
    ].every((v) => typeof pins[v as keyof typeof pins] === 'string'),
    JSON.stringify(pins)
  );
  check(
    '메디신볼 파워는 회전 아닌 것 먼저, 회전 던지기는 회전 메디신볼',
    pins.medball === 'chest' && pins.rotationalThrow === 'slam'
  );
  check(
    '밴드가 없으면 항회전은 한쪽 캐리로',
    pins.antiRotation === 'carry',
    String(pins.antiRotation)
  );
  check(
    '밴드가 있으면 팔로프 먼저',
    pickPinned(lib, [...full, '밴드'], '중급').antiRotation === 'pal'
  );
  const kept = pickPinned(lib, full, '중급', { squat: 'dfs' });
  check('바꾼 것은 지킴', kept.squat === 'dfs');
  check(
    '저장된 pinned 읽기 — 모르는 키 버림',
    eq(readPinned({ squat: 'a', foo: 'b', hinge: 3 }), { squat: 'a' })
  );
}

/* ── 4) 오늘 판정 ─────────────────────────────── */
console.log('\n4) 오늘 판정');
const sig = (o: Partial<TodaySignals> = {}): TodaySignals => ({
  nextDay: 5,
  today: '2026-10-10',
  lastProgramDate: '2026-10-08',
  checkedIn: true,
  otherWorkoutStarted: false,
  halted: false,
  gameToday: false,
  gameTomorrow: false,
  gameYesterday: false,
  bullpenToday: false,
  hardThrowRecent: false,
  override: false,
  recovery: null,
  loadCaution: false,
  soreMany: false,
  sleepShort: false,
  uncertain: false,
  painSlots: [],
  ...o,
});
check(
  '보통 날 = 진행, 주의 없음',
  (() => {
    const d = decideToday(sig());
    return d.kind === 'go' && d.caution === null && Object.keys(d.adjust).length === 0;
  })()
);
check('25일차 = 다 끝남', decideToday(sig({ nextDay: 25 })).kind === 'done');
check(
  '통증 멈춤 = 기다림(넘기기 없음)',
  decideToday(sig({ halted: true, override: true })).kind === 'painWait'
);
check('체크인 전', decideToday(sig({ checkedIn: false })).kind === 'needCheckin');
check(
  '다른 방식으로 이미 시작',
  decideToday(sig({ otherWorkoutStarted: true })).kind === 'otherMode'
);
check(
  '어제 프로그램 날 = 간격',
  decideToday(sig({ lastProgramDate: '2026-10-09' })).kind === 'spacing'
);
{
  const d = decideToday(sig({ gameYesterday: true }));
  check(
    '경기 다음 날 = 쉼, 넘길 수 있음',
    d.kind === 'rest' && d.reason === 'gameYesterday' && d.canOverride
  );
  const o = decideToday(sig({ gameToday: true, override: true }));
  check(
    '경기 날 넘기면 진행 + 주의 1순위',
    o.kind === 'go' && o.caution === 'gameOverride'
  );
  const low = decideToday(sig({ recovery: 'lowCondition' }));
  check(
    '회복 데이(컨디션) = 큰 하체 · 파워 가볍게',
    low.kind === 'go' &&
      low.adjust.bigLower?.kind === 'lighter' &&
      low.adjust.power?.kind === 'lighter' &&
      low.caution === 'recovery'
  );
  const load = decideToday(sig({ recovery: 'loadRisk' }));
  check(
    '회복 데이(부하 위험) = 진행 + 주의만',
    load.kind === 'go' &&
      Object.keys(load.adjust).length === 0 &&
      load.caution === 'recovery'
  );
  const lc = decideToday(sig({ loadCaution: true }));
  check('부하 주의 = 파워 뺌', lc.kind === 'go' && lc.adjust.power?.kind === 'drop');
  const sore = decideToday(sig({ soreMany: true }));
  check(
    '근육통 많이 = 큰 하체만 가볍게',
    sore.kind === 'go' && sore.adjust.bigLower?.kind === 'lighter' && !sore.adjust.power
  );
  const bp5 = decideToday(
    sig({ nextDay: 14, bullpenToday: true, lastProgramDate: '2026-10-07' })
  );
  check(
    '5주 불펜 날 = 회전 던지기 뺌',
    bp5.kind === 'go' && bp5.adjust.core?.kind === 'drop'
  );
  const bp2 = decideToday(sig({ bullpenToday: true }));
  check('2주 불펜 날 = 항회전은 그대로', bp2.kind === 'go' && !bp2.adjust.core);
  const pain = decideToday(sig({ painSlots: ['singleLeg'], loadCaution: true }));
  check(
    '부위 통증 칸 = 대체, 뺀 칸은 그대로 뺌',
    pain.kind === 'go' &&
      pain.adjust.singleLeg?.kind === 'substitute' &&
      pain.adjust.power?.kind === 'drop'
  );
  const gap = decideToday(sig({ lastProgramDate: '2026-09-30' }));
  check(
    '10일 쉼 = 주의 오래 쉼, gapDays',
    gap.kind === 'go' && gap.caution === 'restGap' && gap.gapDays === 10
  );
  const lw = decideToday(sig({ nextDay: 10 }));
  check('4주 = 가벼운 주 주의', lw.kind === 'go' && lw.caution === 'lightWeek');
}
check(
  '주의 우선순위: 회복 > 센 불펜 > 모름 > 가볍게',
  pickCaution(
    sig({ recovery: 'soreSevere', hardThrowRecent: true, uncertain: true }),
    2,
    2
  ) === 'recovery' &&
    pickCaution(
      sig({ hardThrowRecent: true, uncertain: true, soreMany: true }),
      2,
      2
    ) === 'hardThrow' &&
    pickCaution(sig({ uncertain: true, soreMany: true }), 2, 2) === 'uncertain' &&
    pickCaution(sig({ sleepShort: true }), 4, 20) === 'lighter'
);

/* ── 5) 일차 넘기기 ─────────────────────────────── */
console.log('\n5) 일차 넘기기');
const prog = { key: 'offseason-strength-power', day: 5, week: 2 };
check(
  '프로그램 아닌 날은 안 넘김(RG)',
  !shouldAdvance({ program: null, nextDay: 5, plannedSets: 16, loggedSets: 16 })
);
check(
  '일차가 다르면 안 넘김(두 번 넘김 막기)',
  !shouldAdvance({ program: prog, nextDay: 6, plannedSets: 16, loggedSets: 16 })
);
check(
  '16세트 중 7 = 안 넘김',
  !shouldAdvance({ program: prog, nextDay: 5, plannedSets: 16, loggedSets: 7 })
);
check(
  '16세트 중 8 = 넘김',
  shouldAdvance({ program: prog, nextDay: 5, plannedSets: 16, loggedSets: 8 })
);
check(
  '진행 중이 아니면 안 넘김',
  !shouldAdvance({ program: prog, nextDay: null, plannedSets: 16, loggedSets: 16 })
);
check(
  '처방 0 = 안 넘김',
  !shouldAdvance({ program: prog, nextDay: 5, plannedSets: 0, loggedSets: 0 })
);
check(
  '얼린 목록 program 읽기',
  eq(readSessionProgram({ key: 'k', day: 3, week: 1 }), {
    key: 'k',
    day: 3,
    week: 1,
  }) &&
    readSessionProgram({ key: 'k', day: '3' }) === null &&
    readSessionProgram(undefined) === null
);
check(
  '끝내기 줄(미만)',
  finishLine(5, 16, 7) === '16세트 중 7세트. 8세트를 하면 다음 일차로 가요',
  finishLine(5, 16, 7)
);
check('끝내기 줄(넘음)', finishLine(5, 15, 8) === '5일차를 마쳐요');
check(
  '준비 세트 줄',
  warmupLine(95) === '빈 봉×8 → 57.5×5 → 75×3 · 적지 않아도 돼요',
  warmupLine(95) ?? ''
);
check('가벼운 무게엔 준비 줄 없음', warmupLine(30) === null);

/* ── 6) 무게 추천 ─────────────────────────────── */
console.log('\n6) 무게 추천');
const h = (o: Partial<HistoryEntry>): HistoryEntry => ({
  date: '2026-10-01',
  prescribedReps: 5,
  reserve: 2,
  light: false,
  adjusted: false,
  halfDone: true,
  lastWeightKg: 100,
  lastReps: 5,
  rir: 2,
  hitReps: true,
  ...o,
});
const wi = (o: Partial<WeightInput>): WeightInput => ({
  kind: 'barbell',
  bigLower: true,
  reps: 5,
  reserve: 2,
  light: false,
  adjusted: false,
  gapDays: 2,
  history: [],
  ...o,
});
check(
  '장비 단위',
  weightKindOf(['바벨', '벤치']) === 'barbell' &&
    weightKindOf(['덤벨']) === 'dumbbell' &&
    weightKindOf(['케이블']) === 'machine' &&
    weightKindOf(['메디신볼']) === 'none'
);
check(
  '처음 = 숫자 없음',
  suggestWeight(wi({})).kg === null && suggestWeight(wi({})).reason.code === 'first'
);
check(
  '맨몸 = 무게 없음',
  suggestWeight(wi({ kind: 'none', history: [h({})] })).reason.code === 'noWeight'
);
check(
  'R = T+1 → 하체 5% 올림',
  suggestWeight(wi({ history: [h({ lastWeightKg: 92.5, rir: 3 })] })).kg === 97.5,
  String(suggestWeight(wi({ history: [h({ lastWeightKg: 92.5, rir: 3 })] })).kg)
);
check('R = T → 그대로', suggestWeight(wi({ history: [h({ rir: 2 })] })).kg === 100);
check(
  '안 답함 → 그대로',
  suggestWeight(wi({ history: [h({ rir: null })] })).reason.code === 'holdUnanswered'
);
check(
  '한 번 못 채움 → 그대로',
  suggestWeight(wi({ history: [h({ rir: 1 })] })).kg === 100
);
check(
  '두 번 못 채움 → 5% 줄임',
  suggestWeight(
    wi({ history: [h({ rir: 1 }), h({ date: '2026-09-28', hitReps: false })] })
  ).kg === 95
);
check(
  '앞이 안 답함이면 두 번으로 안 셈',
  suggestWeight(wi({ history: [h({ rir: 1 }), h({ date: '2026-09-28', rir: null })] }))
    .kg === 100
);
check(
  '덤벨 상체 20 → 22(최소 한 단위, U1.3)',
  suggestWeight(
    wi({
      kind: 'dumbbell',
      bigLower: false,
      history: [h({ lastWeightKg: 20, rir: 3 })],
    })
  ).kg === 22
);
check(
  '바벨 하체 40 → 42.5(U1.3)',
  suggestWeight(wi({ history: [h({ lastWeightKg: 40, rir: 3 })] })).kg === 42.5
);
check(
  '횟수 옮기기 60×8 R3 → 6회 T2 = 65(U1.2)',
  suggestWeight(
    wi({
      reps: 6,
      reserve: 2,
      history: [
        h({ lastWeightKg: 60, prescribedReps: 8, lastReps: 8, reserve: 3, rir: 3 }),
      ],
    })
  ).kg === 65
);
{
  const s = suggestWeight(
    wi({
      reps: 3,
      reserve: 1,
      history: [
        h({ lastWeightKg: 100, prescribedReps: 8, lastReps: 8, reserve: 3, rir: 4 }),
      ],
    })
  );
  check('상한 +10kg', s.kg === 110 && s.notes.includes('cap'), String(s.kg));
}
check(
  '가벼운 주 ×0.9',
  suggestWeight(wi({ light: true, reserve: 4, history: [h({})] })).kg === 90
);
check(
  '기준은 보통 날만(가벼운 주를 건너뜀)',
  suggestWeight(
    wi({
      reps: 4,
      history: [
        h({ date: '2026-10-01' }),
        h({ date: '2026-10-05', light: true, lastWeightKg: 90 }),
      ],
    })
  ).reason.code === 'transfer' &&
    (
      suggestWeight(
        wi({
          reps: 4,
          history: [
            h({ date: '2026-10-01' }),
            h({ date: '2026-10-05', light: true, lastWeightKg: 90 }),
          ],
        })
      ).reason as { prevKg: number }
    ).prevKg === 100
);
check(
  '조정한 날 · 절반 못 한 날도 건너뜀',
  suggestWeight(
    wi({
      history: [
        h({ date: '2026-10-01' }),
        h({ date: '2026-10-05', adjusted: true, lastWeightKg: 80 }),
        h({ date: '2026-10-06', halfDone: false, lastWeightKg: 70 }),
      ],
    })
  ).kg === 100
);
check('10일 쉼 ×0.9', suggestWeight(wi({ gapDays: 10, history: [h({})] })).kg === 90);
check('20일 쉼 ×0.85', suggestWeight(wi({ gapDays: 20, history: [h({})] })).kg === 85);
check(
  '30일 쉼 = 숫자 없이',
  suggestWeight(wi({ gapDays: 30, history: [h({})] })).reason.code === 'longBreak'
);
check(
  '오늘 조정 ×0.9 + 표시',
  (() => {
    const s = suggestWeight(wi({ adjusted: true, history: [h({})] }));
    return s.kg === 90 && weightTag(s) === '−10% 오늘 컨디션';
  })()
);
check(
  '겹치면 곱함(가벼운 주 + 20일 쉼)',
  suggestWeight(wi({ light: true, gapDays: 20, history: [h({})] })).kg === 77.5
);
check(
  'lb 화면 반올림',
  roundForDisplay(100, 'lb') === 220 && roundForDisplay(100, 'kg') === 100
);

/* ── 7) 문구 ─────────────────────────────── */
console.log('\n7) 문구 — 해요체 · 줄표 없음');
const texts = [
  ...Object.values(CAUTION_TEXT),
  ...Object.values(REST_TEXT),
  reasonText(suggestWeight(wi({}))),
  reasonText(suggestWeight(wi({ history: [h({ rir: 3 })] }))),
  reasonText(suggestWeight(wi({ reps: 6, history: [h({ prescribedReps: 8 })] }))),
  reasonText(
    suggestWeight(
      wi({
        light: true,
        gapDays: 20,
        history: [h({ rir: 1 }), h({ date: '2026-09-28', hitReps: false })],
      })
    )
  ),
  reasonText(suggestWeight(wi({ gapDays: 40, history: [h({})] }))),
];
check(
  '줄표(—) 없음',
  texts.every((t) => !t.includes('—')),
  texts.find((t) => t.includes('—')) ?? ''
);
check(
  '올림 까닭에 지난 기록',
  reasonText(suggestWeight(wi({ history: [h({ rir: 3 })] }))).includes('100kg × 5')
);

/* ── 8) 회귀 계약(RG) — 프로그램이 아닌 날은 그대로 ─────────────────────────────── */
console.log('\n8) 회귀 계약 — 프로그램 아닌 날 · 교체');
const src = (o: Record<string, unknown> = {}) => ({
  id: 'x',
  title: '덤벨 프레스',
  category: '상체 스트렝스',
  bodyParts: ['가슴'],
  intensity: '높음',
  movementPattern: '밀기',
  equipment: ['덤벨', '벤치'],
  sets: 3,
  reps: 10,
  holdSeconds: null as number | null,
  restSeconds: 90,
  perSide: false,
  thumbPath: null,
  ...o,
});
const oldEx = {
  id: 'a',
  title: '스쿼트',
  category: '하체 스트렝스',
  slot: 'main',
  prescription: '3세트 × 10회',
  plannedSets: 3,
  plannedReps: 10,
  plannedHoldSeconds: null,
  perSide: false,
  needsWeight: true,
  isHold: false,
  equipment: ['바벨'],
  bodyParts: [],
  intensity: '높음',
  thumbPath: null,
} as FrozenExercise;
const oldJson = {
  themeKey: 'lower',
  themeLabel: '하체 스트렝스 데이',
  goal: '근력 향상',
  exercises: [oldEx],
};
{
  const read = readFrozenPlan(oldJson);
  check(
    '옛 판은 예전과 똑같은 모양(새 키 없음)',
    eq(read, oldJson) && read != null && !('program' in read)
  );
  const progJson = {
    ...oldJson,
    program: { key: 'offseason-strength-power', day: 5, week: 2 },
  };
  check(
    '프로그램 판은 program 을 지킴(U2)',
    eq(readFrozenPlan(progJson)?.program, progJson.program)
  );
  const bad = readFrozenPlan({ ...oldJson, program: { key: 1 } });
  check('program 모양이 틀리면 버림', bad != null && !('program' in bad));
  const fresh: FrozenPlan = {
    themeKey: 'upper',
    themeLabel: '상체',
    goal: null,
    exercises: [{ ...oldEx, id: 'b' }, oldEx],
  };
  check('다시 열 판이 없으면 새 목록 그대로', mergeReopened(null, fresh) === fresh);
  const kept = readFrozenPlan(progJson) as FrozenPlan;
  const merged = mergeReopened(kept, fresh);
  check(
    '다시 열면 쓰던 목록 + 새 운동만, program 남음',
    eq(
      merged.exercises.map((e) => e.id),
      ['a', 'b']
    ) &&
      eq(merged.program, progJson.program) &&
      merged.themeKey === 'lower'
  );
  check(
    '프로그램 아닌 판의 교체 = null(지금 그대로)',
    programSwapEntry(read as FrozenPlan, oldEx, src(), 0, null) === null
  );
}
{
  const rx3 = slotPrescription('pushPull', 'push', 3);
  const fe = freezeProgramExercise(src(), rx3, { suggestedKg: 24 });
  check(
    '프로그램 운동 = 표 처방 · 칸 · 추천',
    fe.plannedSets === 4 &&
      fe.plannedReps === 6 &&
      fe.restSeconds === 120 &&
      fe.prescription === '4세트 × 6회 · 2개 남기고' &&
      fe.programSlot?.variant === 'push' &&
      fe.suggestedKg === 24 &&
      fe.slot === 'main'
  );
  const lighter = freezeProgramExercise(
    src(),
    slotPrescription('bigLower', 'squat', 3),
    { suggestedKg: 85, adjusted: true }
  );
  check(
    '조정한 날 = 세트 −1 · 표시',
    lighter.plannedSets === 3 && lighter.programSlot?.adjusted === true
  );
  const hold = freezeProgramExercise(
    src({ reps: null, holdSeconds: 30, category: '코어' }),
    slotPrescription('core', 'antiRotation', 2),
    { suggestedKg: null }
  );
  check(
    '버티기 운동은 시간 그대로, 세트만 맞춤, 몸통 칸',
    hold.isHold &&
      hold.plannedHoldSeconds === 30 &&
      hold.plannedSets === 3 &&
      hold.slot === 'core'
  );
  const plan: FrozenPlan = {
    themeKey: 'lower',
    themeLabel: '프로그램',
    goal: null,
    program: { key: 'offseason-strength-power', day: 8, week: 3 },
    exercises: [fe],
  };
  const swap = programSwapEntry(
    plan,
    fe,
    src({ id: 'y', title: '벤치프레스', equipment: ['바벨', '벤치'] }),
    0,
    60
  );
  check(
    '프로그램 날 바꾸기 = 그 칸 · 그 주 처방, 대체 표시(U3)',
    swap != null &&
      swap.entry.plannedSets === 4 &&
      swap.entry.plannedReps === 6 &&
      swap.entry.programSlot?.substitute === true &&
      swap.entry.suggestedKg === 60 &&
      swap.fromPlannedSets === null
  );
  const after = programSwapEntry(plan, fe, src({ id: 'y' }), 2, null);
  check(
    '세트 2개 남긴 뒤 바꾸기 = 남은 2세트만, 바뀐 운동은 2로 줄임',
    after != null && after.entry.plannedSets === 2 && after.fromPlannedSets === 2
  );
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);

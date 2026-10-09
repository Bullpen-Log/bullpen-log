/*
 * 트레이닝 영상 촬영 계획 · 진행 셀프테스트 — `npm run shoot:test`. DB 를 건드리지 않는다.
 *
 *   ① 고정해 둔 계획(lib/shoot/plan-data.json)이 약속을 지키나 — 한 번씩만 · 번호 · 시각 · 3시간 · 부하 상한 · 자리 순서
 *   ② 계획 계산(lib/shoot/schedule.ts)이 같은 입력에 같은 답 · 상한을 지키나(합성 운동)
 *   ③ 진행(lib/shoot/progress.ts) — 지금 · 다음 · 미룬 것 · 이어 찍기 · 계획 대비 · 날별 속도
 */
import { readFileSync } from 'node:fs';
import {
  BREAK_EVERY,
  LOWER_BUCKETS,
  SESSION_MINUTES,
  ALL_STATIONS,
  OUTDOOR_STATIONS,
  WRAP_MINUTES,
  buildPlan,
  bucketOf,
  demoCue,
  loadOf,
  postureOf,
  shotMinutes,
  stationOf,
  type PlanItem,
  type PlanWeek,
  type ShootExercise,
  type ShootPlan,
} from '../lib/shoot/schedule.ts';
import {
  carriedOver,
  clockText,
  countOf,
  cursorOf,
  cursorOfList,
  doneShare,
  groupCounts,
  paceMinutes,
  sessionsOf,
  transitionAfter,
  weekItems,
  type ShootCheckView,
} from '../lib/shoot/progress.ts';
import {
  OUTDOOR_DEFAULT,
  PLYO,
  buildOutdoorWeeks,
  drillMinutes,
  familyOf,
} from '../lib/shoot/outdoor.ts';
import { SHOOT_WARMUPS, warmupRowId } from '../lib/shoot/warmups.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const plan = JSON.parse(
  readFileSync(new URL('../lib/shoot/plan-data.json', import.meta.url), 'utf8')
) as ShootPlan;

function invariants(p: ShootPlan, label: string) {
  const items = p.weeks.flatMap(weekItems);
  const ids = items.map((i) => i.exerciseId);
  check(
    `${label} — 운동마다 한 번씩만`,
    new Set(ids).size === ids.length,
    `${ids.length}개`
  );
  const nosOk = p.weeks.every((w) =>
    weekItems(w).every(
      (it, i) => it.no === `${w.week}-${String(i + 1).padStart(2, '0')}`
    )
  );
  check(`${label} — 번호는 주차-순번(1-01 …)으로 빈틈없이`, nosOk);
  const clockOk = p.weeks.every((w) => {
    const its = weekItems(w);
    return its.every(
      (it, i) => i === 0 || it.at >= its[i - 1].at + its[i - 1].minutes - 1e-6
    );
  });
  check(`${label} — 계획 시각이 앞 운동이 끝난 뒤`, clockOk);
  const endOk = p.weeks.every((w) => w.end <= SESSION_MINUTES - WRAP_MINUTES);
  check(
    `${label} — 매주 백업 10분 전(2:50)에 촬영이 끝남`,
    endOk,
    p.weeks.map((w) => clockText(w.end)).join(' · ')
  );
  check(
    `${label} — 영상 1개 3분 안`,
    items.every((it) => it.minutes <= 3)
  );
  const breaksOk = p.weeks.every(
    (w) => weekItems(w).filter((it) => it.breakAfter).length <= 2
  );
  check(`${label} — 쉬기는 한 회 두 번까지`, breaksOk);
  const stationOrderOk = p.weeks.every((w) =>
    w.stations.every(
      (s, i) =>
        i === 0 ||
        ALL_STATIONS.indexOf(s.station) >
          ALL_STATIONS.indexOf(w.stations[i - 1].station)
    )
  );
  check(`${label} — 자리는 한 회에 한 번씩, 정한 순서대로`, stationOrderOk);
  const heavy = (w: PlanWeek) =>
    weekItems(w).filter((it) => LOWER_BUCKETS.includes(it.bucket) && it.load >= 2);
  const heavyTotal = p.weeks.reduce((a, w) => a + heavy(w).length, 0);
  const cap = Math.ceil(heavyTotal / p.weeks.length) + 1;
  check(
    `${label} — 무거운 하체 회당 ${cap}개까지`,
    p.weeks.every((w) => heavy(w).length <= cap),
    p.weeks.map((w) => heavy(w).length).join(' · ')
  );
  const sideOk = p.weeks.every((w) =>
    w.stations.every((s) => {
      const m = new Map<string, number>();
      for (const it of s.items)
        if (LOWER_BUCKETS.includes(it.bucket) && it.load >= 2)
          m.set(it.bucket, (m.get(it.bucket) ?? 0) + 1);
      return [...m.values()].every((n) => n <= 2);
    })
  );
  check(`${label} — 한 자리에서 같은 쪽 무거운 하체 2개까지`, sideOk);
  /* 한 자리를 같은 자세끼리 끊은 토막 — 자리 안 규칙(파워 먼저 · 같은 부위 3개)은 토막마다 */
  const runs = (items: PlanItem[]) =>
    items.reduce<PlanItem[][]>((acc, it, i) => {
      if (i > 0 && postureOf(items[i - 1].title) === postureOf(it.title))
        acc[acc.length - 1].push(it);
      else acc.push([it]);
      return acc;
    }, []);
  const indoorStations = p.weeks.flatMap((w) =>
    w.stations.filter((s) => s.station !== '넓은 바닥(이동)')
  );
  check(
    `${label} — 자세는 한 자리에서 한 번씩만 바뀐다(같은 자세끼리 붙임)`,
    indoorStations.every((s) => {
      const ps = runs(s.items).map((r) => postureOf(r[0].title));
      return new Set(ps).size === ps.length;
    })
  );
  const powerFirst = indoorStations.every((s) =>
    runs(s.items).every((r) => {
      const idx = r
        .map((it, i) => (it.bucket === '하체 파워' ? i : -1))
        .filter((i) => i >= 0);
      return idx.every((v, k) => v === k);
    })
  );
  check(`${label} — 파워는 같은 자세 토막의 맨 앞(싱싱할 때)`, powerFirst);
  const runOk = indoorStations.every((s) =>
    runs(s.items).every((items) => {
      let run = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (i > 0 && items[i - 1].bucket === it.bucket) {
          run++;
        } else {
          run = 1;
        }
        if (it.bucket !== '모빌리티' && it.bucket !== '하체 파워') {
          /* 다른 부위가 남아 있지 않을 때는 이어질 수 있다 — 그때만 넘침을 봐준다 */
          const othersLeft = items.slice(i + 1).some((x) => x.bucket !== it.bucket);
          if (run > 3 && othersLeft) return false;
        }
      }
      return true;
    })
  );
  check(
    `${label} — 같은 자세 안에서 같은 부위는 3개까지 잇고 다른 부위로(남은 게 그 부위뿐일 때만 예외)`,
    runOk
  );
  void BREAK_EVERY;
}

check(
  '자세 가르기 — 이름으로',
  postureOf('프론 원판 스위머') === '엎드려' &&
    postureOf('짐볼 데드버그') === '누워' &&
    postureOf('하프닐링 워터볼 찹') === '무릎' &&
    postureOf('사이드라잉 윈드밀') === '옆으로' &&
    postureOf('쿼드러펫 덤벨 T 레이즈') === '네발' &&
    postureOf('시티드 외회전 에센트릭 오버로드') === '앉아' &&
    postureOf('고블렛 스쿼트') === '서서'
);

console.log(
  '\n■ 고정 계획(lib/shoot/plan-data.json) — 실내 1~7주(version 3 — 우리 영상인 운동도 다시 찍는다)'
);
const indoorPlan: ShootPlan = { ...plan, weeks: plan.weeks.filter((w) => !w.outdoor) };
{
  const items = indoorPlan.weeks.flatMap(weekItems);
  check(
    '실내 7주 · 417개(야외를 붙여도 그대로)',
    indoorPlan.weeks.length === 7 &&
      items.length === 417 &&
      indoorPlan.weeks.every((w, i) => w.week === i + 1),
    `${indoorPlan.weeks.length}주 · ${items.length}개`
  );
  invariants(indoorPlan, '고정 계획');
  const lower = indoorPlan.weeks.map((w) =>
    LOWER_BUCKETS.reduce((a, b) => a + (w.load[b] ?? 0), 0)
  );
  check(
    '하체 부하는 회마다 고르게(최대 − 최소 ≤ 8점)',
    Math.max(...lower) - Math.min(...lower) <= 8,
    lower.map((x) => x.toFixed(1)).join(' · ')
  );
}

console.log('\n■ 고정 계획 — 야외 8~10주(투구 드릴만 — 워밍업 24개는 2026-10-09 뺐다)');
{
  const out = plan.weeks.filter((w) => w.outdoor);
  const items = out.flatMap(weekItems);
  const drills = items.filter((i) => i.kind === 'drill');
  const warms = items.filter((i) => i.kind === 'warmup');
  check(
    '야외 3주(8 · 9 · 10) — 드릴 139 · 워밍업 없음',
    out.map((w) => w.week).join() === '8,9,10' &&
      drills.length === 139 &&
      warms.length === 0,
    `${out.map((w) => w.week).join(',')} · 드릴 ${drills.length} · 워밍업 ${warms.length}`
  );
  const rowIds = SHOOT_WARMUPS.map((w) => warmupRowId(w.id));
  check(
    '워밍업마다 라이브러리 운동 id(uuid)가 따로 정해져 있다',
    rowIds.every(
      (r) =>
        !!r &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r)
    ) && new Set(rowIds).size === rowIds.length
  );
  const all = plan.weeks.flatMap(weekItems).map((i) => i.exerciseId);
  check(
    '실내 · 야외 통틀어 한 번씩만',
    new Set(all).size === all.length,
    `${all.length}개`
  );
  check(
    '번호는 주차-순번으로 빈틈없이(6-01 …)',
    out.every((w) =>
      weekItems(w).every(
        (it, i) => it.no === `${w.week}-${String(i + 1).padStart(2, '0')}`
      )
    )
  );
  check(
    '매주 백업 10분 전(2:50)에 끝남',
    out.every((w) => w.end <= SESSION_MINUTES - WRAP_MINUTES),
    out.map((w) => clockText(w.end)).join(' · ')
  );
  const order = OUTDOOR_STATIONS as readonly string[];
  check(
    '자리 차례 — 무브먼트 → 메디신볼 → 스로잉',
    out.every((w) =>
      w.stations.every(
        (st, i) =>
          i === 0 ||
          order.indexOf(st.station) > order.indexOf(w.stations[i - 1].station)
      )
    )
  );
  check(
    '계획 시각이 앞 것이 끝난 뒤 · 영상 1개 3분 안 · 쉬기 두 번까지',
    out.every((w) => {
      const its = weekItems(w);
      return (
        its.every(
          (it, i) =>
            it.minutes <= 3 &&
            (i === 0 || it.at >= its[i - 1].at + its[i - 1].minutes - 1e-6)
        ) && its.filter((it) => it.breakAfter).length <= 2
      );
    })
  );
  const fam = new Map<string, Set<number>>();
  for (const w of out)
    for (const it of weekItems(w).filter((i) => i.kind === 'drill')) {
      const k = `${it.bucket}|${familyOf(it.title)}`;
      fam.set(k, (fam.get(k) ?? new Set()).add(w.week));
    }
  check(
    '도구만 다른 같은 동작(작은 공 · 큰 공)은 같은 주',
    [...fam.values()].every((ws) => ws.size === 1),
    `묶음 ${fam.size}개`
  );
  const adjacentOk = out.every((w) => {
    const its = weekItems(w).filter((i) => i.kind === 'drill');
    const seen = new Map<string, number>();
    return its.every((it, i) => {
      const k = `${it.bucket}|${familyOf(it.title)}`;
      const last = seen.get(k);
      seen.set(k, i);
      return last === undefined || last === i - 1;
    });
  });
  check('같은 동작 묶음은 이어서 찍는다', adjacentOk);
  const spread = (f: (i: (typeof items)[number]) => boolean) =>
    out.map((w) => weekItems(w).filter(f).length);
  const even = (xs: number[], tol: number) => Math.max(...xs) - Math.min(...xs) <= tol;
  const throws = spread((i) => i.bucket === '스로잉 드릴');
  const balls = spread((i) => i.bucket === '메디신볼 드릴');
  const moves = spread((i) => i.bucket === '무브먼트 패턴 드릴');
  const jumps = spread((i) => i.kind === 'drill' && PLYO.test(i.title));
  check('주마다 스로잉 수 고르게(차이 3 안)', even(throws, 3), throws.join(' · '));
  check('주마다 메디신볼 수 고르게(차이 3 안)', even(balls, 3), balls.join(' · '));
  check('주마다 무브먼트 수 고르게(차이 3 안)', even(moves, 3), moves.join(' · '));
  check('주마다 점프 · 착지 드릴 고르게(차이 2 안)', even(jumps, 2), jumps.join(' · '));
  check(
    '워밍업이 그 주 맨 앞',
    out.every((w) => {
      const its = weekItems(w);
      const n = its.filter((i) => i.kind === 'warmup').length;
      return its.slice(0, n).every((i) => i.kind === 'warmup');
    })
  );
  /* 같은 입력이면 같은 계획(드릴 순서를 뒤섞어도) */
  const drillIn = drills.map((d) => ({
    id: d.exerciseId,
    title: d.title,
    category: d.bucket,
    equipment: d.equipment,
    stage: d.group ?? null,
    oldVideo: d.oldVideo ?? null,
  }));
  /* 실내 바로 다음 주부터, 고정해 둔 주 수로(scripts/shoot-plan-outdoor.mts) */
  const opts = { ...OUTDOOR_DEFAULT, firstWeek: out[0].week, sessions: out.length };
  const a = JSON.stringify(buildOutdoorWeeks(drillIn, [], opts));
  const b = JSON.stringify(buildOutdoorWeeks([...drillIn].reverse(), [], opts));
  check('같은 드릴이면 같은 계획(순서를 뒤섞어도)', a === b);
  check(
    '고정해 둔 야외 주차 = 지금 계산(다시 뽑아도 번호가 그대로)',
    JSON.stringify(out) === a
  );
  check(
    '드릴 영상 분 — 던지기 · 이어지는 동작은 더',
    drillMinutes({
      id: 'x',
      title: 'P1 스트레치 스로우',
      category: '스로잉 드릴',
      equipment: ['야구공'],
      stage: '기초',
    }) === 2.2 &&
      drillMinutes({
        id: 'y',
        title: '드롭스텝 → 스쿱 토스',
        category: '메디신볼 드릴',
        equipment: ['메디신볼'],
        stage: '연결',
      }) === 2.4
  );
}

console.log('\n■ 계획 계산(합성 운동)');
{
  const cats = [
    '하체 스트렝스',
    '상체 스트렝스',
    '모빌리티',
    '파워',
    '코어',
    '암케어',
    '회복 및 보강',
  ];
  const ints = ['매우 낮음', '낮음', '중간', '높음', '매우 높음'];
  const eqs = [
    ['바벨'],
    ['덤벨'],
    ['밴드'],
    ['맨몸'],
    ['케이블'],
    ['덤벨', '벤치'],
    ['메디신볼'],
    ['박스'],
    ['철봉'],
  ];
  const pats = ['스쿼트', '힌지', '런지', '밀기', '당기기', null];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const ex: ShootExercise[] = Array.from({ length: 240 }, (_, i) => ({
    id: `x${i}`,
    title: `운동 ${String(i).padStart(3, '0')}${i % 17 === 0 ? ' 과부하 내리기' : ''}${i % 23 === 0 ? ' 점프' : ''}`,
    category: pick(cats),
    bodyParts: [pick(['고관절', '햄스트링·둔근', '어깨', '등', '손목·전완', '코어'])],
    movementPattern: pick(pats),
    intensity: pick(ints),
    equipment: pick(eqs),
    holdSeconds: i % 11 === 0 ? 30 : null,
    perSide: i % 2 === 0,
  }));
  const a = buildPlan(ex, '2026-10-09');
  const b = buildPlan([...ex].reverse(), '2026-10-09');
  check(
    '같은 운동이면 넣는 순서와 상관없이 같은 계획',
    JSON.stringify(a) === JSON.stringify(b)
  );
  invariants(a, '합성 240개');
  check(
    '시간 계산 — 기본 1.6 · 천천히 내리기 +0.4 · 점프 +0.3 · 바벨 +0.3 · 3분 상한',
    shotMinutes({
      ...ex[1],
      title: '덤벨 컬',
      equipment: ['덤벨'],
      category: '암케어',
    }) === 1.6 &&
      shotMinutes({
        ...ex[1],
        title: '리스트 플렉션 에센트릭 오버로드',
        equipment: ['덤벨'],
        category: '암케어',
      }) === 2 &&
      shotMinutes({
        ...ex[1],
        title: '바벨 점프 스쿼트 + 회전',
        equipment: ['바벨'],
        category: '파워',
      }) === 2.6 &&
      shotMinutes({
        ...ex[1],
        title: '노르딕 점프 + 회전 시리즈',
        equipment: ['바벨'],
        category: '유산소',
      }) === 3
  );
  check(
    '자리 — 맨몸 점프는 넓은 바닥, 바벨은 랙, 덤벨+벤치는 벤치, 밴드+철봉은 철봉',
    stationOf({
      ...ex[0],
      category: '파워',
      title: '버티컬 점프',
      equipment: ['맨몸'],
    }) === '넓은 바닥(이동)' &&
      stationOf({
        ...ex[0],
        category: '하체 스트렝스',
        title: '바벨 RDL',
        equipment: ['바벨'],
      }) === '랙 · 바벨 · 원판' &&
      stationOf({
        ...ex[0],
        category: '상체 스트렝스',
        title: '헥스 프레스',
        equipment: ['덤벨', '벤치'],
      }) === '벤치' &&
      stationOf({
        ...ex[0],
        category: '상체 스트렝스',
        title: '밴드 보조 풀업',
        equipment: ['철봉', '밴드'],
      }) === '철봉 · TRX'
  );
  check(
    '부위 — 메디신볼 파워는 코어, 스쿼트는 하체 앞, RDL 은 하체 뒤, 손목 암케어는 전완',
    bucketOf({
      ...ex[0],
      category: '파워',
      title: '메디신볼 슬램',
      movementPattern: '회전',
    }) === '코어' &&
      bucketOf({ ...ex[0], category: '하체 스트렝스', movementPattern: '스쿼트' }) ===
        '하체 앞(무릎)' &&
      bucketOf({ ...ex[0], category: '하체 스트렝스', movementPattern: '힌지' }) ===
        '하체 뒤(힌지)' &&
      bucketOf({
        ...ex[0],
        category: '암케어',
        bodyParts: ['손목·전완'],
        title: '튜빙 리스트 플렉션',
      }) === '전완 · 팔꿈치'
  );
  check(
    '부하 — 높음 2 · 천천히 내리기 ×1.5',
    loadOf({ ...ex[0], title: 'x', intensity: '높음' }) === 2 &&
      loadOf({
        ...ex[0],
        title: '리스트 플렉션 에센트릭 오버로드',
        intensity: '높음',
      }) === 3
  );
  check(
    '시범 방법 — 천천히 내리기 1~2회 · 버티기 10초 · 좌우는 한쪽',
    demoCue(
      {
        ...ex[0],
        title: '노르딕 햄스트링 컬',
        holdSeconds: null,
        perSide: false,
        category: '하체 스트렝스',
      },
      '하체 뒤(힌지)'
    ) === '1~2회 천천히 내리기' &&
      demoCue(
        {
          ...ex[0],
          title: '월 싯',
          holdSeconds: 30,
          perSide: false,
          category: '하체 스트렝스',
        },
        '하체 앞(무릎)'
      ) === '10초 버티기' &&
      demoCue(
        {
          ...ex[0],
          title: '고블렛 리버스 런지',
          holdSeconds: null,
          perSide: true,
          category: '하체 스트렝스',
        },
        '하체 앞(무릎)'
      ) === '3회 · 한쪽'
  );
}

console.log('\n■ 진행(지금 · 다음 · 미룬 것)');
{
  const w = plan.weeks[0];
  const items = weekItems(w);
  const at = (min: number) => new Date(Date.UTC(2026, 9, 10, 0, min)).toISOString();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const mk = (pairs: [number, ShootCheckView['status'], number][]) =>
    new Map(
      pairs.map(([i, status, min]) => [
        items[i].exerciseId,
        {
          exerciseId: items[i].exerciseId,
          status,
          at: at(min),
          by: '금윤호',
          note: null,
        },
      ])
    );
  const none = new Map<string, ShootCheckView>();
  const c0 = cursorOf(w, none);
  check(
    '아무것도 안 찍었으면 지금 = 1번, 다음 = 2번',
    c0.current === items[0] && c0.next === items[1]
  );
  const c1 = cursorOf(
    w,
    mk([
      [0, 'done', 0],
      [1, 'later', 2],
    ])
  );
  check(
    '찍은 것 · 미룬 것은 건너뛴다 — 지금 = 3번',
    c1.current === items[2] && c1.next === items[3]
  );
  const c2 = cursorOf(w, mk([[0, 'redo', 0]]));
  check('다시 찍기는 안 찍은 것 — 지금 = 1번', c2.current === items[0]);
  const all = new Map(
    items.map((it) => [
      it.exerciseId,
      {
        exerciseId: it.exerciseId,
        status: 'done' as const,
        at: at(0),
        by: null,
        note: null,
      },
    ])
  );
  const c3 = cursorOf(w, all);
  check('다 찍었으면 지금 · 다음 없음', c3.current === null && c3.next === null);
  const lp = cursorOfList(
    items,
    mk([
      [0, 'done', 0],
      [1, 'later', 2],
    ]),
    items[1].exerciseId
  );
  check(
    '먼저 찍기로 고른 미룬 운동이 지금, 다음은 첫 안 찍은 것',
    lp.current === items[1] && lp.next === items[2]
  );
  const lq = cursorOfList(items, mk([[0, 'done', 0]]), items[0].exerciseId);
  check('이미 찍은 것을 고르면 무시하고 순서대로', lq.current === items[1]);
  const count = countOf(
    items,
    mk([
      [0, 'done', 0],
      [1, 'later', 2],
      [2, 'redo', 4],
    ])
  );
  check(
    '세기 — 찍음 1 · 미룸 1 · 다시 1 · 대기 나머지',
    count.done === 1 &&
      count.later === 1 &&
      count.redo === 1 &&
      count.todo === items.length - 3
  );
  check('비율 — 찍은 것만 센다', Math.abs(doneShare(count) - 1 / items.length) < 1e-9);
  const lastOfStation = w.stations[0].items[w.stations[0].items.length - 1];
  const firstOfNext = w.stations[1].items[0];
  const tr = transitionAfter(w, lastOfStation, firstOfNext);
  check(
    '자리 끝 운동 다음은 자리 옮김을 알린다',
    tr.move?.from === w.stations[0].station && tr.move?.to === w.stations[1].station
  );
  const brk = items.find((it) => it.breakAfter)!;
  check(
    '쉬기 뒤 운동이면 쉬기를 알린다',
    transitionAfter(w, brk, items[items.indexOf(brk) + 1]).rest === true
  );
  const carried = carriedOver(
    plan,
    2,
    mk([
      [0, 'done', 0],
      [1, 'later', 2],
    ])
  );
  check(
    '2주차에는 1주차에서 못 찍은 것이 이어진다',
    carried.length === items.length - 1 && !carried.includes(items[0])
  );
  check(
    '체크가 없는 앞 주는 넘어오지 않는다',
    carriedOver(plan, 2, mk([])).length === 0
  );
  {
    const fixed = JSON.parse(
      readFileSync(new URL('../lib/shoot/plan-data.json', import.meta.url), 'utf8')
    ) as ShootPlan;
    const w1 = weekItems(fixed.weeks[0]);
    const one = new Map<string, ShootCheckView>([
      [
        w1[0].exerciseId,
        {
          exerciseId: w1[0].exerciseId,
          status: 'done',
          at: '2026-10-10T01:00:00.000Z',
          by: null,
          note: null,
        },
      ],
    ]);
    const firstOut = fixed.weeks.find((w) => w.outdoor)!.week;
    const outN = carriedOver(fixed, firstOut, one).length;
    const in2 = carriedOver(fixed, 2, one).length;
    check(
      '야외 주차에는 실내에서 남은 것이 넘어오지 않는다(실내끼리만)',
      outN === 0 && in2 === w1.length - 1,
      `${firstOut}주차 ${outN} · 2주차 ${in2}`
    );
  }
  /* 계획 대비: 1번(계획 15분, 1.6분)을 0분에 끝냄 → 지금 2번(계획 16.6분)인데 실제 10분 지남 → 계획은 0분 뒤라 10분 늦음 */
  const now = new Date(Date.UTC(2026, 9, 10, 0, 10));
  const pace = paceMinutes(w, mk([[0, 'done', 0]]), items[1], now, day);
  const plannedGap = items[1].at - (items[0].at + items[0].minutes);
  check(
    '계획 대비 — 오늘 첫 체크를 기준으로 늦은 분',
    pace === Math.round(10 - plannedGap),
    `${pace}분`
  );
  check(
    '오늘 찍은 것이 없으면 계획 대비는 없다',
    paceMinutes(w, none, items[0], now, day) === null
  );
  const ss = sessionsOf(
    [
      { exerciseId: 'a', status: 'done', at: at(0), by: null, note: null },
      { exerciseId: 'b', status: 'done', at: at(4), by: null, note: null },
      { exerciseId: 'c', status: 'done', at: at(8), by: null, note: null },
      { exerciseId: 'd', status: 'later', at: at(9), by: null, note: null },
    ],
    day
  );
  check(
    '날별 — 3개를 8분에 · 영상 1개 4분',
    ss.length === 1 &&
      ss[0].count === 3 &&
      ss[0].spanMinutes === 8 &&
      ss[0].perVideo === 4
  );
  const g = groupCounts(items, mk([[0, 'done', 0]]), (it) => it.station);
  check(
    '자리별 세기 — 합이 그 주 전체',
    g.reduce((a, x) => a + x.count.total, 0) === items.length
  );
  check(
    '시각 글자 — 59.6분은 1:00, 149분은 2:29',
    clockText(59.6) === '1:00' && clockText(149) === '2:29'
  );
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);

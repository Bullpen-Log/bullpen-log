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
  STATIONS,
  WRAP_MINUTES,
  buildPlan,
  bucketOf,
  demoCue,
  loadOf,
  shotMinutes,
  stationOf,
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
        STATIONS.indexOf(s.station) > STATIONS.indexOf(w.stations[i - 1].station)
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
  const powerFirst = p.weeks.every((w) =>
    w.stations.every((s) => {
      if (s.station === '넓은 바닥(이동)') return true;
      const idx = s.items
        .map((it, i) => (it.bucket === '하체 파워' ? i : -1))
        .filter((i) => i >= 0);
      return idx.every((v, k) => v === k);
    })
  );
  check(`${label} — 파워는 그 자리 맨 앞(싱싱할 때)`, powerFirst);
  const runOk = p.weeks.every((w) =>
    w.stations.every((s) => {
      let run = 0;
      for (let i = 0; i < s.items.length; i++) {
        const it = s.items[i];
        if (i > 0 && s.items[i - 1].bucket === it.bucket) {
          run++;
        } else {
          run = 1;
        }
        if (
          it.bucket !== '모빌리티' &&
          it.bucket !== '하체 파워' &&
          s.station !== '넓은 바닥(이동)'
        ) {
          /* 다른 부위가 남아 있지 않을 때는 이어질 수 있다 — 그때만 넘침을 봐준다 */
          const othersLeft = s.items.slice(i + 1).some((x) => x.bucket !== it.bucket);
          if (run > 3 && othersLeft) return false;
        }
      }
      return true;
    })
  );
  check(
    `${label} — 한 자리에서 같은 부위는 3개까지 잇고 다른 부위로(남은 게 그 부위뿐일 때만 예외)`,
    runOk
  );
  void BREAK_EVERY;
}

console.log('\n■ 고정 계획(lib/shoot/plan-data.json)');
{
  const items = plan.weeks.flatMap(weekItems);
  check(
    '5주 · 312개',
    plan.weeks.length === 5 && items.length === 312,
    `${plan.weeks.length}주 · ${items.length}개`
  );
  invariants(plan, '고정 계획');
  const lower = plan.weeks.map((w) =>
    LOWER_BUCKETS.reduce((a, b) => a + (w.load[b] ?? 0), 0)
  );
  check(
    '하체 부하는 회마다 고르게(최대 − 최소 ≤ 8점)',
    Math.max(...lower) - Math.min(...lower) <= 8,
    lower.map((x) => x.toFixed(1)).join(' · ')
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
        title: '전완 굴곡 과부하 내리기',
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
        title: '튜빙 전완 굴곡',
      }) === '전완 · 팔꿈치'
  );
  check(
    '부하 — 높음 2 · 천천히 내리기 ×1.5',
    loadOf({ ...ex[0], title: 'x', intensity: '높음' }) === 2 &&
      loadOf({ ...ex[0], title: '전완 굴곡 과부하 내리기', intensity: '높음' }) === 3
  );
  check(
    '시범 방법 — 천천히 내리기 1~2회 · 버티기 10초 · 좌우는 한쪽',
    demoCue(
      {
        ...ex[0],
        title: '노르딕 햄스트링',
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
  check('체크가 없는 앞 주는 넘어오지 않는다', carriedOver(plan, 2, mk([])).length === 0);
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

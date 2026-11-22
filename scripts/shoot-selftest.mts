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
  buildPlan,
  bucketOf,
  demoCue,
  loadOf,
  postureOf,
  setupOf,
  isWarmupItem,
  shotMinutes,
  stationOf,
  weekLabel,
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
  openAfter,
  groupCounts,
  paceMinutes,
  sessionsOf,
  transitionAfter,
  weekItems,
  type ShootCheckView,
} from '../lib/shoot/progress.ts';
import {
  OUTDOOR_DEFAULT,
  buildOutdoorWeeks,
  drillMinutes,
  familyOf,
} from '../lib/shoot/outdoor.ts';
import { SHOOT_WARMUPS, warmupRowId } from '../lib/shoot/warmups.ts';
import { CREW_SPACES, crewWeek, crewsOf } from '../lib/shoot/crews.ts';

import { guideStart, readShootNote, shootRetakeHref, shootRunHref } from '../lib/shoot/guide.ts';
import { SHOOT_PLAN, itemOf, linkedDrillCategory, weekOf } from '../lib/shoot/plan.ts';

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

/*
 * 두 사람이 나눠 찍는 주(version 4 의 5주차, lib/shoot/crews.ts)는 사람마다 따로 본다 — 시계 · 쉬기 · 자리 차례가 사람마다다.
 * 부하 고르기(무거운 하체 상한 · 한 자리 같은 쪽 2개)는 그 주에 묻지 않는다 — 2026-10-18 사용자가 '공간 + 장비'를 먼저로 정했다
 * (시범은 2~3회라 넘어도 짧다).
 */
const perCrew = (w: PlanWeek): PlanWeek[] => {
  const cs = crewsOf(w);
  return cs.length ? cs.map((c) => crewWeek(w, c)) : [w];
};
const CREW_ORDER: readonly string[] = CREW_SPACES.flatMap((s) => s.stations);

function invariants(p: ShootPlan, label: string) {
  const items = p.weeks.flatMap(weekItems);
  const ids = items.map((i) => i.exerciseId);
  check(
    `${label} — 운동마다 한 번씩만`,
    new Set(ids).size === ids.length,
    `${ids.length}개`
  );
  /* 촬영이 시작된 뒤 운동을 빼면 그 번호만 비운다 — 이미 찍은 영상의 번호판과 어긋나지 않게(2026-10-10 1-05 뺌) */
  const nosOk = p.weeks.every((w) => {
    const seq = weekItems(w).map((it) => {
      /* 5주차는 111개라 세 자리(5-100 …)까지 */
      const m = /^(\d+)-(\d{2,3})$/.exec(it.no);
      return m && Number(m[1]) === w.week ? Number(m[2]) : NaN;
    });
    return seq.every((n, i) => n >= 1 && (i === 0 || n > seq[i - 1]));
  });
  check(`${label} — 번호는 주차-순번(1-01 …)으로 차례대로(뺀 운동 자리는 빈다)`, nosOk);
  const clockOk = p.weeks.flatMap(perCrew).every((w) => {
    const its = weekItems(w);
    return its.every(
      (it, i) => i === 0 || it.at >= its[i - 1].at + its[i - 1].minutes - 1e-6
    );
  });
  check(`${label} — 계획 시각이 앞 운동이 끝난 뒤`, clockOk);
  /*
   * 2026-10-14 사용자: "한 세션에 3시간 정도로" — 실내 4회를 꽉 채워 2:49~2:56 에 끝난다. 촬영은 3시간쯤, 정리(WRAP)는 조금 넘을 수 있다.
   * 2026-10-15 파워 운동 넷을 더해 3주차가 3:02 — 3시간 안에 드는 나눔은 한 주에 하체가 36.5 로 몰려(다른 주 26~30), 5분까지 둔다.
   */
  const endOk = p.weeks.every((w) => w.end <= SESSION_MINUTES + 5);
  check(
    `${label} — 매주 3시간쯤(5분 안 넘김)에 촬영이 끝남`,
    endOk,
    p.weeks.map((w) => clockText(w.end)).join(' · ')
  );
  check(
    `${label} — 영상 1개 3분 안`,
    items.every((it) => it.minutes <= 3)
  );
  const breaksOk = p.weeks
    .flatMap(perCrew)
    .every((w) => weekItems(w).filter((it) => it.breakAfter).length <= 2);
  check(`${label} — 쉬기는 한 회(두 사람이면 사람마다) 두 번까지`, breaksOk);
  /* 회 처음의 몸풀기 칸(warmup)은 자리 차례 밖 — 그 뒤 자리들이 한 번씩, 정한 순서대로 */
  /* 11/22 처럼 날을 정해 손으로 짠 회(session)는 그 자리 차례가 동선이다(2026-11-21 김민 승인) — 차례 검사 밖 */
  const stationOrderOk = p.weeks.filter((w) => !w.session).flatMap(perCrew).every((w) => {
    const sts = w.stations.filter((s) => !s.warmup);
    const order: readonly string[] = sts.some((s) => s.crew) ? CREW_ORDER : ALL_STATIONS;
    return sts.every(
      (s, i) => i === 0 || order.indexOf(s.station) > order.indexOf(sts[i - 1].station)
    );
  });
  check(`${label} — 자리는 한 회에 한 번씩, 정한 순서대로(몸풀기 칸 빼고)`, stationOrderOk);
  const warmOk = p.weeks.every((w) =>
    w.stations.every((s, i) => !s.warmup || (i === 0 && s.items.every((it) => isWarmupItem(it))))
  );
  check(`${label} — 몸풀기 칸은 회 맨 앞, 가벼운 모빌리티 · 스트레칭만`, warmOk);
  const heavy = (w: PlanWeek) =>
    weekItems(w).filter((it) => LOWER_BUCKETS.includes(it.bucket) && it.load >= 2);
  /* 이미 찍은 1~4주차(version 4 에서 찍은 것만 남김)는 찍은 대로 — 상한은 앞으로 한 사람이 찍을 주에만 */
  const solo = p.weeks.filter((w) => crewsOf(w).length === 0 && (p.version < 4 || w.week > 4));
  const heavyTotal = solo.reduce((a, w) => a + heavy(w).length, 0);
  const cap = Math.ceil(heavyTotal / Math.max(1, solo.length)) + 1;
  check(
    `${label} — 무거운 하체 회당 ${cap}개까지(한 사람이 찍는 주)`,
    solo.every((w) => heavy(w).length <= cap),
    solo.map((w) => heavy(w).length).join(' · ')
  );
  const sideOk = solo.every((w) =>
    w.stations.every((s) => {
      const m = new Map<string, number>();
      for (const it of s.items)
        if (LOWER_BUCKETS.includes(it.bucket) && it.load >= 2)
          m.set(it.bucket, (m.get(it.bucket) ?? 0) + 1);
      return [...m.values()].every((n) => n <= 2);
    })
  );
  check(`${label} — 한 자리에서 같은 쪽 무거운 하체 2개까지`, sideOk);
  /* 한 자리를 준비물(랜드마인 · 바벨 …)끼리, 그 안을 같은 자세끼리 끊은 토막 — 자리 안 규칙(파워 먼저 · 같은 부위 3개)은 토막마다 */
  const cut = (items: PlanItem[], key: (it: PlanItem) => string) =>
    items.reduce<PlanItem[][]>((acc, it, i) => {
      if (i > 0 && key(items[i - 1]) === key(it)) acc[acc.length - 1].push(it);
      else acc.push([it]);
      return acc;
    }, []);
  const setups = (items: PlanItem[]) => cut(items, setupOf);
  const runs = (items: PlanItem[]) => setups(items).flatMap((g) => cut(g, (it) => postureOf(it.title)));
  const indoorStations = p.weeks.flatMap((w) =>
    w.stations.filter((s) => s.station !== '넓은 바닥(이동)' && !s.warmup)
  );
  check(
    `${label} — 자세는 한 준비물 안에서 한 번씩만 바뀐다(같은 자세끼리 붙임)`,
    indoorStations.every((s) =>
      setups(s.items).every((g) => {
        const ps = cut(g, (it) => postureOf(it.title)).map((r) => postureOf(r[0].title));
        return new Set(ps).size === ps.length;
      })
    )
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
  /* 2주차부터(새 규칙으로 뽑은 주) — 한 자리에서 같은 준비물은 한 번에(랜드마인을 두 번 세우지 않게) */
  check(
    `${label} — 같은 준비물은 한 자리에서 한 번에 이어 찍는다(2주차부터)`,
    p.weeks
      .filter((w) => w.week > 1 && !w.outdoor)
      .every((w) =>
        w.stations.every((s) => {
          const ks = setups(s.items).map((g) => setupOf(g[0]));
          return new Set(ks).size === ks.length;
        })
      )
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

/*
 * version 13(2026-11-22 김민): 11/22 촬영 뒤 다시 짰다 — "1주차, 2주차가 아니라 야외 · 실내 둘로. 비슷한 장비 · 위치 · 동작끼리 묶고,
 * 밴드 · 워터볼 · 워터백은 실내, 공 · 메디신볼을 던지는 것만 야외". 찍은 것은 '촬영 완료'(다시 찍기는 거기서), 미룬 것은 미룬 영상 그대로.
 */
console.log('\n■ 고정 계획(lib/shoot/plan-data.json) — 야외 · 실내 · 미룬 영상 · 촬영 완료(version 13)');
{
  const [out, ind, def, done] = plan.weeks;
  check('주 넷 — 1 야외 · 2 실내 · 3 미룬 영상 · 4 촬영 완료',
    plan.weeks.length === 4 &&
      out.week === 1 && out.outdoor === true && weekLabel(out) === '야외' &&
      ind.week === 2 && !ind.outdoor && weekLabel(ind) === '실내' &&
      def.week === 3 && def.deferred === true && weekLabel(def) === '미룬 영상' &&
      done.week === 4 && weekLabel(done) === '촬영 완료',
    plan.weeks.map((w) => `${w.week} ${weekLabel(w)}`).join(' · '));
  const n = (w: PlanWeek) => weekItems(w).length;
  check('11/22 뒤 — 야외 77 · 실내 83 · 미룬 27 · 촬영 완료 43',
    n(out) === 77 && n(ind) === 83 && n(def) === 27 && n(done) === 43,
    plan.weeks.map(n).join(' · '));
  const all = plan.weeks.flatMap(weekItems).map((i) => i.exerciseId);
  check('네 주를 통틀어 운동마다 한 번씩만', new Set(all).size === all.length && all.length === 230, `${all.length}개`);
  const THROW = ['야구공', '플라이오볼', '메디신볼'];
  const throws = (it: PlanItem) => it.equipment.some((e) => THROW.includes(e));
  check('야외는 공 · 메디신볼을 던지는 것만', weekItems(out).every(throws),
    weekItems(out).filter((it) => !throws(it)).map((it) => it.title).join(', '));
  check('실내에는 던지는 것이 없다(밴드 · 워터볼 · 워터백 · 막대는 실내)',
    !weekItems(ind).some(throws) &&
      weekItems(ind).some((it) => it.equipment.includes('밴드')) &&
      weekItems(ind).some((it) => it.equipment.includes('워터백')) &&
      weekItems(ind).some((it) => it.equipment.includes('워터볼')),
    weekItems(ind).filter(throws).map((it) => it.title).join(', '));
  const nosOk = plan.weeks.every((w) =>
    weekItems(w).every((it, i) => it.no === `${w.week}-${String(i + 1).padStart(2, '0')}`));
  check('번호는 주-순번(1-01 …) 빈자리 없이 차례대로', nosOk);
  check('계획 시각이 앞 것이 끝난 뒤', plan.weeks.every((w) => {
    const its = weekItems(w);
    return its.every((it, i) => i === 0 || it.at >= its[i - 1].at + its[i - 1].minutes - 1e-6);
  }));
  check('자리는 한 주에 한 번씩(같은 자리끼리 모음)', plan.weeks.every((w) => {
    const sts = w.stations.map((s) => s.station);
    return new Set(sts).size === sts.length;
  }));
  check('야외 자리 차례 — 메디신볼 벽 → 투구 그물(팔은 몸이 다 풀린 뒤)',
    out.stations.map((s) => s.station).join() === '메디신볼 벽,투구 그물');
  check('실내 자리 차례 — 넓은 바닥(몸풀기 · 막대 · 바이퍼) → 매트 → 공 · 워터백 → 밴드 → 덤벨 → 박스 → 철봉 → 랙 → 케이블 → 머신',
    ind.stations.map((s) => s.station).join() ===
      '넓은 바닥(이동),매트,공 · 워터백(벽 앞),밴드(고정 기둥),덤벨 · 케틀벨,박스,철봉 · TRX,랙 · 바벨 · 원판,케이블,머신');
  /* 한 자리 안에서 같은 장비(조합)는 한 번에 이어서 — 장비를 두 번 꺼내지 않게 */
  const eqKey = (it: PlanItem) => [...it.equipment].sort().join('+');
  const grouped = [out, ind].every((w) => w.stations.every((s) => {
    const ks = s.items.map(eqKey);
    return ks.every((k, i) => i === 0 || k === ks[i - 1] || !ks.slice(0, i - 1).includes(k));
  }));
  check('야외 · 실내 — 한 자리 안에서 같은 장비는 이어서', grouped);
  const famOk = [out, ind].every((w) => {
    const its = weekItems(w).filter((i) => i.kind === 'drill');
    const seen = new Map<string, number>();
    return its.every((it, i) => {
      const k = `${it.bucket}|${familyOf(it.title)}`;
      const last = seen.get(k);
      seen.set(k, i);
      return last === undefined || last === i - 1;
    });
  });
  check('같은 동작 묶음(작은 공 · 큰 공 …)은 이어서 찍는다', famOk);
  check('실내 맨 앞은 몸풀기(이름만 있는 워밍업 아홉)',
    weekItems(ind).slice(0, 9).every((it) => it.bucket === '모빌리티' && it.equipment.join() === '맨몸'));
  check('미룬 영상 · 촬영 완료는 야외 아님', !def.outdoor && !done.outdoor);
  const wallThrow = itemOf('45452ae0-a2f5-4bc6-a5c7-d01761fc5f56');
  check('플라이오볼 벽 던지기 — 야외 메디신볼 벽 끝(벽 자리 그대로)',
    wallThrow?.week === 1 && wallThrow.item.station === '메디신볼 벽' &&
      out.stations[0].items.at(-1)?.exerciseId === wallThrow.item.exerciseId);
  /* 연결 드릴은 계획에 직접 든다 — 연결 자리(linked-drills.json)로 따로 붙는 주(예전 5주차)가 생기지 않는다 */
  check('연결 드릴을 품은 계획 — 따로 붙는 주 없음', SHOOT_PLAN.weeks.length === 4 &&
    SHOOT_PLAN.weeks.every((w) => weekItems(w).length === weekItems(plan.weeks.find((x) => x.week === w.week)!).length));
  /* 번호판 번호가 영상 파일 이름을 대신한다 — 한 주에 같은 번호가 둘이면 다른 카메라로 찍은 영상을 맞출 수 없고 ?at= · #번호가 엉뚱한 운동을 연다
     (2026-11-21 연결 드릴 4-13~4-24 가 트레이닝 번호와 겹쳤다) — 연결 드릴을 합친 실제 주로 본다 */
  const dupNos = SHOOT_PLAN.weeks.flatMap((w) => {
    const nos = weekItems(weekOf(w.week)!).map((it) => it.no);
    return nos.filter((no, i) => nos.indexOf(no) !== i);
  });
  check('모든 주 — 번호판 번호가 겹치지 않는다(연결 드릴 포함)', dupNos.length === 0, dupNos.join(' '));
  /* 연결 드릴은 영상을 올리면 '나중에 촬영'에서 진짜 분류로 — 지금은 11/22 목록 것만(2026-11-21 김민: "우선 내일 목록에 있는거만") */
  {
    const linked = JSON.parse(readFileSync(new URL('../lib/shoot/linked-drills.json', import.meta.url), 'utf8')) as
      { id: string; title: string; indoor?: { week: number } }[];
    const drillCats = new Set(['스로잉 드릴', '메디신볼 드릴', '무브먼트 패턴 드릴', '근력 · 안정 드릴']);
    const nov22 = linked.filter((d) => d.indoor?.week === 4);
    const bad = nov22.filter((d) => !drillCats.has(linkedDrillCategory(d.id) ?? ''));
    check('11/22 연결 드릴 — 영상을 올리면 옮길 분류가 다 있다', nov22.length === 18 && bad.length === 0, bad.map((d) => d.title).join(', '));
    check('11/22 연결 드릴 분류 — PVC · Hip Fire 는 무브먼트, 워터백은 근력 · 안정',
      nov22.filter((d) => /PVC|Hip Fire/.test(d.title)).every((d) => linkedDrillCategory(d.id) === '무브먼트 패턴 드릴') &&
      nov22.filter((d) => /워터백/.test(d.title)).every((d) => linkedDrillCategory(d.id) === '근력 · 안정 드릴'));
    check('11/22 밖의 연결 드릴 · 연결 드릴이 아닌 것은 분류를 안 바꾼다',
      linked.filter((d) => d.indoor?.week !== 4).every((d) => linkedDrillCategory(d.id) === undefined) &&
      linkedDrillCategory('00000000-0000-0000-0000-000000000000') === undefined);
  }
  const rowIds = SHOOT_WARMUPS.map((w) => warmupRowId(w.id));
  check(
    '워밍업마다 라이브러리 운동 id(uuid)가 따로 정해져 있다',
    rowIds.every(
      (r) =>
        !!r &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r)
    ) && new Set(rowIds).size === rowIds.length
  );
  /* 야외 계획 계산(scripts/shoot-plan-outdoor.mts)은 그대로 — 같은 드릴이면 같은 계획(순서를 뒤섞어도) */
  const drillIn = weekItems(out).filter((d) => d.kind === 'drill').map((d) => ({
    id: d.exerciseId,
    title: d.title,
    category: d.bucket,
    equipment: d.equipment,
    stage: d.group ?? null,
    oldVideo: d.oldVideo ?? null,
  }));
  const opts = { ...OUTDOOR_DEFAULT, firstWeek: 1, sessions: 1 };
  const a = JSON.stringify(buildOutdoorWeeks(drillIn, [], opts));
  const b = JSON.stringify(buildOutdoorWeeks([...drillIn].reverse(), [], opts));
  check('같은 드릴이면 같은 야외 계산(순서를 뒤섞어도)', a === b);
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
  void LOWER_BUCKETS;
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
  const w = plan.weeks.find((week) => week.week === 1)!;
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
  /* 중간부터 — 5번째를 골라 찍으면 다음은 6번째(처음의 안 찍은 것이 아니라), 뒤가 다 찍혔으면 앞에서(2026-10-18) */
  const mid = cursorOfList(items, mk([]), items[4].exerciseId);
  const afterMid = openAfter(items, mk([[4, 'done', 0]]), items[4].exerciseId);
  const tailDone = mk(items.slice(5).map((_, k) => [5 + k, 'done', 0] as [number, 'done', number]));
  check(
    '중간부터 찍기 — 다음은 고른 운동 바로 뒤, 찍은 뒤 이어 갈 차례도 그 뒤부터, 뒤가 다 찍혔으면 앞에서',
    mid.current === items[4] &&
      mid.next === items[5] &&
      afterMid[0] === items[5] &&
      openAfter(items, tailDone, items[4].exerciseId)[0] === items[0]
  );
  const lq = cursorOfList(items, mk([[0, 'done', 0]]), items[0].exerciseId);
  check('이미 찍은 것을 고르면 무시하고 순서대로', lq.current === items[1]);
  /* 중간(5번째)을 찍던 중 다른 폰이 그것을 찍음 — 목록 처음(1번째, 건너뛴 것)이 아니라 그 바로 뒤(6번째)로 */
  const remote = cursorOfList(items, mk([[4, 'done', 0]]), items[4].exerciseId);
  check('고른 운동을 다른 폰이 찍으면 그 바로 다음으로(처음으로 튀지 않음)', remote.current === items[5]);
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
  /* 넘어오기는 같은 쪽(실내 · 야외) 다음 주로 — 고정 계획은 주마다 쪽이 달라, 1주차와 같은 쪽 빈 2주차를 붙인 시험 계획으로 본다 */
  const carryPlan: ShootPlan = { ...plan, weeks: [w, { ...w, week: 2, stations: [] }, ...plan.weeks.filter((x) => x.deferred)] };
  const carried = carriedOver(
    carryPlan,
    2,
    mk([
      [0, 'done', 0],
      [1, 'later', 2],
    ])
  );
  /* version 4 — 미룬 것은 미룬 영상 칸으로 모이고 다음 주로는 안 넘어간다(2026-10-18) */
  const deferredNo = plan.weeks.find((x) => x.deferred)?.week ?? -1;
  check(
    '2주차에는 1주차에서 못 찍은 것(미룸 빼고)이 이어지고, 미룬 것은 미룬 영상 칸 끝에 붙는다',
    carried.length === items.length - 2 &&
      !carried.includes(items[0]) &&
      !carried.includes(items[1]) &&
      carriedOver(carryPlan, deferredNo, mk([[1, 'later', 2]])).includes(items[1])
  );
  check(
    '체크가 없는 앞 주는 넘어오지 않는다',
    carriedOver(carryPlan, 2, mk([])).length === 0
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
      '쪽이 다른 주로는 넘어오지 않는다(야외 1주차의 남은 것이 실내 2주차로 안 옴)',
      outN === 0 && in2 === 0,
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

/* 지도 · 다시 찍기 주소는 아무 주로 본다 — 11/22 날짜를 정한 회는 끝나 실내 목록으로(version 13) */
const scheduled = plan.weeks.find((week) => week.week === 2)!;
const guidePlan = weekItems(scheduled);
const firstGuideItem = guidePlan[0];
const secondGuideItem = guidePlan[1];
const guidedChecks = new Map<string, ShootCheckView>([[firstGuideItem.exerciseId, {
  exerciseId: firstGuideItem.exerciseId, status: 'done', at: '2026-11-21T00:00:00.000Z', by: null, note: null,
}]]);
check('지도 첫 진입은 현재 촬영 차례', guideStart(guidePlan, guidedChecks, null, false) === 1);
check('촬영 완료 운동도 명시적으로 지도 가능', guideStart(guidePlan, guidedChecks, firstGuideItem.no, false) === 0);
check('다른 주 번호는 첫 미완료 운동으로', guideStart(guidePlan, guidedChecks, '99-01', false) === 1);
check('지도 URL은 조·시작 번호 보존', shootRunHref(scheduled.week, 'A', secondGuideItem.no, 'guide') === `/admin/shoot/${scheduled.week}/run?crew=A&at=${secondGuideItem.no}&mode=guide`);
check('촬영 URL은 기존 기본 경로 유지', shootRunHref(scheduled.week) === `/admin/shoot/${scheduled.week}/run`);
const retakeUrl = new URL(shootRetakeHref(scheduled.week, 'A', firstGuideItem, secondGuideItem.no), 'https://fixture.invalid');
check('다시 찍기 URL은 대상 ID·번호와 돌아갈 운동을 따로 보존', retakeUrl.searchParams.get('retake') === '1' &&
  retakeUrl.searchParams.get('exercise') === firstGuideItem.exerciseId &&
  retakeUrl.searchParams.get('at') === firstGuideItem.no &&
  retakeUrl.searchParams.get('resume') === secondGuideItem.no && retakeUrl.searchParams.get('crew') === 'A');
const directRetake = new URL(shootRetakeHref(scheduled.week, null, firstGuideItem), 'https://fixture.invalid');
check('주차에서 바로 다시 찍기는 돌아갈 운동을 미리 지정하지 않음', !directRetake.searchParams.has('resume'));
const reason = readShootNote('later', '  촬영장 소음  ');
check('미룸 사유 양끝 공백 제거', reason.ok && reason.note === '촬영장 소음');
check('미룸 사유 공백·201자·잘못된 자료형 거부', !readShootNote('later', '  ').ok && !readShootNote('later', '가'.repeat(201)).ok && !readShootNote('later', 12).ok);
check('미룸 사유 200자와 이전 미룸 호환', readShootNote('later', '가'.repeat(200)).ok && readShootNote('later', undefined).ok && readShootNote('later', null).ok);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);

/**
 * 트레이닝 영상 촬영 계획 — 참고 영상(유튜브)으로 대신하고 있는 운동을 주 1회 3시간 촬영에 나눈다(순수 계산, DB 없음).
 *
 * 2026-10-09 사용자: "일주일에 한 번 · 하루 3시간 · 영상 하나 3분 안 · 모델이 시범 · 같은 기구 · 비슷한 운동은 이어 찍되
 * 한 부위가 근육통으로 무너지지 않게". 계산은 scripts/shoot-plan.mts 가 DB 를 읽어 한 번 돌리고, 결과를
 * lib/shoot/plan-data.json 에 고정한다 — 운동이 새로 들어와도 찍던 계획이 뒤섞이지 않게.
 *
 * ■ 세 가지를 동시에 맞춘다
 *
 *   시간    영상 1개 1.6분(구도 0.3 + 시범 0.6 + 다시 찍기 여유 0.4 + 확인 0.3)에 운동 모양만큼 더한다.
 *           자리를 옮기면 3분, 같은 자리에서 기구만 바꾸면 1분. 3시간 = 준비 15 + 촬영 + 50분마다 쉬기 5 + 백업 10.
 *   기구    같은 자리(덤벨 · 밴드 · 매트 …)를 한 회에 한 번만 들르게 묶는다(새 자리 벌점).
 *   부하    부위마다 부하 점수(강도 + 천천히 내리기 ×1.5)를 회마다 고르게. 무거운 하체는 회당 · 자리당 상한을 둔다.
 *           한 자리 안에서는 같은 부위를 2~3개(4점)까지만 잇고 다른 부위로 — 파워는 그 자리 맨 앞, 천천히 내리기는 맨 끝.
 */

export type ShootExercise = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  movementPattern: string | null;
  intensity: string;
  equipment: string[];
  holdSeconds: number | null;
  perSide: boolean;
  /** 계획을 뽑을 때 이미 있던 우리 영상(다시 찍을 것) — PlanItem.oldVideo */
  oldVideo?: string | null;
};

/** 피로를 다는 단위 — 하체는 파워 · 앞(무릎) · 뒤(힌지) · 보강을 따로 */
export type Bucket =
  | '하체 파워'
  | '하체 앞(무릎)'
  | '하체 뒤(힌지)'
  | '고관절 · 발목 보강'
  | '유산소'
  | '모빌리티'
  | '코어'
  | '상체 밀기 · 어깨'
  | '상체 당기기'
  | '전완 · 팔꿈치'
  | '어깨 · 견갑(암케어)'
  /* 야외 주차(실내 다음 주~, lib/shoot/outdoor.ts) */
  | '워밍업'
  | '무브먼트 패턴 드릴'
  | '메디신볼 드릴'
  | '스로잉 드릴';

export const LOWER_BUCKETS: readonly Bucket[] = [
  '하체 파워',
  '하체 앞(무릎)',
  '하체 뒤(힌지)',
  '고관절 · 발목 보강',
  '유산소',
];

/** 촬영 자리 — 이 순서로 돈다(넓은 곳 파워가 몸이 싱싱할 때, 매트 스트레칭은 정리 운동처럼 맨 끝) */
export const STATIONS = [
  '넓은 바닥(이동)',
  '박스',
  '랙 · 바벨 · 원판',
  '벤치',
  '덤벨 · 케틀벨',
  '케이블',
  '철봉 · TRX',
  '공 · 워터백(벽 앞)',
  '밴드(고정 기둥)',
  '매트',
] as const;
/**
 * 야외 자리(실내 다음 주~ 투구 드릴 · 워밍업, lib/shoot/outdoor.ts) — 이 순서로 돈다: 워밍업(모델 몸풀기) → 몸 쓰는 패턴 →
 * 메디신볼(힘) → 공 던지기(팔은 몸이 다 풀린 뒤).
 */
export const OUTDOOR_STATIONS = [
  '넓은 잔디(이동)',
  '잔디 · 밴드 기둥',
  '메디신볼 벽',
  '투구 그물',
] as const;
export type Station = (typeof STATIONS)[number] | (typeof OUTDOOR_STATIONS)[number];
/** 모든 자리의 차례 — 실내 뒤에 야외 */
export const ALL_STATIONS: readonly Station[] = [...STATIONS, ...OUTDOOR_STATIONS];

export const SESSION_MINUTES = 180;
/** 0:00~0:15 카메라 · 조명 · 첫 자리 준비(모델은 그동안 몸풀기) */
export const SETUP_MINUTES = 15;
/** 끝 10분 — 파일 백업 · 빠진 번호 확인 */
export const WRAP_MINUTES = 10;
export const BREAK_MINUTES = 5;
/** 이만큼 찍으면 쉰다(한 회 두 번까지) */
export const BREAK_EVERY = 50;
export const MOVE_MINUTES = 3;
export const SWAP_MINUTES = 1;

const ECC = /과부하 내리기|버티며 내리기|노르딕|드롭 캐치/;
/** 화면에 '천천히 내리기'로 알리는 것(드롭 캐치는 시간만 더 든다) */
export const SLOW_LOWER = /과부하 내리기|버티며 내리기|노르딕/;
const MULTI = /\+|→|시리즈|단계별|전체|여러 각도|연속|3방향|6방향|다방향/;
export const JUMPY =
  /점프|바운드|홉|슬램|던지기|패스|허들|스케이트|드리블|드롭|리바운드|플립|스로우/;

/** 영상 1개를 찍는 데 드는 분(최대 3) */
export function shotMinutes(x: ShootExercise): number {
  let m = 1.6;
  if (ECC.test(x.title)) m += 0.4;
  if (MULTI.test(x.title)) m += 0.4;
  if (JUMPY.test(x.title)) m += 0.3;
  if (x.equipment.includes('바벨')) m += 0.3;
  if (x.category === '유산소') m += 0.6;
  return Math.round(Math.min(3, m) * 10) / 10;
}

const BALLS = ['메디신볼', '플라이오볼', '워터볼', '워터백', '짐볼'];
const MOVING =
  /스킵|스트라이더|백 페달|워킹|토 워크|셔틀|조깅|걷기|템포 런|브로드|바운드|트랜스버스|마치/;

export function stationOf(x: ShootExercise): Station {
  const e = x.equipment;
  if (x.category === '파워' && (e.length === 0 || (e.length === 1 && e[0] === '맨몸')))
    return '넓은 바닥(이동)';
  if (x.category === '유산소' || MOVING.test(x.title)) return '넓은 바닥(이동)';
  if (e.includes('바벨') || (e.includes('원판') && !e.includes('박스')))
    return '랙 · 바벨 · 원판';
  if (e.includes('철봉') || e.includes('TRX')) return '철봉 · TRX';
  if (e.includes('케이블')) return '케이블';
  if (e.includes('박스')) return '박스';
  if (e.includes('벤치')) return '벤치';
  if (e.some((q) => BALLS.includes(q))) return '공 · 워터백(벽 앞)';
  if (e.includes('덤벨') || e.includes('케틀벨')) return '덤벨 · 케틀벨';
  if (e.includes('밴드')) return '밴드(고정 기둥)';
  return '매트';
}

export function bucketOf(x: ShootExercise): Bucket {
  const p = x.bodyParts;
  if (x.category === '모빌리티') return '모빌리티';
  if (x.category === '코어') return '코어';
  if (x.category === '암케어') {
    if (
      p[0] === '손목·전완' ||
      (p.includes('손목·전완') && /전완|핑거|핀치|손목/.test(x.title))
    )
      return '전완 · 팔꿈치';
    if (p[0] === '이두' || p[0] === '삼두') return '전완 · 팔꿈치';
    return '어깨 · 견갑(암케어)';
  }
  if (x.category === '상체 스트렝스') {
    if (x.movementPattern === '당기기' || p[0] === '이두' || p[0] === '등')
      return '상체 당기기';
    return '상체 밀기 · 어깨';
  }
  if (x.category === '파워') {
    if (/메디신볼|스피드 프레스/.test(x.title)) return '코어';
    return '하체 파워';
  }
  if (x.category === '유산소') return '유산소';
  if (x.category === '회복 및 보강') return '고관절 · 발목 보강';
  if (['스쿼트', '런지', '카프'].includes(x.movementPattern ?? ''))
    return '하체 앞(무릎)';
  return '하체 뒤(힌지)';
}

const INTENSITY_LOAD: Record<string, number> = {
  '매우 낮음': 0.2,
  낮음: 0.5,
  중간: 1,
  높음: 2,
  '매우 높음': 3,
};

/** 부하 점수 — 강도(매우 낮음 0.2 ~ 매우 높음 3), 천천히 내리기 ×1.5 */
export function loadOf(x: ShootExercise): number {
  let l = INTENSITY_LOAD[x.intensity] ?? 1;
  if (ECC.test(x.title)) l *= 1.5;
  return Math.round(l * 10) / 10;
}

export const isLowerBucket = (b: Bucket) => LOWER_BUCKETS.includes(b);

/** 모델에게 말할 시범 방법 */
export function demoCue(x: ShootExercise, bucket: Bucket): string {
  let cue: string;
  if (x.category === '유산소') cue = '10초 걷기 · 뛰기 장면';
  else if (SLOW_LOWER.test(x.title)) cue = '1~2회 천천히 내리기';
  else if (x.holdSeconds) cue = '10초 버티기';
  else if (JUMPY.test(x.title) || /스윙|반등/.test(x.title)) cue = '2~3회';
  else if (bucket === '모빌리티') cue = '2~3회 · 끝 자세 2초';
  else cue = '3회';
  return x.perSide ? `${cue} · 한쪽` : cue;
}

/* ─────────────────────────── 나누기 ─────────────────────────── */

export type ScheduleOptions = {
  /** 몇 회에 나누나 */
  sessions: number;
  /** 그 회에 아직 없는 자리를 새로 열 때의 벌점 — 클수록 자리를 덜 옮긴다 */
  stationPenalty: number;
  /** 부하 고르기의 무게 — 클수록 회마다 부하가 고르다 */
  loadWeight: number;
};

export const DEFAULT_OPTIONS: ScheduleOptions = {
  sessions: 5,
  stationPenalty: 1.2,
  loadWeight: 1.5,
};

type Row = ShootExercise & {
  station: Station;
  bucket: Bucket;
  minutes: number;
  load: number;
  eqKey: string;
};

export type PlanItem = {
  exerciseId: string;
  /** '1-07' — 번호 카드 · 파일 이름 */
  no: string;
  title: string;
  station: Station;
  bucket: Bucket;
  equipment: string[];
  /** 계획 시각(분, 0 = 도착) */
  at: number;
  minutes: number;
  load: number;
  cue: string;
  perSide: boolean;
  /** 이 운동 뒤에 5분 쉰다 */
  breakAfter: boolean;
  /**
   * 무엇인가 — 없으면 운동(ExerciseVideo). drill = 투구 드릴(MechanicsGuide), warmup = 이름만 있는 워밍업
   * (lib/shoot/warmups.ts — 라이브러리에 아직 없다. 영상을 올리면 그 이름의 '워밍업' 운동을 숨긴 채 만든다).
   */
  kind?: 'exercise' | 'drill' | 'warmup';
  /** 워밍업이 들어갈 고정 루틴('전신 워밍업' …) · 드릴의 단계('기초' …) — 화면에 한 줄 */
  group?: string;
  /**
   * 계획을 뽑을 때 이미 있던 우리 영상의 경로 — 그 운동도 다시 찍는다(김민 2026-10-09: "직접 찍은 영상도 포함해서 다시").
   * 라이브러리 영상이 이것과 다르면 이번 촬영에서 올린 것(lib/shoot/load.ts uploaded).
   */
  oldVideo?: string;
};

export type PlanStation = {
  station: Station;
  start: number;
  end: number;
  items: PlanItem[];
};

export type PlanWeek = {
  week: number;
  /** 마지막 운동이 끝나는 시각(분) */
  end: number;
  stations: PlanStation[];
  /** 부위별 부하 합 */
  load: Partial<Record<Bucket, number>>;
  /** 야외 주차(투구 드릴 · 워밍업) — 앞 주에서 넘어오는 것도 같은 쪽끼리만 */
  outdoor?: boolean;
};

export type ShootPlan = {
  version: number;
  /** 'YYYY-MM-DD' — 계획을 뽑은 날 */
  createdOn: string;
  options: ScheduleOptions;
  weeks: PlanWeek[];
};

const isHeavyLower = (x: Row) => isLowerBucket(x.bucket) && x.load >= 2;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/** 같은 입력이면 같은 계획 — 이름 · id 로 줄을 세워 시작한다 */
export function buildPlan(
  exercises: ShootExercise[],
  createdOn: string,
  options: ScheduleOptions = DEFAULT_OPTIONS
): ShootPlan {
  const N = options.sessions;
  const rows: Row[] = [...exercises]
    .sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id))
    .map((x) => ({
      ...x,
      station: stationOf(x),
      bucket: bucketOf(x),
      minutes: shotMinutes(x),
      load: loadOf(x),
      eqKey: [...x.equipment].sort().join('+') || '맨몸',
    }));

  /* 부위별 한 회 목표 = 전체 ÷ N */
  const total = new Map<Bucket, { l: number; t: number }>();
  for (const x of rows) {
    const v = total.get(x.bucket) ?? { l: 0, t: 0 };
    v.l += x.load;
    v.t += x.minutes;
    total.set(x.bucket, v);
  }
  const target = (b: Bucket) => {
    const v = total.get(b)!;
    return { l: v.l / N, t: v.t / N };
  };

  /* 묶음 = 같은 부위 · 자리 · 기구 · 동작 계열. 목표의 60%(부하) · 90%(시간)를 넘거나 무거운 하체가 둘이면 쪼갠다 */
  const gmap = new Map<string, Row[]>();
  for (const x of rows) {
    const k = `${x.bucket}|${x.station}|${x.eqKey}|${x.movementPattern ?? ''}`;
    const list = gmap.get(k) ?? [];
    list.push(x);
    gmap.set(k, list);
  }
  const groups: Row[][] = [];
  for (const list of gmap.values()) {
    const tg = target(list[0].bucket);
    const limL = Math.max(tg.l * 0.6, 2.5);
    const limT = Math.max(tg.t * 0.9, 12);
    let cur: Row[] = [];
    let cl = 0;
    let ct = 0;
    for (const x of list) {
      const heavyFull = isHeavyLower(x) && cur.filter(isHeavyLower).length >= 2;
      if (cur.length && (cl + x.load > limL || ct + x.minutes > limT || heavyFull)) {
        groups.push(cur);
        cur = [];
        cl = 0;
        ct = 0;
      }
      cur.push(x);
      cl += x.load;
      ct += x.minutes;
    }
    if (cur.length) groups.push(cur);
  }

  const heavyCap = Math.ceil(rows.filter(isHeavyLower).length / N) + 1;
  const stationHeavyCap = 4;
  const sideHeavyCap = 2;
  const allMinutes = sum(rows, (x) => x.minutes);

  type Bin = {
    items: Row[];
    bucket: Map<Bucket, { l: number; t: number }>;
    t: number;
    stations: Set<Station>;
    heavy: number;
    stHeavy: Map<string, number>;
  };
  const bins: Bin[] = Array.from({ length: N }, () => ({
    items: [],
    bucket: new Map(),
    t: 0,
    stations: new Set(),
    heavy: 0,
    stHeavy: new Map(),
  }));

  const gl = (g: Row[]) => sum(g, (x) => x.load);
  const gt = (g: Row[]) => sum(g, (x) => x.minutes);
  groups.sort(
    (a, b) =>
      gl(b) / Math.max(target(b[0].bucket).l, 0.1) -
        gl(a) / Math.max(target(a[0].bucket).l, 0.1) || gt(b) - gt(a)
  );

  for (const g of groups) {
    const b = g[0].bucket;
    const tg = target(b);
    const h = g.filter(isHeavyLower).length;
    const sideKey = `${g[0].station}|${b}`;
    let best = -1;
    let bestScore = Infinity;
    bins.forEach((bin, i) => {
      if (
        h &&
        (bin.heavy + h > heavyCap ||
          (bin.stHeavy.get(g[0].station) ?? 0) + h > stationHeavyCap ||
          (bin.stHeavy.get(sideKey) ?? 0) + h > sideHeavyCap)
      )
        return;
      const cur = bin.bucket.get(b) ?? { l: 0, t: 0 };
      const l = cur.l + gl(g);
      const t = cur.t + gt(g);
      const small = g.length <= 1 ? 2 : 1;
      const score =
        options.loadWeight * Math.max(l / Math.max(tg.l, 0.1), (0.5 * t) / tg.t) +
        ((bin.t + gt(g)) / (allMinutes / N)) * 0.7 +
        (bin.stations.has(g[0].station) ? 0 : options.stationPenalty * small);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    /* 상한 때문에 들어갈 곳이 없으면 무거운 것이 가장 적은 회로(넘침은 시험이 잡는다) */
    if (best < 0)
      best = bins.reduce((bi, bin, i) => (bin.heavy < bins[bi].heavy ? i : bi), 0);
    const bin = bins[best];
    bin.items.push(...g);
    const cur = bin.bucket.get(b) ?? { l: 0, t: 0 };
    cur.l += gl(g);
    cur.t += gt(g);
    bin.bucket.set(b, cur);
    bin.t += gt(g);
    bin.stations.add(g[0].station);
    bin.heavy += h;
    bin.stHeavy.set(g[0].station, (bin.stHeavy.get(g[0].station) ?? 0) + h);
    bin.stHeavy.set(sideKey, (bin.stHeavy.get(sideKey) ?? 0) + h);
  }

  const weeks = bins.map((bin, wi) => layoutWeek(wi + 1, bin.items));
  return { version: 1, createdOn, options, weeks };
}

/** 한 자리 안의 순서 — 파워 먼저, 같은 부위는 2~3개(4점)까지 잇고 다른 부위로, 천천히 내리기는 그 부위 끝 */
function orderStation(list: Row[], station: Station): Row[] {
  const byKey = (a: Row, b: Row) =>
    (a.eqKey + (a.movementPattern ?? '') + a.title).localeCompare(
      b.eqKey + (b.movementPattern ?? '') + b.title,
      'ko'
    );
  if (station === '넓은 바닥(이동)') {
    /* 모빌리티(모델 몸풀기) → 유산소 → 나머지(파워) */
    const rank = (x: Row) =>
      x.bucket === '모빌리티' ? 0 : x.bucket === '유산소' ? 1 : 2;
    return [...list].sort(
      (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'ko')
    );
  }
  const q = new Map<Bucket, Row[]>();
  for (const x of [...list].sort(byKey)) {
    const arr = q.get(x.bucket) ?? [];
    arr.push(x);
    q.set(x.bucket, arr);
  }
  for (const [k, xs] of q) {
    q.set(k, [
      ...xs.filter((x) => !SLOW_LOWER.test(x.title)),
      ...xs.filter((x) => SLOW_LOWER.test(x.title)),
    ]);
  }
  const out: Row[] = [];
  const power = q.get('하체 파워');
  if (power) {
    out.push(...power);
    q.delete('하체 파워');
  }
  const queues = [...q.values()].sort((a, b) => b.length - a.length);
  let last: Bucket | null = out.length ? out[out.length - 1].bucket : null;
  while (queues.some((x) => x.length)) {
    const pick =
      queues.find((x) => x.length && x[0].bucket !== last) ??
      queues.find((x) => x.length)!;
    const light = pick[0].bucket === '모빌리티';
    let l = 0;
    let c = 0;
    while (pick.length && (light ? c < 8 : c < 3 && l + pick[0].load <= 4.5)) {
      const x = pick.shift()!;
      out.push(x);
      l += x.load;
      c++;
      if (!light && l >= 4) break;
    }
    last = out[out.length - 1].bucket;
  }
  return out;
}

function layoutWeek(week: number, items: Row[]): PlanWeek {
  const byStation = new Map<Station, Row[]>();
  for (const x of items) {
    const arr = byStation.get(x.station) ?? [];
    arr.push(x);
    byStation.set(x.station, arr);
  }
  const order = [...byStation.keys()].sort(
    (a, b) => ALL_STATIONS.indexOf(a) - ALL_STATIONS.indexOf(b)
  );
  let clock = SETUP_MINUTES;
  let since = 0;
  let prev: Row | null = null;
  let breaks = 0;
  let n = 0;
  const stations: PlanStation[] = [];
  const load: Partial<Record<Bucket, number>> = {};
  for (const st of order) {
    if (prev) {
      clock += MOVE_MINUTES;
      since += MOVE_MINUTES;
    }
    const start = clock;
    const out: PlanItem[] = [];
    for (const x of orderStation(byStation.get(st)!, st)) {
      if (prev && prev.station === x.station && prev.eqKey !== x.eqKey) {
        clock += SWAP_MINUTES;
        since += SWAP_MINUTES;
      }
      n++;
      const item: PlanItem = {
        exerciseId: x.id,
        no: `${week}-${String(n).padStart(2, '0')}`,
        title: x.title,
        station: x.station,
        bucket: x.bucket,
        equipment: x.equipment,
        at: Math.round(clock * 10) / 10,
        minutes: x.minutes,
        load: x.load,
        cue: demoCue(x, x.bucket),
        perSide: x.perSide,
        breakAfter: false,
        ...(x.oldVideo ? { oldVideo: x.oldVideo } : {}),
      };
      out.push(item);
      load[x.bucket] = Math.round(((load[x.bucket] ?? 0) + x.load) * 10) / 10;
      clock += x.minutes;
      since += x.minutes;
      prev = x;
      if (since >= BREAK_EVERY && breaks < 2) {
        item.breakAfter = true;
        clock += BREAK_MINUTES;
        since = 0;
        breaks++;
      }
    }
    stations.push({
      station: st,
      start: Math.round(start * 10) / 10,
      end: Math.round(clock * 10) / 10,
      items: out,
    });
  }
  return { week, end: Math.round(clock * 10) / 10, stations, load };
}

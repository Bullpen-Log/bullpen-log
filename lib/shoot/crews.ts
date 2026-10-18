import {
  BREAK_EVERY,
  BREAK_MINUTES,
  MOVE_MINUTES,
  SETUP_MINUTES,
  SWAP_MINUTES,
  demoCue,
  isWarmupItem,
  orderStation,
  orderWarmup,
  setupOf,
  type Bucket,
  type PlanItem,
  type PlanStation,
  type PlanWeek,
  type Row,
  type Station,
} from '@/lib/shoot/schedule';

/**
 * 두 사람이 같은 헬스장에서 동시에 찍는 주(2026-10-18 사용자: "5주차는 운동 장비 + 공간으로 — 2명이 나눠서 동시에 촬영한다").
 *
 * 공간은 셋이다 — 맨몸 · 스트레칭을 하는 넓은 공간, 랙을 쓰는 공간, 케이블을 쓰는 공간(케이블 앞은 어느 정도 넓어 다른 운동도 된다).
 * 한 공간은 한 사람만 쓴다: A 는 넓은 공간 → 랙 공간, B 는 케이블 공간(케이블 · 기둥에 거는 밴드 · 덤벨). 둘의 몫이 비슷하게
 * 나뉘도록 묶었다(5주차 111개 — A 52 · B 59, 끝 2:13 · 2:11). 공간 안은 지금처럼 자리(장비) → 같은 준비물 → 같은 자세 → 부위 차례(orderStation).
 * 계획 시각은 사람마다 따로 센다 — 둘 다 0:15 에 시작한다.
 */
export const CREW_SPACES: readonly {
  crew: string;
  space: string;
  stations: readonly Station[];
}[] = [
  { crew: 'A', space: '넓은 공간', stations: ['넓은 바닥(이동)', '매트'] },
  {
    crew: 'A',
    space: '랙 공간',
    stations: ['랙 · 바벨 · 원판', '철봉 · TRX', '박스', '벤치'],
  },
  /* 케이블 앞의 빈자리 — 덤벨 · 공(워터볼 · 짐볼)도 여기서. 공을 B 로 둔 것은 몫 맞추기(A 2:25 · B 1:54 → 2:13 · 2:11) */
  {
    crew: 'B',
    space: '케이블 공간',
    stations: ['케이블', '밴드(고정 기둥)', '덤벨 · 케틀벨', '공 · 워터백(벽 앞)'],
  },
];

export const CREWS = [...new Set(CREW_SPACES.map((s) => s.crew))];

/** 자리(장비) → 공간 · 맡은 사람. 표에 없는 자리는 넓은 공간(맨몸) */
export function spaceOf(station: Station): { crew: string; space: string } {
  const s = CREW_SPACES.find((x) => x.stations.includes(station)) ?? CREW_SPACES[0];
  return { crew: s.crew, space: s.space };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 한 주를 두 사람 몫으로 늘어놓는다(순수 — 같은 입력이면 같은 계획). 번호는 A 의 차례 → B 의 차례로 이어 매긴다.
 * 몸풀기(가벼운 모빌리티 · 스트레칭)는 A 의 맨 앞(넓은 공간). 자리를 바꾸면 같은 공간 안은 도구 바꿈(1분), 공간을 옮기면 옮김(3분).
 */
export function layoutCrewWeek(week: number, rows: Row[]): PlanWeek {
  const warm = rows.filter(isWarmupItem);
  const rest = rows.filter((x) => !isWarmupItem(x));
  type Block = {
    station: Station;
    warmup: boolean;
    space: string;
    crew: string;
    rows: Row[];
  };
  const blocks: Block[] = [];
  if (warm.length)
    blocks.push({
      station: '매트',
      warmup: true,
      ...spaceOf('넓은 바닥(이동)'),
      rows: orderWarmup(warm),
    });
  for (const sp of CREW_SPACES)
    for (const st of sp.stations) {
      const list = rest.filter((x) => x.station === st);
      if (list.length)
        blocks.push({
          station: st,
          warmup: false,
          space: sp.space,
          crew: sp.crew,
          rows: orderStation(list, st),
        });
    }

  let n = 0;
  let end = 0;
  const stations: PlanStation[] = [];
  const load: Partial<Record<Bucket, number>> = {};
  for (const crew of CREWS) {
    let clock = SETUP_MINUTES;
    let since = 0;
    let breaks = 0;
    let prev: Block | null = null;
    let prevRow: Row | null = null;
    for (const b of blocks.filter((x) => x.crew === crew)) {
      if (prev) {
        const gap = prev.space === b.space ? SWAP_MINUTES : MOVE_MINUTES;
        clock += gap;
        since += gap;
      }
      const start = clock;
      const items: PlanItem[] = [];
      for (const x of b.rows) {
        if (
          prevRow &&
          prevRow.station === x.station &&
          setupOf(prevRow) !== setupOf(x)
        ) {
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
          at: r1(clock),
          minutes: x.minutes,
          load: x.load,
          cue: demoCue(x, x.bucket),
          perSide: x.perSide,
          breakAfter: false,
          ...(x.oldVideo ? { oldVideo: x.oldVideo } : {}),
        };
        items.push(item);
        load[x.bucket] = r1((load[x.bucket] ?? 0) + x.load);
        clock += x.minutes;
        since += x.minutes;
        prevRow = x;
        if (since >= BREAK_EVERY && breaks < 2) {
          item.breakAfter = true;
          clock += BREAK_MINUTES;
          since = 0;
          breaks++;
        }
      }
      stations.push({
        station: b.station,
        ...(b.warmup ? { warmup: true } : {}),
        space: b.space,
        crew: b.crew,
        start: r1(start),
        end: r1(clock),
        items,
      });
      prev = b;
    }
    end = Math.max(end, clock);
  }
  return { week, end: r1(end), stations, load };
}

/** 이 사람 몫만 남긴 주 — 촬영 모드(?crew=A)가 그 사람 차례만 돈다. 맡은 사람이 없는 주는 그대로 */
export function crewWeek(w: PlanWeek, crew: string | null): PlanWeek {
  if (!crew || !w.stations.some((s) => s.crew)) return w;
  return { ...w, stations: w.stations.filter((s) => s.crew === crew) };
}

/** 그 주를 나눠 찍는 사람들(없으면 빈 목록) */
export const crewsOf = (w: PlanWeek): string[] => [
  ...new Set(w.stations.flatMap((s) => (s.crew ? [s.crew] : []))),
];

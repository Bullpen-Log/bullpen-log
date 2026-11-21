import data from '@/lib/shoot/plan-data.json' with { type: 'json' };
import linkedDrills from '@/lib/shoot/linked-drills.json' with { type: 'json' };
import type { PlanItem, PlanWeek, ShootPlan, Station } from '@/lib/shoot/schedule';

/**
 * 고정해 둔 촬영 계획(scripts/shoot-plan.mts 가 뽑은 lib/shoot/plan-data.json).
 *
 * 서버 쪽에서만 읽는다 — 136KB 라 화면 묶음에 통째로 싣지 않고, 화면에는 그 주 몫만 넘긴다.
 */
const base = data as ShootPlan;
const existingIds = new Set(base.weeks.flatMap((week) => week.stations.flatMap((station) => station.items.map((item) => item.exerciseId))));

type Placement = { week: number; no: string; station: Station; minutes: number; cue: string; at?: number };
type LinkedDrill = {
  id: string;
  title: string;
  stage: string;
  equipment: string[];
  indoor?: Placement;
  outdoor?: Placement;
  youtubeId?: string;
  aspectRatio?: number;
};
const referenceDrills = linkedDrills as LinkedDrill[];
const referenceById = new Map(referenceDrills.map((drill) => [drill.id, drill]));

export function linkedYouTubeReference(id: string): { yt: string; ar?: number } | undefined {
  const drill = referenceById.get(id);
  return drill?.youtubeId ? { yt: drill.youtubeId, ar: drill.aspectRatio } : undefined;
}

/** 링크 추가 드릴은 지정한 실내 시간 또는 실외 촬영 자리 끝에 배정한다. */
export const SHOOT_PLAN: ShootPlan = {
  ...base,
  weeks: base.weeks.map((week) => {
    let end = week.end;
    let addedLoad = 0;
    const bucket = week.outdoor ? '스로잉 드릴' : '무브먼트 패턴 드릴';
    const stations = week.stations.map((station) => {
      let stationEnd = station.end;
      const items: PlanItem[] = [];
      for (const drill of referenceDrills) {
        const slot = week.outdoor ? drill.outdoor : drill.indoor;
        if (existingIds.has(drill.id) || slot?.week !== week.week || slot.station !== station.station) continue;
        const item: PlanItem = {
          exerciseId: drill.id,
          no: slot.no,
          title: drill.title,
          equipment: drill.equipment,
          station: station.station,
          at: slot.at ?? stationEnd,
          minutes: slot.minutes,
          cue: slot.cue,
          kind: 'drill',
          bucket,
          group: drill.stage,
          load: week.outdoor ? 1 : 0.5,
          perSide: false,
          breakAfter: false,
        };
        addedLoad += item.load;
        stationEnd = Math.max(stationEnd, Math.round((item.at + item.minutes) * 10) / 10);
        items.push(item);
      }
      if (!items.length) return station;
      end = Math.max(end, stationEnd);
      return { ...station, end: stationEnd, items: [...station.items, ...items].sort((a, b) => a.at - b.at) };
    });
    if (!addedLoad) return week;
    const session = week.week === 4 && week.session ? {
      ...week.session,
      agenda: [
        ...week.session.agenda.slice(0, 2),
        { start: 28, end: 42, title: '메커니즘 · 밴드·막대·맨몸 3개' },
        { start: 42, end: 50, title: '메커니즘 · 아쿠아볼 4개' },
        { start: 50, end: 54, title: '메커니즘 · 밴드 앞발 블로킹 2개' },
        { start: 54, end: 60, title: '재촬영 · 파일 확인 · 웨이트 자리 인계' },
        ...week.session.agenda.slice(-1),
      ],
    } : week.session;
    return { ...week, stations, end, session, load: { ...week.load, [bucket]: (week.load[bucket] ?? 0) + addedLoad } };
  }),
};

export function weekOf(n: number): PlanWeek | null {
  return SHOOT_PLAN.weeks.find((w) => w.week === n) ?? null;
}

export function itemOf(exerciseId: string): { week: number; item: PlanItem } | null {
  for (const w of SHOOT_PLAN.weeks)
    for (const s of w.stations)
      for (const it of s.items)
        if (it.exerciseId === exerciseId) return { week: w.week, item: it };
  return null;
}

/**
 * 촬영 계획을 뽑을 때 이미 있던 우리 영상(약 한 달 전에 찍은 것) — 이번 촬영으로 다시 찍어 바꾼다. 아직 그 영상 그대로면
 * '직접 촬영'으로 세지 않는다(2026-10-10 사용자: "한 달 전에 찍은 운동 영상은 다시 교체할 거라 직접 촬영한 영상에서 제외").
 */
export const OLD_OWN_VIDEOS: ReadonlySet<string> = new Set(
  SHOOT_PLAN.weeks.flatMap((w) =>
    w.stations.flatMap((s) => s.items.flatMap((it) => (it.oldVideo ? [it.oldVideo] : [])))
  )
);

export const PLAN_EXERCISE_IDS: ReadonlySet<string> = new Set(
  SHOOT_PLAN.weeks.flatMap((w) =>
    w.stations.flatMap((s) => s.items.map((it) => it.exerciseId))
  )
);

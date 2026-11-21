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
const extraIndoorWeek: PlanWeek = {
  week: 5,
  end: 8,
  stations: [
    { station: '넓은 바닥(이동)', start: 8, end: 8, items: [] },
    { station: '공 · 워터백(벽 앞)', start: 8, end: 8, items: [] },
  ],
  load: {},
};

/** 11/22 기존 촬영 번호를 유지하면서 새 드릴과 장비 순서로 이어 찍는다. */
const november22MovementSlots: Record<string, { at: number; minutes?: number }> = {
  '4-01': { at: 20.5, minutes: 1.5 },
  '4-02': { at: 43.3 },
  '4-03': { at: 45.3 },
  '4-04': { at: 51.6, minutes: 1.4 },
  '4-05': { at: 8 },
  '4-06': { at: 53, minutes: 1.4 },
};

export function linkedYouTubeReference(id: string): { yt: string; ar?: number } | undefined {
  const drill = referenceById.get(id);
  return drill?.youtubeId ? { yt: drill.youtubeId, ar: drill.aspectRatio } : undefined;
}

/**
 * 연결 드릴의 분류 — '나중에 촬영'으로 등록해 둔 것(scripts/add-linked-mechanics-drill.mts)을 우리 영상을 올리면 이 분류로 옮긴다
 * (app/actions/shoot.ts attachShootClip). 안 옮기면 영상을 올려도 드릴 목록에 '나중에 촬영'으로 남아 안 찍은 것처럼 보였다(2026-11-21 김민:
 * "영상 올리면 찍음으로 표시되게"). 라이브러리의 장비 관례대로 — 야구공 · 플라이오볼 스로잉, 메디신볼, 밴드 · 워터백 · 워터볼 · 바이퍼 ·
 * 불가리안 백(장비 칸 없음)은 버티는 힘(근력 · 안정 — lib/categories.ts 정의에 워터백/워터볼이 든다), 막대 · 맨몸은 동작 익히기(무브먼트 패턴).
 * 지금은 날을 정한 실내 촬영(11/22 — session 이 있는 주)의 연결 드릴만 옮긴다(2026-11-21 김민: "우선 내일 목록에 있는거만").
 * 그 밖의 연결 드릴이면 undefined(올려도 '나중에 촬영' 그대로).
 */
const sessionWeeks = new Set(base.weeks.filter((week) => week.session).map((week) => week.week));
export function linkedDrillCategory(id: string): string | undefined {
  const drill = referenceById.get(id);
  if (!drill || !drill.indoor || !sessionWeeks.has(drill.indoor.week)) return undefined;
  const eq = drill.equipment ?? [];
  if (eq.some((e) => e === '야구공' || e === '플라이오볼')) return '스로잉 드릴';
  if (eq.includes('메디신볼')) return '메디신볼 드릴';
  if (eq.length === 0 || eq.some((e) => ['밴드', '워터백', '워터볼', '바이퍼'].includes(e))) return '근력 · 안정 드릴';
  return '무브먼트 패턴 드릴';
}

/** 링크 추가 드릴은 지정한 실내 시간 또는 실외 촬영 자리 끝에 배정한다. */
export const SHOOT_PLAN: ShootPlan = {
  ...base,
  weeks: [...base.weeks, ...(referenceDrills.some((drill) => drill.indoor?.week === 5) ? [extraIndoorWeek] : [])].map((week) => {
    let end = week.end;
    let addedLoad = 0;
    const bucket = week.outdoor ? '스로잉 드릴' : '무브먼트 패턴 드릴';
    const stations = week.stations.map((station) => {
      const baseItems = week.week === 4
        ? station.items.map((item) => ({ ...item, ...november22MovementSlots[item.no] }))
        : station.items;
      let stationEnd = Math.max(station.end, ...baseItems.map((item) => item.at + item.minutes));
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
      const merged = [...baseItems, ...items].sort((a, b) => a.at - b.at);
      return { ...station, start: merged[0].at, end: stationEnd, items: merged };
    });
    if (!addedLoad) return week;
    const session = week.week === 4 && week.session ? {
      ...week.session,
      agenda: [
        week.session.agenda[0],
        { start: 8, end: 20.5, title: '피브이씨 · 골반 회전 → 플립업 → 터널과 찹' },
        { start: 20.5, end: 37.3, title: '워터백 · 한 발 균형 → 힙힌지 → 앞발 지지와 찹' },
        { start: 37.3, end: 51.6, title: '워터볼 · 레그 리프트 → 착지 → 퀵픽과 전체 모션' },
        { start: 51.6, end: 57.2, title: '밴드·맨몸 · 방향 이동과 앞발 블로킹' },
        { start: 57.2, end: 60, title: '파일 확인 · 웨이트 자리 인계' },
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

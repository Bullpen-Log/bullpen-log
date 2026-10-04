import 'server-only';

import { prisma } from '@/lib/prisma';
import { favoriteDrillIds } from '@/lib/favorites';
import { visibleGuides } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { equipmentForToday } from '@/lib/report/equipment';
import { groupDrills, type MechanicsDrillView, type MechanicsVariant } from '@/lib/mechanics/drills';
import {
  buildLevelSession,
  canUseVariant,
  levelAdvice,
  readProgramState,
  type SessionItem,
} from '@/lib/mechanics/program';
import { levelSession, SESSIONS_PER_LEVEL, type LevelKey } from '@/lib/mechanics/levels';

/** 도구 하나 + 가진 장비로 할 수 있나(장비를 안 고른 사람은 늘 true) */
export type PlayerVariant = MechanicsVariant & { owned: boolean };

/** 따라 하기에서 바꿔 할 수 있는 동작 하나 — 그 동작의 도구들과 처음 고를 도구 */
export type SessionAlternative = { title: string; guideId: string; variants: PlayerVariant[] };

/**
 * 세션의 드릴 한 줄 + 영상 정보(고른 도구의 것).
 * alternatives: 맨 앞이 이 드릴, 뒤가 같은 요소 · 같은 단계의 다른 동작(SessionItem.swaps) — 따라 하기의 '다른 드릴' · 도구 칩
 */
export type SessionDrillView = SessionItem & {
  variant: MechanicsVariant;
  alternatives: SessionAlternative[];
};

export type MechanicsProgramView = {
  /** 고른 수준 — 안 골랐으면 null(수준 고르기 화면) */
  level: LevelKey | null;
  /** 이 수준에서 마친 세션 수(0~12) */
  index: number;
  /** 다음 세션의 주차 · 그 주의 몇 번째 — 12번을 다 마쳤으면 null */
  week: number | null;
  day: number | null;
  /** 한 수준의 세션 수(12) */
  total: number;
  /** 수준과 상관없이 지금까지 마친 세션 수 — 영상 찍기 알림(filmPrompt)이 쓴다 */
  sessionsDone: number;
  /** 오늘 세션을 하나라도 마쳤나 */
  finishedToday: boolean;
  /** 다음 · 아래 수준 권하기(levelAdvice) */
  advice: ReturnType<typeof levelAdvice>;
};

/**
 * 프로그램 칸 · 따라 하기가 읽는 것 — 내 프로그램과 오늘의 세션, 오늘 이미 한 드릴(2026-10-04).
 * 프로그램이 없으면 program 이 null 이고 세션도 비어 있다.
 */
export async function loadMechanicsProgram(userId: string): Promise<{
  program: MechanicsProgramView | null;
  session: SessionDrillView[];
  /** 오늘 '했다'로 남은 드릴 id — 따라 하기를 이어서 할 때 건너뛴다 */
  doneToday: string[];
}> {
  const todayKey = toDateKey(new Date());
  const [row, guides, favorites, logs, user, setup] = await Promise.all([
    prisma.mechanicsProgram.findUnique({ where: { userId } }),
    visibleGuides(),
    favoriteDrillIds(userId),
    prisma.userDrillLog.findMany({
      where: { userId, date: dbDate(todayKey), done: true },
      select: { guideId: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { ownedEquipment: true } }),
    /* 트레이닝처럼 오늘 쓸 수 있는 장비(오늘 안 골랐으면 가진 것 전부) */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId, date: dbDate(todayKey) } },
      select: { availableEquipment: true },
    }),
  ]);
  if (!row) return { program: null, session: [], doneToday: [] };

  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );
  const drills = groupDrills(guides, favorites, ownThumbs);
  const state = readProgramState(row.progress);
  const plan = state.level ? levelSession(state.level, state.index) : null;
  const program: MechanicsProgramView = {
    level: state.level,
    index: state.index,
    week: plan?.week ?? null,
    day: plan?.day ?? null,
    total: SESSIONS_PER_LEVEL,
    sessionsDone: row.sessionsDone,
    finishedToday: row.lastSessionOn ? keyOfDbDate(row.lastSessionOn) === todayKey : false,
    advice: levelAdvice(state),
  };
  const gear = equipmentForToday(user?.ownedEquipment ?? [], setup?.availableEquipment);
  const owned = gear.length > 0 ? new Set(gear) : null;
  const variants = new Map(drills.flatMap((d) => d.variants.map((v) => [v.id, v] as const)));
  const byTitle = new Map(drills.map((d) => [d.title, d] as const));
  const toAlternative = (d: MechanicsDrillView, guideId: string): SessionAlternative => ({
    title: d.title,
    guideId,
    variants: d.variants.map((v) => ({ ...v, owned: canUseVariant(v, owned) })),
  });
  const items = state.level ? buildLevelSession({ drills, level: state.level, index: state.index, owned }) : [];
  const session = items.flatMap((item): SessionDrillView[] => {
    const variant = variants.get(item.guideId);
    const drill = byTitle.get(item.title);
    if (!variant || !drill) return [];
    const alternatives = [
      toAlternative(drill, item.guideId),
      ...item.swaps.flatMap((w) => {
        const d = byTitle.get(w.title);
        return d ? [toAlternative(d, w.guideId)] : [];
      }),
    ];
    return [{ ...item, variant, alternatives }];
  });

  /* 따라 하기에서 도구나 드릴을 바꿔 했어도 그 자리는 한 것으로 — 화면들은 item.guideId 로 본다 */
  const done = new Set(logs.map((l) => l.guideId));
  const doneToday = [...done];
  for (const item of session) {
    const ids = item.alternatives.flatMap((a) => a.variants.map((v) => v.id));
    if (!done.has(item.guideId) && ids.some((id) => done.has(id))) doneToday.push(item.guideId);
  }
  return { program, session, doneToday };
}

import 'server-only';

import { prisma } from '@/lib/prisma';
import { favoriteDrillIds } from '@/lib/favorites';
import { visibleGuides } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { groupDrills, type MechanicsVariant } from '@/lib/mechanics/drills';
import {
  buildSession,
  isElementName,
  readProgress,
  type ProgramProgress,
  type SessionItem,
} from '@/lib/mechanics/program';
import type { MechanicsElementName } from '@/lib/mechanics/elements';

/** 세션의 드릴 한 줄 + 영상 정보(고른 도구의 것) */
export type SessionDrillView = SessionItem & { variant: MechanicsVariant };

export type MechanicsProgramView = {
  focus: MechanicsElementName | null;
  progress: ProgramProgress;
  sessionsDone: number;
  /** 오늘 세션을 하나라도 마쳤나 */
  finishedToday: boolean;
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
  const [row, guides, favorites, logs] = await Promise.all([
    prisma.mechanicsProgram.findUnique({ where: { userId } }),
    visibleGuides(),
    favoriteDrillIds(userId),
    prisma.userDrillLog.findMany({
      where: { userId, date: dbDate(todayKey), done: true },
      select: { guideId: true },
    }),
  ]);
  if (!row) return { program: null, session: [], doneToday: [] };

  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );
  const drills = groupDrills(guides, favorites, ownThumbs);
  const program: MechanicsProgramView = {
    focus: isElementName(row.focus) ? row.focus : null,
    progress: readProgress(row.progress),
    sessionsDone: row.sessionsDone,
    finishedToday: row.lastSessionOn ? keyOfDbDate(row.lastSessionOn) === todayKey : false,
  };
  const variants = new Map(drills.flatMap((d) => d.variants.map((v) => [v.id, v] as const)));
  const session = buildSession({
    drills,
    progress: program.progress,
    focus: program.focus,
    sessionsDone: program.sessionsDone,
  }).flatMap((item) => {
    const variant = variants.get(item.guideId);
    return variant ? [{ ...item, variant }] : [];
  });
  return { program, session, doneToday: logs.map((l) => l.guideId) };
}

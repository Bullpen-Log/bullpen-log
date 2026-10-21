import 'server-only';
import type { getCurrentUser } from '@/lib/dal';
import { favoriteDrillIds } from '@/lib/favorites';
import { trainingGuides } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { groupDrills, type MechanicsDrillView } from '@/lib/mechanics/drills';
import { loadElementReport, loadMechanicsProgram, type ElementReportView, type MechanicsProgramView } from '@/lib/mechanics/load';
import type { DrillThrowNote, MechanicsPainFold, SessionItem } from '@/lib/mechanics/program';

/**
 * 아이폰 앱 메커니즘 화면(native/src/app/training-mechanics.tsx)이 그릴 것 — 웹 메커니즘 칸(app/(app)/training/mechanics-section.tsx)과 같은
 * 함수(loadMechanicsProgram · groupDrills)를 그대로 부른다. 프로그램 칸의 세션은 목록에 쓰는 칸만 추린다(따라 하기의 다른 드릴 · 도구는 따라 하기
 * 화면이 다시 읽는다 — lib/mechanics/play-load.ts). 'use server' 파일에 두지 않는다 — user 를 받는 함수가 입구가 되지 않게.
 */

type AppUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 프로그램 칸 목록의 드릴 한 줄 — 웹 SessionCard 가 그리는 칸만 */
export type AppSessionDrill = Pick<SessionItem, 'title' | 'guideId' | 'element' | 'stage' | 'tool' | 'dose' | 'category' | 'gearNote' | 'rx'>;

export type AppMechanicsProgramTab = {
  tab: 'program';
  program: MechanicsProgramView | null;
  session: AppSessionDrill[];
  doneToday: string[];
  painFold: MechanicsPainFold | null;
  throwNote: DrillThrowNote | null;
};

export type AppMechanicsElementsTab = {
  tab: 'elements';
  drills: MechanicsDrillView[];
  hand: string | null;
  /** 진행 중인 3D 리포트 처방의 요소들 — 흐름 칩의 점 · 요소 카드의 '내 리포트' 칸 */
  report: ElementReportView[] | null;
};

export async function loadAppMechanicsTab(
  user: AppUser,
  tab: 'program' | 'elements'
): Promise<AppMechanicsProgramTab | AppMechanicsElementsTab> {
  if (tab === 'program') {
    const { program, session, doneToday, painFold, throwNote } = await loadMechanicsProgram(user.id);
    return {
      tab,
      program,
      session: session.map(({ title, guideId, element, stage, tool, dose, category, gearNote, rx }) => ({
        title,
        guideId,
        element,
        stage,
        tool,
        dose,
        category,
        gearNote,
        rx,
      })),
      doneToday,
      painFold,
      throwNote,
    };
  }
  /* 요소별 드릴 — 웹 mechanics-section.tsx 와 같은 묶음(별 · 직접 찍은 영상의 미리보기 주소까지) */
  const [guides, favorites, report] = await Promise.all([trainingGuides(), favoriteDrillIds(user.id), loadElementReport(user.id)]);
  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );
  return { tab, drills: groupDrills(guides, favorites, ownThumbs), hand: user.throwingHand, report };
}

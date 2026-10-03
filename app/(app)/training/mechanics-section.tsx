import { favoriteDrillIds } from '@/lib/favorites';
import { visibleGuides } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { groupDrills } from '@/lib/mechanics/drills';
import type { MechanicsTab } from './mechanics-tabs';
import { loadMechanicsProgram } from '@/lib/mechanics/load';
import { MechanicsGuide } from './mechanics-guide';
import { MechanicsProgram } from './mechanics-program';

/**
 * 메커니즘 칸 — [프로그램 | 요소별 드릴](2026-10-04).
 *
 * 투구 드릴(라이브러리의 '투구 드릴', MechanicsGuide)을 투구 요소 여섯으로 묶어 보여 준다. 암케어의 부위별 보강과 같은
 * 모양이다 — 요소 → 증상 · 설명 → 단계별 드릴. 글은 lib/mechanics/elements.ts.
 *
 * 프로그램 칸은 쉬운 단계부터 올라가는 과정 — 오늘의 세션 · 요소별 진행(lib/mechanics/program.ts · load.ts).
 */
export async function MechanicsSection({
  user,
  tab,
  focus,
}: {
  user: { id: string; role: string; throwingHand: string | null };
  tab: MechanicsTab;
  /** 주소의 ?el= — 그 요소 카드를 열어 둔다 */
  focus: string | null;
}) {
  if (tab === 'program') {
    const { program, session, doneToday } = await loadMechanicsProgram(user.id);
    return <MechanicsProgram program={program} session={session} doneToday={doneToday} />;
  }

  const [guides, favorites] = await Promise.all([visibleGuides(), favoriteDrillIds(user.id)]);
  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );

  return (
    <MechanicsGuide
      drills={groupDrills(guides, favorites, ownThumbs)}
      hand={user.throwingHand}
      isAdmin={user.role === 'ADMIN'}
      focus={focus}
    />
  );
}

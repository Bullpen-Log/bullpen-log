import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { favoriteDrillIds } from '@/lib/favorites';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { MechanicsClient, type GuideItem } from './mechanics-client';

export default async function MechanicsPage() {
  const user = await requireUser();

  const [guides, favoriteIds] = await Promise.all([
    prisma.mechanicsGuide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    favoriteDrillIds(user.id),
  ]);

  const thumbUrls = await createPlaybackUrls(
    guides.map((g) => g.thumbPath).filter((p): p is string => !!p)
  );

  const items: GuideItem[] = guides.map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    description: g.description,
    focusPoints: g.focusPoints,
    equipment: g.equipment,
    videoPath: g.videoPath,
    source: g.source,
    referenceVideoId: g.referenceVideoId,
    aspectRatio: g.aspectRatio,
    /*
     * 참고 영상의 미리보기는 유튜브가 공개한 고정 주소를 그대로 쓴다.
     * 우리 저장소에 담아 두지 않으므로 발급받을 주소도 없다.
     */
    thumbUrl: g.referenceVideoId
      ? referenceThumbUrl(g.referenceVideoId)
      : g.thumbPath
        ? (thumbUrls[g.thumbPath] ?? null)
        : null,
    sortOrder: g.sortOrder,
    favorite: favoriteIds.has(g.id),
  }));

  /*
   * 예전에는 여기에 '학습 완료 0 / 116' 카드가 있었다. 진행률로 보이니 116개를
   * 다 채워야 하는 숙제처럼 읽혔는데, 드릴은 필요한 것을 골라서 하는 것이다.
   * 세는 대신 별을 달아 다시 찾기 쉽게 하는 쪽으로 바꿨다.
   */
  return (
    <div className="space-y-6">
      <MechanicsClient guides={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}

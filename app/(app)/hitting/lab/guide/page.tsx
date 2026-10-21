import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, Card, PageHeading } from '@/components/ui';
import { LAB_MAX_VIDEO_MB, type LabHand } from '@/lib/pitch-lab-meta';
import {
  SWING_GUIDE_CHECKS,
  SWING_GUIDE_MOVE_NOTE,
  SWING_GUIDE_POINTS,
  SWING_GUIDE_SECTION_NAME,
  swingForHand,
  swingGuideUploadPoints,
  type SwingGuideSection,
} from '@/lib/swing-lab-meta';
import { SwingPlaceArt } from './place-art';

/**
 * 3D 스윙 분석 촬영 안내(웹) — 글은 lib/swing-lab-meta.ts SWING_GUIDE_* 한 곳(앱 native/src/app/swing/guide.tsx 와 같이 쓴다).
 * ?hand=L 이면 좌타 기준(1루 ↔ 3루).
 */
export default async function SwingGuidePage({ searchParams }: { searchParams: Promise<{ hand?: string }> }) {
  await requireUser();
  const { hand: handParam } = await searchParams;
  const hand: LabHand = handParam === 'L' ? 'L' : 'R';
  if (expoLevel((await headers()).get('user-agent')) >= 11) return <OpenNative path={`/swing/guide?hand=${hand}`} cover={false} />;
  const section = (id: SwingGuideSection, children: React.ReactNode) => (
    <Card key={id} id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-base font-semibold text-ink">{SWING_GUIDE_SECTION_NAME[id]}</h2>
      {children}
    </Card>
  );
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/hitting/lab">3D 스윙 분석</BackLink>
        <PageHeading title="스윙 촬영 안내" description="이대로 찍으면 3D 가 가장 정확해요." />
      </div>
      <div className="stack-block">
        {section(
          'checklist',
          <ul className="space-y-2">
            {SWING_GUIDE_CHECKS.map((x) => (
              <li key={x.id} className="flex items-center gap-3 text-sm text-ink">
                <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-line" />
                {swingForHand(x.title, hand)}
              </li>
            ))}
          </ul>
        )}
        {section(
          'place',
          <>
            <SwingPlaceArt hand={hand} />
            <Points items={SWING_GUIDE_POINTS.place.map((t) => swingForHand(t, hand))} />
          </>
        )}
        {section('frame', <Points items={SWING_GUIDE_POINTS.frame} />)}
        {section('phone', <Points items={SWING_GUIDE_POINTS.phone} />)}
        {section(
          'steps',
          <ol className="space-y-2.5">
            {SWING_GUIDE_POINTS.steps.map((t, i) => (
              <li key={t} className="flex gap-3 text-sm text-ink">
                <span className="text-numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky text-xs font-semibold text-white">{i + 1}</span>
                <span className="pt-0.5 break-keep">{t}</span>
              </li>
            ))}
          </ol>
        )}
        {section(
          'move',
          <>
            <Points items={SWING_GUIDE_POINTS.move} />
            <p className="rounded-xl bg-ink/4 px-3 py-2.5 text-sm break-keep text-ink">{SWING_GUIDE_MOVE_NOTE}</p>
          </>
        )}
        {section('upload', <Points items={swingGuideUploadPoints(LAB_MAX_VIDEO_MB)} />)}
      </div>
    </div>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm text-ink">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky" />
          <span className="break-keep">{t}</span>
        </li>
      ))}
    </ul>
  );
}

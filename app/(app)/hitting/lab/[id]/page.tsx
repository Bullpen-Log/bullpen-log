import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, PageHeading } from '@/components/ui';
import { RoundBatter } from '@/components/round-icon';
import { loadAppSwingDetail } from '@/app/actions/swing-lab';

/**
 * 3D 스윙 분석 샘플 하나(웹) — 영상(정면 · 포수 뒤 + 마커 샘플의 ③ · ④)과 촬영 정보. 3D 모델은 샘플을 모은 뒤라 그 자리는 '만드는 중'.
 * 앱은 native/src/app/swing/[id].tsx.
 */
export default async function SwingSamplePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (expoLevel((await headers()).get('user-agent')) >= 11) return <OpenNative path={`/swing/${id}`} cover={false} />;
  const d = await loadAppSwingDetail(id);
  if (!d.ok) redirect(d.to === '/login' ? '/login' : '/hitting/lab');
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/hitting/lab">3D 스윙 분석</BackLink>
        <PageHeading kicker={d.marker ? '마커 샘플' : '베타'} title={d.title} description={d.chips.join(' · ') || undefined} />
      </div>
      {d.memo && <p className="text-sm break-keep text-ink">{d.memo}</p>}
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#151722] px-5 py-6 text-center">
        <RoundBatter aria-hidden className="h-6 w-6 text-[#8b93a7]" />
        <p className="text-base font-semibold text-[#e8eef7]">3D 스윙 모델을 만드는 중이에요</p>
        <p className="text-sm break-keep text-[#9aa3b8]">영상은 그대로 두세요. 모델이 열리면 이 스윙으로 리포트를 받을 수 있어요.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 desk:grid-cols-4">
        {d.videos.map((v) => (
          <figure key={v.key} className="space-y-1.5">
            <figcaption className="text-xs font-semibold text-muted">{v.label}</figcaption>
            {v.url ? (
              <video src={`${v.url}#t=0.001`} controls muted playsInline preload="metadata" className="aspect-9/16 w-full rounded-xl bg-black object-contain" />
            ) : (
              <div className="flex aspect-9/16 w-full items-center justify-center rounded-xl bg-ink/5 text-xs text-muted">영상 없음</div>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

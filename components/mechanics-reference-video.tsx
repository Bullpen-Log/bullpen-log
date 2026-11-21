import type { InstagramSegment } from '@/lib/mechanics/reference-draft';

/** 이미 편집된 무음 클립을 상세 화면 안에서 재생한다. */
export function MechanicsReferenceVideo({ id, title, panel }: {
  id: string;
  title: string;
  panel?: InstagramSegment['panel'];
}) {
  return (
    <video
      key={id}
      src={`/api/admin/mechanics-reference?id=${encodeURIComponent(id)}`}
      aria-label={`${title} 녹화 참고 영상`}
      className={`mx-auto block w-full max-h-[55dvh] rounded-xl bg-black object-contain ${panel ? 'aspect-video' : 'aspect-[9/16]'}`}
      autoPlay
      muted
      loop
      playsInline
      controls
    />
  );
}

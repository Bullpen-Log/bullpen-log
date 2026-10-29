import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { startPickUi } from '~/videos/filters';
import { VideoGallery } from '~/videos/gallery';

/**
 * 내 영상 — 투구 · 타격 영상을 한곳에서 다시 찾는다(2026-10-26 · 27 · 29). 홈에서 오른쪽으로 쓸거나 위 막대 영상 단추로 연다.
 * 화면은 videos/gallery.tsx(비교의 B 고르기도 같은 부품). 예전 주소 ?pick=<A> 는 비교 화면의 B 고르기로 넘긴다(그 화면이 고르기 · 맞추기 · 비교를 맡는다).
 */
export default function MyVideosScreen() {
  const { pick, src } = useLocalSearchParams<{ pick?: string; src?: string }>();
  useEffect(() => {
    if (!pick) return;
    startPickUi();
    router.replace({ pathname: '/pitch/compare' as never, params: { a: pick, src: src ?? 'my-videos' } });
  }, [pick, src]);
  if (pick) return null;
  return <VideoGallery />;
}

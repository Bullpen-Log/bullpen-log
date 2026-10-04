import {
  FallbackActions,
  FallbackLink,
  FallbackShell,
  FallbackText,
  FallbackTitle,
} from '@/components/fallback';

/**
 * 앱 틀 안에서 찾지 못했을 때 — 지운 자료실 글 · 루틴 · 그날 기록 같은 것(notFound()). 하단 탭이 남는다(2026-10-04).
 * 예전에는 뿌리의 '404 · 없는 주소예요' 화면이 틀을 통째로 덮었다.
 */
export default function AppNotFound() {
  return (
    <FallbackShell>
      <FallbackTitle>찾을 수 없어요</FallbackTitle>
      <FallbackText>지워졌거나 옮겨진 기록이에요.</FallbackText>
      <FallbackActions>
        <FallbackLink href="/today" primary>
          홈으로
        </FallbackLink>
      </FallbackActions>
    </FallbackShell>
  );
}

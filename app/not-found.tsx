import {
  FallbackActions,
  FallbackLink,
  FallbackShell,
  FallbackText,
  FallbackTitle,
} from '@/components/fallback';

/**
 * 없는 주소로 들어왔을 때.
 *
 * 예전에는 Next.js 기본 화면이 나왔다 — 흰 바탕에 영어로
 * "404: This page could not be found." 한 줄. 한국어 앱에서 그 화면이 뜨면
 * 앱이 망가진 것처럼 보인다.
 *
 * 로그인 여부를 묻지 않는다. 여기서 회원을 조회하면 로그인 안 한 사람이
 * 없는 주소로 들어왔을 때 로그인 화면으로 튕기는데, 그건 404가 할 일이 아니다.
 */
export default function NotFound() {
  return (
    <FallbackShell>
      {/*
        '404 · 없는 주소예요'는 웹사이트의 말이었다 — 앱에는 주소가 없다(2026-10-04 '앱 안에 머물기'). 지워졌거나
        옮겨진 화면이라고만 말한다. 앱 틀 안에서 난 것은 app/(app)/not-found.tsx 가 하단 탭을 남긴 채 같은 말을 한다.
      */}
      <FallbackTitle>찾을 수 없어요</FallbackTitle>
      <FallbackText>지워졌거나 옮겨진 화면이에요. 아래에서 다시 시작해 주세요.</FallbackText>
      <FallbackActions>
        <FallbackLink href="/today" primary>
          홈으로
        </FallbackLink>
        <FallbackLink href="/videos">투구 기록</FallbackLink>
      </FallbackActions>
    </FallbackShell>
  );
}

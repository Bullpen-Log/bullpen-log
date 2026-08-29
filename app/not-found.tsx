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
      <p className="text-display text-5xl leading-none text-line-strong">404</p>
      <div className="mt-4">
        <FallbackTitle>없는 주소입니다</FallbackTitle>
        <FallbackText>
          주소가 바뀌었거나 잘못 입력하셨을 수 있습니다. 아래에서 다시 시작해주세요.
        </FallbackText>
      </div>
      <FallbackActions>
        <FallbackLink href="/today" primary>
          홈으로
        </FallbackLink>
        <FallbackLink href="/pitch-log">투구 일지</FallbackLink>
      </FallbackActions>
    </FallbackShell>
  );
}

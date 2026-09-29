import Link from 'next/link';
import { Wordmark } from '@/components/logo';

/** 문의 메일 — 이용약관 · 개인정보 처리방침의 '문의'와 같은 주소 */
const CONTACT = 'bullpenlog.com@gmail.com';

/**
 * 화면 맨 밑 — 웹사이트라면 흔히 두는 것을 짧게(사용자 요청, 2026-09-27).
 *
 * 서비스 이름과 한 줄 소개, 약관 · 개인정보 처리방침 · 문의, 의료 안내 한 줄, 저작권.
 * 개인정보 처리방침은 굵게 둔다 — 국내 사이트가 다 그렇게 해서 찾는 사람이 먼저 알아본다.
 * 사업자 정보(등록번호 · 주소)는 적지 않는다. 없는 값을 지어 넣으면 안 된다.
 *
 * 앱 안 화면(app/(app)/layout.tsx), 약관 화면, 첫 화면이 같이 쓴다. 폭은 부르는 쪽 본문과
 * 맞춘다(width). 휴대폰의 앱 안 화면은 하단 탭이 밑을 덮으므로 그만큼 비운다(tabBar).
 */
export function SiteFooter({
  width = 'max-w-5xl xl:max-w-6xl 2xl:max-w-7xl',
  tabBar = false,
}: {
  /** 본문과 같은 최대 폭 */
  width?: string;
  /** 휴대폰 하단 탭(fixed) 높이만큼 밑을 비운다 */
  tabBar?: boolean;
}) {
  return (
    <footer className="border-t border-line bg-surface/60">
      <div
        className={`mx-auto w-full px-4 pt-8 sm:px-6 ${width} ${
          tabBar ? 'pb-24 desk:pb-10' : 'pb-10'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2">
              <Wordmark className="text-lg text-ink" />
            </p>
            <p className="mt-1.5 text-xs text-muted">
              투수를 위한 트레이닝 &amp; 기록 플랫폼
            </p>
          </div>

          <nav
            aria-label="사이트 정보"
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
          >
            <Link href="/terms" className="text-muted transition-colors hover:text-ink">
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="font-semibold text-ink transition-colors hover:text-sky-strong"
            >
              개인정보 처리방침
            </Link>
            <a
              href={`mailto:${CONTACT}`}
              className="text-muted transition-colors hover:text-ink"
            >
              문의 {CONTACT}
            </a>
          </nav>
        </div>

        <p className="mt-5 max-w-3xl break-keep text-xs leading-relaxed text-muted">
          투구 계획과 운동 제안은 남긴 기록을 바탕으로 계산한 참고 자료이며, 의학적
          진단이나 처방이 아닙니다. 통증이 있으면 수치와 관계없이 던지지 말고 전문의와
          상담하세요.
        </p>
        <p className="mt-2 text-xs text-muted">
          © 2026 Bullpen Log. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

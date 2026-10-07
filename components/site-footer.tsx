import Link from 'next/link';
import { Wordmark } from '@/components/logo';

/** 문의 메일 — 이용약관 · 개인정보 처리방침의 '문의'와 같은 주소 */
export const CONTACT = 'bullpenlog.com@gmail.com';

/** 의료 안내 — 꼬리말과 설정 창 '정보'(휴대폰은 꼬리말이 없다)가 같이 쓴다 */
export const MEDICAL_NOTICE =
  '투구 계획과 운동 제안은 남긴 기록을 바탕으로 계산한 참고 자료이며, 의학적 진단이나 처방이 아닙니다. 통증이 있으면 수치와 관계없이 던지지 말고 전문의와 상담하세요.';

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
    <>
      {/*
        휴대폰의 앱 안 화면은 꼬리말 없이 하단 탭 자리만 비운다 — 앱에는 화면마다 붙는 꼬리말이 없고, 약관 · 문의 ·
        의료 안내는 설정 창 맨 밑 '정보'에 있다(2026-10-01 사용자 '애플처럼'). PC 와 첫 화면 · 약관 화면은 그대로.
      */}
      {tabBar && (
        <div
          aria-hidden
          className="h-[calc(var(--tab-bar-top)+1rem)] shrink-0 desk:hidden"
        />
      )}
      {/*
        경계선 없이 블록 안에서 위에서 아래로 — 맨 위는 화면 바탕(page), 블록의 6할쯤에서 원래 꼬리말 색(surface 60% 를 바탕에 섞은 것 —
        예전 bg-surface/60 과 같은 색)에 닿고 그 아래는 그 색 그대로(2026-10-07 사용자: "위는 원래 배경색, 아래는 원래 블록 색으로
        그라데이션 — 지금은 배경색이랑 똑같다"). 블록 전체에 걸쳐 옅게 섞으면 글자가 있는 아래쪽도 바탕색처럼 보였다.
      */}
      <footer
        className={tabBar ? 'hidden desk:block' : undefined}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, var(--color-page) 0%, color-mix(in oklab, var(--color-surface) 60%, var(--color-page)) 60%)',
        }}
      >
        <div
          className={`mx-auto w-full px-4 pt-12 sm:px-6 ${width} ${
            tabBar ? 'pb-[calc(var(--tab-bar-top)+1rem)] desk:pb-5' : 'pb-5'
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2">
                <Wordmark className="text-lg text-ink" />
              </p>
              <p className="mt-1 text-xs text-muted">
                투수를 위한 투구 기록과 트레이닝
              </p>
            </div>

            <nav
              aria-label="사이트 정보"
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
            >
              <Link
                href="/terms"
                className="text-muted transition-colors hover:text-ink"
              >
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

          <p className="mt-3 max-w-3xl break-keep text-xs leading-relaxed text-muted">
            {MEDICAL_NOTICE}
          </p>
          <p className="mt-1 text-xs text-muted">
            © 2026 Bullpen Log. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}

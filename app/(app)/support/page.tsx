import { CircleHelp, Megaphone, MessagesSquare, Send } from '@/components/icon';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { loadSupportHome } from '@/lib/support-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { ButtonLink, Card, PageHeading } from '@/components/ui';
import { CONTACT } from '@/components/site-footer';
import { SupportFaq } from '@/components/support/support-faq';
import { SupportInquiryRows } from '@/components/support/support-inquiry-rows';
import { SupportNoticeRows } from '@/components/support/support-notice-rows';
import { SupportSectionHead } from '@/components/support/support-section';

/**
 * 고객센터 첫 화면(2026-10-17 1판 — 틀) — 공지 · 자주 묻는 질문 · 내 1:1 문의를 카드 하나씩.
 * 한 화면에서 '무슨 일이 있나 → 혹시 아는 답인가 → 아니면 묻기' 순서로 내려간다.
 */
export default async function SupportPage() {
  const user = await requireUser();

  /* 새 아이폰 앱(Expo)이 고객센터를 아는 판(BullpenNative/6 부터)이면 앱 화면으로 연다(native/src/app/support/index.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 6) {
    return <OpenNative path="/support" cover={false} />;
  }

  /* 읽기는 앱 화면과 같은 곳(lib/support-load.ts) */
  const { notices, inquiries, inquiryCount } = await loadSupportHome(user);

  return (
    <div className="stack-page">
      <PageHeading title="고객센터" />

      {/* 공지 */}
      <Card className="space-y-3">
        <SupportSectionHead icon={Megaphone} title="공지" moreHref="/support/notices" />
        {notices.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            아직 올라온 공지가 없어요.
          </p>
        ) : (
          <SupportNoticeRows rows={notices} bordered={false} />
        )}
      </Card>

      {/* 자주 묻는 질문 */}
      <Card className="space-y-4">
        <SupportSectionHead icon={CircleHelp} title="자주 묻는 질문" />
        <SupportFaq />
      </Card>

      {/* 1:1 문의 */}
      <Card className="space-y-3">
        <SupportSectionHead
          icon={MessagesSquare}
          title="1:1 문의"
          count={inquiryCount}
          moreHref={inquiryCount > 0 ? '/support/inquiries' : undefined}
          action={
            <ButtonLink href="/support/inquiries/new" size="sm">
              문의하기
            </ButtonLink>
          }
        />
        {inquiries.length === 0 ? (
          <p className="py-4 text-center text-sm leading-relaxed break-keep text-muted">
            아직 문의한 게 없어요. 오류 · 계정 · 기능 제안 무엇이든 물어 주세요.
          </p>
        ) : (
          <SupportInquiryRows rows={inquiries} bordered={false} />
        )}
      </Card>

      {/* 메일 — 로그인이 안 되는 사람도 닿을 수 있는 길. 주소는 꼬리말 · 약관과 같다(components/site-footer.tsx) */}
      <Card className="space-y-2">
        <h2 className="text-base font-bold text-ink">더 궁금한 게 있어요?</h2>
        <p className="text-sm leading-relaxed break-keep text-muted">
          자주 묻는 질문에 없으면 1:1 문의로 물어 주세요. 로그인이 안 될 때는 메일로도
          받아요.
        </p>
        <a
          href={`mailto:${CONTACT}`}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-sky"
        >
          <Send aria-hidden className="h-4 w-4" />
          {CONTACT}
        </a>
      </Card>
    </div>
  );
}

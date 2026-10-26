import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ADULT_AGE,
  AUTO_HIDE,
  COACH_BADGE_NOTE,
  INJURY_NOTE,
  MEET_MIN_AGE,
  POST_CATEGORIES,
  RATE_LIMITS,
  REPORT_REASONS,
  BOARD_GUIDES,
} from '@/lib/community';
import { BackLink } from '@/components/ui';
import { DugoutPageHeader, SectionHead } from '@/components/dugout/ui';

export const metadata: Metadata = { title: '커뮤니티 운영 원칙' };

const DAY_MS = 24 * 60 * 60_000;

/**
 * 커뮤니티 운영 원칙 · 신고 안내(2026-10-26) — 실제 기능과 같은 말로. 숫자는 lib/community.ts 에서 그대로 읽는다(바꾸면 여기도 같이 바뀐다).
 * 로그인 없이 누구나 본다.
 */
export default function CommunityGuidePage() {
  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <DugoutPageHeader title="운영 원칙 · 신고 안내" subtitle="모든 야구인이 편하게 이야기하도록 지키는 것" />

      <section className="space-y-3">
        <SectionHead title="게시판" />
        <ul className="space-y-2 text-sm text-ink/90">
          {POST_CATEGORIES.map((c) => (
            <li key={c.key}>
              <strong className="text-ink">{c.label}</strong>: {BOARD_GUIDES[c.key].what}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHead title="하지 않는 것" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/90">
          <li>사람 · 팀 · 지역을 깎아내리는 욕설 · 비하</li>
          <li>정치 이야기, 토토 · 불법 중계 · 불법 거래 홍보</li>
          <li>광고 · 같은 글 되풀이(도배)</li>
          <li>남의 개인정보 올리기. 전화번호 · 카톡 아이디 · 오픈채팅 주소는 글 · 댓글에 적으면 저절로 가려져요</li>
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHead title="연락 · 만남" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/90">
          <li>1:1 쪽지는 없어요. 연락은 번개 · 팀 글에 묶인 대화로만 해요.</li>
          <li>
            번개 참가 · 팀 신청은 만 {MEET_MIN_AGE}세부터예요. ‘성인만’ 번개는 만 {ADULT_AGE}세부터예요. 처음 만나는 사람과는 공원 · 운동장처럼 여럿이 다니는
            곳에서 만나요.
          </li>
          <li>번개 대화방은 모임 다음 날 닫혀요. 글쓴이가 번개를 취소하면 바로 닫혀요.</li>
          <li>모임 · 경기가 끝나면 글쓴이가 ‘모였어요’ · ‘못 했어요’를 남겨요. 참가 신청만으로 모임이 열린 것으로 치지 않아요.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHead title="신고" />
        <p className="text-sm text-ink/90">
          글 · 댓글 · 대화의 말을 신고할 수 있어요. 고르는 까닭: {REPORT_REASONS.map((r) => r.label).join(' · ')}. 신고한 사람은 글쓴이에게 알려지지 않아요.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/90">
          <li>운영자가 보고 가리거나 그대로 둬요. 가릴 때는 까닭을 남기고, 글쓴이는 내 글에서 그 까닭을 볼 수 있어요.</li>
          <li>
            운영자가 보기 전에도, 하루 안에 {AUTO_HIDE.reporters}명 이상 신고하면 잠시 가려요. 가입한 지 {AUTO_HIDE.minAccountAgeMs / DAY_MS}일이 안 된 계정, 문제없는
            신고를 되풀이한 계정의 신고는 세지 않아요. 운영자가 다시 보고 되살릴 수 있어요.
          </li>
          <li>가려진 글의 글쓴이는 한 번 이의를 낼 수 있어요. 운영자가 다시 봐요.</li>
          <li>
            짧은 사이에 너무 많이 쓰면 잠시 막혀요. 글 {RATE_LIMITS.post.windowMs / 60_000}분에 {RATE_LIMITS.post.max}개 · 댓글 1분에 {RATE_LIMITS.comment.max}개 ·
            대화 1분에 {RATE_LIMITS.message.max}개 · 신고 하루 {RATE_LIMITS.report.max}건.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHead title="차단" />
        <p className="text-sm text-ink/90">
          차단하면 그 사람의 글 · 댓글이 내 목록 · 검색 · 글 화면에서 안 보이고, 서로의 글에 댓글 · 참가 · 둘만의 대화를 못 해요. 같이 참가한 번개 대화방은
          그대로 쓰고, 그 사람의 말만 내 화면에서 접혀요. 상대는 차단된 줄 몰라요.{' '}
          <Link href="/community/blocked" className="font-semibold text-sky">
            차단한 사람
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <SectionHead title="표시" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/90">
          <li>
            <strong className="text-ink">코치</strong>: {COACH_BADGE_NOTE}
          </li>
          <li>
            <strong className="text-ink">운영</strong>: 덕아웃 운영자가 쓴 글이에요.
          </li>
          <li>
            <strong className="text-ink">부상 질문</strong>: {INJURY_NOTE}
          </li>
        </ul>
      </section>
    </div>
  );
}

/**
 * 고객센터(/support, 2026-10-17 1판 — 틀) — 공지 · 자주 묻는 질문 · 1:1 문의. 글 · 구분 값은 여기 한 곳.
 * 화면은 app/(app)/support, 관리자는 app/(app)/admin/support, 동작은 app/actions/support.ts.
 */
import { CONTACT } from './site-info';

export const INQUIRY_CATEGORIES = [
  { key: 'bug', label: '오류 · 버그' },
  { key: 'account', label: '계정 · 로그인' },
  { key: 'data', label: '기록 · 자료' },
  { key: 'feature', label: '기능 제안' },
  { key: 'other', label: '기타' },
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]['key'];
export function isInquiryCategory(v: unknown): v is InquiryCategory {
  return INQUIRY_CATEGORIES.some((c) => c.key === v);
}
export function inquiryCategoryLabel(key: string) {
  return INQUIRY_CATEGORIES.find((c) => c.key === key)?.label ?? '기타';
}

/** 문의 상태 — Prisma enum InquiryStatus 와 같은 이름 */
export const INQUIRY_STATUS = {
  OPEN: { label: '접수됨', tone: 'sky' },
  ANSWERED: { label: '답변 완료', tone: 'good' },
  CLOSED: { label: '종료', tone: 'muted' },
} as const;
export type InquiryStatusKey = keyof typeof INQUIRY_STATUS;

export const INQUIRY_TITLE_MAX = 80;
export const INQUIRY_BODY_MAX = 3000;
export const REPLY_BODY_MAX = 3000;
export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 10000;

/**
 * 자주 묻는 질문 — 글은 코드에 둔다(DB 없이 — 틀 단계라 바꾸기 쉽게). 묶음마다 질문 몇 개.
 * 기관 · 선수 이름은 적지 않는다. 글은 '~해요' 체.
 */
export const FAQ: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: '시작하기',
    items: [
      {
        q: '처음 가입하면 무엇부터 하면 되나요?',
        a: '홈의 체크인부터 시작해 보세요. 투구와 트레이닝 화면은 각각 첫 설정을 마치면 이용할 수 있어요.',
      },
      {
        q: '투구 · 트레이닝 화면이 잠겨 있어요.',
        a: '첫 설정을 마치지 않은 화면이에요. 화면을 눌러 설정을 끝내면 이용할 수 있어요.',
      },
      {
        q: '체크인은 꼭 매일 해야 하나요?',
        a: '매일 하면 컨디션 · 통증 흐름이 쌓여 운동 일정과 투구 계획이 더 정확해져요. 빠진 날이 있어도 괜찮아요 — 그날은 평소 값으로 봐요.',
      },
    ],
  },
  {
    group: '투구·구속',
    items: [
      {
        q: '구속 측정은 어떻게 하나요?',
        a: '아이폰 앱에서 투구 탭의 구속 측정 단추로 열어요(투구 첫 설정을 마친 뒤). 안내대로 폰을 세워 두면 공이 지나가는 것을 카메라가 알아채 재요. 처음 한 번은 거리 설정이 필요해요.',
      },
      {
        q: '구속이 실제보다 낮게(높게) 나와요.',
        a: '폰과 공이 지나가는 선 사이의 거리가 설정과 다르면 값이 틀어져요. 설정의 거리를 다시 재 보세요. 삼각대에 두고 재면 가장 정확해요.',
      },
      {
        q: '부하 지수는 무엇인가요?',
        a: '최근 7일의 부하(투구수 × 체감 강도)를 최근 4주의 주당 평균과 견준 값이에요. 1.3 을 넘으면 평소보다 빠르게 늘고 있다는 뜻이라 조심해야 해요.',
      },
    ],
  },
  {
    group: '트레이닝',
    items: [
      {
        q: '오늘 운동이 왜 이렇게 나왔나요?',
        a: '그날 체크인(컨디션 · 통증 · 잠)과 최근 투구량을 보고 짜요. 통증이 있는 부위의 무거운 운동은 빼고, 던진 다음 날은 회복 쪽으로 기울어요.',
      },
    ],
  },
  {
    group: '계정·기록',
    items: [
      {
        q: '비밀번호를 잊었어요.',
        a: `로그인 화면의 '비밀번호를 잊었어요'에서 메일을 보낼 수 있어요. 가입한 이메일 주소와 겪는 문제를 ${CONTACT}에 알려 주세요. 앱에서 직접 비밀번호를 재설정하는 기능은 아직 없어요.`,
      },
      {
        q: '내 기록은 어디에 저장되나요?',
        a: '서버에 저장되고 본인만 볼 수 있어요. 올린 영상도 본인 폴더에만 있어요. 탈퇴하면 기록 · 영상이 함께 지워져요.',
      },
      {
        q: '탈퇴하고 싶어요.',
        a: '내 정보 → 계정 → 회원 탈퇴에서 진행할 수 있어요. 지운 기록은 되돌릴 수 없어요.',
      },
    ],
  },
];

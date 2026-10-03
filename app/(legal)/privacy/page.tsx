import type { Metadata } from 'next';
import { PrivacyContent } from './privacy-content';

export const metadata: Metadata = {
  title: '개인정보 처리방침 — Bullpen Log',
  description: 'Bullpen Log가 어떤 정보를 받아 어떻게 쓰는지 적어 둔 문서입니다.',
};

/*
 * 글은 따로 둔 파일에 있다 — 가입 화면이 같은 글을 창으로 띄운다(app/login/auth-form.tsx,
 * 2026-10-03). 아이폰 앱에서 새 탭 링크는 사파리로 넘어가 가입하던 것을 두고 나가야 했다.
 */
export default function PrivacyPage() {
  return <PrivacyContent />;
}

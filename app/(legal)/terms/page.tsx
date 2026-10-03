import type { Metadata } from 'next';
import { TermsContent } from './terms-content';

export const metadata: Metadata = {
  title: '이용약관 — Bullpen Log',
  description: 'Bullpen Log 서비스 이용약관입니다.',
};

/*
 * 글은 따로 둔 파일에 있다 — 가입 화면이 같은 글을 창으로 띄운다(app/login/auth-form.tsx,
 * 2026-10-03). 아이폰 앱에서 새 탭 링크는 사파리로 넘어가 가입하던 것을 두고 나가야 했다.
 */
export default function TermsPage() {
  return <TermsContent />;
}

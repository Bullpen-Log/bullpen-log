'use client';

import dynamic from 'next/dynamic';
import { Modal } from '@/components/modal';

/*
 * 약관 · 개인정보 글을 창으로 — 약관 화면(app/(legal))과 같은 글이다(2026-10-03 가입, 2026-10-04 설정 › 정보).
 *
 * 예전에는 새 탭 링크(target="_blank")였다. 아이폰 앱은 새 탭 링크를 사파리로 넘겨서, 가입하던 사람이 앱 밖으로
 * 튕겨 나갔다. 설정의 줄은 약관 화면으로 넘어가 웹 문서 머리(로고 · 바닥글)가 떴다. 창으로 띄우면 앱 안에 머문다.
 * 글은 창을 처음 열 때 받는다 — 여는 화면을 무겁게 하지 않게.
 */
const TermsContent = dynamic(
  () => import('@/app/(legal)/terms/terms-content').then((m) => m.TermsContent),
  { loading: () => <p className="py-8 text-center text-sm text-muted">불러오는 중…</p> }
);
const PrivacyContent = dynamic(
  () => import('@/app/(legal)/privacy/privacy-content').then((m) => m.PrivacyContent),
  { loading: () => <p className="py-8 text-center text-sm text-muted">불러오는 중…</p> }
);

export type LegalDoc = 'terms' | 'privacy';

export const LEGAL_TITLE: Record<LegalDoc, string> = {
  terms: '이용약관',
  privacy: '개인정보 처리방침',
};

/** 새 탭으로 열려는 누름인가(⌘ · Ctrl · 가운데 단추) — 그건 브라우저에 맡긴다(PC) */
export function wantsNewTab(e: React.MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1;
}

export function LegalSheet({
  doc,
  open,
  origin,
  onClose,
  onSwitch,
}: {
  doc: LegalDoc | null;
  open: boolean;
  origin: { x: number; y: number } | null;
  onClose: () => void;
  onSwitch: (doc: LegalDoc) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={doc ? LEGAL_TITLE[doc] : ''} origin={origin}>
      {/*
        글 끝의 '개인정보 처리방침 · 이용약관' 링크는 페이지로 넘어가지 않고 창 안에서 바꿔 보인다 —
        넘어가면 적던 가입 칸이 사라지고, 앱 안에서 웹 문서 화면이 뜬다.
      */}
      <div
        onClickCapture={(e) => {
          const a = (e.target as Element).closest('a');
          const path = a?.getAttribute('href');
          if (path !== '/terms' && path !== '/privacy') return;
          if (wantsNewTab(e)) return;
          e.preventDefault();
          onSwitch(path.slice(1) as LegalDoc);
        }}
      >
        {doc === 'terms' ? <TermsContent /> : doc === 'privacy' ? <PrivacyContent /> : null}
      </div>
    </Modal>
  );
}

'use client';

import { Component, type ReactNode } from 'react';

/**
 * 창 본문이 잘못되면 그 창 안에서만 알린다 — 화면 전체로 번지지 않게.
 *
 * '자세히 보기' 창(app/(app)/training/armcare-info.tsx)과 부위 창(components/body-parts.tsx)의
 * 본문은 창을 처음 열 때 받는다(next/dynamic). 신호가 약하거나 새로 배포돼 옛 파일이
 * 사라지면 받기가 실패하는데, 막는 곳이 없어 오류가 화면 전체의 오류 화면
 * (app/(app)/error.tsx)까지 올라갔다 — 만들던 내 루틴의 이름·운동까지 사라졌다(2026-09-27 검토).
 *
 * 한 번 받기에 실패한 파일은 새로고침 전까지 다시 받지 않는다(Turbopack 이 실패를 기억한다).
 * 그래서 '다시 시도' 대신 새로고침을 권한다. 창을 닫았다 다시 열면(resetKey) 한 번 더 그려 본다.
 */
export class ModalBodyBoundary extends Component<
  { resetKey: unknown; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[창 본문 오류]', error);
  }

  componentDidUpdate(prev: { resetKey: unknown }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="space-y-3 rounded-2xl bg-surface-2 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-ink">창을 불러오지 못했어요</p>
        {/* '새로고침'은 웹 브라우저의 말이라 '다시 불러오기'로(2026-10-04) — 하는 일은 같다(화면을 다시 연다) */}
        <p className="text-xs leading-relaxed break-keep text-muted">
          인터넷 연결을 확인한 뒤 다시 불러와 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-sm font-semibold text-ink transition-colors desk:min-h-0 desk:rounded-xl desk:border desk:border-line-strong desk:bg-transparent desk:px-4 desk:py-2 desk:hover:border-sky desk:hover:text-sky"
        >
          다시 불러오기
        </button>
      </div>
    );
  }
}

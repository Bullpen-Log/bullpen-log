'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { RoundBell } from '@/components/round-icon';
import { Modal } from '@/components/modal';
import { SettingsPanel } from '@/components/settings-panel';
import { SettingsCog } from '@/components/app-shell/glyphs';
import { NotificationList, useUnreadNotifications } from '@/components/notification-list';

/**
 * 덕아웃 위 막대 오른쪽의 알림 · 설정(2026-10-22 금윤호: "덕아웃의 알림은 따로 이동하는 게 아니라 알림 아이콘 밑에 팝업으로 — 싱커의 알림이랑 비슷하게",
 * "덕아웃 메인화면 우측 상단에 설정도"). 알림 창 안은 싱커 종과 같은 목록(components/notification-list.tsx), 설정은 싱커와 같은 설정 창.
 */
export function DugoutBell({ initial = 0, large = false }: { initial?: number; /** 첫 화면(구글식 홈) 모서리 — 48px */ large?: boolean }) {
  const [open, setOpen] = useState(false);
  const count = useUnreadNotifications(initial);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /* 바깥을 누르거나 Esc 면 닫는다 — 닫히면 초점을 종으로 */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={count > 0 ? `알림, 안 읽은 알림 ${count}개` : '알림'}
        title="알림"
        data-bar-tool
        className={`relative flex ${large ? 'h-12 w-12' : 'h-10 w-10'} items-center justify-center rounded-full transition-colors duration-75 ${
          open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
        }`}
      >
        <RoundBell aria-hidden className={large ? 'h-6 w-6' : 'h-5 w-5'} {...({ filled: open } as object)} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface"
          />
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-no-ptr
          role="dialog"
          aria-label="알림"
          className="motion-safe:animate-fade-in absolute top-full right-0 z-50 mt-2 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-3 text-ink shadow-lg"
        >
          <NotificationList onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function DugoutSettings() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsCog open={open} onOpen={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="설정" look="folder">
        <SettingsPanel />
      </Modal>
    </>
  );
}

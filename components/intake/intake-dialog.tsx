'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@/components/icon';
import { PagedContent } from './paged-content';
import styles from './experience.module.css';

/** 접수 안의 도움말도 한 화면. 긴 내용은 다음/이전 내용으로 읽는다. */
export function IntakeDialog({
  open,
  onClose,
  title,
  children,
  fill = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  fill?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const before = document.activeElement;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
    return () => {
      if (el.open) el.close();
      if (before instanceof HTMLElement && before.isConnected)
        before.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      {open && (
        <div className={styles.dialogBody}>
          <header className={styles.dialogHeader}>
            <h2>{title}</h2>
            <button type="button" aria-label="닫기" onClick={onClose}>
              <X aria-hidden className="h-5 w-5" />
            </button>
          </header>
          {fill ? (
            <div className={styles.dialogFill}>{children}</div>
          ) : (
            <PagedContent className={styles.dialogText} resetKey={title}>
              {children}
            </PagedContent>
          )}
        </div>
      )}
    </dialog>
  );
}

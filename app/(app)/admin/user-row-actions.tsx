'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { deleteUser, toggleUserRole, type AdminState } from '@/app/actions/admin';
import { guardFormAction } from '@/lib/action-offline';
import { ConfirmDialog } from '@/components/confirm-delete';

/** 묻는 창에 띄울 것 — 제목 · 무엇이 바뀌는지 · 확인 단추 글 */
type Ask = { title: string; detail: string; confirmLabel: string };

function ActionButton({
  label,
  title,
  children,
  danger,
  ask,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
  ask: Ask;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  /*
   * 되돌릴 수 없는 동작은 한 번 더 확인받는다. 예전에는 window.confirm 이었는데, 아이폰 앱에서는 영어
   * 'Cancel/OK' 시스템 창이 떴다(2026-10-03) — 앱의 묻는 창(ConfirmDialog)으로 묻고, 확인하면 이 폼을 보낸다.
   */
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        title={title}
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 desk:min-h-0 ${
          danger
            ? 'border-line text-muted hover:border-danger hover:bg-danger-bg hover:text-danger'
            : 'border-line text-muted hover:border-sky hover:text-sky'
        }`}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          buttonRef.current?.form?.requestSubmit();
        }}
        title={ask.title}
        detail={ask.detail}
        confirmLabel={ask.confirmLabel}
        pending={pending}
      />
    </>
  );
}

export function RoleToggle({
  userId,
  nickname,
  isAdmin,
  disabled,
}: {
  userId: string;
  nickname: string;
  isAdmin: boolean;
  disabled: boolean;
}) {
  const [, formAction] = useActionState<AdminState, FormData>(
    guardFormAction(toggleUserRole),
    undefined
  );

  if (disabled) {
    return <span className="text-xs text-muted/50">본인</span>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <ActionButton
        label={isAdmin ? `${nickname} 관리자 해제` : `${nickname} 관리자 지정`}
        title={isAdmin ? '관리자 권한 해제' : '관리자로 지정'}
        ask={
          isAdmin
            ? {
                title: `${nickname}님의 관리자 권한을 해제할까요?`,
                detail: '해제하면 관리자 메뉴를 더는 쓸 수 없어요.',
                confirmLabel: '해제하기',
              }
            : {
                title: `${nickname}님에게 관리자 권한을 줄까요?`,
                detail: '영상 등록과 회원 관리를 할 수 있게 돼요.',
                confirmLabel: '관리자로 지정',
              }
        }
      >
        {isAdmin ? (
          <>
            <ShieldOff className="h-3.5 w-3.5" />
            해제
          </>
        ) : (
          <>
            <ShieldCheck className="h-3.5 w-3.5" />
            관리자로
          </>
        )}
      </ActionButton>
    </form>
  );
}

export function DeleteUser({
  userId,
  nickname,
  disabled,
}: {
  userId: string;
  nickname: string;
  disabled: boolean;
}) {
  const [, formAction] = useActionState<AdminState, FormData>(
    guardFormAction(deleteUser),
    undefined
  );

  if (disabled) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <ActionButton
        label={`${nickname} 삭제`}
        title="회원 삭제"
        danger
        ask={{
          title: `${nickname}님을 삭제할까요?`,
          detail: '이 회원의 투구 기록과 게시글도 함께 지워지고 되돌릴 수 없어요.',
          confirmLabel: '삭제하기',
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </ActionButton>
    </form>
  );
}

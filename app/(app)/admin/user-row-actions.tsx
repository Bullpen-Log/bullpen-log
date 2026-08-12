'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { deleteUser, toggleUserRole, type AdminState } from '@/app/actions/admin';

function ActionButton({
  label,
  title,
  children,
  danger,
  confirmMessage,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={label}
      onClick={(e) => {
        // 되돌릴 수 없는 동작은 한 번 더 확인받는다.
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 ${
        danger
          ? 'border-line text-muted hover:border-danger hover:bg-danger-bg hover:text-danger'
          : 'border-line text-muted hover:border-sky hover:text-sky'
      }`}
    >
      {children}
    </button>
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
    toggleUserRole,
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
        confirmMessage={
          isAdmin
            ? `${nickname}님의 관리자 권한을 해제할까요?`
            : `${nickname}님에게 관리자 권한을 줄까요?\n영상 등록과 회원 관리가 가능해집니다.`
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
    deleteUser,
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
        confirmMessage={`${nickname}님을 삭제할까요?\n\n이 회원의 투구 기록과 게시글도 함께 삭제되며 되돌릴 수 없습니다.`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </ActionButton>
    </form>
  );
}

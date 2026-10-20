'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { KeyRound, Trash2 } from '@/components/icon';
import { ROLE_LABEL, type Role } from '@/lib/permissions';
import { deleteUser, resetUserPassword, toggleUserRole, type AdminState } from '@/app/actions/admin';
import { guardFormAction } from '@/lib/action-offline';
import { ConfirmDialog } from '@/components/confirm-delete';
import { toast } from '@/components/toast';
import { Modal } from '@/components/modal';

/* 실패(신호 끊김 · 이미 지워진 회원)를 한 줄로 알린다 — 예전엔 state 를 버려 창만 닫히고 아무 말이 없었다(2026-10-18) */
function useErrorToast(state: AdminState) {
  useEffect(() => {
    if (state?.error) toast(state.error, 'error');
  }, [state]);
}

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

const ROLES: Role[] = ['USER', 'MANAGER', 'ADMIN'];
const ROLE_DETAIL: Record<Role, string> = {
  USER: '관리자 메뉴를 더는 쓸 수 없어요.',
  MANAGER: '영상 촬영 · 구속 측정 관리자 · 세션 녹화 · ABS 만 쓸 수 있어요. 회원 · 공지 · 라이브러리 고치기는 못 해요.',
  ADMIN: '회원 관리 · 역할 바꾸기까지 모든 관리자 기능을 쓸 수 있어요.',
};

/** 역할 고르개(일반 · 준관리자 · 대표관리자, 2026-10-20) — 고르면 한 번 묻고 바꾼다. 대표관리자만 이 화면을 본다 */
export function RolePicker({
  userId,
  nickname,
  role,
  disabled,
}: {
  userId: string;
  nickname: string;
  role: Role;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(guardFormAction(toggleUserRole), undefined);
  useErrorToast(state);
  const formRef = useRef<HTMLFormElement>(null);
  const [ask, setAsk] = useState<Role | null>(null);

  if (disabled) {
    return <span className="text-xs text-muted/50">본인</span>;
  }

  return (
    <form ref={formRef} action={formAction} className="flex items-center">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={ask ?? role} />
      <div role="radiogroup" aria-label={`${nickname} 역할`} className="flex rounded-lg border border-line p-0.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={r === role}
            onClick={() => r !== role && setAsk(r)}
            className={`min-h-10 rounded-md px-2.5 text-xs transition-colors desk:min-h-0 desk:py-1 ${
              r === role ? 'bg-sky-tint font-bold text-sky' : 'text-muted hover:text-ink'
            }`}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={ask != null}
        onClose={() => setAsk(null)}
        onConfirm={() => {
          formRef.current?.requestSubmit();
          setTimeout(() => setAsk(null), 0);
        }}
        title={ask ? `${nickname}님을 ${ROLE_LABEL[ask]}로 바꿀까요?` : ''}
        detail={ask ? ROLE_DETAIL[ask] : ''}
        confirmLabel="바꾸기"
        pending={false}
      />
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
  const [state, formAction] = useActionState<AdminState, FormData>(
    guardFormAction(deleteUser),
    undefined
  );
  useErrorToast(state);

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

/**
 * 임시 비밀번호 만들기 — 비밀번호를 잊은 회원(메일 보내는 길이 없음)에게 관리자가 새 비밀번호를 전한다. 만든 비밀번호는 이 창에서 한 번만
 * 보이고 어디에도 남지 않는다. 창을 닫으면 다시 못 본다(다시 만들면 새 것).
 */
export function TempPassword({
  userId,
  nickname,
  disabled,
}: {
  userId: string;
  nickname: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(guardFormAction(resetUserPassword), undefined);
  useErrorToast(state);
  /* 돌려받은 비밀번호를 창에 띄울지 — 닫으면 다시 안 띄운다(같은 state 를 또 보이지 않게 그 값을 쥔다) */
  const [shownFor, setShownFor] = useState<string | null>(null);
  const temp = state?.tempPassword ?? null;

  if (disabled) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <ActionButton
        label={`${nickname} 임시 비밀번호 만들기`}
        title="임시 비밀번호 만들기"
        ask={{
          title: `${nickname}님의 임시 비밀번호를 만들까요?`,
          detail: '지금 비밀번호는 더 쓸 수 없고 모든 기기의 로그인이 풀려요. 만든 비밀번호는 한 번만 보여요.',
          confirmLabel: '만들기',
        }}
      >
        <KeyRound className="h-3.5 w-3.5" />
      </ActionButton>
      <Modal
        open={temp != null && shownFor !== temp}
        onClose={() => setShownFor(temp)}
        title="임시 비밀번호"
        description={`${nickname}님에게 전해 주세요. 로그인한 뒤 내 정보에서 바꾸게 알려 주세요.`}
      >
        <p className="selectable select-all rounded-lg bg-surface-2 px-4 py-3 text-center font-mono text-xl tracking-wider text-ink">
          {temp}
        </p>
        <p className="mt-3 text-xs text-muted">이 창을 닫으면 다시 볼 수 없어요.</p>
        <button
          type="button"
          onClick={() => {
            if (temp) navigator.clipboard?.writeText(temp).then(() => toast('복사했어요'), () => {});
          }}
          className="mt-4 min-h-11 w-full rounded-lg border border-line text-sm text-ink hover:border-sky hover:text-sky"
        >
          복사하기
        </button>
      </Modal>
    </form>
  );
}

'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/modal';

/**
 * 지우기 전에 한 번 묻는 창.
 *
 * 점검에서 나온 것이다. 투구 기록의 휴지통은 수정(연필) 바로 옆에 있는데,
 * 한 번 누르면 기록과 올려둔 영상이 저장소에서 영구히 사라졌다. 게시글도,
 * 라이브러리의 운동과 드릴도 마찬가지였다. 앱에서 묻는 곳은 관리자의 회원
 * 삭제 딱 한 군데였다.
 *
 * 무엇이 사라지는지 이름을 대고 묻는다. "정말 삭제하시겠습니까?"는 아무것도
 * 알려주지 않는다 — 무엇을, 무엇까지, 되돌릴 수 있는지가 필요하다.
 *
 * 창은 앱이 이미 쓰는 것을 그대로 쓴다. window.confirm 은 브라우저마다 생김새가
 * 다르고 폰에서는 시스템 창이 떠서, 앱 안에서 벌어지는 일처럼 안 보인다.
 */

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  detail,
  confirmLabel,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  pending: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-ink">{detail}</div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-xl border border-danger-line bg-danger-bg px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/70 disabled:opacity-50"
          >
            {pending ? '지우는 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Ask = {
  /** 창 제목 — "이 기록을 지울까요?" */
  title: string;
  /** 무엇이 사라지는지. 되돌릴 수 없다는 말도 여기 적는다. */
  detail: ReactNode;
  /** 지우기 버튼에 적는 말. 기본은 '지우기' */
  confirmLabel?: string;
  /** 누르는 자리의 생김새 — 보통 휴지통 아이콘 */
  children: ReactNode;
  className?: string;
  /** 화면 낭독기가 읽을 말 — "8월 28일 기록 삭제" */
  ariaLabel: string;
};

/** 직접 지우는 경우. 확인을 받으면 onConfirm 을 부른다. */
export function ConfirmDelete({
  onConfirm,
  title,
  detail,
  confirmLabel = '지우기',
  children,
  className,
  ariaLabel,
}: Ask & { onConfirm: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            await onConfirm();
            setOpen(false);
          } finally {
            setPending(false);
          }
        }}
        title={title}
        detail={detail}
        confirmLabel={confirmLabel}
        pending={pending}
      />
    </>
  );
}

/**
 * 서버 동작(form action)으로 지우는 경우.
 *
 * 폼을 여기서 그리고, 확인을 받으면 그 폼을 보낸다. 버튼을 곧바로 submit 으로
 * 두면 확인 창이 뜨기 전에 이미 지워진다.
 */
export function ConfirmDeleteForm({
  action,
  hidden,
  title,
  detail,
  confirmLabel = '지우기',
  children,
  className,
  ariaLabel,
}: Ask & {
  action: (formData: FormData) => void | Promise<void>;
  /** 폼에 함께 실어 보낼 값 — 보통 { id } */
  hidden: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <form ref={formRef} action={action}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={ariaLabel}
          className={className}
        >
          {children}
        </button>
      </form>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={title}
        detail={detail}
        confirmLabel={confirmLabel}
        pending={false}
      />
    </>
  );
}

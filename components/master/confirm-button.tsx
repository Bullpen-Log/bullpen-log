'use client';

import type { ReactNode } from 'react';
import { SafeForm } from '@/components/safe-form';
import { Button } from '@/components/ui';

/**
 * 한 번 묻고 보내는 단추 — 구성원 내보내기 · 초대 코드 지우기. 숨은 칸들을 품은 SafeForm(신호 끊김에 안전) 안의 단추가
 * 확인을 받은 뒤에만 폼을 보낸다.
 */
export function ConfirmButton({
  action,
  fields,
  message,
  doneToast,
  variant = 'ghost',
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  fields: Record<string, string>;
  message: string;
  doneToast?: string;
  variant?: 'ghost' | 'danger' | 'secondary';
  children: ReactNode;
}) {
  return (
    <SafeForm action={action} doneToast={doneToast} className="inline-block">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={(e) => {
          if (window.confirm(message)) e.currentTarget.form?.requestSubmit();
        }}
      >
        {children}
      </Button>
    </SafeForm>
  );
}

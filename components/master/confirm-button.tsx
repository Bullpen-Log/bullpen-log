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
  ask,
}: {
  action: (formData: FormData) => Promise<unknown>;
  fields: Record<string, string>;
  message: string;
  doneToast?: string;
  variant?: 'ghost' | 'danger' | 'secondary';
  children: ReactNode;
  /** 확인 뒤 한 번 더 묻고 그 답을 숨은 칸 name 에 yes · no 로 싣는다(일정 지우기의 '수행일지도 빼기') */
  ask?: { name: string; message: string; yes: string; no: string };
}) {
  return (
    <SafeForm action={action} doneToast={doneToast} className="inline-block">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {ask ? <input type="hidden" name={ask.name} defaultValue={ask.no} /> : null}
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={(e) => {
          const form = e.currentTarget.form;
          if (!form || !window.confirm(message)) return;
          if (ask) {
            const field = form.elements.namedItem(ask.name);
            if (field instanceof HTMLInputElement) field.value = window.confirm(ask.message) ? ask.yes : ask.no;
          }
          form.requestSubmit();
        }}
      >
        {children}
      </Button>
    </SafeForm>
  );
}

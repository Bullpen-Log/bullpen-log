'use client';

import { useState, type ReactNode } from 'react';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { toast } from '@/components/toast';

/** 서버에 닿지 못했다는 표시 — 액션이 돌려줄 수 있는 어떤 값과도 겹치지 않는다 */
const OFFLINE = Symbol('offline');

/**
 * 서버 동작(form action)을 보내는 폼 — 신호가 끊겨 보내기가 던지면 오류 화면 대신 폼 밑에 한 줄로 알린다.
 *
 * `<form action={서버 동작}>` 은 보내기가 던지면 가장 가까운 오류 화면으로 넘어가, 체육관처럼 신호가 약한 곳에서 [운동 시작]
 * · 일정 만들기 · 트레이닝 설정을 누르면 트레이닝 화면이 통째로 '화면을 불러오지 못했습니다'가 됐다. 성공하면 서버 동작이
 * 하던 대로 다른 화면으로 보낸다(redirect 는 그대로 넘긴다 — lib/action-offline.ts). 안의 제출 단추는 useFormStatus 로
 * '보내는 중'을 그대로 알 수 있다.
 */
export function SafeForm({
  action,
  className,
  doneToast,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  className?: string;
  /**
   * 저장이 끝나면 잠깐 띄울 한 줄(components/toast.tsx) — 같은 화면으로 돌아오는 저장(설정의 경력 · 장비)은 화면이
   * 그대로라 된 건지 몰랐다. 서버 동작이 redirect 로 끝나면 그 신호(던짐)가 곧 성공이다 — orOffline 이 넘기는 던짐은
   * Next 의 신호(redirect · notFound)뿐이다.
   */
  doneToast?: string;
  children: ReactNode;
}) {
  const [error, setError] = useState<string>();
  return (
    <form
      className={className}
      action={async (formData) => {
        setError(undefined);
        let result: unknown;
        try {
          result = await orOffline(action(formData), OFFLINE);
        } catch (signal) {
          if (doneToast) toast(doneToast);
          throw signal;
        }
        if (result === OFFLINE) setError(OFFLINE_MESSAGE);
        else if (doneToast) toast(doneToast);
      }}
    >
      {children}
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

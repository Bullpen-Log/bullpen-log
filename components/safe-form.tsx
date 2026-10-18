'use client';

import { useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
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
          /*
           * 다른 화면으로 보내는 redirect 만 성공이다 — 로그인이 풀려 /login 으로 가거나 notFound 면 저장되지 않았다. 예전엔 그때도
           * '저장했어요'가 떴다(2026-10-18). 신호 글: 'NEXT_REDIRECT;<type>;<url>;<status>;'(app/api/rpc 와 같은 읽기)
           */
          const digest = (signal as { digest?: unknown } | null)?.digest;
          const to = typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;') ? digest.split(';')[2] : null;
          if (doneToast && to != null && !to.startsWith('/login')) toast(doneToast);
          throw signal;
        }
        if (result === OFFLINE) setError(OFFLINE_MESSAGE);
        else if (doneToast) toast(doneToast);
      }}
    >
      <WhileSending>{children}</WhileSending>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * 보내는 동안 안의 단추 · 칸을 잠근다 — 신호가 약하면 [운동 시작]이 몇 초 동안 반응이 없어 여러 번 눌렸고, 누를 때마다 서버
 * 동작이 따로 돌았다(2026-10-16). fieldset 의 disabled 가 안의 모든 단추를 한 번에 막는다(display: contents 라 모양은 그대로).
 */
function WhileSending({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset
      disabled={pending}
      aria-busy={pending || undefined}
      className="contents [&:disabled_button]:opacity-60"
    >
      {children}
    </fieldset>
  );
}

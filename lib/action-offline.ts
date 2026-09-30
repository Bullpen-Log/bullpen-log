import { unstable_rethrow } from 'next/navigation';
import { keepInput, type FormValues } from '@/lib/form-values';

/** 신호가 끊겨 서버에 닿지 못했을 때 보이는 말 */
export const OFFLINE_MESSAGE = '인터넷 연결을 확인한 뒤 다시 해 주세요.';

/**
 * 서버 액션 부르기가 던지면(신호 끊김 · 배포로 서버가 바뀐 순간처럼 요청 자체가 실패) 실패 결과로 바꾼다.
 *
 * 전환(startTransition) · useActionState 안에서 던진 오류는 가장 가까운 오류 화면(error.tsx)으로 올라가, 화면이 통째로
 * 바뀌고 적던 것도 사라졌다 — 체육관처럼 신호가 약한 곳에서 흔하다. 이것으로 감싸면 폼 · 단추가 실패를 한 줄로 알리고
 * 그대로 남는다. Next.js 자체 신호(redirect · notFound 등)는 잡지 않고 그대로 넘긴다.
 */
export async function orOffline<T, F>(call: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await call;
  } catch (err) {
    unstable_rethrow(err);
    return fallback;
  }
}

/**
 * useActionState 에 넘길 폼 액션을 신호 끊김에서 지킨다 — 던지면 오류 한 줄과 적은 값(values, 폼이 다시 채운다)을
 * 돌려준다. extra 는 함께 돌려줄 것(가입 폼의 field — 오류를 보일 단계).
 */
export function guardFormAction<
  S extends { error?: string; values?: FormValues } | undefined,
>(
  action: (prev: S, formData: FormData) => Promise<S>,
  extra?: Omit<NonNullable<S>, 'error' | 'values'>
): (prev: S, formData: FormData) => Promise<S> {
  return (prev, formData) =>
    orOffline(action(prev, formData), {
      ...extra,
      error: OFFLINE_MESSAGE,
      values: keepInput(formData),
    } as S);
}

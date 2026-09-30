import { unstable_rethrow } from 'next/navigation';

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

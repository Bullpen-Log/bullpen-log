import { addTransitionType, startTransition } from 'react';
import { QUIET_REFRESH } from '@/lib/transition-types';

/**
 * 화면을 깜빡이지 않고 서버에서 새로 받는다 — router.refresh() 대신 쓴다.
 *
 * router.refresh() 는 전환(transition) 안에서 새 화면을 그린다. 본문을 감싼
 * <ViewTransition name="app-main">(app/(app)/layout.tsx)은 그 전환마다 본문을
 * 페이드시켜서, 자료만 새로 받는데도 본문 전체가 한 번 깜빡였다.
 *
 * 전환에 QUIET_REFRESH 표시를 붙여 부른다. router.refresh 안의 startTransition 은
 * 바깥 전환의 표시를 물려받으므로(React 의 startTransition), 레이아웃이 이 표시를 보고
 * 본문 페이드를 건너뛴다. 탭을 옮길 때의 페이드는 그대로다.
 */
export function quietRefresh(router: { refresh: () => void }) {
  startTransition(() => {
    addTransitionType(QUIET_REFRESH);
    router.refresh();
  });
}

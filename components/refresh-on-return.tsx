'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { quietRefresh } from '@/lib/quiet-refresh';

/** 이만큼 넘게 다른 창에 가 있다 돌아오면 화면을 새로 받는다 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * 오래 가려져 있던 탭으로 돌아오면 화면을 새로 받는다.
 *
 * 앱의 틀(오른쪽 위 막대, 내 사진)은 화면을 옮겨도 다시 그리지 않고 처음 받은 것을
 * 들고 있다. 그래서 휴대폰에서 프로필 사진을 바꾸고 켜 둔 PC 탭으로 돌아오면 옛
 * 사진이 그대로였다 — 게다가 옛 사진 파일은 바꿀 때 지워서, 브라우저가 다시 받으려
 * 하면 빈 그림이 된다. 사진 주소도 한 시간이면 끝나는 임시 주소라, 오래 켜 둔
 * 탭은 주소가 죽는다.
 *
 * 잠깐 다른 창을 봤다 돌아온 것까지 새로 받으면 매번 서버를 부른다. 5분 넘게
 * 가려져 있던 때만 받는다. router.refresh 는 화면에 적어 둔 것(입력 중인 글, 연 창)을
 * 지우지 않고 서버에서 온 부분만 바꾼다.
 */
export function RefreshOnReturn() {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null =
      document.visibilityState === 'hidden' ? Date.now() : null;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= STALE_AFTER_MS) {
        quietRefresh(router);
      }
      hiddenAt = null;
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [router]);

  return null;
}

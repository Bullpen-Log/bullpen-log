'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 운동하는 동안 화면이 꺼지지 않게 잡아 둔다.
 *
 * 세트 사이에 1~3분을 쉬는데 폰은 보통 30초면 잠긴다. 한 세트 할 때마다 폰을
 * 깨워 잠금을 풀어야 하고, 손에 초크나 땀이 묻어 있으면 지문도 잘 안 먹는다.
 * 휴식 시계를 화면에 띄워 둔 것이 이 화면의 핵심인데, 그 시계가 30초마다
 * 사라지면 띄운 뜻이 없다.
 *
 * ■ 화면을 벗어나면 저절로 풀린다
 *
 * 브라우저가 페이지를 가릴 때(다른 앱으로 가거나 잠그면) 잠금을 스스로
 * 놓는다. 그래서 돌아왔을 때 다시 잡아야 하고, 그 일을 visibilitychange 로
 * 한다. 운동 화면을 나가면 useEffect 뒷정리에서 놓는다 — 배터리를 계속 먹게
 * 두지 않는다.
 *
 * ■ 안 되는 기기가 있다
 *
 * iOS 는 16.4 부터, 안드로이드 크롬은 84 부터다. 그보다 낮으면 조용히 아무
 * 일도 안 한다 — 화면 어디에도 경고를 띄우지 않는다. 사용자가 고칠 수 있는
 * 것이 아니고, 원래 하던 대로 폰이 꺼질 뿐이다.
 *
 * 돌려주는 값은 '지금 잡고 있는가'다. 화면에 표시하고 싶을 때만 쓰면 된다.
 */
export function useWakeLock(active = true): boolean {
  const [held, setHeld] = useState(false);
  /* 여러 번 잡지 않게 들고 있는 것을 기억한다 */
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return;

    let done = false;

    const grab = async () => {
      /* 가려진 동안에는 요청 자체가 거절된다. 보일 때만 손을 뻗는다. */
      if (done || lockRef.current || document.visibilityState !== 'visible') return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (done) {
          await lock.release();
          return;
        }
        lockRef.current = lock;
        setHeld(true);
        /* 브라우저가 먼저 놓는 경우 — 손에 든 것을 비워 둬야 다시 잡는다 */
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) {
            lockRef.current = null;
            setHeld(false);
          }
        });
      } catch {
        /* 배터리 절약 모드 같은 이유로 거절될 수 있다. 그냥 안 잡는다. */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void grab();
    };

    void grab();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      const lock = lockRef.current;
      lockRef.current = null;
      setHeld(false);
      void lock?.release().catch(() => {});
    };
  }, [active]);

  return held;
}

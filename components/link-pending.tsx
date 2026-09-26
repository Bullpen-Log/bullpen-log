'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/** 투구 기록 팝업이 떴다는 알림 — DayModal 이 뜰 때 보낸다(announcePopupOpened) */
const POPUP_OPENED = 'bullpen:popup-opened';

export function announcePopupOpened() {
  window.dispatchEvent(new Event(POPUP_OPENED));
}

/**
 * 링크를 누른 뒤 다음 화면이 뜰 때까지 아이콘 자리에서 도는 표시.
 *
 * <Link> 안에 아이콘 대신 넣는다: <LinkPending className="h-4 w-4"><Plus /></LinkPending>.
 * 평소에는 그 아이콘을, 기다리는 동안에는 같은 크기의 도는 동그라미를 그린다 — 눌렀는데
 * 아무 일도 없는 것처럼 보이지 않게.
 *
 * 링크가 알려 주는 '기다리는 중'(useLinkStatus)만으로는 모자라다. 투구 기록 팝업은 주소가
 * 먼저 바뀌고(재 보니 0.1초) 내용이 다 온 뒤에 창이 뜨는데(1초), 링크의 기다림은 주소가
 * 바뀔 때 끝나 버려 그 사이가 비었다. 그래서 누른 순간부터 팝업이 떴다는 알림이 올 때까지
 * 돈다. 끝내 안 뜨면(오류, 다른 화면) 10초 뒤에 멈춘다.
 */
export function LinkPending({
  className = 'h-4 w-4',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  const ref = useRef<HTMLSpanElement>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const link = ref.current?.closest('a');
    if (!link) return;
    const onClick = (e: MouseEvent) => {
      /* 새 탭으로 여는 누름은 이 화면에서 기다릴 것이 없다 */
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      setWaiting(true);
    };
    const done = () => setWaiting(false);
    link.addEventListener('click', onClick);
    window.addEventListener(POPUP_OPENED, done);
    return () => {
      link.removeEventListener('click', onClick);
      window.removeEventListener(POPUP_OPENED, done);
    };
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWaiting(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  return (
    <span ref={ref} className="contents">
      {pending || waiting ? (
        <Loader2 aria-hidden className={`${className} animate-spin`} />
      ) : (
        children
      )}
    </span>
  );
}

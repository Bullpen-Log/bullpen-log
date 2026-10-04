'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { haptic } from '@/lib/haptics';

/**
 * 잠깐 뜨는 알림 — '저장했어요' 같은 한 줄이 화면 위에 1.8초 떴다 사라진다(2026-10-04 '앱 느낌' 3단계).
 *
 * 예전에는 저장하면 폼 맨 위에 하늘색 상자('저장했습니다.')가 생겼다. 단추는 폼 맨 밑이라 상자는 대개 화면 밖이었고,
 * 설정의 경력 · 장비처럼 아무 표시가 없는 곳도 있었다 — 눌렀는데 된 건지 몰랐다. 아이폰 앱처럼 체크 한 줄과 떨림으로 알린다.
 *
 * 어디서든 toast('…') 로 부른다. 뿌리 레이아웃에 <Toaster /> 가 하나 있다 — 화면을 옮겨도(저장 뒤 redirect) 남는다.
 * 창(<dialog>) 안에서 저장해도 보이게 popover(맨 위 칸)로 띄운다. popover 가 없는 옛 사파리(16)는 창 밑에 깔린다.
 */
export type ToastTone = 'success' | 'error';
type ToastItem = { id: number; text: string; tone: ToastTone };

const SHOW_MS = 1800;

let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export function toast(text: string, tone: ToastTone = 'success') {
  current = { id: ++seq, text, tone };
  listeners.forEach((l) => l());
  haptic(tone === 'error' ? 'error' : 'success');
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function Toaster() {
  const item = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !item) return;
    /* 다시 띄우면 맨 위 칸의 맨 위로 — 그새 열린 창보다 위에 선다 */
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    } catch {
      /* popover 가 없는 브라우저 — 그냥 fixed 로 보인다 */
    }
    /* 보이기 전 모양(옅고 위)을 한 번 그리게 한 뒤 표시를 단다 — 같은 순간에 달면 움직임 없이 툭 나타난다 */
    el.getBoundingClientRect();
    el.dataset.show = '';
    const hide = window.setTimeout(() => delete el.dataset.show, SHOW_MS);
    /* 사라지는 움직임(0.15초)이 끝난 뒤 맨 위 칸에서 내린다 — 남아 있으면 그 자리를 못 누른다 */
    const close = window.setTimeout(() => {
      try {
        el.hidePopover();
      } catch {}
    }, SHOW_MS + 200);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(close);
    };
  }, [item]);

  const Icon = item?.tone === 'error' ? CircleAlert : Check;
  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      aria-live="polite"
      data-press-none
      /*
        자리 — 시계 밑, 위 막대 위에 겹쳐 뜬다(아이폰의 알림 배너 자리). popover 의 기본 칸(가운데 · 테두리 · 바탕)은 걷는다.
        보일 때(data-show) 위에서 내려오며 진해지고, 사라질 때는 빠르게 옅어진다.
      */
      className="pointer-events-none fixed inset-x-0 z-100 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-auto m-0 mx-auto flex w-max max-w-[calc(100vw-2rem)] -translate-y-3 items-center gap-2 overflow-visible border-0 bg-transparent p-0 opacity-0 transition-[opacity,translate] duration-150 ease-out data-show:translate-y-0 data-show:opacity-100 data-show:duration-200 motion-reduce:translate-y-0 desk:top-4"
    >
      {item && (
        <span
          key={item.id}
          className="flex min-h-11 items-center gap-2 rounded-full bg-ink/92 py-2.5 pr-5 pl-4 text-sm font-semibold text-page shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] backdrop-blur-md"
        >
          <Icon
            aria-hidden
            className={`h-4.5 w-4.5 shrink-0 ${item.tone === 'error' ? 'text-danger' : 'text-sky-soft'}`}
            strokeWidth={2.6}
          />
          <span className="break-keep">{item.text}</span>
        </span>
      )}
    </div>
  );
}

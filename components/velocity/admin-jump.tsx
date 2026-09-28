'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Wrench, X } from 'lucide-react';
import { VELOCITY_SCREENS } from './session-types';
import type { VelocityScreenKey } from './session-types';

/**
 * 관리자 점프 단추 — 측정 화면(폰 틀) 왼쪽 가장자리에 붙은 작은 손잡이.
 *
 * 누르면 측정 화면 안의 화면 이름 목록(VELOCITY_SCREENS)이 오른쪽으로 펼쳐지고, 하나를 누르면
 * 그리로 옮긴다. 기능을 확인해 보는 관리자용이라 부르는 쪽이 isAdmin 일 때만 그린다 —
 * 일반 계정은 이 부품 자체가 없다.
 *
 * 손잡이(토글)는 접혔을 때나 펼쳤을 때나 같은 단추다 — 펼치면 판의 머리 줄 왼쪽에 X 로 남는다.
 * 그래야 "작은 단추를 다시 누르면 접힌다"가 말 그대로 되고, 키보드 초점도 잃지 않는다.
 * 화면으로 옮기면 접는다(판이 폰 화면 대부분을 덮어 옮긴 화면을 못 본다). 도구는 여러 번 누르는
 * 것(예: 예시 공 넣기)이라 누른 뒤에도 열어 둔다.
 *
 * 자리는 부르는 쪽이 className 으로 준다(예: "absolute left-0 top-1/2 z-30 -translate-y-1/2").
 * 왼쪽 0 은 고정이고 접힘/펼침에 따라 폭만 바뀐다. 판 높이는 70dvh 를 넘지 않고 안에서 굴린다.
 *
 * 색은 bg-ink 대신 bg-black — ink 는 다크 · 네이비 테마에서 밝은 색으로 뒤집혀 흰 글자와 겹친다.
 * 측정 화면의 카메라 위 컨트롤(bg-black/45 · 흰 글자)과 같은 계열이다.
 */

const join = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(' ');

/** 목록 밑 '도구' 묶음의 한 줄 */
export type AdminJumpTool = { label: string; onClick: () => void };

export function AdminJump({
  current,
  onJump,
  tools,
  className,
}: {
  /** 지금 화면 — 목록에서 진하게 · 체크. 어느 화면도 아니면 null */
  current: VelocityScreenKey | null;
  onJump: (key: VelocityScreenKey) => void;
  /** 목록 밑 '도구' 묶음(예: 예시 공 넣기). 없거나 비면 묶음 자체가 없다 */
  tools?: AdminJumpTool[];
  /** 자리 — 부르는 쪽이 absolute 위치를 준다 */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /* 접고 손잡이로 초점을 돌린다 — 목록이 사라지면 그 안에 있던 초점이 body 로 떨어진다 */
  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  /*
   * 바깥을 누르거나 Esc 면 접는다. 판(손잡이 포함) 안은 바깥이 아니다.
   * 바깥을 눌렀을 때는 초점을 돌리지 않는다 — 누른 곳으로 가는 초점을 빼앗지 않게.
   */
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const toolList = tools ?? [];

  return (
    <div ref={rootRef} className={join('flex flex-col items-start', className)}>
      <div
        className={join(
          'origin-left text-white backdrop-blur',
          open
            ? /* 펼침 — 15rem 판, 넘치면 안에서 굴린다 */
              'max-h-[70dvh] w-60 overflow-y-auto overscroll-contain rounded-r-2xl bg-black/90 shadow-xl motion-safe:animate-fade-in'
            : /* 접힘 — 28×40 손잡이, 반투명. 커서를 대거나 초점이 오면 또렷해진다 */
              'h-10 w-7 rounded-r-full bg-black/70 opacity-40 transition-opacity hover:opacity-90 focus-within:opacity-90'
        )}
      >
        {/* 머리 줄 — 손잡이(=토글) · 제목. 접혔을 때는 손잡이만 남는다 */}
        <div className={open ? 'flex items-center gap-1 py-1 pl-1 pr-3' : 'flex'}>
          <button
            ref={toggleRef}
            type="button"
            aria-label="관리자 이동"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => (open ? close() : setOpen(true))}
            className={join(
              'inline-flex shrink-0 items-center justify-center transition-colors',
              open
                ? 'h-10 w-10 rounded-full text-white/80 hover:bg-white/10 hover:text-white'
                : 'h-10 w-7 rounded-r-full'
            )}
          >
            {open ? (
              <X aria-hidden className="h-4 w-4" />
            ) : (
              <Wrench aria-hidden size={14} />
            )}
          </button>
          {open && (
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-white/60">
              관리자 · 화면 이동
            </p>
          )}
        </div>

        {open && (
          <div id={panelId} className="pb-1">
            {/* 화면 목록 — 지금 화면은 체크 · 밝은 바탕 · 진한 글자 */}
            <ul aria-label="화면">
              {VELOCITY_SCREENS.map((s) => {
                const on = s.key === current;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => {
                        onJump(s.key);
                        close();
                      }}
                      className={join(
                        'flex min-h-10 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/10',
                        on && 'bg-white/10'
                      )}
                    >
                      <span className="inline-flex w-4 shrink-0 justify-center">
                        {on && <Check aria-hidden className="h-4 w-4 text-sky" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={join(
                            'block truncate text-sm',
                            on
                              ? 'font-semibold text-white'
                              : 'font-medium text-white/90'
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-xs text-white/55">
                          {s.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {toolList.length > 0 && (
              <>
                <div role="separator" className="mx-3 my-1 border-t border-white/10" />
                <p className="px-4 pb-0.5 pt-1 text-xs font-medium text-white/60">
                  도구
                </p>
                {toolList.map((t, i) => (
                  <button
                    key={`${i}-${t.label}`}
                    type="button"
                    onClick={t.onClick}
                    className="flex min-h-10 w-full items-center px-4 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {t.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

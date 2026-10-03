'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  SlidersHorizontal,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { VELOCITY_SCREENS } from './session-types';
import type { VelocityScreenKey } from './session-types';

/**
 * 관리자 제어 센터 — 측정 화면(폰 틀) 왼쪽 가장자리의 작은 손잡이를 누르면 아이폰 제어 센터처럼 화면 위에 흐린 판이 덮이고
 * 큰 타일 둘이 뜬다(2026-10-03 사용자: "일자로 스크롤하던 것을 제어센터 느낌으로, 관리자 이동과 관리자 설정은 따로").
 *
 *   [화면 이동]   측정 화면 안의 화면들로 곧장(기능을 확인해 보는 관리자용) — 타일 격자, 지금 화면은 흰 타일
 *   [관리자 설정] 관리자만 쓰는 스위치(정확도 보정용 저장 · 엔진 개발용 녹화 …) + 도구(예시 공 넣기 · 지우기)
 *
 * 일반 계정은 이 부품 자체가 없다(부르는 쪽이 isAdmin 일 때만 그린다). 자리는 부르는 쪽이 판 전체를 덮을 수 있는 틀 안에서
 * 준다 — 판은 그 틀의 absolute inset-0 이다. 색은 테마와 상관없이 검정 · 흰색(ink 는 다크 테마에서 뒤집힌다).
 */

const join = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(' ');

/** 도구 한 칸(누를 때마다 하는 일 — 예: 예시 공 넣기). 누른 뒤에도 판을 열어 둔다 */
export type AdminJumpTool = { label: string; onClick: () => void; icon?: LucideIcon };

/** 관리자 설정의 스위치 한 칸 */
export type AdminToggle = {
  key: string;
  label: string;
  /** 켜면 무엇이 되는지 한두 줄 */
  hint: string;
  icon: LucideIcon;
  on: boolean;
  onChange: (next: boolean) => void;
};

type View = 'closed' | 'home' | 'screens' | 'settings';

export function AdminJump({
  current,
  onJump,
  toggles,
  tools,
  className,
}: {
  /** 지금 화면 — 화면 이동에서 흰 타일 · 체크. 어느 화면도 아니면 null */
  current: VelocityScreenKey | null;
  onJump: (key: VelocityScreenKey) => void;
  /** 관리자 설정의 스위치들 */
  toggles?: AdminToggle[];
  /** 관리자 설정 밑 '도구' 묶음. 없거나 비면 묶음 자체가 없다 */
  tools?: AdminJumpTool[];
  /** 손잡이 자리 — 부르는 쪽이 absolute 위치를 준다 */
  className?: string;
}) {
  const [view, setView] = useState<View>('closed');
  const handleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = view !== 'closed';
  const toggleList = toggles ?? [];
  const toolList = tools ?? [];
  const onCount = toggleList.filter((t) => t.on).length;
  const currentLabel = VELOCITY_SCREENS.find((s) => s.key === current)?.label ?? null;

  const close = () => {
    setView('closed');
    handleRef.current?.focus();
  };

  /* Esc — 안쪽 판이면 첫 판으로, 첫 판이면 닫는다 */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setView((v) => (v === 'home' ? 'closed' : 'home'));
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, view]);

  return (
    <>
      {/* 손잡이 — 접힌 28×40, 반투명. 판이 열려 있으면 숨긴다 */}
      {!open && (
        <div className={className}>
          <button
            ref={handleRef}
            type="button"
            aria-label="관리자"
            aria-haspopup="dialog"
            onClick={() => setView('home')}
            className="inline-flex h-10 w-7 items-center justify-center rounded-r-full bg-black/70 text-white opacity-40 backdrop-blur transition-opacity hover:opacity-90 focus-visible:opacity-90"
          >
            <Wrench aria-hidden size={14} />
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="관리자"
          className="absolute inset-0 z-40 flex flex-col bg-black/55 text-white backdrop-blur-xl motion-safe:animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="mx-auto flex w-full max-w-sm flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            {/* 머리 줄 — 안쪽 판이면 ‹ 관리자, 첫 판이면 제목 · 닫기 */}
            <div className="flex h-12 items-center justify-between">
              {view === 'home' ? (
                <p className="text-sm font-semibold text-white/70">관리자</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="-ml-2 inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <ChevronLeft aria-hidden className="h-5 w-5" />
                  관리자
                </button>
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="닫기"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            {view === 'home' && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <BigTile
                  icon={LayoutGrid}
                  title="화면 이동"
                  sub={
                    currentLabel ? `지금 · ${currentLabel}` : '측정 화면 안의 화면들'
                  }
                  row={0}
                  onClick={() => setView('screens')}
                />
                <BigTile
                  icon={SlidersHorizontal}
                  title="관리자 설정"
                  sub={
                    toggleList.length === 0
                      ? '도구'
                      : onCount > 0
                        ? `${onCount}개 켜짐`
                        : '모두 꺼짐'
                  }
                  lit={onCount > 0}
                  row={1}
                  onClick={() => setView('settings')}
                />
              </div>
            )}

            {view === 'screens' && (
              <>
                <h2 className="mt-1 text-xl font-semibold">화면 이동</h2>
                <ul aria-label="화면" className="mt-3 grid grid-cols-2 gap-2">
                  {VELOCITY_SCREENS.map((s, i) => {
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
                          style={{ '--row': i } as CSSProperties}
                          className={join(
                            'flex min-h-16 w-full flex-col justify-center rounded-2xl px-3.5 py-2.5 text-left transition-colors motion-safe:animate-row-in',
                            on
                              ? 'bg-white text-black'
                              : 'bg-white/12 text-white hover:bg-white/20'
                          )}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            {on && (
                              <Check
                                aria-hidden
                                className="h-4 w-4 shrink-0 text-sky"
                              />
                            )}
                            <span className="truncate">{s.label}</span>
                          </span>
                          <span
                            className={join(
                              'mt-0.5 line-clamp-2 text-xs leading-snug',
                              on ? 'text-black/55' : 'text-white/55'
                            )}
                          >
                            {s.hint}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {view === 'settings' && (
              <>
                <h2 className="mt-1 text-xl font-semibold">관리자 설정</h2>
                {toggleList.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {toggleList.map((t, i) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          role="switch"
                          aria-checked={t.on}
                          onClick={() => t.onChange(!t.on)}
                          style={{ '--row': i } as CSSProperties}
                          className={join(
                            'flex min-h-36 flex-col items-start rounded-3xl p-4 text-left transition-colors motion-safe:animate-row-in',
                            t.on
                              ? 'bg-white text-black'
                              : 'bg-white/12 text-white hover:bg-white/20'
                          )}
                        >
                          <span
                            className={join(
                              'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                              t.on ? 'bg-sky text-white' : 'bg-white/20 text-white'
                            )}
                          >
                            <Icon aria-hidden className="h-5 w-5" />
                          </span>
                          <span className="mt-3 text-sm font-semibold leading-tight">
                            {t.label}
                          </span>
                          <span
                            className={join(
                              'text-xs font-medium',
                              t.on ? 'text-sky' : 'text-white/55'
                            )}
                          >
                            {t.on ? '켬' : '끔'}
                          </span>
                          <span
                            className={join(
                              'mt-1.5 text-xs leading-snug',
                              t.on ? 'text-black/55' : 'text-white/55'
                            )}
                          >
                            {t.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {toolList.length > 0 && (
                  <>
                    <p className="mt-5 text-xs font-semibold text-white/60">도구</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {toolList.map((t, i) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={`${i}-${t.label}`}
                            type="button"
                            onClick={t.onClick}
                            className="flex min-h-14 items-center gap-2.5 rounded-2xl bg-white/12 px-3.5 text-left text-sm font-medium text-white transition-colors hover:bg-white/20 active:bg-white/25"
                          >
                            {Icon && (
                              <Icon
                                aria-hidden
                                className="h-4 w-4 shrink-0 text-white/70"
                              />
                            )}
                            <span className="min-w-0 flex-1 leading-snug">
                              {t.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** 첫 판의 큰 타일 — 아이콘 동그라미 · 제목 · 한 줄 · › */
function BigTile({
  icon: Icon,
  title,
  sub,
  lit = false,
  row,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  lit?: boolean;
  row: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ '--row': row } as CSSProperties}
      className="flex aspect-square flex-col justify-between rounded-3xl bg-white/12 p-4 text-left transition-colors hover:bg-white/20 active:bg-white/25 motion-safe:animate-row-in"
    >
      <span className="flex items-start justify-between">
        <span
          className={join(
            'inline-flex h-12 w-12 items-center justify-center rounded-full',
            lit ? 'bg-sky text-white' : 'bg-white/20 text-white'
          )}
        >
          <Icon aria-hidden className="h-6 w-6" />
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 text-white/40" />
      </span>
      <span>
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-white/60">{sub}</span>
      </span>
    </button>
  );
}

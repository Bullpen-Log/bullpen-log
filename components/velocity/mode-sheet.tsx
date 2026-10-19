'use client';

import { Radar, Target } from '@/components/icon';
import { MODES, MODE_YELLOW, type CameraMode } from '@/lib/camera-mode';
import { haptic } from '@/lib/haptics';

const ICON = { radar: Radar, target: Target } as const;

/**
 * 모드 고르기 시트(웹) — 카메라 화면이 열리면 미리보기 위 아래쪽에 뜬다(docs/designs/camera-modes.md 2-1, 앱 native/src/velocity/mode-sheet.tsx 와 같은 모양).
 * 큰 카드 둘(구속 측정 · ABS 판정), 지난 번 모드가 먼저 골라져 있어 한 번 누르면 들어간다. 관리자만 쓰는 모드는 일반 사용자에게 흐리게 '준비 중'.
 */
export function ModeSheet({ value, isAdmin, onPick }: { value: CameraMode; isAdmin: boolean; onPick: (mode: CameraMode) => void }) {
  return (
    <div
      className="absolute inset-x-3 bottom-3 z-20 rounded-[28px] bg-[rgba(20,20,22,0.78)] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_0_0_0.5px_rgba(255,255,255,0.12),0_12px_30px_-8px_rgba(0,0,0,0.6)] backdrop-blur motion-safe:animate-[rise-in_220ms_cubic-bezier(0.2,0.9,0.3,1)]"
      role="radiogroup"
      aria-label="무엇을 할까요?"
    >
      <p className="text-center text-base font-bold">무엇을 할까요?</p>
      <div className="mt-3 flex gap-2.5">
        {MODES.map((m) => {
          const locked = m.adminOnly && !isAdmin;
          const on = m.key === value;
          const Icon = ICON[m.icon];
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked}
              onClick={() => {
                haptic('selection');
                onPick(m.key);
              }}
              className={`flex min-h-[8.25rem] flex-1 flex-col items-start gap-1.5 rounded-[20px] border-[1.5px] p-3.5 text-left transition-[opacity,background-color] active:opacity-85 disabled:opacity-45 ${
                on ? 'border-[#ffd60a] bg-[rgba(255,214,10,0.12)]' : 'border-white/15 bg-white/[0.08]'
              }`}
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-full"
                style={{ backgroundColor: on ? MODE_YELLOW : 'rgba(255,255,255,0.14)', color: on ? '#000' : '#fff' }}
              >
                <Icon aria-hidden className="h-7 w-7" />
              </span>
              <span className="mt-1 text-base font-bold">{m.title}</span>
              <span className="text-footnote leading-snug text-white/70">{locked ? '준비 중이에요' : m.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

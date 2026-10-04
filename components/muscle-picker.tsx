'use client';

import { useState } from 'react';
import { ARMCARE_AREAS, ARMCARE_MUSCLES } from '@/lib/armcare/anatomy';

/**
 * 암케어 운동이 키우는 근육 고르개 — 관리자 운동 등록·수정 폼에서 쓴다.
 *
 * 누른 차례를 지킨다. 맨 앞이 '가장 크게 쓰는 근육'이고 그 근육의 부위가 운동의
 * 주 부위가 된다(lib/armcare/anatomy.ts 의 primaryArea) — 오늘의 암케어가 부위마다
 * 운동을 고를 때 이 값을 본다. 보통의 체크 상자는 목록 차례로 되돌려 보내서
 * 쓸 수 없다. 고른 칩에는 차례 번호를 달아, 무엇이 맨 앞인지 보이게 한다.
 *
 * 폼에는 고른 차례대로 숨은 칸(name="targetMuscles")을 싣는다. 서버는 그 차례를
 * 그대로 받는다(cleanTargetMuscles).
 */
export function MusclePicker({
  name = 'targetMuscles',
  initial = [],
}: {
  name?: string;
  initial?: readonly string[];
}) {
  const [picked, setPicked] = useState<string[]>([...initial]);

  /*
   * 방금 누른 근육 — 그 부위 칩 밑에 무슨 일을 하는 근육인지 한 줄로 보인다(2026-10-03). 예전에는 title(마우스를
   * 올려야 뜨는 말풍선)에만 있어 아이폰에서는 볼 길이 없었다.
   */
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const tapped = ARMCARE_MUSCLES.find((m) => m.name === lastTapped);

  const toggle = (muscle: string) => {
    setLastTapped(muscle);
    setPicked((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    );
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-ink">키우는 근육 (암케어)</legend>
      <p className="text-xs leading-relaxed break-keep text-muted">
        가장 크게 쓰는 근육부터 차례로 누르세요. 1번 근육의 부위가 이 운동의 주 부위가
        돼요.
      </p>
      {picked.map((m) => (
        <input key={m} type="hidden" name={name} value={m} />
      ))}
      <div className="space-y-2.5">
        {ARMCARE_AREAS.map((area) => {
          const muscles = ARMCARE_MUSCLES.filter((m) => m.area === area.key);
          return (
            <div key={area.key} className="space-y-1">
              <p className="text-[11px] font-medium text-muted">{area.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {muscles.map((m) => {
                  const order = picked.indexOf(m.name);
                  const on = order >= 0;
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggle(m.name)}
                      aria-pressed={on}
                      title={m.does}
                      /* 휴대폰은 칩 40px(이 저장소의 칩 규칙) — 26px 라 옆 칩이 잘못 눌렸다. PC 는 예전 크기 */
                      className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors desk:min-h-0 desk:px-2.5 desk:text-xs ${
                        on
                          ? 'border-sky bg-sky-tint text-sky-strong'
                          : 'border-line text-muted hover:border-sky hover:text-sky'
                      }`}
                    >
                      {on && (
                        <span className="text-[10px] font-bold tabular-nums">
                          {order + 1}
                        </span>
                      )}
                      {m.name}
                    </button>
                  );
                })}
              </div>
              {tapped?.area === area.key && (
                <p
                  aria-live="polite"
                  className="text-xs leading-relaxed break-keep text-muted"
                >
                  <span className="font-semibold text-ink">{tapped.name}</span> ·{' '}
                  {tapped.does}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

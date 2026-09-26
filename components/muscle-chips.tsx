'use client';

import { useState } from 'react';
import { areaOfMuscle, helpsLine, muscleInfo } from '@/lib/armcare/anatomy';
import { visibleChips } from '@/lib/armcare/chips';
import { useArmcareInfo } from '@/components/armcare-info-context';

/**
 * 근육 이름 칩 — 암케어 운동이 키우는 근육.
 *
 * 맨 앞(가장 크게 쓰는 근육)만 진하게 칠한다. 주 근육을 가려 보여야 '이 운동은
 * 어디를 위한 것인가'가 한눈에 읽힌다 — 셋을 똑같이 칠하면 T 레이즈가 어깨 뒤
 * 운동인지 날개뼈 운동인지 알 수 없다.
 *
 * 암케어 화면(루틴 · 부위별 보강 · 내 루틴 만들기)과 라이브러리 운동 상세가 함께 쓴다.
 *
 * '자세히 보기' 창이 있는 화면(ArmcareInfoProvider 안)에서는 칩을 누를 수 있다 — 누르면 그
 * 근육의 3D 그림과 설명이 창으로 뜬다(app/(app)/training/armcare-info.tsx). 2026-09-26
 * 사용자분: "운동마다 어느 근육을 쓰는지 글로만 적혀 있고 그림으로 확인할 수 없다 —
 * 키워드를 누르면 그 부위의 그래픽이 보이게". 창이 없는 화면에서는 글자 칩이다.
 */
export function MuscleChips({
  muscles,
  highlight,
  max,
}: {
  muscles: string[];
  /** 이 근육들을 진하게 — 부위별 보강에서 그 부위의 근육을 짚는다. 안 주면 맨 앞만. */
  highlight?: readonly string[];
  /**
   * 이만큼만 보이고 나머지는 '+N' — 운동 줄처럼 좁은 곳에서 칩이 두세 줄로 늘어지지
   * 않게(2026-09-26, 화면의 글 줄이기). 누를 수 있는 칩이면 '+N'을 눌러 다 펼친다.
   *
   * 진하게 칠할 근육(highlight)부터 남긴다(lib/armcare/chips.ts).
   */
  max?: number;
}) {
  const [all, setAll] = useState(false);
  const info = useArmcareInfo();
  if (muscles.length === 0) return null;
  const shown = all ? muscles : visibleChips(muscles, highlight, max);
  const hidden = muscles.filter((m) => !shown.includes(m));
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((m) => {
        const strong = highlight ? highlight.includes(m) : m === muscles[0];
        /* 근육이 속한 부위의 색 점 — 색만 봐도 어디 근육인지 (lib/armcare/anatomy.ts) */
        const color = areaOfMuscle(m)?.color;
        const look = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          strong ? 'bg-sky-tint text-sky-strong' : 'bg-surface-2 text-muted'
        }`;
        const dot = color && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        );
        return info ? (
          <button
            key={m}
            type="button"
            onClick={(e) => info({ kind: 'muscle', name: m }, e)}
            aria-label={`${m} — 위치와 설명 보기`}
            className={`${look} min-h-6 ring-sky transition-shadow hover:ring-1`}
          >
            {dot}
            {m}
            <span aria-hidden className="opacity-60">
              ›
            </span>
          </button>
        ) : (
          <span key={m} title={muscleInfo(m)?.does} className={look}>
            {dot}
            {m}
          </span>
        );
      })}
      {hidden.length > 0 &&
        (info ? (
          <button
            type="button"
            onClick={() => setAll(true)}
            aria-label={`근육 ${hidden.length}개 더 보기`}
            className="min-h-6 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted ring-sky transition-shadow hover:ring-1"
          >
            +{hidden.length}
          </button>
        ) : (
          <span
            title={hidden.join(' · ')}
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
          >
            +{hidden.length}
          </span>
        ))}
    </span>
  );
}

/**
 * 라이브러리 운동 상세의 '키우는 근육' 줄 — 칩과 '→ 예방에 도움' 한 줄.
 *
 * 근육을 안 적은 운동(암케어가 아닌 것 대부분)에는 아무것도 안 그린다.
 */
export function MuscleRow({ muscles }: { muscles: string[] }) {
  if (muscles.length === 0) return null;
  const line = helpsLine(muscles);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted">키우는 근육</p>
      <MuscleChips muscles={muscles} />
      {line && <p className="text-xs leading-relaxed break-keep text-muted">{line}</p>}
    </div>
  );
}

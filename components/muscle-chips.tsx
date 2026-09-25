import { helpsLine, muscleInfo } from '@/lib/armcare/anatomy';

/**
 * 근육 이름 칩 — 암케어 운동이 키우는 근육.
 *
 * 맨 앞(가장 크게 쓰는 근육)만 진하게 칠한다. 주 근육을 가려 보여야 '이 운동은
 * 어디를 위한 것인가'가 한눈에 읽힌다 — 셋을 똑같이 칠하면 T 레이즈가 어깨 뒤
 * 운동인지 날개뼈 운동인지 알 수 없다.
 *
 * 트레이닝의 암케어 화면과 라이브러리 운동 상세가 함께 쓴다.
 */
export function MuscleChips({
  muscles,
  highlight,
}: {
  muscles: string[];
  /** 이 근육들을 진하게 — 부위별 보강에서 그 부위의 근육을 짚는다. 안 주면 맨 앞만. */
  highlight?: readonly string[];
}) {
  if (muscles.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {muscles.map((m, i) => {
        const strong = highlight ? highlight.includes(m) : i === 0;
        return (
          <span
            key={m}
            title={muscleInfo(m)?.does}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              strong ? 'bg-sky-tint text-sky-strong' : 'bg-surface-2 text-muted'
            }`}
          >
            {m}
          </span>
        );
      })}
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

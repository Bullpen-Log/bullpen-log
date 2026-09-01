import { Dumbbell, Flame, Target } from 'lucide-react';

/**
 * 운동 한 줄에 붙는 부가 정보.
 *
 * 예전에는 난이도·부위·장비를 전부 테두리 있는 알약으로 그렸다. 한 줄에
 * 칩이 여섯 개씩 붙으니 제목도 처방도 칩과 같은 무게로 보였고, 목록이
 * 통째로 태그 더미가 됐다.
 *
 * 지금은 강도만 색이 있는 칩으로 남긴다 — 오늘 몸에 무리인지 아닌지를
 * 알려주는 유일한 값이라 눈에 걸려야 한다. 나머지는 가운뎃점으로 이은
 * 흐린 글자 한 줄이다. 정보는 그대로 있고 소리만 줄였다.
 */

/*
 * 강도별 색. 낮을수록 초록, 높을수록 빨강으로 간다.
 *
 * emerald-700 같은 팔레트 색이 아니라 앱 토큰(ok·warn·danger)을 쓴다.
 * 토큰은 다크에서 밝은 쪽으로 뒤집히지만 팔레트 색은 그대로라, 예전에는
 * 다크 화면에서 진한 초록 글자가 진한 배경에 묻혔다.
 * 문자열을 그대로 적어야 Tailwind 가 클래스를 찾아낸다.
 */
const INTENSITY_STYLE: Record<string, string> = {
  '매우 낮음': 'bg-ok/10 text-ok',
  낮음: 'bg-sky/10 text-sky-strong',
  중간: 'bg-warn/12 text-warn',
  높음: 'bg-warn/20 text-warn',
  '매우 높음': 'bg-danger/10 text-danger',
};

const chip =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium';

/** 운동 한 줄의 부가 정보 */
export function ExerciseBadges({
  bodyParts,
  intensity,
  difficulty,
  equipment,
}: {
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
}) {
  // 난이도 · 부위 · 장비를 한 줄로 잇는다. 빈 값은 가운뎃점이 겹치지 않게 걸러낸다.
  const rest = [difficulty, ...bodyParts, ...equipment].filter(Boolean);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`${chip} ${INTENSITY_STYLE[intensity] ?? 'bg-surface-2 text-muted'}`}
        title="운동 강도"
      >
        <Flame aria-hidden className="h-3 w-3" />
        강도 {intensity}
      </span>

      {rest.length > 0 && (
        <span className="text-[11px] leading-none text-muted">{rest.join(' · ')}</span>
      )}
    </span>
  );
}

/**
 * 드릴 한 줄의 부가 정보.
 *
 * 교정 포인트는 드릴을 고르는 기준이라 남겨두고, 장비는 흐린 글자로 뒤에 붙인다.
 */
export function DrillBadges({
  focusPoints,
  equipment,
}: {
  focusPoints: string[];
  equipment: string[];
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {focusPoints.map((point) => (
        <span
          key={point}
          className={`${chip} bg-sky/10 text-sky-strong`}
          title="교정 포인트"
        >
          <Target aria-hidden className="h-3 w-3" />
          {point}
        </span>
      ))}

      {equipment.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] leading-none text-muted">
          <Dumbbell aria-hidden className="h-3 w-3" />
          {equipment.join(' · ')}
        </span>
      )}
    </span>
  );
}

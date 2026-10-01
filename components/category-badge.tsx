import {
  Activity,
  Dumbbell,
  Footprints,
  HeartPulse,
  Leaf,
  Move,
  Shield,
  Target,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
/**
 * 카테고리 배지 — 아이콘과 이름(회색 한 가지).
 *
 * 한때 카테고리마다 색을 하나씩(일곱 가지) 칠했다. 운동 445개가 같은 회색 글자라 설정 화면처럼
 * 보였기 때문인데, 2026-10-01 사용자가 "애플처럼 깔끔하게 · 기본색 하나 + 고른 것만 강조"를 정하며 색을
 * 거뒀다 — 한 화면에 하체 남보라 · 파워 주황 · 암케어 장미가 섞여 정작 고른 것이 안 보였다. 이제는
 * 아이콘이 무엇인지 알려 주고, 색은 고른 것(강조색)에만 쓴다. 카테고리의 색 이름(lib/categories.ts 의
 * tone)은 남겨 두었다 — 다시 쓸 일이 있으면 여기만 고치면 된다.
 */

/**
 * 카테고리 이름 → 아이콘.
 *
 * 뜻이 통하는 것으로 고른다 — 하체는 발자국, 파워는 번개, 회복은 잎.
 * 그림만 봐도 무엇인지 짐작이 가야 색을 붙인 뜻이 있다.
 */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  '하체 스트렝스': Footprints,
  '상체 스트렝스': Dumbbell,
  모빌리티: Waves,
  파워: Zap,
  코어: Shield,
  암케어: HeartPulse,
  '회복 및 보강': Leaf,
  '스로잉 드릴': Target,
  '메디신볼 드릴': Activity,
  '무브먼트 패턴 드릴': Move,
};

/* 모든 카테고리가 같은 회색 — 옅은 회색 바탕(글자색 6%) 위 보조 글자색 */
const NEUTRAL = { text: 'text-muted', chip: 'bg-ink/6 text-muted' };

export function categoryStyle(name: string) {
  return { ...NEUTRAL, Icon: ICON_BY_NAME[name] ?? null };
}

/** 목록 줄에 붙이는 작은 배지 — 아이콘 + 이름 */
export function CategoryBadge({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const { chip, Icon } = categoryStyle(name);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${chip} ${className}`}
    >
      {Icon && <Icon aria-hidden className="h-3 w-3" strokeWidth={2.2} />}
      {name}
    </span>
  );
}

/** 카드 머리에 놓는 둥근 아이콘 한 개 */
export function CategoryIcon({
  name,
  className = 'h-9 w-9',
}: {
  name: string;
  className?: string;
}) {
  const { chip, Icon } = categoryStyle(name);
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl ${chip} ${className}`}
    >
      <Icon className="h-[55%] w-[55%]" strokeWidth={2} />
    </span>
  );
}

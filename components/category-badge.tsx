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
import {
  MECHANICS_CATEGORIES,
  TRAINING_CATEGORIES,
  type CategoryTone,
} from '@/lib/categories';

/**
 * 카테고리 배지 — 색과 아이콘.
 *
 * 예전에는 카테고리가 회색 글자 한 줄이었다. 운동 445개가 전부 같은 모양으로
 * 나오니 목록이 아니라 설정 화면처럼 보였고, 무엇이 하체고 무엇이 암케어인지
 * 글자를 읽어야만 알 수 있었다.
 *
 * 색과 아이콘을 붙이면 읽기 전에 알아본다. 넓은 면을 칠하지 않고 작은 배지에만
 * 쓰므로 일곱 가지 색이어도 어지럽지 않다.
 */

/** 카테고리 이름 → 색 이름. 목록에 없는 이름은 색 없이 그린다. */
const TONE_BY_NAME = new Map<string, CategoryTone>(
  [...TRAINING_CATEGORIES, ...MECHANICS_CATEGORIES].map((c) => [c.name, c.tone])
);

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

/*
 * 색 이름 → 실제 클래스.
 *
 * 표로 만들어 두는 이유가 있다. Tailwind 는 소스에 그대로 적힌 클래스 이름만
 * 찾아 넣으므로, `text-cat-${tone}` 처럼 이어 붙이면 아무 색도 안 나온다.
 */
const TONE_CLASS: Record<CategoryTone, { text: string; chip: string }> = {
  lower: { text: 'text-cat-lower', chip: 'bg-cat-lower/10 text-cat-lower' },
  upper: { text: 'text-cat-upper', chip: 'bg-cat-upper/10 text-cat-upper' },
  mobility: { text: 'text-cat-mobility', chip: 'bg-cat-mobility/10 text-cat-mobility' },
  power: { text: 'text-cat-power', chip: 'bg-cat-power/10 text-cat-power' },
  core: { text: 'text-cat-core', chip: 'bg-cat-core/10 text-cat-core' },
  armcare: { text: 'text-cat-armcare', chip: 'bg-cat-armcare/10 text-cat-armcare' },
  recovery: { text: 'text-cat-recovery', chip: 'bg-cat-recovery/10 text-cat-recovery' },
};

const NEUTRAL = { text: 'text-muted', chip: 'bg-surface-2 text-muted' };

export function categoryStyle(name: string) {
  const tone = TONE_BY_NAME.get(name);
  return {
    ...(tone ? TONE_CLASS[tone] : NEUTRAL),
    Icon: ICON_BY_NAME[name] ?? null,
  };
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

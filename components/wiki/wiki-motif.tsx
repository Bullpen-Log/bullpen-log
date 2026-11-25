import { Baseball, Dumbbell, Gauge, Lightbulb, PersonStanding, Zap } from '@/components/icon';
import type { WikiCategoryId } from '@/lib/wiki';

/**
 * 싱커위키 꾸밈(R1) — 덕아웃 느낌을 조금: 옅은 초록(--color-dugout)과 야구공 실밥 · 공이 날아가는 호.
 * 꾸밈일 뿐 무엇을 잰 그래프가 아니다(값 · 축 · 숫자를 그리지 않는다). 화면 읽기 프로그램에는 숨긴다.
 */

/** 공이 날아가는 호 + 실밥 — 카드 귀퉁이 · 예시 칸 머리에 작게 */
export function BallArc({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 28" aria-hidden className={`shrink-0 text-dugout ${className}`} fill="none">
      <path d="M3 25 C 18 4, 40 2, 52 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 5" opacity="0.55" />
      <circle cx="56" cy="13" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M52.6 9.2c1.4 2.2 1.4 5.4 0 7.6M59.4 9.2c-1.4 2.2-1.4 5.4 0 7.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

const CATEGORY_ICON: Record<WikiCategoryId, typeof Baseball> = {
  'pitching-mechanics': Baseball,
  'training-concepts': Zap,
  'movements-postures': PersonStanding,
  equipment: Dumbbell,
  'records-metrics': Gauge,
  'basic-terms': Lightbulb,
};

/** 묶음 그림 — 옅은 초록 동그라미 안 선 그림 */
export function CategoryBadge({ id, size = 'md' }: { id: WikiCategoryId; size?: 'sm' | 'md' }) {
  const Icon = CATEGORY_ICON[id];
  const box = size === 'sm' ? 'h-7 w-7' : 'h-10 w-10';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span aria-hidden className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-dugout/12 text-dugout`}>
      <Icon className={icon} />
    </span>
  );
}

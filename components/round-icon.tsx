'use client';

import { forwardRef, useId, type SVGProps } from 'react';
import type { LucideIcon } from '@/components/icon';
import { roundIconMarkup, type RoundIconName } from '@/lib/round-icons';

/**
 * 둥근 야구 아이콘(lib/round-icons.ts) — lucide 아이콘 자리에 그대로 들어가게 같은 모양으로 받는다(className · aria-hidden ·
 * strokeWidth 는 무시 — 굵기는 그림이 정한다). filled 면 채움형(지금 고른 하단 탭 등).
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'ref' | 'name'> & { filled?: boolean; size?: number | string; absoluteStrokeWidth?: boolean };

export const RoundIcon = forwardRef<SVGSVGElement, Props & { name: RoundIconName }>(function RoundIcon(
  { name, filled = false, size = 24, ...all },
  ref
) {
  /* lucide 굵기 칸은 버린다 — 굵기는 그림이 정한다 */
  const { strokeWidth, absoluteStrokeWidth, ...rest } = all;
  void strokeWidth;
  void absoluteStrokeWidth;
  const id = `ri${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  /*
   * 네이비 · 다크 테마는 늘 채움형(2026-10-21 금윤호) — 라이트는 테두리형(고른 탭만 채움). 테마는 <html data-theme> 라
   * 두 벌을 그리고 CSS(globals.css .ri-o · .ri-f)가 하나만 보인다. filled 면 채움형 하나만.
   */
  const svg = (fill: boolean, cls: string) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      {...rest}
      className={`${rest.className ?? ''} ${cls}`}
      dangerouslySetInnerHTML={{ __html: roundIconMarkup(name, fill, `${id}${cls}`) }}
    />
  );
  if (filled) return svg(true, '');
  return (
    <>
      {svg(false, 'ri-o')}
      {svg(true, 'ri-f')}
    </>
  );
});

/** 이름을 박은 아이콘 부품 — lucide 아이콘을 받는 자리(NAV_ICONS · 홈 링 · 앱 아이콘 판)에 그대로 넣게 같은 타입으로 내보낸다.
 *  filled 는 타입 밖이라 쓰는 쪽이 { filled: true } 를 덧붙인다 */
function make(name: RoundIconName): LucideIcon {
  const C = forwardRef<SVGSVGElement, Props>(function Named(props, ref) {
    return <RoundIcon ref={ref} name={name} {...props} />;
  });
  C.displayName = `Round(${name})`;
  return Object.assign(C, { round: true }) as unknown as LucideIcon;
}

/** 둥근 아이콘인가 — filled 를 넘겨도 되는지(lucide 에 넘기면 svg 속성으로 새어 경고가 난다) */
export function isRoundIcon(Icon: unknown): boolean {
  return (Icon as { round?: boolean } | null)?.round === true;
}

export const RoundHome = make('home');
export const RoundBaseball = make('baseball');
export const RoundBat = make('bat');
export const RoundCommunity = make('community');
export const RoundMenu = make('menu');
export const RoundBell = make('bell');
export const RoundSettings = make('settings');
export const RoundTraining = make('training');
export const RoundCutlery = make('cutlery');
export const RoundRadar = make('radar');
export const RoundZone = make('zone');
export const RoundPitcher = make('pitcher');
export const RoundSupport = make('support');

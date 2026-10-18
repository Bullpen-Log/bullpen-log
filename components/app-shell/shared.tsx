'use client';

import { type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { NAV_ALSO, NAV_GROUPS, isLockSideHref } from '@/lib/nav';

/* 앱 틀(components/app-shell.tsx)의 부품들이 같이 쓰는 것 — 메뉴 불 판정 · 도크 시간 · 날기 연출 모양. 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/** 메뉴 주소 전부(경로만) — 더 자세한 메뉴가 있는지 볼 때 쓴다 */
const MENU_PATHS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href.split('?')[0]));

/**
 * 현재 위치 판정. 하위 경로도 같은 메뉴로 본다.
 * 단 '/'로 시작하는 다른 메뉴를 잘못 물지 않게 정확히 비교한다.
 *
 * 하위 경로에 더 자세한 메뉴가 따로 있으면 그 메뉴만 켜진다 — 구속 측정 관리자(/admin/velocity)
 * 에서 관리자(/admin)까지 같이 켜져, 사이드바에 불이 두세 개 들어와 있었다.
 */
export function useIsActive() {
  const pathname = usePathname();
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  /*
   * 메뉴 주소에 ?칸이 붙을 수 있다(트레이닝 — lib/training-part.ts) — 경로만 본다.
   * 그 탭에 속하는 다른 주소도 본다(투구 기록 ← 날짜 화면 · 구속 측정 관리자, lib/nav.ts 의 NAV_ALSO).
   * 잠긴 곁 항목(구속 측정 → 투구 기록 설정, lib/nav.ts isLockSideHref)은 켜지 않는다 — 같은 설정 화면은 탭 항목
   * (투구 기록)이 맡는다. 경로만 보면 둘이 같이 켜졌다.
   */
  return (href: string) => {
    if (isLockSideHref(href)) return false;
    const path = href.split('?')[0];
    if ((NAV_ALSO[path] ?? []).some(under)) return true;
    if (!under(path)) return false;
    return !MENU_PATHS.some((p) => p !== path && p.startsWith(`${path}/`) && under(p));
  };
}

/**
 * 격자·도크 위에 커서를 이만큼 두면 판(이름까지 있는 전체 메뉴)이 저절로 열린다.
 *
 * 아이콘만 있는 도크에서 무엇인지 몰라 머뭇거리는 시간이다. 그보다 짧으면 도크를
 * 훑어보는 도중에 열려 버리고, 그보다 길면 기다리다 그냥 누른다.
 */
export const DOCK_HOVER_MS = 5000;

/** 날아가는 것(양쪽에 다 있다)과 제자리에서 돋아나거나 잦아드는 것(한쪽에만 있다) */
export type FlyKind = 'fly' | 'pop';

/**
 * 도크 · 팝업이 설 자리 — 위에서 잰 거리와, 화면 오른쪽 끝에서 잰 거리.
 *   right  격자 단추 한가운데까지(도크는 여기에 가운데를 맞춘다)
 *   edge   막대의 오른쪽 끝까지 = 화면 끝에서 조금 띄운 자리(팝업은 여기에 오른쪽 끝을 맞춘다 — 2026-10-09 사용자:
 *          "오른쪽 끝에 조금 띄운 상태로 붙여줘"). 도크는 격자 밑 가운데라 팝업으로 자라며 오른쪽으로 조금 옮겨 앉는다
 */
export type Anchor = { top: number; right: number; edge: number };

/**
 * 연출에서 움직이는 것에 다는 이름표 — 옛·새 모습을 짝짓는 이름과, 어떻게
 * 움직일지 정하는 딱지. 차례 딱지(dN)는 전체 메뉴에서의 순서다.
 */
export function flyStyle(name: string, index: number, kind: FlyKind): CSSProperties {
  return {
    viewTransitionName: name,
    viewTransitionClass: `nav-${kind} d${index}`,
  } as CSSProperties;
}

/**
 * 판에만 자리가 있는 아이콘(라이브러리·자료실·관리자)의 이름표 — 날아오지 않고
 * 판의 제자리에서 돋아난다. 차례 딱지(gN)는 그것들끼리의 순서라, 날아오는
 * 넷(dN)과 따로 센다 — 판이 거의 다 들어온 뒤에 하나씩 돋게 하려고.
 */
export function growStyle(name: string, order: number): CSSProperties {
  return {
    viewTransitionName: name,
    viewTransitionClass: `nav-grow g${order}`,
  } as CSSProperties;
}

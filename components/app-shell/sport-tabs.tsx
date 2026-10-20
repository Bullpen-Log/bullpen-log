'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { MobileTabs } from './mobile-tabs';
import { sportActiveHref, sportOf, type NavItem, type SportKey } from '@/lib/nav';

/**
 * 휴대폰 하단바 — 투구 · 타격 화면이면 그 종목 바, 아니면 평소 바(2026-10-20 김민 D1, docs/designs/hitting-restructure.md).
 * 어느 바인지는 주소로만 정한다(lib/nav.ts sportOf) — 서버가 그린 첫 화면부터 맞는 바가 선다.
 * 바가 바뀌면 칸 수가 달라져 렌즈 자리 · 길이가 새로 잡힌다(key 로 새로 붙임 — 옛 바의 눌린 칸 기억이 새 바에 남지 않게).
 */
export function SportAwareTabs({
  tabs,
  sportBars,
  defaultSport,
  menuOpen,
  onMenu,
}: {
  tabs: NavItem[];
  /** 잠금을 입힌 종목 바 둘(app/(app)/layout.tsx 가 applyLocks 로) */
  sportBars: Record<SportKey, NavItem[]>;
  /** 그냥 /training 일 때의 종목 — 타자만 하는 사람이면 타격 */
  defaultSport: SportKey;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sport = sportOf(pathname, params, defaultSport);
  if (!sport) {
    return <MobileTabs key="main" tabs={tabs} menuOpen={menuOpen} onMenu={onMenu} />;
  }
  return (
    <MobileTabs
      key={sport}
      tabs={sportBars[sport]}
      menuOpen={false}
      onMenu={onMenu}
      activeOverride={sportActiveHref(sport, pathname, params)}
    />
  );
}

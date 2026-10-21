import { Shield, type LucideIcon } from '@/components/icon';
import type { NavIconName } from '@/lib/nav';
import {
  RoundArmcare,
  RoundBack,
  RoundBaseball,
  RoundBat,
  RoundBook,
  RoundClapper,
  RoundCommunity,
  RoundGauge,
  RoundLog,
  RoundPeople,
  RoundShield,
  RoundVideo,
  RoundCutlery,
  RoundHome,
  RoundMenu,
  RoundPitcher,
  RoundRadar,
  RoundSettings,
  RoundSupport,
  RoundTraining,
  RoundZone,
} from '@/components/round-icon';

/**
 * 메뉴 아이콘 이름 → 그림.
 *
 * lib/nav.ts 는 서버에서도 읽으므로 이름만 들고 있다. 리액트 컴포넌트는
 * 서버에서 화면 쪽으로 건네줄 수 없어서다. 이름을 그림으로 바꾸는 자리를
 * 여기 하나만 둔다 — 사이드바·하단 탭·더보기가 같은 그림을 쓴다.
 */
/**
 * 휴대폰 더보기의 앱 아이콘 판 색 — 위(밝음) → 아래(짙음) 그라데이션 두 색(2026-10-13 김민 "고품질 아이콘").
 * 아이폰 앱처럼 앱마다 한 색. 관리 · 설정은 같은 짙은 회색으로 묶어 눈에 덜 띄게.
 */
export const NAV_TINT: Record<NavIconName, [string, string]> = {
  home: ['#4fc3ff', '#0a7fd6'],
  baseball: ['#ff7a6b', '#e0352b'],
  bat: ['#ff9f6b', '#e0602b'],
  back: ['#6b7180', '#2c313b'],
  heart: ['#ff7aa8', '#d9346b'],
  calendar: ['#4fc3ff', '#0a7fd6'],
  dumbbell: ['#ffb14a', '#f06a0f'],
  utensils: ['#5fe07a', '#1f9e45'],
  radar: ['#8f9bff', '#4b55d6'],
  body: ['#4fe0cf', '#0e968a'],
  film: ['#ff86b0', '#d93d74'],
  target: ['#ffd25a', '#eb9a06'],
  book: ['#a3adbf', '#5e6b80'],
  shield: ['#6b7180', '#2c313b'],
  admin: ['#6b7180', '#2c313b'],
  gauge: ['#6b7180', '#2c313b'],
  clapper: ['#6b7180', '#2c313b'],
  settings: ['#6b7180', '#2c313b'],
  community: ['#c4a7ff', '#7c3aed'],
  support: ['#5fd3c8', '#0f8f86'],
  users: ['#7fb3ff', '#2563eb'],
  menu: ['#6b7180', '#2c313b'],
  zone: ['#ffd25a', '#eb9a06'],
};

/** 메뉴 아이콘 — lucide 와 둥근 야구 아이콘(components/round-icon.tsx, 같은 타입). 둥근 아이콘은 filled 도 알아듣는다(지금 고른 탭) */
export type NavIcon = LucideIcon;

/*
 * 2026-10-21 금윤호: 둥근 야구 아이콘 13종으로 바꿈 — 홈 · 투구(공) · 타격(배트) · 덕아웃(말풍선) · 더보기(메뉴) · 설정 · 트레이닝(덤벨) ·
 * 영양(포크 · 나이프) · 구속 측정(스피드건) · ABS(스트라이크존) · 메커니즘 · 투구 드릴 · 3D 동작 분석(투구 모션) · 고객센터 · 소통 관리(헤드셋).
 * 2026-10-22 rounded-baseball-icons-3 으로 나머지도: 뒤로 · 기록(체크 목록) · 암케어(팔) · 운동 영상 · 자료 · 관리자(별 방패) · 구속 관리자(계기판) ·
 * 촬영(슬레이트) · 팀 관리(두 사람). 'shield' 는 홈 요약 칸의 '컨디션'(lib/report/feed-items.ts — 앱도 같은 이름을 받는다)이 써서 옛 방패 그대로,
 * 관리자 메뉴는 새 이름 'admin'.
 */
export const NAV_ICONS: Record<NavIconName, NavIcon> = {
  home: RoundHome,
  baseball: RoundBaseball,
  bat: RoundBat,
  back: RoundBack,
  heart: RoundArmcare,
  calendar: RoundLog,
  dumbbell: RoundTraining,
  film: RoundVideo,
  utensils: RoundCutlery,
  target: RoundPitcher,
  zone: RoundZone,
  book: RoundBook,
  settings: RoundSettings,
  shield: Shield,
  admin: RoundShield,
  gauge: RoundGauge,
  clapper: RoundClapper,
  radar: RoundRadar,
  body: RoundPitcher,
  community: RoundCommunity,
  support: RoundSupport,
  users: RoundPeople,
  menu: RoundMenu,
};

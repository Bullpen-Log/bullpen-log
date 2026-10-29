/**
 * 앱 RPC 동작(<모듈>.<함수>) → 기능 표(2026-10-29 출시 전 베타). 판정은 lib/release-access.ts, 서버 막기는 lib/release-gate.ts.
 *
 * 쓰임:
 *   1) RPC 입구(app/api/rpc/[action]/route.ts)가 동작을 부르기 전에 이 표로 한 번 판정한다 — 잠긴 동작은 몸을 읽지도 않고 403.
 *   2) 그다음 동작 자신이 사람을 읽을 때 관문(getCurrentUser)이 또 판정한다 — 동작 맨 위의 allowFeature · allowAdmin 이 없으면 막힌다.
 *      두 쪽이 모두 열어야 지나간다. 둘이 어긋나면 막히는 쪽으로 어긋난다(덜 열린 쪽).
 *   3) 목록 시험(scripts/release-access-selftest.mts)이 registry 의 모든 모듈이 여기 있는지, 열린 동작의 함수에 밝힘 줄이 있는지 본다.
 *
 * 새 액션 모듈을 registry 에 더하면 여기에도 한 줄(빠뜨리면 'unclassified' — 베타 동안 막힌다).
 * 순수 파일.
 */
import type { Permission } from '@/lib/permissions';
import type { Capability } from '@/lib/release-access';

export type OpAccess = { cap: Capability; perm?: Permission };

/** 모듈의 기본 기능 */
export const RPC_MODULE_CAPABILITY: Record<string, OpAccess> = {
  /* 열린 것 */
  'pitch-lab': { cap: 'pitch3d' },
  'analysis-consent': { cap: 'pitch3d' },
  auth: { cap: 'account' },
  profile: { cap: 'account' },
  'login-ticket': { cap: 'account' },
  push: { cap: 'appInfra' },
  support: { cap: 'support' },

  /* 관리 업무(기존 권한 표 그대로) */
  'app-admin': { cap: 'admin' },
  admin: { cap: 'admin' },
  'velocity-admin': { cap: 'admin', perm: 'velocityAdmin' },
  'velocity-recording': { cap: 'admin', perm: 'recording' },
  shoot: { cap: 'admin', perm: 'shoot' },
  'app-shoot': { cap: 'admin', perm: 'shoot' },
  'patch-note': { cap: 'admin' },
  content: { cap: 'library' },

  /* 관리 업무 예외가 있는 일반 기능(준관리자 velocityAdmin · abs) */
  velocity: { cap: 'velocity' },
  abs: { cap: 'abs' },

  /* 잠긴 것 */
  'swing-lab': { cap: 'swing3d' },
  app: { cap: 'records' },
  'app-analysis': { cap: 'analysis' },
  'app-armcare': { cap: 'armcare' },
  armcare: { cap: 'armcare' },
  rehab: { cap: 'armcare' },
  'app-library': { cap: 'library' },
  favorite: { cap: 'library' },
  'featured-video': { cap: 'pitchLog' },
  'app-mechanics': { cap: 'mechanics' },
  mechanics: { cap: 'mechanics' },
  'mechanics-review': { cap: 'mechanics' },
  'app-nutrition': { cap: 'nutrition' },
  nutrition: { cap: 'nutrition' },
  'app-training': { cap: 'training' },
  'app-training-parts': { cap: 'training' },
  'app-workout': { cap: 'training' },
  workout: { cap: 'training' },
  warmup: { cap: 'training' },
  program: { cap: 'training' },
  'plan-edit': { cap: 'training' },
  'training-days': { cap: 'training' },
  'training-setup': { cap: 'training' },
  'exercise-history': { cap: 'training' },
  'exercise-log': { cap: 'training' },
  'exercise-note': { cap: 'training' },
  'pitch-setup': { cap: 'pitchLog' },
  'sinker-log': { cap: 'records' },
  'hitting-log': { cap: 'hitting' },
  'my-videos': { cap: 'myVideos' },
  checkin: { cap: 'checkin' },
  'day-cards': { cap: 'checkin' },
  'calendar-event': { cap: 'calendar' },
  notifications: { cap: 'notifications' },
  'onboarding-state': { cap: 'records' },
  board: { cap: 'board' },
  'app-dugout': { cap: 'dugout' },
  community: { cap: 'dugout' },
  market: { cap: 'dugout' },
  lessons: { cap: 'dugout' },
  venues: { cap: 'dugout' },
  'app-lesson': { cap: 'dugout' },
  'profile-public': { cap: 'dugout' },
  chat: { cap: 'chat' },
  'app-org': { cap: 'org' },
  'app-team': { cap: 'org' },
  org: { cap: 'org' },
  'org-calendar': { cap: 'org' },
  'org-join': { cap: 'org' },
  'org-notes': { cap: 'org' },
  'org-notices': { cap: 'org' },
  'org-record': { cap: 'org' },
  'org-report': { cap: 'org' },
  sharing: { cap: 'org' },
};

/** 모듈 기본과 다른 함수 */
export const RPC_ACTION_CAPABILITY: Record<string, OpAccess> = {
  /* 앱 시작 정보 · 앱스토어 나라 알림 — 바탕(베타 홈이 계정 · 판정을 받는 곳) */
  'app.loadAppMe': { cap: 'appInfra' },
  'app.reportStorefront': { cap: 'appInfra' },
  /* 시험용 나라 바꾸기 — 대표관리자만 */
  'app.setMyCountry': { cap: 'admin' },
  /* 준관리자 관리 첫 화면 · 구속 관리자(기존 권한 표의 adminHome · velocityAdmin) */
  'app-admin.loadAppAdmin': { cap: 'admin', perm: 'adminHome' },
  'app-admin.loadAppVelocityAdmin': { cap: 'admin', perm: 'velocityAdmin' },
  'app-admin.loadAppVelocityDay': { cap: 'admin', perm: 'velocityAdmin' },
};

/** RPC 동작 이름 → 기능. 표에 없는 모듈은 'unclassified'(베타 동안 막힘) */
export function rpcAccessOf(action: string): OpAccess {
  const exact = RPC_ACTION_CAPABILITY[action];
  if (exact) return exact;
  const dot = action.lastIndexOf('.');
  const mod = dot > 0 ? action.slice(0, dot) : '';
  return (Object.hasOwn(RPC_MODULE_CAPABILITY, mod) ? RPC_MODULE_CAPABILITY[mod] : undefined) ?? { cap: 'unclassified' };
}

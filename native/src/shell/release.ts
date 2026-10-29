import { useSyncExternalStore } from 'react';
import {
  BETA_LOCK_TITLE,
  RELEASE_POLICY_VERSION,
  accessAllowsPath,
  type ReleaseAccess,
} from '@/lib/release-access';
import { loadJson, saveJson } from '~/lib/store';
import { toast } from '~/shell/toast';

/**
 * 출시 전 베타 정책 — 앱이 그리기에 쓰는 것(2026-10-29, 서버 판정은 lib/release-gate.ts). 서버가 계정을 알려 줄 때(app.loadAppMe 의 access)
 * 받아 둔다. 진짜 막기는 서버(403 FEATURE_LOCKED_BETA)고, 이것은 잠긴 화면을 아예 열지 않고 안내하는 데 쓴다.
 *
 * 상태 셋:
 *   - known: 서버가 이 계정 · 이 정책 판으로 알려 줬다(또는 꺼진 망에서 같은 계정 · 같은 판의 저장값).
 *   - unknown: 아직 모름(앱을 켠 직후 · 꺼진 망에 저장값 없음) — **막힌 쪽으로 그린다**(잠깐이라도 다 열지 않는다, accessAllowsPath(null)).
 * 옛 서버(access 칸 없음)는 베타를 모르는 서버라 정식 출시로 본다.
 * 계정이 바뀌면(로그인 화면 · 다른 사람) 버린다. 폰에는 마지막 한 사람 것만, 정책 판과 함께 — 판이 다르면 안 쓴다.
 */
const KEY = 'bullpen-release-access';

type Known = { userId: string; access: ReleaseAccess };
let known: Known | null = null;
/* 서버에 물었는데 못 받았다(꺼진 망 · 오류) — 이때부터 모름을 막힌 쪽으로 '정해진' 것으로 본다(화면 지킴이 _layout 이 잠긴 화면을 닫는다).
   묻는 중(켜 있는 망에서 답을 기다리는 동안)에는 정하지 않는다 — 정식 출시 사용자의 딥링크 화면이 답이 오기 전에 닫히지 않게 */
let lookupFailed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/** 서버가 베타를 모를 때(옛 서버) — 정식 출시와 같다 */
const releasedAccess = (): ReleaseAccess => ({ stage: 'released', policyVersion: RELEASE_POLICY_VERSION, restricted: false, allowed: [], adminPerms: [] });

const isAccess = (v: unknown): v is ReleaseAccess =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as ReleaseAccess).restricted === 'boolean' &&
  Array.isArray((v as ReleaseAccess).allowed) &&
  Array.isArray((v as ReleaseAccess).adminPerms);

/** 계정을 물은 답(loadAppMe)에서 — access 가 없으면(옛 서버) 정식 출시 */
export function setReleaseFromMe(userId: string, access: unknown) {
  const a = access === undefined ? releasedAccess() : isAccess(access) ? access : null;
  /* 모양이 깨진 답은 막힌 쪽(모름)으로 */
  known = a ? { userId, access: a } : null;
  lookupFailed = !a;
  emit();
  if (known) void saveJson(KEY, known);
}

/** 꺼진 망에서 켤 때 — 마지막 계정 · 같은 정책 판의 저장값만. 그 밖은 모름(막힌 쪽) */
export async function restoreRelease(): Promise<void> {
  if (known) return;
  const v = (await loadJson(KEY)) as Known | null;
  if (known || !v || typeof v.userId !== 'string' || !isAccess(v.access)) return;
  if (v.access.policyVersion !== RELEASE_POLICY_VERSION) return;
  known = v;
  lookupFailed = false;
  emit();
}

/** 계정을 묻다 실패했다(app.loadAppMe) — 저장값도 없으면 막힌 쪽으로 정한다 */
export function releaseLookupFailed() {
  if (known || lookupFailed) return;
  lookupFailed = true;
  emit();
}

/** 로그아웃 · 다른 계정 — 앞사람의 정책을 남기지 않는다(관리자 다음 사람에게 다 열려 보이지 않게) */
export function resetRelease() {
  known = null;
  lookupFailed = false;
  emit();
  void saveJson(KEY, null);
}

export const releaseNow = (): ReleaseAccess | null => known?.access ?? null;
export const useRelease = () => useSyncExternalStore(subscribe, releaseNow);
/** 정책이 정해졌나 — 서버 답(또는 같은 계정 · 판의 저장값)을 받았거나, 묻다 실패해 막힌 쪽으로 정했다 */
const decidedNow = () => known != null || lookupFailed;
export const useReleaseDecided = () => useSyncExternalStore(subscribe, decidedNow);

/** 지금 베타 화면을 그려야 하나 — 모르면 그린다(막힌 쪽) */
export const isBetaView = (a: ReleaseAccess | null = releaseNow()) => !a || a.restricted;

/** 이 앱 주소를 열 수 있나(그리기용 — 서버가 다시 판정한다) */
export const canOpen = (href: string, a: ReleaseAccess | null = releaseNow()) => accessAllowsPath(a, href, 'native');

/** 잠긴 기능을 눌렀을 때 — '준비 중인 기능입니다.' 작은 안내 한 번(되풀이 누름은 잇달아 띄우지 않는다). 그 화면으로는 들어가지 않는다 */
let lastNotice = 0;
export function noticeLocked() {
  const now = Date.now();
  if (now - lastNotice < 2500) return;
  lastNotice = now;
  toast(BETA_LOCK_TITLE, 'info');
}

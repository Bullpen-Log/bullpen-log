/**
 * 구속 측정 — 웹 브라우저(localStorage)에 두는 것들: 설정 · 화각 · 지난 세션 거리. 계산(꼴 맞추기)은 lib/velocity-setup.ts parseSetup ·
 * lib/velocity-session-distance.ts parseDistMemory 에 있고, 아이폰 앱(native/)은 같은 계산을 앱 저장소로 쓴다(2026-10-17 — 계산 파일이
 * localStorage 를 안 만지게 갈랐다, scripts/shared-lib-selftest.mts).
 */
import { parseSetup, type VelocitySetup } from '@/lib/velocity-setup';
import { parseDistMemory, type DistMemory } from '@/lib/velocity-session-distance';

export const SETUP_KEY = 'bullpen-velocity-setup';
/** 같은 탭 안에서 설정이 바뀌었다고 알리는 신호 — storage 이벤트는 다른 탭에만 간다 */
export const SETUP_CHANGE_EVENT = 'bullpen:velocity-setup';
export const FOV_KEY = 'bullpen-velocity-fov';
const MEMORY_KEY = 'bullpen-velocity-dist-memory';

export function loadSetup(): VelocitySetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    return raw ? parseSetup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSetup(setup: Omit<VelocitySetup, 'savedAt'>): VelocitySetup {
  const full = { ...setup, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(full));
  } catch {
    /* 사생활 보호 모드 등 — 이번만 쓴다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
  return full;
}

/** 저장된 설정을 지운다 — 다음 측정 때 처음부터 다시 묻는다 */
export function clearSetup() {
  try {
    localStorage.removeItem(SETUP_KEY);
  } catch {
    /* 위와 같다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
}

export function loadFov(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const n = Number(localStorage.getItem(FOV_KEY));
    return n >= 30 && n <= 120 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveFov(fovDeg: number) {
  try {
    localStorage.setItem(FOV_KEY, String(fovDeg));
  } catch {
    /* 사생활 보호 모드 등 — 저장이 안 되면 이번만 쓴다 */
  }
}

export function loadDistMemory(): DistMemory | null {
  try {
    return parseDistMemory(JSON.parse(localStorage.getItem(MEMORY_KEY) ?? 'null'), Date.now());
  } catch {
    return null;
  }
}

export function saveDistMemory(m: DistMemory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* 사생활 보호 모드 등 — 다음 세션은 다시 어림한다 */
  }
}

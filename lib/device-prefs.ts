/**
 * 이 기기에만 저장하는 설정(2026-10-22 금윤호: "설정에 필요한 것들 넣어 둬") — 진동 · 움직임 줄이기.
 * 테마(lib/theme.ts)와 같은 방식: localStorage 에 두고 <html> 속성으로 화면 전체에 알린다. 첫 그림 전에 PREFS_INIT_SCRIPT 가 속성을 단다.
 *   진동 끔        html[data-haptics='off']   — lib/haptics.ts 의 buzz · haptic 이 아무것도 안 한다
 *   움직임 줄이기  html[data-reduce-motion]   — globals.css 의 '움직임 줄이기' 안전망을 기기 설정과 상관없이 켠다
 */
export type DevicePref = 'haptics' | 'reduceMotion';

const KEYS: Record<DevicePref, string> = {
  haptics: 'bullpen-haptics',
  reduceMotion: 'bullpen-reduce-motion',
};
/** 저장이 없을 때 — 진동은 켬, 움직임 줄이기는 끔 */
const DEFAULTS: Record<DevicePref, boolean> = { haptics: true, reduceMotion: false };
const EVENT = 'bullpen:device-prefs';

function apply(pref: DevicePref, on: boolean) {
  const html = document.documentElement;
  if (pref === 'haptics') {
    if (on) delete html.dataset.haptics;
    else html.dataset.haptics = 'off';
  } else if (on) html.dataset.reduceMotion = '';
  else delete html.dataset.reduceMotion;
}

export function readPref(pref: DevicePref): boolean {
  if (typeof window === 'undefined') return DEFAULTS[pref];
  try {
    const v = localStorage.getItem(KEYS[pref]);
    return v == null ? DEFAULTS[pref] : v === '1';
  } catch {
    return DEFAULTS[pref];
  }
}

export function setPref(pref: DevicePref, on: boolean) {
  try {
    localStorage.setItem(KEYS[pref], on ? '1' : '0');
  } catch {
    /* 저장이 막힌 창(사생활 보호) — 이번 화면에만 적용 */
  }
  apply(pref, on);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribePrefs(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** 진동을 꺼 뒀나 — lib/haptics.ts 가 부른다 */
export function hapticsOff(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.haptics === 'off';
}

/** 첫 그림 전에 속성을 단다(app/layout.tsx <head>) — 움직임 줄이기를 켠 기기에서 첫 화면부터 움직이지 않게 */
export const PREFS_INIT_SCRIPT = `
(function(){try{
  var d=document.documentElement;
  if(localStorage.getItem('${KEYS.haptics}')==='0')d.dataset.haptics='off';
  if(localStorage.getItem('${KEYS.reduceMotion}')==='1')d.dataset.reduceMotion='';
}catch(e){}})();
`;

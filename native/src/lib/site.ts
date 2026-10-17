/**
 * 앱이 띄우는 사이트 · 서버.
 *
 * 전환 동안(2026-10-17 엔지니어링 검토) 아직 네이티브로 안 옮긴 화면은 지금 사이트를 웹뷰로 띄운다. 사이트는 User-Agent 의
 * 'BullpenLogApp' 으로 앱 안인지 가린다(lib/app-env.ts) — Capacitor 껍데기와 같은 표시를 붙여 사이트 동작이 그대로이게 하고,
 * 'BullpenNative' 로 Expo 껍데기임을 따로 알린다(사이트가 나중에 이것으로 갈라 쓸 수 있게).
 *
 * 개발 중에 내 컴퓨터 서버를 띄우려면 EXPO_PUBLIC_SITE_URL=http://<맥 IP>:3000 으로 켠다(시뮬레이터는 http://localhost:3000).
 */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://bullpen-log.vercel.app').replace(/\/$/, '');

export const SITE_HOST = new URL(SITE_URL).host;

/**
 * 웹뷰 User-Agent 끝에 붙는 이름표 — BullpenNative/<n> 의 n 은 이 앱이 아는 앱 화면의 판(사이트 lib/app-env.ts expoLevel).
 * 사이트가 새 앱 화면으로 넘기는 길을 더하면 여기를 올린다: 1 구속 측정 · 투구 그날, 2 운동 진행(/workout).
 */
export const APP_UA = 'BullpenLogApp/2.0 BullpenNative/2';

/** 앱을 켜면 처음 여는 사이트 화면 — Capacitor 껍데기와 같다(mobile/capacitor.config.json server.url) */
export const START_PATH = '/today';

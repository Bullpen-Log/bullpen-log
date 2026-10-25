import * as Linking from 'expo-linking';
import { type Href, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { markAppReady } from '~/shell/intro';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
  type WebViewProps,
} from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { APP_UA, SITE_HOST, SITE_URL, START_PATH } from '~/lib/site';
import { CAP_SHIM, handleCapMessage } from '~/lib/cap-bridge';
import { loadMe, resetMe } from '~/pitch/api';
import { resetPitchStore } from '~/pitch/store';
import { resetCompare } from '~/pitch/log-list';
import { resetLibraryItems } from '~/library/parts';
import { resetImported } from '~/pitch/attach';
import { resetScanned } from '~/nutrition/scanned';
import { HomeTab, resetHomeCache } from '~/home/tab';
import { resetNotificationList } from '~/home/notifications';
import { NutritionTab } from '~/nutrition/tab';
import { TrainingTab, resetTrainingCache } from '~/training/tab';
import { resetPitchTodayCache } from '~/pitch/today-card';
import { resetVelocityDayCache } from '~/pitch/velocity-day';
import { resetNutritionStore } from '~/nutrition/api';
import { WEB_WAIT_MS, setDestinationOf, useWebNav, webArrived } from '~/shell/web-nav';
import { createWebRoute, locOf } from '~/shell/web-route';
import { whenStill } from '~/shell/transition';
import { resetFavorites } from '~/training/favorites';
import { setMenu, setMenuTabs, useMenu, type MenuGroup } from '~/shell/menu-store';
import { adoptWebValues, cacheClear, loadJson, saveJson } from '~/lib/store';
import { onPrefsChange, PREF_KEYS, reloadPrefs } from '~/lib/prefs';
import { useTheme } from '~/lib/ui';
import { dropDraftNotOf } from '~/velocity/draft';
import { markWrite, rpc, RpcError } from '~/lib/rpc';
import { toDateKey } from '@/lib/pitch-stats';
import { TRAINING_HOME_HREF } from '@/lib/training-part';
import { drainOutbox, setOutboxOwner } from '~/workout/outbox';
import { drainChecks } from '~/armcare/outbox';
import { sendCheck } from '~/armcare/send';
import { PitchTab } from '~/pitch/tab';
import { DEFAULT_SPORT_BARS, DEFAULT_TABS, TAB_BAR_HEIGHT, TabBar, sportActiveHref, sportOfPath, type ShellTab, type SportKey } from '~/shell/tab-bar';
import { TabPager } from '~/shell/tab-pager';
import { ClockVeil } from '~/shell/clock-veil';
import { Press } from '~/shell/press';

type WebViewHandle = { injectJavaScript(script: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(velocity/engine.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebViewHandle> }
>;

/**
 * 앱 껍데기 — 사이트 웹뷰 하나 + 앱 아래 탭 막대(shell/tab-bar.tsx). 홈 · 트레이닝 · 커뮤니티는 웹뷰가(사이트의 판 넘기기로 바로 옮김), 투구 탭은
 * 앱 화면(pitch/tab.tsx)이 웹뷰를 덮는다. 사이트는 앱 안이면 제 탭 막대를 숨긴다(components/app-shell/expo-tabs.tsx).
 *
 * 화면을 네이티브로 옮기면(구속 측정 · 촬영 · 투구 영상부터, 검토 D3) 그 주소로 가는 길을 여기서 가로채 네이티브 화면을 연다.
 * 로그인은 사이트 'session' 쿠키 그대로 — sharedCookiesEnabled 로 앱의 쿠키 저장소와 같이 써서 네이티브 화면의 /api/rpc 도
 * 같은 로그인으로 부른다.
 */
/** 사이트 주소 중 네이티브 화면이 맡는 것 */
const NATIVE_PATHS = new Set(['/velocity', '/velocity/measure']);
/** 같은 화면을 두 번 쌓지 않게 — 주소 가로채기와 사이트 알림이 한 번 누름에 같이 올 수 있다 */
let lastOpen = { path: '', at: 0 };
/** 앱 화면이 맡는 사이트 주소(구속 측정 말고) — 사이트가 BullpenNative/<n> 판을 보고 넘기는 것과 같은 목록(lib/app-env.ts expoLevel) */
const NATIVE_ROUTES = [
  /^\/pitch\/\d{4}-\d{2}-\d{2}$/,
  /^\/workout$/,
  /^\/armcare\/[\w-]+(\?[\w=&%.-]*)?$/,
  /^\/(mechanics|analysis)(\?[\w=&%.-]*)?$/,
  /^\/support(\/notices(\/[\w-]+)?|\/inquiries(\/[\w-]+)?)?$/,
  /^\/library\/(training|mechanics|warmup)$/,
  /^\/board(\/[\w-]+)?$/,
  /^\/warmup$/,
  /^\/workout-done\?id=[\w-]+$/,
  /^\/setup\/(pitch|training|nutrition)$/,
  /^\/admin(\/(support|community|patch-notes(\/[\w-]+)?|notice(\?id=[\w-]+)?))?$/,
  /^\/admin\/shoot(\/\d+(\?at=[\w%.-]+)?)?$/,
  /^\/admin\/velocity(\/(upload|\d{4}-\d{2}-\d{2}))?$/,
  /^\/velocity\?mode=(speed|abs)$/,
  /^\/lab(\/guide|\/[0-9a-f-]{36})?(\?[\w=&%.-]*)?$/,
  /^\/login\?native=1$/,
  /^\/(signup|account)$/,
  /* 팀 · 레슨장 공간(1단계, docs/designs/sinker-team-lesson-contract.md 2-2) — 웹 /manage · /join 은 nativeOfWeb 이 이리로 */
  /^\/org(\/join(\?code=\w+)?|\/member\/[\w-]+\?org=[\w-]+|\/share\/[\w-]+)?$/,
];
const isNativePath = (path: string) => NATIVE_PATHS.has(path) || NATIVE_ROUTES.some((r) => r.test(path));
/**
 * 웹 주소 → 같은 앱 화면(있으면). 사이트 페이지마다의 OpenNative 와 같은 짝 — 앱 탭 · 카드에서 누른 웹 주소가 앱 화면이 있는 곳이면 웹을 그리지 않고
 * 바로 연다(예전엔 웹 페이지를 서버에서 그린 뒤 앱 화면으로 넘겨 한 번 더 기다렸다). '?web=1'(일부러 웹)은 건드리지 않는다.
 */
function nativeOfWeb(href: string): string | null {
  if (/[?&]web=1\b/.test(href)) return null;
  if (isNativePath(href)) return href;
  const [path, q] = href.split('?');
  const day = /^\/pitch-log\/(\d{4}-\d{2}-\d{2})$/.exec(path)?.[1];
  if (day) return `/pitch/${day}`;
  const lab = /^\/videos\/lab(\/guide|\/[0-9a-f-]{36})?$/.exec(path);
  if (lab) return `/lab${lab[1] ?? ''}`;
  const setup: Record<string, string> = { '/videos/setup': '/setup/pitch', '/training/setup': '/setup/training', '/nutrition/setup': '/setup/nutrition' };
  if (setup[path]) return setup[path];
  if (path === '/workout/warmup') return '/warmup';
  /* 마스터 계정의 웹 관리 화면 · 선수의 참여 화면 → 앱 팀 · 레슨장 공간(웹 /manage 는 PC 용, 앱에서는 '?web=1' 로만) */
  if (path === '/manage' || path.startsWith('/manage/')) return '/org';
  if (path === '/join') {
    const code = new URLSearchParams(q ?? '').get('code');
    return code && /^\w+$/.test(code) ? `/org/join?code=${code}` : '/org';
  }
  /* 웹 ABS 판정 → 앱 카메라 화면의 ABS 모드(앱 카메라 · 2배 · 손떨림 보정 — 웹뷰 카메라보다 정확) */
  if (path === '/abs') return '/velocity?mode=abs';
  const sp = new URLSearchParams(q ?? '');
  const view = path === '/coach' ? sp.get('view') : null;
  /* '그날 분석'(?date=YYYY-MM-DD)은 그 날짜째 — 네이티브3 분석 화면이 받는다 */
  const date = sp.get('date');
  if (view === 'pitch' || view === 'training')
    return `/analysis?view=${view}${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `&date=${date}` : ''}`;
  return null;
}
function openNative(path: string) {
  /*
   * 같은 주소만 0.7초 안에 한 번 — 예전엔 어느 주소든 막아, 앱 화면을 닫자마자 다른 앱 화면을 열면 말없이 안 열렸다.
   * 1.5초면 화면을 닫고 곧바로 같은 곳을 다시 누를 때 안 열렸다(2026-10-21) — _layout 의 같은 곳 두 번 밀기 막기(0.7초)와 같게
   */
  if (path === lastOpen.path && Date.now() - lastOpen.at < 700) return;
  /* ? 뒤까지 맞는 앱 화면이 먼저 — '/velocity?mode=abs' 를 '/velocity' 로 열면 ABS 모드가 빠졌다 */
  if (NATIVE_ROUTES.some((r) => r.test(path))) router.push(path as Href);
  else if (NATIVE_PATHS.has(path.split('?')[0])) router.push('/velocity');
  else return;
  lastOpen = { path, at: Date.now() };
}

/** 사이트 주소 → 그 주소가 속한 탭(웹 lib/nav.ts NAV_ALSO 와 같은 묶음) */
function tabOf(path: string, tabs: ShellTab[]): string | null {
  const group: Record<string, string[]> = {
    '/today': ['/today', '/coach'],
    '/videos': ['/videos', '/pitch-log', '/admin/velocity'],
    '/training': ['/training'],
    '/nutrition': ['/nutrition'],
    /* 덕아웃 탭(/?dugout=1) — 덕아웃 틀의 화면들(장터 · 커뮤니티 · 레슨 …)도 이 탭이다 */
    '/': ['/market', '/community', '/lessons', '/venues', '/chat', '/me', '/search', '/notifications', '/u', '/pay', '/link'],
  };
  for (const t of tabs) {
    const base = t.href.split('?')[0];
    const roots = group[base] ?? [base];
    if ((base === '/' && path === '/') || roots.some((r) => path === r || path.startsWith(`${r}/`))) return t.href;
  }
  return null;
}

/**
 * 옛 앱(웹 화면)이 이 폰의 localStorage 에 둔 값 가운데 앱 화면이 쓰는 것 — 처음 그릴 때 앱 저장소로 옮긴다(이미 있으면 안 덮는다,
 * lib/store.ts adoptWebValues). 같은 번들 ID 라 옛 앱의 웹 저장소 · 로그인 쿠키는 그대로 남아 있다.
 */
const WEB_JSON_KEYS = ['bullpen-velocity-setup'];
/** 테마 · 단위(글자 값, ~/lib/prefs) — 웹을 열 때마다 웹 값을 따른다. 앱 설정 화면에서 바꾸면 웹에도 같이 칠해 둘이 늘 같다 */
const WEB_RAW_KEYS = Object.values(PREF_KEYS);
const WEB_KEYS = [...WEB_JSON_KEYS, ...WEB_RAW_KEYS];
/*
 * 웹이 서버에 쓰거나(fetch POST · 서버 동작) 테마 · 단위를 바꾸면 앱에 알린다 — 앱 화면은 앱이 부른 쓰기(lib/rpc markWrite)만 알아서,
 * 웹 체크인 · 투구 기록 · 설정 뒤 홈으로 돌아와도 30초 동안 옛 화면이었고, 웹 설정 창에서 바꾼 단위는 웹을 다시 열 때까지 안 따랐다
 * (2026-10-24 두 번째 검토). 화면 처음 그릴 때 한 번만 건다(웹 안 옮겨 다니기는 같은 창이라 그대로 남는다).
 */
const WATCH_WEB = `(function(){if(window.__bpWatch)return;window.__bpWatch=1;var post=function(m){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m))}catch(e){}};var f=window.fetch;if(f)window.fetch=function(i,o){var m=String((o&&o.method)||(i&&i.method)||'GET').toUpperCase();var u=String((i&&(i.url||i.href))||i||'');var p=f.apply(this,arguments);if(m!=='GET'&&m!=='HEAD'&&u.indexOf('/_vercel/')<0)p.then(function(r){if(r&&r.ok)post({t:'wrote'})},function(){});return p};var K=${JSON.stringify(WEB_RAW_KEYS)},s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){s.apply(this,arguments);if(K.indexOf(k)>=0){var o={};o[k]=String(v);post({t:'adopt',items:o})}}})();true;`;
const ADOPT_WEB_VALUES = `(function(){try{var o={};${JSON.stringify(WEB_KEYS)}.forEach(function(k){o[k]=localStorage.getItem(k)});window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({t:'adopt',items:o}))}catch(e){}})();true;`;
/*
 * 옛 앱(Capacitor 웹뷰)이 웹 저장소(IndexedDB 'bullpen-velocity', lib/velocity-draft.ts)에 남긴 저장 안 한 구속 세션 · 못 올린 클립을 센다.
 * 같은 번들이라 웹 저장소는 이어지는데, 새 앱은 구속 측정을 앱 화면으로 열어 그 세션에 닿을 길이 없었다(2026-10-17 검토 D9 — 첫 실행 옮기기).
 * 공 모양이 앱 세션과 달라 옮겨 담지 않고, 웹 구속 화면(?resume=1&web=1)이 마저 저장하게 한다. 없는 DB 는 만들지 않는다(onupgradeneeded 에서 멈춤).
 */
const OLD_VELOCITY = `(function(){try{var r=indexedDB.open('bullpen-velocity');r.onupgradeneeded=function(){r.transaction.abort()};r.onsuccess=function(){var d=r.result,n=[].slice.call(d.objectStoreNames);if(n.indexOf('draft')<0||n.indexOf('uploads')<0){d.close();return}var tx=d.transaction(['draft','uploads'],'readonly'),g=tx.objectStore('draft').get('current'),u=tx.objectStore('uploads').count();tx.oncomplete=function(){var p=g.result&&g.result.pitches?g.result.pitches.length:0;d.close();if(p||u.result)window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({t:'oldvelo',pitches:p,uploads:u.result}))}}}catch(e){}})();true;`;
/** 옛 세션을 '나중에' 하면 하루 동안 다시 묻지 않는다 */
const OLD_VELOCITY_SNOOZE = 'bullpen-old-velocity-snooze';
let askedOldVelocity = false;

/** 앱이 웹에 보낸 이동 ↔ 웹의 '그렸어요' 짝짓기(아래 SiteScreen goWeb · onMessage) — 껍데기는 하나라 여기 둔다(lastOpen 과 같다) */
const route = createWebRoute();
/** 앱 판이 맡는 주소 — 홈 · 투구(?view=log 포함) · 영양 · 트레이닝 첫 화면(?view=home · last). 여기면 웹을 기다리지 않고 바로 판을 바꾼다 */
function isAppPage(href: string): boolean {
  const { path, search } = locOf(href);
  if (path === '/videos' || path === '/today' || path === '/nutrition') return true;
  const view = new URLSearchParams(search).get('view');
  return path === '/training' && (view === 'home' || view === 'last');
}
/*
 * 더보기 같은 앱 화면이 웹 주소를 열 때 '언제 보이나'를 알려 준다(shell/web-nav.ts destinationOf) — 아래 navTo 와 같은 갈래: 앱 화면이면 새로 열고,
 * 앱 판 · 웹이 이미 그 자리면 바로 보이고, 나머지는 웹이 그린 뒤에 보인다. 잠긴 앱 판(첫 설정으로 가는 탭)은 'now' 로 보지만 웹이 첫 설정으로 보낸다
 */
setDestinationOf((href) => {
  if (href.startsWith('#')) return 'now';
  if (nativeOfWeb(href) != null) return 'native';
  return isAppPage(href) || route.at(href) ? 'now' : 'web';
});

const isLoginPath = (p: string) => p === '/login' || p.startsWith('/login/') || p === '/signup';
/** 웹 체크인 흐름(app/(session)/checkin) — 탭 막대가 없는 화면 */
const isCheckinPath = (p: string) => p === '/checkin' || p.startsWith('/checkin/');

/** 로그아웃 — 앞사람 기록(메모리 · 폰)을 지운다. 다음 사람이 로그인하면 새로 받는다(껍데기 상태는 SiteScreen resetShell) */
function resetAccount() {
  resetMe();
  setOutboxOwner(null);
  resetPitchStore();
  resetCompare();
  resetLibraryItems();
  resetHomeCache();
  resetNutritionStore();
  resetTrainingCache();
  resetFavorites();
  resetPitchTodayCache();
  resetVelocityDayCache();
  resetImported();
  resetScanned();
  resetNotificationList();
  /* 더보기의 이름 · 관리자 칸 — 다음 사람의 메뉴 알림이 오기 전까지 앞사람 것이 보였다 */
  setMenu({ groups: [], nickname: '' });
  setMenuTabs(DEFAULT_TABS);
  void cacheClear();
  /*
   * 저장 안 한 구속 세션(폰에 맡김)은 여기서 지우지 않는다 — 로그인 화면에 왔다고 지우면 같은 사람이 다시 로그인해도 잰 공이 사라졌다(2026-10-21).
   * 다른 계정이 로그인했을 때만 지운다(ownerKnown → dropDraftNotOf, 운동 대기열과 같은 규칙)
   */
}

/** 누가 로그인했는지 안 때 — 대기열 주인을 정하고, 다른 계정이 맡긴 구속 세션은 지우고, 폰에 남은 것을 보낸다 */
function ownerKnown(userId: string) {
  setOutboxOwner(userId);
  void dropDraftNotOf(userId);
  drainQueues();
}

/** 다음 한국 자정까지(ms) — 한국은 서머타임이 없어 UTC+9 고정. 1초 넉넉히 */
const untilKstMidnight = () => 86_400_000 - ((Date.now() + 9 * 3_600_000) % 86_400_000) + 1000;
const UNSEEN = { home: false, pitch: false, training: false, nutrition: false };
const PAGER_KEYS = ['home', 'pitch', 'training', 'nutrition'] as const;

/** 폰에 남은 운동 세트 · 암케어 체크를 보낸다 — 체크를 하나라도 보냈으면 사이트의 트레이닝 목록 · 홈을 새로 그리게(따라 하기 화면과 같다) */
function drainQueues() {
  void drainOutbox((p) => rpc('workout.logSet', p), () => undefined);
  let sent = 0;
  void drainChecks(sendCheck, (_p, res) => {
    if (!('error' in res)) sent++;
  }).then(() => {
    if (sent) rpc('exercise-log.refreshTrainingLists').catch(() => undefined);
  });
}

export default function SiteScreen() {
  /** 바꾸면 웹뷰를 새로 그린다 — 다시 불러오기(react-native-webview 14 의 WebView 는 ref 를 안 받는다) */
  const [load, setLoad] = useState(0);
  const [failed, setFailed] = useState(false);
  const dark = useTheme() !== 'light';
  const web = useRef<WebViewHandle>(null);
  /** 사이트 테마의 바탕색 — 오래 뒤에 있다 돌아와 다시 그리는 동안 흰 화면이 번쩍이지 않게(옛 앱의 bullpenTheme 과 같은 일) */
  const [pageColor, setPageColor] = useState<string | null>(null);
  /* 앱 탭 막대 — 사이트가 알려 준 탭 · 지금 주소 · 막대를 보일지(탭이 없는 웹 화면에서는 숨김) */
  const [tabs, setTabs] = useState<ShellTab[]>(DEFAULT_TABS);
  /* 투구 · 타격 종목 바(사이트가 잠금을 입혀 보냄) — 2026-10-20 타격 1단계 D1 */
  const [sportBars, setSportBars] = useState<Record<SportKey, ShellTab[]>>(DEFAULT_SPORT_BARS);
  const [path, setPath] = useState('/today');
  /* 주소의 ? 뒤 — 트레이닝은 첫 화면(?view=home)만 앱 화면이고 암케어 · 메커니즘(?view=…)은 웹이라 가른다 */
  const [search, setSearch] = useState('');
  const [barOn, setBarOn] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  /* 서버가 계정 · 오늘을 알려 줬나 — 꺼진 망이면 오늘은 폰의 한국 날짜로 두고(앱 탭이 그려지게) 8초마다 다시 묻는다 */
  const [meOk, setMeOk] = useState(false);
  const [meTry, setMeTry] = useState(0);
  /* 계정 · 오늘을 못 받은 까닭(꺼진 망 말고) — 오늘을 모르면 앱 판이 안 서고, 새 앱은 웹 홈 · 투구 판도 그리지 않아 빈 화면이었다(2026-10-24 검토) */
  const [meError, setMeError] = useState<string | null>(null);
  /** 폰 날짜로 둔 오늘 — 망이 끊겼다고 서버 오늘(시험 계정의 시뮬레이션 날짜)을 덮지 않게, 폰 날짜를 따르던 때만 바꾼다 */
  const deviceDay = useRef(toDateKey(new Date()));
  /*
   * 계정 · 오늘을 (다시) 묻는다. 됐으면 대기열 주인을 정하고 폰에 남은 운동 세트 · 암케어 체크를 보낸다(그 화면을 다시 안 열어도 — 암케어 체크는
   * 7일 지나면 버려진다. 서버가 거절한 것은 대기열이 뺀다). 로그인 전이면 막혀 그대로 남는다(다음 기회에).
   */
  /* 늦게 온 옛 답(로그아웃 전에 보낸 물음)이 새 계정을 덮지 않게 — 마지막 물음의 답만 받는다 */
  const askNo = useRef(0);
  const askMe = useCallback(() => {
    resetMe();
    const no = ++askNo.current;
    return loadMe().then(
      (m) => {
        if (no !== askNo.current) return true;
        deviceDay.current = toDateKey(new Date());
        setToday(m.today);
        setMeOk(true);
        setMeError(null);
        ownerKnown(m.userId);
        return true;
      },
      (e: unknown) => {
        if (no !== askNo.current) return false;
        setMeError(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : e instanceof RpcError && e.code === 'offline' ? null : '불러오지 못했어요.');
        if (e instanceof RpcError && e.code === 'offline') {
          const was = deviceDay.current;
          const now = toDateKey(new Date());
          deviceDay.current = now;
          setToday((t) => (!t || t === was ? now : t));
        }
        return false;
      }
    );
  }, []);
  /* 꺼진 망에서 켜면 실패하고 영영 웹만 보였다 — 8초 뒤 다시(망이 돌아올 때까지 되풀이) */
  useEffect(() => {
    if (!(barOn || failed) || meOk) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void askMe().then((ok) => {
      if (!ok && alive) timer = setTimeout(() => alive && setMeTry((n) => n + 1), 8000);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [barOn, failed, meOk, meTry, askMe]);
  /*
   * 앱을 다시 볼 때 · 한국 자정에 오늘을 다시 묻는다 — 밤을 넘겨 켜 둔 앱이 어제 달력 · 어제 홈을 보이지 않게. 계정도 다시 정한다 — 꺼진 망에서 켜
   * 첫 물음이 실패했으면 여기서 처음 계정이 정해진다(2026-10-18 통합 점검). 뒤에 있는 동안 멈춘 자정 시계는 '다시 볼 때'가 메운다.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void askMe();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const atMidnight = () => {
      timer = setTimeout(() => {
        void askMe();
        atMidnight();
      }, untilKstMidnight());
    };
    atMidnight();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [askMe]);
  const active = tabOf(path, tabs);
  const sport = sportOfPath(path, search);
  /* 웹을 앞으로 — 앱 화면 위에서 연 웹 창(설정)이 보이게 앱 화면을 잠시 걷는다. 그 창을 닫거나 탭을 누르면 돌아온다 */
  const [webFront, setWebFront] = useState(false);
  const pitchTab = tabs.find((t) => t.href === '/videos');
  /* 투구 탭의 첫 화면일 때만 앱 화면 — 잠겼으면 웹의 첫 설정 화면(주소가 /videos/setup)으로 간다 */
  const showPitch = barOn && path === '/videos' && !!today && !pitchTab?.locked && !webFront;
  /* 홈 첫 화면도 앱 화면 — '웹 홈에서' 를 누르면 홈 탭을 다시 누를 때까지 웹 홈(일정 · 자세한 그날 칸) */
  const [webHome, setWebHome] = useState(false);
  const showHome = barOn && path === '/today' && !!today && !webHome && !webFront;
  const menu = useMenu();
  /* 영양 첫 화면도 앱 화면(오늘 먹은 것 · 담기 · 체중) — '식단 · 목표 · 통계'를 누르면 영양을 다시 열 때까지 웹 영양 */
  const [webNutrition, setWebNutrition] = useState(false);
  const openWebNutrition = useCallback(() => setWebNutrition(true), []);
  /* 2026-10-20 영양은 하단 탭에서 더보기로(넷째 탭은 커뮤니티) — 잠김은 더보기 목록(사이트가 보낸 메뉴)에서 읽는다 */
  const nutritionTab =
    tabs.find((t) => t.href === '/nutrition') ?? menu.groups.flatMap((g) => g.items).find((i) => i.href.split('?')[0] === '/nutrition' || i.icon === 'utensils');
  /* undefined = 아직 모름(메뉴가 오기 전) */
  const nutritionLocked = nutritionTab?.locked;
  const showNutrition = barOn && path === '/nutrition' && !!today && !webNutrition && !nutritionTab?.locked && !webFront;
  /* 트레이닝 첫 화면(앱 카드 셋)도 앱 화면 — 카드를 누르면(암케어 · 메커니즘 · 운동 전체) 주소가 ?view=… 로 바뀌어 웹이 보인다 */
  /* 2026-10-21 트레이닝은 하단 탭이 아니라 투구 종목 바 안 — 잠김은 그 칸에서 읽는다(하단 탭에서 찾으면 늘 없어 잠김을 못 봤다) */
  const trainingTab = sportBars.pitch.find((t) => t.href.startsWith('/training?sport='));
  const trainingView = new URLSearchParams(search).get('view');
  const showTraining =
    barOn && path === '/training' && (trainingView === 'home' || trainingView === 'last') && !!today && !trainingTab?.locked && !webFront;
  /* 판 넘기기 — 지금 보일 앱 판(없으면 웹이 앞)과 한 번이라도 열린 판(붙여 둠) */
  const pagerOn = showHome || showPitch || showTraining || showNutrition;
  const nowIndex = showHome ? 0 : showPitch ? 1 : showTraining ? 2 : showNutrition ? 3 : -1;
  const [pagerIndex, setPagerIndex] = useState(0);
  if (nowIndex >= 0 && nowIndex !== pagerIndex) setPagerIndex(nowIndex);
  const [seen, setSeen] = useState(UNSEEN);
  if ((showHome && !seen.home) || (showPitch && !seen.pitch) || (showTraining && !seen.training) || (showNutrition && !seen.nutrition))
    setSeen({ home: seen.home || showHome, pitch: seen.pitch || showPitch, training: seen.training || showTraining, nutrition: seen.nutrition || showNutrition });

  /* 웹뷰를 새로 만들 때(다시 불러오기 · 프로세스 죽음) — 새 웹은 /today 인데 앱 상태가 옛 주소로 남아 탭 불 · 판이 어긋났다 */
  const resetWebState = () => {
    arrived();
    route.reset();
    setPath('/today');
    setSearch('');
    setWebFront(false);
    setWebHome(false);
    setWebNutrition(false);
  };
  /*
   * 앱이 웹에 보낸 이동과 웹의 '그렸어요'(msg 'path')를 짝짓는다(shell/web-route.ts) — 탭을 A → B 로 빨리 옮기면 A 의 알림이 늦게 와 B 를
   * 덮었다(화면 · 탭 불이 A 로 갔다가 B 로, 2026-10-25 화면 전환 점검). 웹이 이미 그 자리면 알림이 안 오니 goWeb 이 '기다릴 것 없음'을 돌려준다.
   * track = false 는 알림이 안 오는 부름(더보기 — 웹은 창만 연다).
   */
  /* 판(탭 화면)에 넘기는 openWeb · goTab 이 늘 같은 함수여야 탭을 옮길 때 붙어 있는 판 넷이 다시 그려지지 않는다 — 컴파일러가 이 함수를 옆 효과와
     한 묶음으로 기억해 판이 붙을 때마다 바뀌었다(2026-10-25 점검). 손으로 묶는다 */
  const goWeb = useCallback(
    (href: string, track = true) => {
      const waits = track && route.send(href);
      web.current?.injectJavaScript(`window.__bpTab && window.__bpTab(${JSON.stringify(href)});true;`);
      return waits;
    },
    []
  );
  /*
   * 웹 화면으로 갈 때는 웹이 그 주소를 그렸다고 알려 온 뒤(msg 'path')에 앱 판을 걷는다 — 먼저 걷으면 밑에 깔린 옛 웹 화면이 보였다가 그 화면으로
   * 넘어갔다(투구 → 타격, 앱 → 암케어 · 메커니즘, 2026-10-24 전체 검토). 그동안 탭 막대 렌즈는 누른 칸에 먼저 가 있다(pressed).
   * 'path' 알림은 Next 가 새 주소를 화면에 붙인 뒤(usePathname 이 바뀐 뒤)에 온다 — 그 화면의 불러오는 판(loading)일 수는 있어도 옛 화면은 아니다.
   * 웹이 이미 그 자리면(알림이 안 옴) 바로 걷는다. 알림을 못 받으면(느린 망 · 웹 다리 없는 화면) WEB_WAIT_MS 뒤에 걷는다 — 예전 1.5초는 느린 망에서
   * 새 화면이 오기 전에 옛 웹 화면을 보였다.
   */
  const [pressed, setPressed] = useState<string | null>(null);
  const webWait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showWeb = (href: string, waits: boolean) => {
    clearTimeout(webWait.current);
    const loc = locOf(href);
    if (!waits) {
      setPath(loc.path);
      setSearch(loc.search);
      setPressed(null);
      return;
    }
    setPressed(href);
    webWait.current = setTimeout(() => {
      setPath(loc.path);
      setSearch(loc.search);
      setPressed(null);
    }, WEB_WAIT_MS);
  };
  const arrived = useCallback(() => {
    clearTimeout(webWait.current);
    setPressed(null);
  }, []);
  useEffect(() => () => clearTimeout(webWait.current), []);
  /*
   * 웹처럼 판 넷을 다 띄워 둔다(웹 @home · @videos · @training · @nutrition 이 늘 떠 있다 — 판 사이를 넘길 때 옆 판이 비지 않게).
   * 예전엔 처음 연 판 뒤 1.2초에 나머지 셋을 한꺼번에 붙여, 셋이 같은 순간에 그리고 서버를 불러 그때 누른 탭 · 쓸기가 끊겼다(2026-10-25 화면 전환 점검).
   * 이제 하나씩 — 지금 탭에서 가까운 판부터, 첫 판은 1.2초 뒤 · 다음은 0.7초 간격. 웹 이동을 기다리는 동안(pressed) · 화면이 넘어가는 동안
   * (whenStill)은 미룬다. 잠긴 탭은 붙이지 않는다(웹은 잠금 판), 영양은 메뉴가 와서 안 잠긴 걸 안 뒤에.
   */
  useEffect(() => {
    if (!pagerOn || pressed) return;
    const can = { home: true, pitch: !pitchTab?.locked, training: !trainingTab?.locked, nutrition: nutritionLocked === false };
    const next = PAGER_KEYS.map((k, i) => ({ k, d: Math.abs(i - pagerIndex) }))
      .sort((a, b) => a.d - b.d)
      .find(({ k }) => !seen[k] && can[k])?.k;
    if (!next) return;
    const mounted = PAGER_KEYS.filter((k) => seen[k]).length;
    let stop: (() => void) | undefined;
    const t = setTimeout(
      () => {
        stop = whenStill(() => setSeen((s) => (s[next] ? s : { ...s, [next]: true })), { grace: 0 });
      },
      mounted <= 1 ? 1200 : 700
    );
    return () => {
      clearTimeout(t);
      stop?.();
    };
  }, [pagerOn, pressed, pagerIndex, seen, pitchTab?.locked, trainingTab?.locked, nutritionLocked]);
  const pressTab = (t: ShellTab) => {
    /* 앞서 누른 웹 칸을 기다리던 것은 버린다 — 안 그러면 옛 칸으로 되돌아가고 렌즈도 그 칸에 남았다(2026-10-24 검토) */
    arrived();
    setWebFront(false);
    /* 더보기는 앱 화면(사이트가 목록을 알려 준 뒤) — 웹 메뉴는 앱 화면 위에서 열면 밑에 깔려 안 보인다 */
    if (t.href === '/more' && menu.groups.length) return router.push('/more' as Href);
    /* 더보기(메뉴가 오기 전)는 웹이 창만 열고 주소를 안 알린다 — 기다리지 않는다 */
    if (t.href === '/more') return void goWeb(t.href, false);
    if (t.href === '/today') setWebHome(false);
    if (t.href === '/nutrition') setWebNutrition(false);
    const waits = goWeb(t.href);
    /*
     * 앱 판이 있는 탭(홈 · 투구 · 영양 · 트레이닝 첫 화면 ?view=home · last)은 바로 그 판으로 — 종목 바의 홈 · 기록(?view=log)도 같은 판이라
     * ? 뒤까지 바로 맞춘다. 웹뿐인 탭(타격 · 덕아웃 · 웹 트레이닝 칸 ?sport= · ?view=암케어 …)은 웹이 그린 뒤에 앱 판을 걷는다(showWeb)
     */
    if (isAppPage(t.href) && !t.locked) {
      const loc = locOf(t.href);
      setPath(loc.path);
      setSearch(loc.search);
    } else showWeb(t.href, waits);
  };
  /* 투구 탭(앱 화면)에서 아직 웹인 화면(투구 분석 · 3D 동작 분석)으로 — 앱 화면을 바로 걷고 웹이 그 주소로 간다 */
  const openWeb = (href: string) => {
    arrived();
    const native = nativeOfWeb(href);
    if (native && isNativePath(native)) return openNative(native);
    const waits = goWeb(href);
    /* 앱 판이 맡는 주소(투구 기록 ?view=log 등)는 바로 그 판으로 — 웹을 기다릴 까닭이 없다 */
    if (isAppPage(href)) {
      const loc = locOf(href);
      setPath(loc.path);
      setSearch(loc.search);
    } else showWeb(href, waits);
  };
  const goTab = (href: string) => {
    /*
     * 운동을 마치거나 트레이닝 첫 설정을 끝낸 뒤의 '/training' — 2026-10-21 트레이닝이 종목 바 안으로 들어가 하단 탭에서 못 찾고 웹 '오늘 운동'이 열렸다.
     * 앱 트레이닝 첫 화면(TrainingTab, ?view=home — 트레이닝 홈 카드가 여는 곳)으로. 잠겼으면 웹이 첫 설정으로 보낸다
     */
    if (href === '/training' && !trainingTab?.locked) {
      setWebFront(false);
      setPath('/training');
      setSearch(TRAINING_HOME_HREF.split('?')[1]);
      return goWeb(TRAINING_HOME_HREF);
    }
    /*
     * 쿼리 없는 탭 주소도 그 탭으로 — 트레이닝 탭의 주소는 '/training?view=home' 인데 운동을 마치거나 트레이닝 첫 설정을 끝낸 뒤 '/training' 으로 보내
     * 짝을 못 찾고 웹 '오늘 운동' 화면이 열렸다(2026-10-20 대조 검토)
     */
    const t = tabs.find((x) => x.href === href) ?? (href.includes('?') ? undefined : tabs.find((x) => x.href.split('?')[0] === href));
    if (t) pressTab(t);
    else openWeb(href);
  };
  /*
   * 앱 화면이 끝난 뒤 웹을 옮길 곳(운동을 마치면 축하 화면 · 더보기에서 고른 곳) — shell/web-nav.ts. 탭 · 앱 화면이 있는 곳은 그리로,
   * '#settings' · '#profile' 은 웹 설정 · 내 정보 창(주소가 없다 — 앱 화면을 걷고 연다). 처리기는 늘 지금 탭 목록을 보게 ref 로.
   */
  const navTo = useRef<(href: string) => void>(() => undefined);
  useEffect(() => {
    navTo.current = (href) => {
      if (href === '#refresh') {
        /* 앱 화면이 저장해 웹 틀(탭 잠금 · 목록)이 바뀌었다 — 웹이 다시 받으면 탭 목록을 새로 알린다 */
        setWebNutrition(false);
        setWebHome(false);
        web.current?.injectJavaScript('window.__bpRefresh && window.__bpRefresh();true;');
      } else if (href === '#settings' || href === '#profile') {
        /* 앞으로 내는 것은 웹이 창을 연 뒤 알린다(webfront true) — 연결이 없는 웹 화면이면 아무 일도 안 일어나고 갇히지 않는다 */
        web.current?.injectJavaScript(`window.__bpOpen && window.__bpOpen('${href.slice(1)}');true;`);
      } else if (isNativePath(href)) openNative(href);
      else goTab(href);
    };
  });
  useWebNav(useCallback((href: string) => navTo.current(href), []));
  /* 앱 설정 화면에서 고른 테마 · 단위를 웹에도 — 웹 다리(expo-tabs.tsx __bpPrefs)가 없는 화면이면 저장소에만 두고 다음에 열 때 칠해진다 */
  useEffect(
    () =>
      onPrefsChange((p) => {
        const keys = Object.fromEntries(Object.entries(p).map(([k, v]) => [PREF_KEYS[k as keyof typeof PREF_KEYS], v]));
        web.current?.injectJavaScript(
          `(function(){var p=${JSON.stringify(p)};if(window.__bpPrefs)window.__bpPrefs(p);else{var k=${JSON.stringify(keys)};for(var i in k)try{localStorage.setItem(i,k[i])}catch(e){}}})();true;`
        );
      }),
    []
  );

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
    markAppReady();
  }, []);

  /** 우리 사이트 밖 주소(유튜브 · 결제 · 메일 등)는 웹뷰에서 열지 않고 폰의 앱 · 사파리로 */
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (!req.isTopFrame) return true;
    let host = '';
    try {
      host = new URL(req.url).host;
    } catch {
      return false;
    }
    /* 네이티브로 옮긴 화면 — 사이트 대신 앱 화면을 연다(구속 측정, 검토 D3) */
    /* ?web=1 은 옛 앱 세션을 웹 구속 화면이 마무리하는 길이라 가로채지 않는다(app/(session)/velocity/page.tsx) */
    const u = new URL(req.url);
    if (host === SITE_HOST && NATIVE_PATHS.has(u.pathname) && u.searchParams.get('web') !== '1') {
      openNative(u.pathname + u.search);
      return false;
    }
    if (
      host === SITE_HOST ||
      req.url.startsWith('about:') ||
      req.url.startsWith('blob:') ||
      req.url.startsWith('data:')
    )
      return true;
    void Linking.openURL(req.url);
    return false;
  }, []);

  /* 사이트 안에서 누른 이동은 페이지를 새로 안 불러 onShouldStart 가 못 본다 — 사이트(app/(session)/velocity/open-native.tsx)가 알려 준다 */
  /* 옛 앱이 남긴 저장 안 한 구속 세션 — 앱을 켤 때 한 번 묻고, 마무리하기면 웹 구속 화면이 세션 요약부터 연다 */
  const askOldVelocity = async (pitches: number, uploads: number) => {
    if (askedOldVelocity || path.startsWith('/velocity')) return;
    askedOldVelocity = true;
    const until = Number(await loadJson(OLD_VELOCITY_SNOOZE)) || 0;
    if (Date.now() < until) return;
    const what = [pitches ? `저장하지 않은 공 ${pitches}개` : '', uploads ? `못 올린 영상 ${uploads}개` : ''].filter(Boolean).join(' · ');
    Alert.alert('예전 앱에 맡겨 둔 구속 측정이 있어요', `${what}. 웹 화면에서 마저 저장해 주세요.`, [
      { text: '나중에', style: 'cancel', onPress: () => void saveJson(OLD_VELOCITY_SNOOZE, Date.now() + 24 * 60 * 60 * 1000) },
      { text: '마무리하기', onPress: () => openWeb('/velocity?resume=1&web=1') },
    ]);
  };
  /* 알림 처리기(onMessage)는 한 번 만든다 — 늘 지금 주소 · 웹 열기를 보게 ref 로 */
  const oldVelocity = useRef(askOldVelocity);
  useEffect(() => {
    oldVelocity.current = askOldVelocity;
  });

  /* 로그인 화면에 왔다 = 로그아웃 — 앞사람 기록과 함께 껍데기 상태(붙여 둔 판 · 웹 홈/영양 · 탭 · 종목 바)도 처음으로 */
  const resetShell = useCallback(() => {
    resetAccount();
    askNo.current++;
    setToday(null);
    setMeOk(false);
    setSeen(UNSEEN);
    setWebHome(false);
    setWebNutrition(false);
    setTabs(DEFAULT_TABS);
    setSportBars(DEFAULT_SPORT_BARS);
  }, []);

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: {
      t?: string;
      path?: string;
      items?: ShellTab[] & Record<string, string | null>;
      sports?: { pitch?: unknown; hit?: unknown };
      on?: boolean;
      search?: string;
      groups?: MenuGroup[];
      nickname?: unknown;
      avatarUrl?: unknown;
      isAdmin?: unknown;
      pitches?: unknown;
      uploads?: unknown;
    };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'native' && msg.path) return openNative(msg.path);
    if (msg.t === 'tabs' && Array.isArray(msg.items)) {
      setTabs(msg.items);
      setMenuTabs(msg.items);
      const sp = msg.sports;
      if (sp && Array.isArray(sp.pitch) && Array.isArray(sp.hit)) setSportBars({ pitch: sp.pitch, hit: sp.hit });
      return;
    }
    if (msg.t === 'path' && typeof msg.path === 'string') {
      const loc = { path: msg.path, search: typeof msg.search === 'string' ? msg.search : '' };
      webArrived(loc.path, loc.search);
      /* 더 새 이동이 가는 중에 늦게 온 옛 이동의 답 — 화면 · 탭 불을 그쪽으로 돌리지 않는다 */
      if (route.arrive(loc) === 'stale') return;
      arrived();
      setPath(loc.path);
      setSearch(loc.search);
      return;
    }
    if (msg.t === 'wrote') return markWrite();
    if (msg.t === 'tabbar') return setBarOn(msg.on === true);
    if (msg.t === 'adopt' && msg.items) return void adoptWebValues(msg.items, WEB_RAW_KEYS).then(reloadPrefs);
    if (msg.t === 'menu' && Array.isArray(msg.groups))
      return setMenu({
        groups: msg.groups,
        nickname: String(msg.nickname ?? ''),
        avatarUrl: typeof msg.avatarUrl === 'string' ? msg.avatarUrl : null,
        isAdmin: msg.isAdmin === true,
      });
    if (msg.t === 'webfront') return setWebFront(msg.on === true);
    if (msg.t === 'loc') {
      if (typeof msg.path === 'string' && isLoginPath(msg.path)) resetShell();
      return;
    }
    if (msg.t === 'oldvelo') return void oldVelocity.current(Number(msg.pitches) || 0, Number(msg.uploads) || 0);
    /* 진동 · 화면 켜 두기 · 알림 · 테마(작은 다리, lib/cap-bridge.ts) */
    handleCapMessage(
      msg,
      (script) => web.current?.injectJavaScript(script),
      (t) => t.color && setPageColor(t.color)
    );
  }, [resetShell, arrived]);

  const onNav = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading) setFailed(false);
    /* 로그인 화면 = 로그아웃했거나 로그인이 풀렸다 — 앞사람 기록(메모리 · 폰)을 지운다. 다음 사람이 로그인하면 새로 받는다 */
    let pathname = '';
    try {
      pathname = new URL(nav.url).pathname;
    } catch {
      return;
    }
    if (isLoginPath(pathname)) resetShell();
    /*
     * 마스터 계정은 (app) 틀이 웹 /manage 로 보낸다 — 앱에서는 팀 · 레슨장 공간(앱 화면)을 연다(결정 3: 마스터 계정엔 내 싱커가 없다).
     * 서버 이동(redirect)은 shouldStart 를 안 거칠 수 있어 주소가 바뀐 것을 여기서 본다. '?web=1' 은 일부러 웹.
     */
    if (!nav.loading && (pathname === '/manage' || pathname.startsWith('/manage/')) && !/[?&]web=1\b/.test(nav.url)) openNative('/org');
  }, [resetShell]);

  /*
   * 판 넷 — 하나씩 따로 만들어 둔다. 한 덩어리로 쓰면 컴파일러가 판 넷을 한 묶음으로 기억해, 탭을 옮길 때(pagerIndex) · 판 하나가 붙을 때마다
   * 붙어 있는 판이 모두 다시 그려졌다(2026-10-25 화면 전환 점검). 따로 두면 바뀐 판만 새로 만든다
   */
  const pitchLog = showPitch && new URLSearchParams(search).get('view') === 'log';
  const { home: seenHome, pitch: seenPitch, training: seenTraining, nutrition: seenNutrition } = seen;
  const homeSlot = today && seenHome ? <HomeTab key="home" today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} onTab={goTab} /> : null;
  const pitchSlot = today && seenPitch ? <PitchTab key="pitch" today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} log={pitchLog} /> : null;
  const trainingSlot = today && seenTraining ? <TrainingTab key="training" today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} /> : null;
  const nutritionSlot = today && seenNutrition ? <NutritionTab key="nutrition" today={today} bottom={TAB_BAR_HEIGHT} onWebNutrition={openWebNutrition} /> : null;

  /* 웹을 못 불러와도(꺼진 망에서 켬) 탭 막대 · 앱 탭은 그대로 쓴다 — 사이트가 '막대 켬'을 못 알려 주니 실패면 켠 것으로 본다 */
  const barShown = (barOn || failed) && !webFront && !isCheckinPath(path);

  return (
    <View style={{ flex: 1 }}>
      <RefWebView
        key={load}
        ref={web}
        injectedJavaScriptBeforeContentLoaded={CAP_SHIM + WATCH_WEB}
        injectedJavaScript={ADOPT_WEB_VALUES + OLD_VELOCITY}
        source={{ uri: `${SITE_URL}${START_PATH}` }}
        applicationNameForUserAgent={APP_UA}
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsLinkPreview={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        decelerationRate="normal"
        pullToRefreshEnabled={false}
        style={[
          styles.web,
          dark && styles.offlineDark,
          pageColor ? { backgroundColor: pageColor } : null,
        ]}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={onNav}
        onMessage={onMessage}
        onLoadEnd={hideSplash}
        onError={() => {
          hideSplash();
          setFailed(true);
        }}
        onContentProcessDidTerminate={() => {
          resetWebState();
          setLoad((n) => n + 1);
        }}
      />
      {/* 웹 자리에만 알림 — 예전엔 껍데기 전체를 이 화면으로 바꿔 탭 막대 · 앱 탭까지 못 썼다(2026-10-21) */}
      {failed ? (
        <View style={[StyleSheet.absoluteFill, styles.offline, dark && styles.offlineDark, { paddingBottom: 24 + TAB_BAR_HEIGHT }]}>
          <Text style={[styles.title, dark && styles.textDark]}>인터넷에 연결할 수 없어요</Text>
          <Text style={[styles.body, dark && styles.mutedDark]}>연결되면 다시 불러와 주세요.</Text>
          <Press
            accessibilityRole="button"
            style={styles.button}
            onPress={() => {
              setFailed(false);
              resetWebState();
              setLoad((n) => n + 1);
            }}
          >
            <Text style={styles.buttonText}>다시 불러오기</Text>
          </Press>
        </View>
      ) : null}
      {/* 오늘을 아직 모름 — 웹 홈 · 투구 판은 새 앱에서 비어 있어 그 자리를 앱이 채운다(받는 중 · 못 받음) */}
      {barOn && !today && !webFront && !isCheckinPath(path) ? (
        <View style={[StyleSheet.absoluteFill, styles.offline, dark && styles.offlineDark, { paddingBottom: 24 + TAB_BAR_HEIGHT }]}>
          {meError ? (
            <>
              <Text style={[styles.body, dark && styles.mutedDark]}>{meError}</Text>
              <Press accessibilityRole="button" style={styles.button} onPress={() => setMeTry((n) => n + 1)}>
                <Text style={styles.buttonText}>다시 불러오기</Text>
              </Press>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      ) : null}
      {/* 탭 넷 — 나란히 두고 240ms 에 미끄러진다(웹 tab-pager). 한 번 연 판은 붙여 둬서 굴린 자리가 남는다 */}
      {today ? <TabPager index={pagerIndex} visible={pagerOn} slots={[homeSlot, pitchSlot, trainingSlot, nutritionSlot]} /> : null}
      {/* 홈 밖의 탭은 위 막대가 없어 시계 자리를 막으로 덮는다(웹 data-top-veil) */}
      {today && pagerOn && pagerIndex !== 0 ? <ClockVeil /> : null}
      {/*
        웹 창(설정 · 내 정보 — 웹 틀의 폴더 모양 창)이 앞에 떠 있는 동안은 숨긴다 — 그 창을 닫는 바깥 막은 아래쪽 띠뿐인데 이 막대가 그 띠를
        덮어, 앱에서는 창을 닫을 자리가 없었다(2026-10-18 시뮬레이터에서 확인). 창이 닫히면 웹이 알려(webfront false) 다시 보인다.
      */}
      {/*
        체크인(웹 (session) 흐름)으로 갈 때는 앱이 주소를 정하는 그 순간 숨긴다 — 웹 틀이 떨어져 '막대 끔'을 알려 오기 전까지 체크인 화면 위에
        막대가 같이 보였다(2026-10-20 김민: "체크인 고치기를 누르면 체크인과 하단 바가 같이 나온다").
      */}
      {/*
        투구 · 타격 안에서는 종목 바(‹ · 기록 · 트레이닝 · …)로 갈아 끼운다 — 커뮤니티 하단바와 같은 back · enter(웹 sport-tabs.tsx 와 같은 규칙).
        key 가 바뀌어 새로 붙을 때마다 들어오기 연출이 돈다.
      */}
      {barShown ? (
        sport ? (
          <TabBar
            key={sport}
            tabs={sportBars[sport]}
            active={pressed ?? sportActiveHref(sport, path, search)}
            onPress={pressTab}
            back={() => goTab('/today')}
            enter
          />
        ) : (
          <TabBar
            key="main"
            tabs={tabs}
            active={pressed ?? (showPitch ? '/videos' : showHome ? '/today' : showNutrition ? '/nutrition' : active)}
            onPress={pressTab}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#f4f7fb' },
  offline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#f4f7fb',
  },
  offlineDark: { backgroundColor: '#000000' },
  title: { fontSize: 20, fontWeight: '700', color: '#1d1d1f' },
  body: { fontSize: 15, color: '#6e6e73' },
  textDark: { color: '#f5f5f7' },
  mutedDark: { color: '#98989d' },
  button: {
    marginTop: 8,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#0a84d6',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600', color: '#ffffff' },
});

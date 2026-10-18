import * as Linking from 'expo-linking';
import { type Href, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
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
import { resetImported } from '~/pitch/attach';
import { resetScanned } from '~/nutrition/scanned';
import { HomeTab, resetHomeCache } from '~/home/tab';
import { NutritionTab } from '~/nutrition/tab';
import { TrainingTab, resetTrainingCache } from '~/training/tab';
import { resetPitchTodayCache } from '~/pitch/today-card';
import { resetVelocityDayCache } from '~/pitch/velocity-day';
import { resetNutritionStore } from '~/nutrition/api';
import { useWebNav } from '~/shell/web-nav';
import { setMenu, useMenu, type MenuGroup } from '~/shell/menu-store';
import { adoptWebValues, cacheClear, loadJson, saveJson } from '~/lib/store';
import { clearDraft } from '~/velocity/draft';
import { rpc } from '~/lib/rpc';
import { drainOutbox, setOutboxOwner } from '~/workout/outbox';
import { drainChecks } from '~/armcare/outbox';
import { sendCheck } from '~/armcare/send';
import { PitchTab } from '~/pitch/tab';
import { DEFAULT_TABS, TAB_BAR_HEIGHT, TabBar, type ShellTab } from '~/shell/tab-bar';

type WebViewHandle = { injectJavaScript(script: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(velocity/engine.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebViewHandle> }
>;

/**
 * 앱 껍데기 — 사이트 웹뷰 하나 + 앱 아래 탭 막대(shell/tab-bar.tsx). 홈 · 트레이닝 · 영양은 웹뷰가(사이트의 판 넘기기로 바로 옮김), 투구 탭은
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
  /^\/community(\/[\w-]+)?(\?[\w=&%.-]*)?$/,
  /^\/support(\/notices(\/[\w-]+)?|\/inquiries(\/[\w-]+)?)?$/,
  /^\/library\/(training|mechanics)$/,
  /^\/board(\/[\w-]+)?$/,
  /^\/warmup$/,
  /^\/workout-done\?id=[\w-]+$/,
];
const isNativePath = (path: string) => NATIVE_PATHS.has(path) || NATIVE_ROUTES.some((r) => r.test(path));
function openNative(path: string) {
  /* 같은 주소만 1.5초 안에 한 번 — 예전엔 어느 주소든 막아, 앱 화면을 닫자마자 다른 앱 화면을 열면 말없이 안 열렸다 */
  if (path === lastOpen.path && Date.now() - lastOpen.at < 1500) return;
  if (NATIVE_PATHS.has(path)) router.push('/velocity');
  else if (NATIVE_ROUTES.some((r) => r.test(path))) router.push(path as Href);
  else return;
  lastOpen = { path, at: Date.now() };
}
const openVelocity = () => openNative('/velocity');

/** 사이트 주소 → 그 주소가 속한 탭(웹 lib/nav.ts NAV_ALSO 와 같은 묶음) */
function tabOf(path: string, tabs: ShellTab[]): string | null {
  const group: Record<string, string[]> = {
    '/today': ['/today', '/coach'],
    '/videos': ['/videos', '/pitch-log', '/admin/velocity'],
    '/training': ['/training'],
    '/nutrition': ['/nutrition'],
  };
  for (const t of tabs) {
    const base = t.href.split('?')[0];
    const roots = group[base] ?? [base];
    if (roots.some((r) => path === r || path.startsWith(`${r}/`))) return t.href;
  }
  return null;
}

/**
 * 옛 앱(웹 화면)이 이 폰의 localStorage 에 둔 값 가운데 앱 화면이 쓰는 것 — 처음 그릴 때 앱 저장소로 옮긴다(이미 있으면 안 덮는다,
 * lib/store.ts adoptWebValues). 같은 번들 ID 라 옛 앱의 웹 저장소 · 로그인 쿠키는 그대로 남아 있다.
 */
const WEB_JSON_KEYS = ['bullpen-velocity-setup'];
/** 웹 설정 창이 고치는 글자 값 — 늘 웹을 따른다(운동 진행 화면의 kg · lb, lib/units-storage.ts WEIGHT_KEY) */
const WEB_RAW_KEYS = ['bullpen-unit-weight'];
const WEB_KEYS = [...WEB_JSON_KEYS, ...WEB_RAW_KEYS];
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

const isLoginPath = (p: string) => p === '/login' || p.startsWith('/login/') || p === '/signup';

/** 로그아웃 — 앞사람 기록(메모리 · 폰)을 지운다. 다음 사람이 로그인하면 새로 받는다 */
function resetAccount() {
  resetMe();
  setOutboxOwner(null);
  resetPitchStore();
  resetHomeCache();
  resetNutritionStore();
  resetTrainingCache();
  resetPitchTodayCache();
  resetVelocityDayCache();
  resetImported();
  resetScanned();
  /* 더보기의 이름 · 관리자 칸 — 다음 사람의 메뉴 알림이 오기 전까지 앞사람 것이 보였다 */
  setMenu({ groups: [], nickname: '' });
  void cacheClear();
  /* 저장 안 한 구속 세션(폰에 맡김) — 다음 사람이 '이어서 하기'로 앞사람 공을 제 기록에 저장하지 않게. 클립 파일은 tmp 라 하루 안에 앱이 치운다 */
  void clearDraft();
}

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
  const dark = useColorScheme() === 'dark';
  const web = useRef<WebViewHandle>(null);
  /** 사이트 테마의 바탕색 — 오래 뒤에 있다 돌아와 다시 그리는 동안 흰 화면이 번쩍이지 않게(옛 앱의 bullpenTheme 과 같은 일) */
  const [pageColor, setPageColor] = useState<string | null>(null);
  /* 앱 탭 막대 — 사이트가 알려 준 탭 · 지금 주소 · 막대를 보일지(탭이 없는 웹 화면에서는 숨김) */
  const [tabs, setTabs] = useState<ShellTab[]>(DEFAULT_TABS);
  const [path, setPath] = useState('/today');
  /* 주소의 ? 뒤 — 트레이닝은 첫 화면(?view=home)만 앱 화면이고 암케어 · 메커니즘(?view=…)은 웹이라 가른다 */
  const [search, setSearch] = useState('');
  const [barOn, setBarOn] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    if (barOn && !today)
      void loadMe().then(
        (m) => setToday(m.today),
        () => undefined
      );
  }, [barOn, today]);
  /*
   * 운동 중 신호가 없어 폰에 남은 세트 · 암케어 체크 — 앱을 켤 때 · 다시 볼 때 보낸다(그 화면을 다시 안 열어도 — 암케어 체크는 7일 지나면 버려진다).
   * 서버가 거절한 것은 대기열이 뺀다.
   * 로그인 전이면 보내기가 막혀 그대로 남는다(다음 기회에).
   */
  useEffect(() => {
    if (!barOn) return;
    /* 누구인지 안 뒤에 — 대기열은 지금 계정 것만 보낸다 */
    void loadMe().then(
      (m) => {
        setOutboxOwner(m.userId);
        drainQueues();
      },
      () => undefined
    );
  }, [barOn]);
  /* 앱을 다시 볼 때 오늘을 다시 묻는다 — 밤을 넘겨 켜 둔 앱이 어제 달력 · 어제 홈을 보이지 않게 */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      drainQueues();
      resetMe();
      void loadMe().then(
        (m) => setToday(m.today),
        () => undefined
      );
    });
    return () => sub.remove();
  }, []);
  const active = tabOf(path, tabs);
  /* 웹을 앞으로 — 앱 화면 위에서 연 웹 창(설정)이 보이게 앱 화면을 잠시 걷는다. 그 창을 닫거나 탭을 누르면 돌아온다 */
  const [webFront, setWebFront] = useState(false);
  const pitchTab = tabs.find((t) => t.href === '/videos');
  /* 투구 탭의 첫 화면일 때만 앱 화면 — 잠겼으면 웹의 첫 설정 화면(주소가 /videos/setup)으로 간다 */
  const showPitch = barOn && path === '/videos' && !!today && !pitchTab?.locked && !webFront;
  /* 홈 첫 화면도 앱 화면 — '웹 홈에서' 를 누르면 홈 탭을 다시 누를 때까지 웹 홈(일정 · 자세한 그날 칸) */
  const [webHome, setWebHome] = useState(false);
  const showHome = barOn && path === '/today' && !!today && !webHome && !webFront;
  /* 영양 첫 화면도 앱 화면(오늘 먹은 것 · 담기 · 체중) — '식단 · 목표 · 통계'를 누르면 영양 탭을 다시 누를 때까지 웹 영양 */
  const [webNutrition, setWebNutrition] = useState(false);
  const nutritionTab = tabs.find((t) => t.href === '/nutrition');
  const showNutrition = barOn && path === '/nutrition' && !!today && !webNutrition && !nutritionTab?.locked && !webFront;
  /* 트레이닝 첫 화면(앱 카드 셋)도 앱 화면 — 카드를 누르면(암케어 · 메커니즘 · 운동 전체) 주소가 ?view=… 로 바뀌어 웹이 보인다 */
  const trainingTab = tabs.find((t) => t.href.startsWith('/training'));
  const trainingView = new URLSearchParams(search).get('view');
  const showTraining =
    barOn && path === '/training' && (trainingView === 'home' || trainingView === 'last') && !!today && !trainingTab?.locked && !webFront;
  const menu = useMenu();

  const goWeb = (href: string) =>
    web.current?.injectJavaScript(`window.__bpTab && window.__bpTab(${JSON.stringify(href)});true;`);
  const pressTab = (t: ShellTab) => {
    setWebFront(false);
    if (t.href.startsWith('/training') && !t.locked) {
      setPath('/training');
      setSearch(t.href.split('?')[1] ?? '');
    }
    /* 더보기는 앱 화면(사이트가 목록을 알려 준 뒤) — 웹 메뉴는 앱 화면 위에서 열면 밑에 깔려 안 보인다 */
    if (t.href === '/more' && menu.groups.length) return router.push('/more' as Href);
    if ((t.href === '/videos' || t.href === '/today' || t.href === '/nutrition') && !t.locked) setPath(t.href);
    if (t.href === '/today') setWebHome(false);
    if (t.href === '/nutrition') setWebNutrition(false);
    goWeb(t.href);
  };
  /* 투구 탭(앱 화면)에서 아직 웹인 화면(투구 분석 · 3D 동작 분석)으로 — 앱 화면을 바로 걷고 웹이 그 주소로 간다 */
  const openWeb = (href: string) => {
    setPath(href.split('?')[0]);
    setSearch(href.split('?')[1] ?? '');
    goWeb(href);
  };
  const goTab = (href: string) => {
    const t = tabs.find((x) => x.href === href);
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
      if (href === '#settings' || href === '#profile') {
        /* 앞으로 내는 것은 웹이 창을 연 뒤 알린다(webfront true) — 연결이 없는 웹 화면이면 아무 일도 안 일어나고 갇히지 않는다 */
        web.current?.injectJavaScript(`window.__bpOpen && window.__bpOpen('${href.slice(1)}');true;`);
      } else if (isNativePath(href)) openNative(href);
      else goTab(href);
    };
  });
  useWebNav(useCallback((href: string) => navTo.current(href), []));

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
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
      openVelocity();
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

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: {
      t?: string;
      path?: string;
      items?: ShellTab[] & Record<string, string | null>;
      on?: boolean;
      search?: string;
      groups?: MenuGroup[];
      nickname?: unknown;
      pitches?: unknown;
      uploads?: unknown;
    };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'native' && msg.path) return openNative(msg.path);
    if (msg.t === 'tabs' && Array.isArray(msg.items)) return setTabs(msg.items);
    if (msg.t === 'path' && typeof msg.path === 'string') {
      setPath(msg.path);
      setSearch(typeof msg.search === 'string' ? msg.search : '');
      return;
    }
    if (msg.t === 'tabbar') return setBarOn(msg.on === true);
    if (msg.t === 'adopt' && msg.items) return void adoptWebValues(msg.items, WEB_RAW_KEYS);
    if (msg.t === 'menu' && Array.isArray(msg.groups)) return setMenu({ groups: msg.groups, nickname: String(msg.nickname ?? '') });
    if (msg.t === 'webfront') return setWebFront(msg.on === true);
    if (msg.t === 'loc') {
      if (typeof msg.path === 'string' && isLoginPath(msg.path)) {
        resetAccount();
        setToday(null);
      }
      return;
    }
    if (msg.t === 'oldvelo') return void oldVelocity.current(Number(msg.pitches) || 0, Number(msg.uploads) || 0);
    /* 진동 · 화면 켜 두기 · 알림 · 테마(작은 다리, lib/cap-bridge.ts) */
    handleCapMessage(
      msg,
      (script) => web.current?.injectJavaScript(script),
      (t) => t.color && setPageColor(t.color)
    );
  }, []);

  const onNav = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading) setFailed(false);
    /* 로그인 화면 = 로그아웃했거나 로그인이 풀렸다 — 앞사람 기록(메모리 · 폰)을 지운다. 다음 사람이 로그인하면 새로 받는다 */
    let pathname = '';
    try {
      pathname = new URL(nav.url).pathname;
    } catch {
      return;
    }
    if (isLoginPath(pathname)) {
      resetAccount();
      setToday(null);
    }
  }, []);

  if (failed) {
    return (
      <View style={[styles.offline, dark && styles.offlineDark]}>
        <Text style={[styles.title, dark && styles.textDark]}>
          인터넷에 연결할 수 없어요
        </Text>
        <Text style={[styles.body, dark && styles.mutedDark]}>
          연결되면 다시 불러와 주세요.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setFailed(false);
            setLoad((n) => n + 1);
          }}
        >
          <Text style={styles.buttonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <RefWebView
        key={load}
        ref={web}
        injectedJavaScriptBeforeContentLoaded={CAP_SHIM}
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
        onContentProcessDidTerminate={() => setLoad((n) => n + 1)}
      />
      {showHome && today ? (
        <View style={StyleSheet.absoluteFill}>
          <HomeTab today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} onTab={goTab} onWebHome={() => setWebHome(true)} />
        </View>
      ) : null}
      {showTraining && today ? (
        <View style={StyleSheet.absoluteFill}>
          <TrainingTab today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} />
        </View>
      ) : null}
      {showNutrition && today ? (
        <View style={StyleSheet.absoluteFill}>
          <NutritionTab today={today} bottom={TAB_BAR_HEIGHT} onWebNutrition={() => setWebNutrition(true)} />
        </View>
      ) : null}
      {showPitch && today ? (
        <View style={StyleSheet.absoluteFill}>
          <PitchTab today={today} bottom={TAB_BAR_HEIGHT} onWeb={openWeb} />
        </View>
      ) : null}
      {/*
        웹 창(설정 · 내 정보 — 웹 틀의 폴더 모양 창)이 앞에 떠 있는 동안은 숨긴다 — 그 창을 닫는 바깥 막은 아래쪽 띠뿐인데 이 막대가 그 띠를
        덮어, 앱에서는 창을 닫을 자리가 없었다(2026-10-18 시뮬레이터에서 확인). 창이 닫히면 웹이 알려(webfront false) 다시 보인다.
      */}
      {barOn && !webFront ? (
        <TabBar
          tabs={tabs}
          active={showPitch ? '/videos' : showHome ? '/today' : showNutrition ? '/nutrition' : showTraining ? (trainingTab?.href ?? active) : active}
          onPress={pressTab}
        />
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

'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { expoLevel } from '@/lib/app-env';

/**
 * 새 아이폰 앱(Expo)이 로그인 · 가입을 앱 화면으로 맡은 판(native/src/app/login.tsx · signup.tsx). 그 앱이면 이 웹 로그인 자리는 비워 두고
 * 앱에게 '로그인 화면을 열어 줘'를 알린다. OpenNative(velocity)처럼 뒤로 가지 않는다 — 로그인 전에는 돌아갈 화면이 없다(갔다가 다시 로그인으로 돌아와 되풀이).
 *
 * 앱 로그인이 끝나면 앱 껍데기가 window.__bpTab('/today') 로 웹을 옮긴다. 이 자리에는 판 넘기기((app) 틀의 ExpoTabBridge)가 없어 그 이름을
 * 여기서 받는다 — 판을 넘기지 않고 주소를 새로 연다(새 로그인 쿠키로 서버가 다시 그리게).
 */
const NATIVE_LOGIN_LEVEL = 8;
const FLAG = 'data-native-login';
/**
 * 앱 로그인 화면을 여는 주소 — 앱 화면 목록(native/src/app/index.tsx NATIVE_ROUTES)은 이것만 앱으로 가로챈다. 그냥 '/login' 은 지금처럼 웹으로 가야
 * 껍데기가 로그인 주소를 보고 앞사람 기록을 지운다(로그인이 풀린 앱 화면들이 leaveTo('/login') 으로 보낸다).
 */
const NATIVE_PATH = '/login?native=1';

/** 첫 그림 전에 표시를 단다(웹 로그인 폼이 한 번 번쩍이지 않게) — page.tsx 의 main 이 이 표시면 안 보인다 */
const EARLY = `(function(){var m=/BullpenNative\\/(\\d+)/.exec(navigator.userAgent);if(m&&+m[1]>=${NATIVE_LOGIN_LEVEL})document.documentElement.setAttribute('${FLAG}','')})()`;

const noSubscribe = () => () => {};

export function NativeLoginBridge() {
  /* 스크립트는 서버 그림 · 붙는 동안만 — 클라이언트 이동으로 들어오면 React 가 'script 태그' 오류를 낸다(효과가 대신 표시를 단다) */
  const serverPass = useSyncExternalStore(noSubscribe, () => false, () => true);
  useEffect(() => {
    if (expoLevel(navigator.userAgent) < NATIVE_LOGIN_LEVEL) return;
    const html = document.documentElement;
    html.setAttribute(FLAG, '');
    const w = window as unknown as {
      ReactNativeWebView?: { postMessage(s: string): void };
      __bpTab?: (href: string) => void;
    };
    const go = (href: string) => window.location.replace(href);
    w.__bpTab = go;
    w.ReactNativeWebView?.postMessage(JSON.stringify({ t: 'native', path: NATIVE_PATH }));
    return () => {
      html.removeAttribute(FLAG);
      if (w.__bpTab === go) delete w.__bpTab;
    };
  }, []);
  return serverPass ? <script dangerouslySetInnerHTML={{ __html: EARLY }} /> : null;
}

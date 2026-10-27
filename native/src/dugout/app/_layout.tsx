import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '~/lib/ui';
import { useAppUpdateOnReturn } from '~/shell/app-update';
import { Intro, SPLASH_W, type IntroLook } from '~/shell/intro';
import { Toaster } from '~/shell/toast';
import { DUGOUT_GREEN, DugoutMark } from '~/dugout/mark';

/**
 * 덕아웃 앱(APP_VARIANT=dugout — app.config.js)의 뿌리. 화면 폴더가 싱커(src/app)와 따로라 싱커 화면은 묶이지 않는다.
 * 섞기 방식(2026-10-24 김민) — 덕아웃 사이트 웹뷰 하나 + 앱 탭 막대(index.tsx), 앱 화면은 하나씩 더한다(지금은 로그인).
 */
SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: 'index' };

/*
 * 시작 연출 — 싱커 앱과 같은 장면 · 같은 2.2초(shell/intro.tsx · intro-timeline.ts, 2026-10-27 김민): 시작 화면의 큰 지붕 로고가 작아지며 이름 칸으로 → D · U · G · O · U · T 가 밀려 나온다.
 * 큰 로고 = 시작 화면 그림(scripts/make-dugout-app-assets.mjs — 64 칸 그림의 로고 상자 57.7 × 39.4 를 그림 폭의 60% 로, 가운데)과 같은 크기 · 자리.
 * 이름 줄은 웹 Wordmark brand='dugout'(로고 0.78em · 틈 0.18em · 글자 가운데에 맞춤). 글자는 싱커 연출처럼 DIN Condensed(웹은 Bebas).
 */
const BOX_W = 57.7;
const BIG = (SPLASH_W * 0.6 * 64) / BOX_W;
const DUGOUT_INTRO: IntroLook = {
  label: '덕아웃',
  letters: ['D', 'U', 'G', 'O', 'U', 'T'],
  aspect: 1,
  bigH: BIG,
  /* 로고 상자 가운데(32.15, 31.7)가 그림 가운데(32, 32)에서 비킨 만큼 */
  bigOffset: [((32 - 32.15) * BIG) / 64, ((32 - 31.7) * BIG) / 64],
  /* DIN Condensed 대문자는 글자 상자 밑 0.3em ~ 1em — 로고 가운데를 대문자 가운데(밑에서 0.65em)에 */
  slot: (size) => ({ h: size * 0.78, right: size * 0.18, bottom: size * (0.65 - 0.39) }),
  mark: (h) => <DugoutMark size={h} color={DUGOUT_GREEN} />,
};

export default function DugoutLayout() {
  const theme = useTheme();
  useAppUpdateOnReturn();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* 로그인 — 덕아웃은 로그인 없이도 보니 끌어내려 닫을 수 있는 창 */}
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
      </Stack>
      <Toaster />
      <Intro look={DUGOUT_INTRO} />
    </GestureHandlerRootView>
  );
}

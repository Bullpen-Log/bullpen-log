import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '~/lib/ui';
import { useAppUpdateOnReturn } from '~/shell/app-update';
import { Toaster } from '~/shell/toast';

/**
 * 덕아웃 앱(APP_VARIANT=dugout — app.config.js)의 뿌리. 화면 폴더가 싱커(src/app)와 따로라 싱커 화면은 묶이지 않는다.
 * 섞기 방식(2026-10-24 김민) — 덕아웃 사이트 웹뷰 하나 + 앱 탭 막대(index.tsx), 앱 화면은 하나씩 더한다(지금은 로그인).
 */
SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: 'index' };

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
    </GestureHandlerRootView>
  );
}

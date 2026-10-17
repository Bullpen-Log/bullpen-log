import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

/** 사이트 첫 화면이 그려질 때까지 시작 화면을 둔다(index.tsx 가 걷는다) — 흰 화면이 번쩍이지 않게 */
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

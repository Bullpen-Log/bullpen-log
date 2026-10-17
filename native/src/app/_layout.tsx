import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

/** 사이트 첫 화면이 그려질 때까지 시작 화면을 둔다(index.tsx 가 걷는다) — 흰 화면이 번쩍이지 않게 */
SplashScreen.preventAutoHideAsync();

/*
 * 같은 곳으로 0.7초 안에 두 번 미는 것은 한 번으로 — 단추를 두 번 누르면 같은 화면(구속 측정 카메라 · 체크인 · 글 · 분석)이 두 겹 쌓였다.
 * 누르는 곳이 스물 곳 넘게 흩어져 있어 한 곳(router.push)에서 막는다. 다른 곳으로 미는 것 · 다른 인자는 그대로 간다.
 * ponytail: 전역 한 칸 — 서로 다른 두 곳을 동시에 미는 일은 없다고 본다.
 */
const push = router.push.bind(router);
let lastPush = { key: '', at: 0 };
try {
  router.push = ((href, options) => {
    const key = JSON.stringify(href);
    const now = Date.now();
    if (key === lastPush.key && now - lastPush.at < 700) return;
    lastPush = { key, at: now };
    push(href, options);
  }) as typeof router.push;
} catch {
  /* router 를 못 고치는 판이면 예전처럼(두 번 누르면 두 겹) */
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="pitch/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pitch/import" options={{ presentation: 'modal' }} />
        <Stack.Screen name="nutrition/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="more" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

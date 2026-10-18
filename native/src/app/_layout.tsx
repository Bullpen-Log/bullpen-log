import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

/** 사이트 첫 화면이 그려질 때까지 시작 화면을 둔다(index.tsx 가 걷는다) — 흰 화면이 번쩍이지 않게 */
SplashScreen.preventAutoHideAsync();

/* 알림 · 딥링크(bullpenlog://profile)로 꺼진 앱을 열어도 밑에 웹 껍데기(index)를 깐다 — 뒤로 가면 탭으로 */
export const unstable_settings = { initialRouteName: 'index' };

/*
 * 같은 곳으로 0.7초 안에 두 번 미는 것은 한 번으로 — 단추를 두 번 누르면 같은 화면(구속 측정 카메라 · 체크인 · 글 · 분석)이 두 겹 쌓였다.
 * 누르는 곳이 스물 곳 넘게 흩어져 있어 한 곳(router.push)에서 막는다. 화면이 붙은 뒤에 건다 — expo-router 가 첫 그림 때 router 의 함수를
 * 진짜로 갈아 끼워(routingQueueContext Object.assign), 모듈을 읽을 때 걸면 지워진다. 효과는 자식(그 갈아 끼우기) 뒤에 돈다.
 * ponytail: 전역 한 칸 — 서로 다른 두 곳을 동시에 미는 일은 없다고 본다.
 */
function useSinglePush() {
  useEffect(() => {
    const real = router.push;
    let last = { key: '', at: 0 };
    router.push = ((href, options) => {
      const key = JSON.stringify(href);
      const now = Date.now();
      if (key === last.key && now - last.at < 700) return;
      last = { key, at: now };
      real(href, options);
    }) as typeof router.push;
    return () => {
      router.push = real;
    };
  }, []);
}

export default function RootLayout() {
  useSinglePush();
  /* 딥링크로 앱 화면부터 열면 그 화면이 보이게 시작 화면을 걷는다 — 밑의 웹 껍데기는 가려져 있어 다 그려졌다는 알림이 오지 않았다 */
  const path = usePathname();
  useEffect(() => {
    if (path !== '/') void SplashScreen.hideAsync();
  }, [path]);
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

import { router, Stack, usePathname } from 'expo-router';
import { Toaster } from '~/shell/toast';
import { Intro, markAppReady } from '~/shell/intro';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { prefsReady, usePrefs } from '~/lib/prefs';
import { BullpenNative } from '../../modules/bullpen-native';
import { useTheme } from '~/lib/ui';

/** 사이트 첫 화면이 그려질 때까지 시작 화면을 둔다(index.tsx 가 걷는다) — 흰 화면이 번쩍이지 않게 */
SplashScreen.preventAutoHideAsync();

/* 알림 · 딥링크(bullpenlog://profile)로 꺼진 앱을 열어도 밑에 웹 껍데기(index)를 깐다 — 뒤로 가면 탭으로 */
export const unstable_settings = { anchor: 'index' };

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
  const theme = useTheme();
  useEffect(() => {
    if (path !== '/') {
      void SplashScreen.hideAsync();
      markAppReady();
    }
  }, [path]);
  /* 자판 · 동작 시트 · 날짜 바퀴 같은 기기 UI 도 설정 테마를 따른다(다크를 골랐는데 기기가 라이트면 자판이 하얗게 떴다). '자동'이면 기기 그대로 */
  const pick = usePrefs().theme;
  useEffect(() => {
    Appearance.setColorScheme(pick === 'system' ? 'unspecified' : pick === 'light' ? 'light' : 'dark');
    /* 다음 시작 화면도 이 테마로(처음 읽기 전의 기본값은 기억하지 않는다) */
    /* 옛 앱(부품에 이 기능이 없음)은 건너뛴다 */
    void prefsReady.then(() => BullpenNative.setLaunchStyle?.(pick));
  }, [pick]);
  return (
    /* 밀어서 하기(shell/swipe-row.tsx) 같은 손가락 동작 부품은 이 뿌리 안에서만 돈다 */
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 상태바 글자색 — 설정 테마를 따른다(기기 밝기가 아니라) */}
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* 구속 측정 — 웹은 멀리서 튀어나오는 zoom 전환. 앱은 옅어지며 들어온다(홈 쓸기의 검은 판 위로 이어짐) */}
        <Stack.Screen name="velocity" options={{ animation: 'fade', animationDuration: 220 }} />
        {/* 그날 화면 — 웹 휴대폰처럼 아래에서 올라오는 창(끌어내려 닫기) */}
        <Stack.Screen name="pitch/[date]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pitch/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pitch/import" options={{ presentation: 'modal' }} />
        <Stack.Screen name="nutrition/add" options={{ presentation: 'modal' }} />
        {/* 설정 · 내 정보 — 웹처럼 창으로(더보기 폴더 위에 뜨고 닫으면 폴더가 그대로) */}
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        {/* 더보기 — 뒤를 덮는 막 + 가운데 유리 폴더(웹 휴대폰 폴더와 같다) */}
        <Stack.Screen name="more" options={{ presentation: 'transparentModal', animation: 'none' }} />
        {/* 알림 종의 오늘 할 일 — 내용만큼만 올라오는 아래 시트(웹 휴대폰 종 시트와 같다) */}
        <Stack.Screen
          name="notice"
          options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 28 }}
        />
      </Stack>
      {/* '저장했어요' 같은 잠깐 알림(웹 Toaster) — 쌓인 화면 위, 시계 밑 */}
      <Toaster />
      {/* 시작 연출 — 웹 시작 연출과 같은 B → 이름(shell/intro.tsx), 사이트가 그려지면 걷힌다 */}
      <Intro />
    </GestureHandlerRootView>
  );
}

import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * 오래 쉬다 돌아왔을 때 새 화면 코드 받기 — 앱을 완전히 끄지 않는 사람도 업데이트(/api/app-update)를 받게(2026-10-20 김민: "푸시하면 바로").
 * 켤 때는 expo-updates 가 알아서 묻는다(app.json updates · 1.5초 기다림). 여기는 30분 넘게 뒤에 있다가 앞으로 왔을 때만 묻고 받아 둔다.
 * 쓰는 중에는 절대 다시 켜지 않는다(reloadAsync 없음) — 받은 것은 다음에 앱을 새로 켤 때 들어간다(2026-10-21 김민). 예전엔 주소가 '/' 일 때
 * 다시 켰는데, 웹 화면(체크인 · 글쓰기 등)도 모두 '/' 위라 쓰던 중에 앱이 다시 켜졌다.
 * expo-updates 는 바닥 모듈(ExpoUpdates)이 있을 때만 불러온다 — 그 모듈 전에 구운 앱('불펜로그 테스트' 등)이 Metro 의 새 화면 코드를 받으면
 * 불러오는 순간 오류로 켜지자마자 꺼졌다(2026-10-20).
 */
const AWAY_MS = 30 * 60 * 1000;

export function useAppUpdateOnReturn() {
  useEffect(() => {
    if (__DEV__ || !requireOptionalNativeModule('ExpoUpdates')) return;
    let leftAt = 0;
    let busy = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        if (!leftAt) leftAt = Date.now();
        return;
      }
      const away = leftAt ? Date.now() - leftAt : 0;
      leftAt = 0;
      if (away < AWAY_MS || busy) return;
      busy = true;
      void (async () => {
        const Updates = await import('expo-updates');
        if (!Updates.isEnabled) return;
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        await Updates.fetchUpdateAsync();
      })()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    });
    return () => sub.remove();
  }, []);
}

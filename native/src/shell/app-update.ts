import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * 오래 쉬다 돌아왔을 때 새 화면 코드 받기 — 앱을 완전히 끄지 않는 사람도 업데이트(/api/app-update)를 받게(2026-10-20 김민: "푸시하면 바로").
 * 켤 때는 expo-updates 가 알아서 묻는다(app.json updates · 5초 기다림). 여기는 30분 넘게 뒤에 있다가 앞으로 왔을 때만 묻고 받아 두며,
 * 지금 홈(탭 화면)에 있을 때만 바로 다시 켠다 — 운동 · 측정 · 글쓰기 중에 화면이 다시 켜지면 안 된다. 그 밖이면 다음에 켤 때 들어간다.
 */
const AWAY_MS = 30 * 60 * 1000;

export function useAppUpdateOnReturn(onHome: boolean) {
  const home = useRef(onHome);
  useEffect(() => {
    home.current = onHome;
  }, [onHome]);
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
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
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const got = await Updates.fetchUpdateAsync();
        if (got.isNew && home.current) await Updates.reloadAsync();
      })()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    });
    return () => sub.remove();
  }, []);
}

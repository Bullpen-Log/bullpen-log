import { useEffect } from 'react';
import { BullpenNative } from '../../modules/bullpen-native';

/**
 * 운동하는 동안의 시계를 다이나믹 아일랜드 · 잠금 화면에(Live Activity — 위젯 확장 plugins/rest-activity, 2026-10-20 김민).
 * 화면은 지금 상태 하나만 넘긴다: 값이 바뀔 때만 보내고(시계는 시스템이 센다), null 이면 거두고, 화면을 나가면 거둔다.
 * 옛 앱(이 함수가 없는 판)은 그냥 넘어간다.
 */
export type LiveState = {
  /** rest = 쉬는 중(올라감) · hold = 버티기 · 쉬기(거꾸로, until 까지) · work = 운동 중(since 부터 올라감) */
  kind: 'rest' | 'hold' | 'work';
  /** SF Symbol 이름 */
  symbol: string;
  label: string;
  title: string;
  detail: string;
  /** 밀리초 */
  since: number;
  until?: number;
};

export function useLiveActivity(state: LiveState | null) {
  /* 같은 값이면 다시 안 보낸다 — 화면은 1초마다 다시 그려진다(쉬는 시계) */
  const key = state ? JSON.stringify(state) : '';
  useEffect(() => {
    const s = key ? (JSON.parse(key) as LiveState) : null;
    if (!s) {
      void BullpenNative.liveEnd?.().catch(() => undefined);
      return;
    }
    void BullpenNative.liveShow?.(s.kind, s.symbol, s.label, s.title, s.detail, s.since, s.until ?? 0).catch(() => undefined);
  }, [key]);
  useEffect(() => () => void BullpenNative.liveEnd?.().catch(() => undefined), []);
}

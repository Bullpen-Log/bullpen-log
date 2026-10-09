'use client';

import { useEffect } from 'react';
import { remindAt, timeLabel, type CalendarEventView } from '@/lib/calendar-event';
import {
  hasNativeBridge,
  nativeCancelAlarm,
  nativeScheduleAlarm,
} from '@/lib/native-bridge';

/** 이 폰에 걸어 둔 일정 알림(일정 id) — 지운 · 바꾼 일정의 알림을 걷으려고 적어 둔다 */
const KEY = 'bullpen-event-alarms';
/** iOS 는 앱 하나에 예약 알림을 64개까지 쥔다 — 운동 휴식 알림 자리를 남기고 가까운 것부터 */
const MAX = 40;

/**
 * 일정 알림 — 아이폰 앱이 폰 안에 미리 걸어 두는 로컬 알림(lib/native-bridge.ts).
 *
 * 홈 캘린더가 그려질 때마다 앞으로 울릴 알림을 모두 다시 건다(같은 id 는 바뀐다). 서버가 보내는 푸시가 아니라서
 * 다른 기기에서 고친 일정은 이 폰에서 홈을 한 번 열어야 맞춰진다. 사파리 · PC 에서는 아무 일도 안 한다.
 */
export function useEventAlarms(events: CalendarEventView[]) {
  useEffect(() => {
    if (!hasNativeBridge()) return;
    const now = Date.now();
    const want = events
      .map((e) => ({ e, at: remindAt(e) }))
      .filter(
        (x): x is { e: CalendarEventView; at: number } => x.at != null && x.at > now
      )
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX);
    const ids = new Set(want.map((x) => x.e.id));

    let prev: string[] = [];
    try {
      prev = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {}
    for (const id of prev) if (!ids.has(id)) nativeCancelAlarm(`event-${id}`);
    for (const { e, at } of want) {
      const body = [timeLabel(e.time), e.memo?.split('\n')[0]]
        .filter(Boolean)
        .join(' · ');
      nativeScheduleAlarm(`event-${e.id}`, at, e.title, body);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify([...ids]));
    } catch {}
  }, [events]);
}

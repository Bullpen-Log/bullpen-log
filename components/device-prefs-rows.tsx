'use client';

import { useSyncExternalStore } from 'react';
import { SwitchRow } from '@/components/switch';
import { readPref, setPref, subscribePrefs, type DevicePref } from '@/lib/device-prefs';

/** 설정의 '기기' 칸 — 진동 · 움직임 줄이기 스위치(lib/device-prefs.ts). 이 기기에만 저장된다 */
export function DevicePrefsRows() {
  return (
    <div className="divide-y divide-line">
      <Row pref="haptics" label="진동" />
      <Row pref="reduceMotion" label="움직임 줄이기" />
    </div>
  );
}

function Row({ pref, label }: { pref: DevicePref; label: string }) {
  const on = useSyncExternalStore(
    subscribePrefs,
    () => readPref(pref),
    () => pref === 'haptics'
  );
  return (
    <SwitchRow checked={on} onChange={(v) => setPref(pref, v)} className="py-1 first:pt-0 last:pb-0">
      {label}
    </SwitchRow>
  );
}

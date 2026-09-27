'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 폰의 기울기 — 수평계.
 *
 * 카메라를 수평으로 두어야 공이 화면을 비스듬히 가로지르지 않고, 스트라이크 존 격자도 바로 선다.
 * 브라우저의 deviceorientation 으로 잰다: 세로로 세운 폰에서 좌우 기울기(roll)는 gamma,
 * 앞뒤 기울기(pitch)는 beta − 90 이다. 아이폰은 사용자가 단추를 눌러 허락해야 값이 온다
 * (DeviceOrientationEvent.requestPermission) — 허락 전에는 needsPermission 이 true.
 *
 * PC 나 값이 안 오는 기기에서는 supported 가 false — 화면은 수평계를 숨기고 넘어간다.
 */
export type DeviceLevel = {
  /** 좌우 기울기(도). 오른쪽이 내려가면 + */
  roll: number | null;
  /** 앞뒤 기울기(도). 뒤로 젖혀지면 + (카메라가 위를 봄) */
  pitch: number | null;
  supported: boolean;
  needsPermission: boolean;
};

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientationCtor = (): OrientationCtor | null =>
  typeof DeviceOrientationEvent !== 'undefined'
    ? (DeviceOrientationEvent as OrientationCtor)
    : null;

/** 허락 단추가 필요한 기기(아이폰)인가 — 그리는 동안 읽어도 되는 고정값 */
const askable = () => !!orientationCtor()?.requestPermission;

type Reading = { roll: number; pitch: number } | null | 'none';

export function useDeviceLevel(active: boolean) {
  /* null = 아직 모름, 'none' = 값이 안 오는 기기, 아니면 마지막 값 */
  const [reading, setReading] = useState<Reading>(null);
  const [granted, setGranted] = useState(false);

  const requestPermission = useCallback(async () => {
    const ctor = orientationCtor();
    if (!ctor?.requestPermission) {
      setGranted(true);
      return;
    }
    try {
      const res = await ctor.requestPermission();
      setGranted(res === 'granted');
    } catch {
      setGranted(false);
    }
  }, []);

  const needsPermission = active && askable() && !granted;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    if (!orientationCtor()) return;
    if (askable() && !granted) return;

    let got = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null && e.gamma == null) return;
      got = true;
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      const roll = landscape ? (e.beta ?? 0) : (e.gamma ?? 0);
      const pitch = landscape ? (e.gamma ?? 0) : (e.beta ?? 0) - 90;
      setReading({
        roll: Math.round(roll * 10) / 10,
        pitch: Math.round(pitch * 10) / 10,
      });
    };
    window.addEventListener('deviceorientation', onOrient);
    /* 1초 안에 값이 안 오면 못 재는 기기(PC 등)로 본다 */
    const timer = setTimeout(() => {
      if (!got) setReading('none');
    }, 1000);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      clearTimeout(timer);
    };
  }, [active, granted]);

  const level: DeviceLevel =
    reading && reading !== 'none'
      ? {
          roll: reading.roll,
          pitch: reading.pitch,
          supported: true,
          needsPermission: false,
        }
      : { roll: null, pitch: null, supported: false, needsPermission };

  return { level, requestPermission };
}

/** 수평으로 볼 한계(도) — 이 안이면 초록 */
export const LEVEL_OK_DEG = 1.5;

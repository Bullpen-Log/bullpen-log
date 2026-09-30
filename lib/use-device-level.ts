'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 폰의 기울기 — 수평계.
 *
 * 카메라를 수평으로 두어야 공이 화면을 비스듬히 가로지르지 않고, 스트라이크 존 격자도 바로 선다.
 * 브라우저의 deviceorientation(β · γ)에서 **중력 방향**을 구해 잰다. 예전에는 좌우 기울기를 γ 로 바로 읽었는데, 폰을
 * 거의 똑바로 세우면(β ≈ 90°) γ 가 오일러 각의 특이점이라 크게 튄다 — 뒤로 2° 젖힌 폰을 옆으로 1° 기울이면 γ 가 26° 로
 * 읽혔다(2026-09-30 사용자: "수평계 값이 너무 튄다"). 중력 방향은 세운 폰에서도 이어져 있다.
 *
 * 아이폰은 사용자가 누른 순간에 허락을 받아야 값이 온다(DeviceOrientationEvent.requestPermission) — 화면은 카메라를
 * 켜는 누름에서 같이 부른다(requestPermission). 그 전에는 needsPermission 이 true. PC 나 값이 안 오는 기기에서는
 * supported 가 false — 화면은 수평계를 숨긴다.
 */
export type DeviceLevel = {
  /** 좌우 기울기(도, 0.5° 단위). 오른쪽이 내려가면 + */
  roll: number | null;
  /** 앞뒤 기울기(도, 1° 단위). 카메라가 위를 보면 + */
  pitch: number | null;
  /** 수평인가 — 좌우가 LEVEL_OK_DEG 안 · 앞뒤가 PITCH_OK_DEG 안(드나들 때 흔들리지 않게 문턱을 둘로) */
  ok: boolean;
  /**
   * 수평이 아닐 때 어느 쪽이 벗어났나 — 좌우가 먼저. 반올림한 roll 로 다시 따지면 1.5~1.75° 가 1.5 로 보여 '앞뒤'로 잘못
   * 가리켰다(2026-09-30 코드 검토). 판정한 그 값으로 정한다.
   */
  cause: 'roll' | 'pitch' | null;
  /**
   * 글자로 보일 각도(정수, 부호 있음) — 지금 보이는 숫자에서 0.75° 넘게 벗어날 때만 바뀐다. 반올림 경계(2.5°)에서 흔들리면
   * 3°·2° 가 깜박였다(2026-09-30 브라우저 시험, 떨림 1° 에서 초당 3.6번).
   */
  rollDeg: number | null;
  pitchDeg: number | null;
  supported: boolean;
  needsPermission: boolean;
};

/** 좌우가 이 안이면 수평(도) */
export const LEVEL_OK_DEG = 1.5;
/** 수평에서 벗어났다고 볼 좌우 기울기(도) — 1.5 에서 들고 나면 초록이 깜박인다 */
const LEVEL_LEAVE_DEG = 2.2;
/**
 * 앞뒤(카메라가 위아래를 봄)는 넉넉히 — 릴리스 포인트 · 미트를 가운데 표적에 맞추려면 폰을 조금 숙이거나 젖혀야 한다.
 * 좌우와 달리 코스 격자를 비틀지 않는다.
 */
export const PITCH_OK_DEG = 10;
const PITCH_LEAVE_DEG = 12;
/** 흔들림을 누르는 시간 상수(초) — 0.25초면 손으로 들어도 바늘이 떨지 않고, 삼각대를 돌리면 곧 따라온다 */
const SMOOTH_SEC = 0.25;

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientationCtor = (): OrientationCtor | null =>
  typeof DeviceOrientationEvent !== 'undefined'
    ? (DeviceOrientationEvent as OrientationCtor)
    : null;

/** 허락 단추가 필요한 기기(아이폰)인가 — 그리는 동안 읽어도 되는 고정값 */
const askable = () => !!orientationCtor()?.requestPermission;

type Vec = [number, number, number];

/**
 * β · γ(도) → 폰 좌표의 중력 방향(단위 벡터, x 오른쪽 · y 위 · z 화면 밖). 방향 회전은 Z-X'-Y''(W3C) —
 * g = R(α,β,γ)ᵀ·(0,0,−1) = (cosβ sinγ, −sinβ, −cosβ cosγ). α(나침반)는 중력과 상관없다.
 */
export function gravityOf(betaDeg: number, gammaDeg: number): Vec {
  const b = (betaDeg * Math.PI) / 180;
  const g = (gammaDeg * Math.PI) / 180;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

/**
 * 화면이 돌아간 만큼(screen.orientation.angle, 반시계) 중력을 화면 좌표로 — 가로로 들면 화면의 '위'가 폰의 옆이다.
 * 가로 90°(폰 위쪽이 왼쪽)면 화면 x = −폰 y, 화면 y = 폰 x.
 */
export function toScreen(g: Vec, angleDeg: number): Vec {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [g[0] * c - g[1] * s, g[0] * s + g[1] * c, g[2]];
}

/** 화면 좌표의 중력 → 좌우 · 앞뒤 기울기(도) */
export function tiltOf(g: Vec): { roll: number; pitch: number } {
  const deg = 180 / Math.PI;
  return {
    roll: Math.atan2(g[0], -g[1]) * deg,
    pitch: Math.atan2(g[2], Math.hypot(g[0], g[1])) * deg,
  };
}

const screenAngle = () => {
  const o = (typeof screen !== 'undefined' ? screen.orientation : undefined)?.angle;
  if (typeof o === 'number') return o;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
};

type Shown = {
  roll: number;
  pitch: number;
  ok: boolean;
  cause: 'roll' | 'pitch' | null;
  rollDeg: number;
  pitchDeg: number;
};
/** 글자로 보일 정수 각도 — 지금 것에서 이만큼(도) 넘게 벗어나야 바꾼다 */
const DEG_HOLD = 0.75;
type Reading = Shown | null | 'none';

export function useDeviceLevel(active: boolean) {
  /* null = 아직 모름, 'none' = 값이 안 오는 기기, 아니면 마지막(부드럽게 한 · 반올림한) 값 */
  const [reading, setReading] = useState<Reading>(null);
  /* 허락 — 'denied' 면 아이폰이 다시 묻지 않는다(설정에서 바꿔야 한다). 그때는 수평계를 숨긴다 */
  const [perm, setPerm] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const granted = perm === 'granted';

  /**
   * 허락을 청한다(아이폰) — 사용자가 누른 그 순간에 불러야 한다. 허락이 필요 없는 기기면 아무 일도 안 한다. 화면은 카메라를
   * 켜는 누름이 아닌 다음 누름(주의사항 닫기 · 다음 · 측정 시작)에서 부른다 — 카메라 허락 창과 한 누름에 겹치지 않게.
   * 누름 밖(효과 등)에서 부르면 아이폰은 거절하는데, 그때는 그대로 '모름'으로 두어 다음 누름에 다시 묻는다.
   */
  const requestPermission = useCallback(async () => {
    const ctor = orientationCtor();
    if (!ctor?.requestPermission) {
      setPerm('granted');
      return;
    }
    try {
      const res = await ctor.requestPermission();
      setPerm(res === 'granted' ? 'granted' : 'denied');
    } catch {
      /* 누름 밖에서 불렀다 — 다음 누름에 다시 */
    }
  }, []);

  const needsPermission = active && askable() && perm === 'unknown';

  /*
   * 켜지면 누름 없이 한 번 청한다 — 크롬(허락 함수가 있어도 묻지 않는다) · 이 앱에서 이미 허락한 아이폰은 곧바로 '허락'이라
   * 수평계가 저절로 켜진다. 처음 쓰는 아이폰은 누름 밖이라 거절되고 '모름'으로 남아 다음 누름(주의사항 닫기 · 다음 · 측정
   * 시작 · '수평계 켜기')에서 묻는다.
   */
  useEffect(() => {
    if (!active || perm !== 'unknown') return;
    const ctor = orientationCtor();
    if (!ctor?.requestPermission) return;
    let alive = true;
    ctor.requestPermission().then(
      (res) => {
        if (alive) setPerm(res === 'granted' ? 'granted' : 'denied');
      },
      () => {
        /* 누름 밖이라 거절 — 다음 누름에 다시 */
      }
    );
    return () => {
      alive = false;
    };
  }, [active, perm]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    if (!orientationCtor()) return;
    if (askable() && !granted) return;

    let got = false;
    /* 부드럽게 한 중력(화면 좌표) · 마지막 시각 · 마지막으로 그린 값 */
    let smooth: Vec | null = null;
    let lastT = 0;
    let shown: Shown | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      got = true;
      const g = toScreen(gravityOf(e.beta, e.gamma), screenAngle());
      const now = performance.now();
      if (!smooth) smooth = g;
      else {
        /* 지수 평균 — 이벤트 간격이 들쭉날쭉해도 같은 시간 상수가 되게 간격으로 무게를 정한다 */
        const k = 1 - Math.exp(-Math.min(0.5, (now - lastT) / 1000) / SMOOTH_SEC);
        smooth = [
          smooth[0] + (g[0] - smooth[0]) * k,
          smooth[1] + (g[1] - smooth[1]) * k,
          smooth[2] + (g[2] - smooth[2]) * k,
        ];
      }
      lastT = now;
      const t = tiltOf(smooth);
      const roll = Math.round(t.roll * 2) / 2 || 0;
      const pitch = Math.round(t.pitch) || 0;
      const was = shown?.ok ?? false;
      const rollOk = Math.abs(t.roll) <= (was ? LEVEL_LEAVE_DEG : LEVEL_OK_DEG);
      const pitchOk = Math.abs(t.pitch) <= (was ? PITCH_LEAVE_DEG : PITCH_OK_DEG);
      const ok = rollOk && pitchOk;
      const cause = ok ? null : !rollOk ? 'roll' : 'pitch';
      const hold = (cur: number | undefined, v: number) =>
        cur != null && Math.abs(v - cur) <= DEG_HOLD ? cur : Math.round(v) || 0;
      const rollDeg = hold(shown?.rollDeg, t.roll);
      const pitchDeg = hold(shown?.pitchDeg, t.pitch);
      /* 보이는 값이 바뀔 때만 다시 그린다 — 이벤트는 초당 60번 오는데 화면 전체를 그만큼 다시 그리면 무겁다 */
      if (
        shown &&
        shown.roll === roll &&
        shown.pitch === pitch &&
        shown.ok === ok &&
        shown.cause === cause &&
        shown.rollDeg === rollDeg &&
        shown.pitchDeg === pitchDeg
      )
        return;
      shown = { roll, pitch, ok, cause, rollDeg, pitchDeg };
      setReading(shown);
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
          ok: reading.ok,
          cause: reading.cause,
          rollDeg: reading.rollDeg,
          pitchDeg: reading.pitchDeg,
          supported: true,
          needsPermission: false,
        }
      : {
          roll: null,
          pitch: null,
          ok: false,
          cause: null,
          rollDeg: null,
          pitchDeg: null,
          supported: false,
          needsPermission,
        };

  return { level, requestPermission };
}

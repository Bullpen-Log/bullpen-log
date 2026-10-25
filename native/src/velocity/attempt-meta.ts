import { requireOptionalNativeModule } from 'expo-modules-core';
import { APP_UA } from '~/lib/site';
import type { StartInfo } from '../../modules/dual-camera';
import type { EngineInfo, MeasureOpts } from './engine';
import type { SessionCtx } from './session';

/**
 * 시도 기록에 싣는 설정 · 판(2026-10-25 설계안 작업 A — "모델 · 네이티브 · 웹 엔진 · 설정의 버전을 기록한다"). 서버(app/actions/velocity.ts
 * recordVelocityAttempt)가 아는 칸만 남긴다(sanitizeSettings · sanitizeVersions). 현장 자료를 되짚을 때 '그때 어떤 설정 · 어느 판이었나'를
 * 폰 콘솔이 아니라 DB 에서 바로 읽기 위해서다(10-20 세션은 설정을 되짚을 길이 없었다).
 */

/** 그 시도를 잰 설정 — 잰 작업은 계산기에 넘긴 옵션 그대로(opts), 재지 못한 알림은 화면의 지금 설정 */
export function attemptSettings(
  opts: MeasureOpts | undefined,
  ctx: SessionCtx,
  dist: { m: number; auto: boolean },
  chosen: boolean,
  /** 클립에 실려 온 모델 후보 수(작업 B) — 계산기에 넘긴 수는 opts.netHits */
  hitsAvail?: number
) {
  return {
    ...(hitsAvail != null ? { hitsAvail } : {}),
    cameraPos: ctx.cameraPos,
    tape: ctx.tape,
    /** 고른 '투수판 → 멈추는 곳' + 폰 자리(m) — 15% 문의 기준 */
    rubberDistM: ctx.distM,
    distanceM: opts?.distanceM ?? dist.m,
    distanceAuto: opts?.distanceAuto ?? dist.auto,
    distanceChosen: opts?.distanceChosen ?? chosen,
    ...(opts
      ? {
          approach: opts.approach,
          fps: opts.fps,
          fovDeg: opts.fovDeg,
          fovKnown: opts.fovKnown,
          tiltRad: opts.tiltRad,
          ...(opts.ballRange ? { rangeStart: opts.ballRange.startSec, rangeEnd: opts.ballRange.endSec, seedT: opts.ballRange.seedT } : {}),
          netHits: opts.netHits?.length ?? 0,
        }
      : {}),
  };
}

/**
 * 판 — 앱(네이티브) 판 · 빌드 · 웹뷰 UA(앱 화면 판 BullpenNative/N) · OTA 갱신 번호 · JS dev/release · 계산기 엔진 판 · 계산기 기능(ENGINE_CAPS) ·
 * 카메라 모듈이 아는 후보 약속(StartInfo.hitsSchema — 작업 B 부터)
 */
export function attemptVersions(info: StartInfo | null, engine: EngineInfo | null, update: string | null) {
  const hits = info?.hitsSchema;
  return {
    app: info?.appVersion ?? undefined,
    build: info?.appBuild ?? undefined,
    debug: info?.debugBuild === true,
    ua: APP_UA,
    js: __DEV__ ? 'dev' : 'release',
    update: update ?? undefined,
    engine: engine?.engine ?? undefined,
    caps: engine ? JSON.stringify(engine.caps) : undefined,
    module: typeof hits === 'number' ? `hits:${hits}` : undefined,
  };
}

/**
 * 지금 돌고 있는 화면 코드의 OTA 갱신 번호(expo-updates updateId) — 바닥 모듈이 있을 때만 불러온다(native/src/shell/app-update.ts 와 같은 까닭:
 * 그 모듈 전에 구운 앱은 불러오는 순간 꺼졌다). 개발(Metro) · 앱에 든 그대로면 null.
 */
export async function loadUpdateId(): Promise<string | null> {
  if (__DEV__ || !requireOptionalNativeModule('ExpoUpdates')) return null;
  try {
    const Updates = await import('expo-updates');
    return Updates.isEnabled && !Updates.isEmbeddedLaunch ? (Updates.updateId ?? null) : null;
  } catch {
    return null;
  }
}

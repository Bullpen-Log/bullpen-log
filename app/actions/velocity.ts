'use server';

import { phoneVideoPath } from '@/lib/phone-video-path';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNowMs } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import {
  MAX_VIDEO_BYTES,
  createUploadTarget,
  deleteVideos,
  isOwnedBy,
  isStorageConfigured,
} from '@/lib/storage';
import {
  deleteVelocityPitchRow,
  deleteVelocitySessionRows,
  sanitizeAnalysis,
  sanitizeDistance,
  syncVelocitySession,
} from '@/lib/velocity-sync';
import { isRestSession, validateSessionType } from '@/lib/session-type';
import { readEffortInput } from '@/lib/pitch-effort';
import { fitCalibration, type CalFit, type CalPair } from '@/lib/velocity-calibration';
import {
  CALIBRATION_FAMILY,
  VELOCITY_ENGINE_VERSION,
} from '@/lib/velocity-engine/version';
import {
  PITCH_RESULT_KEYS,
  PITCH_TYPE_KEYS,
  ZONE_MAX,
  ZONE_MIN,
  type PitchEdit,
} from '@/lib/velocity-meta';

/**
 * 구속 측정 — 저장 · 고치기 · 지우기 · 보정식.
 *
 * 화면(app/(session)/velocity)이 잰 공들을 한 세션으로 저장하면서 투구 기록(PitchLog) 한 건도
 * 같이 만든다. 그날 화면(/pitch-log/<날짜>)에서 공마다 구종 · 코스 · 결과 · 스피드건 값을 고치고
 * 지운다. 공을 지우면 같이 만든 투구 기록의 투구수 · 구속도 다시 맞춘다.
 */

export type VelocityActionResult = { ok: true } | { ok: false; error: string };

const MIN_KMH = 30;
const MAX_KMH = 200;
const MAX_PITCHES = 200;
/** 같은 세션을 다시 저장한 것으로 보는 시간 — 끊긴 응답에 다시 누르는 사이(투구 기록 API 의 2분보다 넉넉히: 클립까지 올리느라 오래 걸린다) */
const DUPLICATE_SESSION_MS = 10 * 60_000;

/**
 * 방금 같은 세션을 저장했나 — 같은 날, DUPLICATE_SESSION_MS 안에, 원래 잰 값(rawKmh)이 같은 차례로 같은 세션. 저장은 됐는데 답만 못 받아
 * 다시 누르면 세션이 둘이 되어 투구 탭 카드가 공 수를 두 배로 채웠다(2026-10-16 통합 검토 — 투구 기록 API 의 같은 값 막기와 같은 꼴).
 * 서로 다른 두 세션의 잰 값이 소수점까지 같은 차례일 일은 없다. 시각은 앱 시계(시험 계정은 createdAt 도 그 시계로 적힌다 — lib/prisma.ts).
 */
async function recentSameSession(userId: string, date: Date, rawKmhs: number[]) {
  const rows = await prisma.velocitySession.findMany({
    where: { userId, date, createdAt: { gte: new Date(appNowMs() - DUPLICATE_SESSION_MS) } },
    select: { id: true, pitches: { select: { id: true, rawKmh: true }, orderBy: { seq: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return (
    rows.find(
      (r) =>
        r.pitches.length === rawKmhs.length && r.pitches.every((p, i) => p.rawKmh === rawKmhs[i])
    ) ?? null
  );
}
const MEMO_MAX = 500;
/** 보정식을 맞출 때 보는 최근 짝 수 */
const CAL_PAIR_LIMIT = 200;

export type SavePitchInput = {
  rawKmh: number;
  errorKmh: number;
  confidence: string;
  releaseKmh: number | null;
  releaseDxCm: number | null;
  releaseDyCm: number | null;
  releaseDistM: number | null;
  travelM: number | null;
  durationSec: number | null;
  frames: number | null;
  fps: number | null;
  /** 이 공을 낸 시도 기록(recordVelocityAttempt)의 id — 저장할 때 잇는다. 없어도 된다 */
  attemptId?: string | null;
  /** 엔진이 본 자료(궤적 · 해상도 · 초점거리 · 맞음새 …) — 영상 없이도 다시 맞춰 볼 수 있게. 없어도 된다 */
  analysis?: unknown;
  /** 자동 감지로 잡힌 공인가(false = 수동으로 단추를 눌러 잼) */
  autoDetected?: boolean;
  /**
   * 수기 — 카메라가 재지 못한 영상(30fps · 공을 못 찾음)을 스피드건 값만 적어 올린 공(관리자의 '영상
   * 파일로 재기'). gunKmh 가 꼭 있어야 하고 rawKmh · kmh 는 그 값이 된다. 보정 짝에는 안 들어간다.
   */
  manual?: boolean;
} & PitchEdit;

export type SaveSessionInput = {
  /** YYYY-MM-DD */
  date: string;
  sessionType: string;
  /**
   * 체감 강도 5~100%(2판 D2) — 측정 화면의 저장 시트가 보낸다. 없으면 옛 1~10(intensity)을 받는다(관리자 영상 올리기 ·
   * 배포 직전에 열어 둔 화면). 둘 다 lib/pitch-effort.ts readEffortInput 이 읽어 투구 기록 두 칸을 채운다.
   */
  effortPct?: number | null;
  intensity?: number;
  fovDeg: number;
  source: 'camera' | 'file';
  device: string | null;
  /** 어디서 — 'behind-pitcher' · 'behind-catcher', 네트 유무(타구 측정은 2026-10-03 뺐다 — DB 의 mode 칸은 늘 'pitch') */
  cameraPos: string;
  net: boolean;
  /** 관리자의 '정확도 보정용 저장' — 보정 자료로 표시한다(관리자만 켜진다). 영상 클립은 이것과 상관없이 모든 세션에서 올린다 */
  forCalibration?: boolean;
  /** 자동 감지 모드였나 */
  autoMode?: boolean;
  /**
   * 스피드건 보정을 적용할까(측정 화면 설정). false 면 카메라 값 그대로 저장하고 세션의 보정식은 ×1 +0(짝 0) —
   * 예전에는 설정을 꺼도 서버가 늘 보정해 저장했다(김민 2026-09-30). 없으면(관리자 영상 파일 · 옛 앱) 적용.
   */
  useCal?: boolean;
  /** 그때 쓴 초점거리(원본 긴 변 기준 픽셀) · 렌즈 보정 정보 · 포수 뒤 릴리스 거리 · 원본 프레임 크기 */
  focalPx?: number | null;
  lensCal?: unknown;
  releaseDistM?: number | null;
  /** 투수 뒤의 폰 → 미트 거리(m) · 출처('tape' · 'session-size' · 'default' · 'auto') — 엔진 2.4 1단계 */
  distanceM?: number | null;
  distanceSource?: string | null;
  frameW?: number | null;
  frameH?: number | null;
  pitches: SavePitchInput[];
  /** 이 세션에서 남긴 시도 기록 전부(못 잰 것 포함)의 id — 세션에 잇는다(엔진 2.4 0단계) */
  attemptIds?: string[];
};

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

const optional = (v: unknown, lo: number, hi: number): number | null =>
  v == null || v === '' ? null : num(v, lo, hi);

function checkEdit(edit: PitchEdit): { error: string } | PitchEdit {
  const pitchType =
    edit.pitchType == null || edit.pitchType === '' ? null : String(edit.pitchType);
  if (pitchType != null && !PITCH_TYPE_KEYS.includes(pitchType)) {
    return { error: '구종 값이 올바르지 않아요.' };
  }
  const zone = optional(edit.zone, ZONE_MIN, ZONE_MAX);
  if (edit.zone != null && zone == null)
    return { error: '코스는 1~9 사이여야 해요.' };
  const result = edit.result == null || edit.result === '' ? null : String(edit.result);
  if (result != null && !PITCH_RESULT_KEYS.includes(result)) {
    return { error: '결과 값이 올바르지 않아요.' };
  }
  const gunKmh = optional(edit.gunKmh, MIN_KMH, MAX_KMH);
  if (edit.gunKmh != null && gunKmh == null) {
    return { error: `스피드건 값은 ${MIN_KMH}~${MAX_KMH} km/h 사이로 넣어주세요.` };
  }
  const memo = String(edit.memo ?? '').trim();
  if (memo.length > MEMO_MAX)
    return { error: `메모는 ${MEMO_MAX}자까지 적을 수 있어요.` };
  return {
    pitchType,
    zone: zone == null ? null : Math.round(zone),
    result,
    gunKmh,
    memo: memo || null,
  };
}

/** 그 사람의 스피드건 짝으로 맞춘 보정식 — 화면이 처음 열 때와 저장할 때 */
export async function loadCalibration(): Promise<{ fit: CalFit; pairs: CalPair[] }> {
  const user = await getCurrentUser();
  if (!user) return { fit: fitCalibration([]), pairs: [] };
  const rows = await prisma.velocityPitch.findMany({
    /*
     * 수기 공은 카메라 값이 없어(스피드건 값 복사) 짝이 아니다. 옛 모델로 잰 공도 뺀다 — 모델이 고쳐진
     * 뒤에도 옛 편향을 되풀이해 보정하면 두 번 고치는 셈이다(관리자가 다시 재서 채우면 지금 모델이 된다).
     * 작은 자리 손질(1.8.0 → 1.8.1)은 재는 방법이 같아 짝을 그대로 쓴다 — 같은 묶음(CALIBRATION_FAMILY)이면 짝.
     * 관리자가 '보정에서 빼기'를 한 공(잘못 적은 건 값 등)도 뺀다 — 관리자 통계(isPair)만 빼고 여기는 쓰고 있었다.
     */
    where: {
      userId: user.id,
      gunKmh: { not: null },
      manual: false,
      calibExclude: false,
      engineVersion: { startsWith: CALIBRATION_FAMILY },
      /* 믿음 높은 공만 — 믿음 낮은 공의 짝이 보정식을 기울였다(2026-10-12, lib/velocity-calibration.ts fitCalibration) */
      confidence: 'high',
    },
    orderBy: { createdAt: 'desc' },
    take: CAL_PAIR_LIMIT,
    select: { rawKmh: true, gunKmh: true, analysis: true },
  });
  /*
   * 밝은 배경 앞의 어두운 공(모델 1.8.0 의 두 번째 길 — analysis.polarity 'dark' · 'mixed')은 다른 자로 쟀다(확인 전) — 짝에서 뺀다.
   * 대비 길(모델 1.9.0 — analysis.fallback 'close' · 'center', 밖 · 표적 그물 앞)로 잰 공도 뺀다 — 2배 줌 · 밖 짝 13개가 평균
   * 2.6~3.5km/h 낮게 읽혀 아직 맞추지 않은 조건이다. 밖에서 스피드건 짝이 쌓이면 이 공들만 따로 맞춰 본다.
   * 기준 조건(1080p · 60fps · 2배가 진짜 줌 · 손떨림 보정) 밖에서 잰 공(analysis.offStandard — 웹 카메라 · 디지털 줌 · 초당 장면이
   * 모자람)도 뺀다 — 같은 영상도 조건만 바꾸면 값이 달라져, 섞이면 기준 조건 공의 보정까지 틀어진다(2026-10-08 사용자 원칙).
   */
  const pairs = rows
    .filter((r) => {
      const a = r.analysis as {
        polarity?: unknown;
        fallback?: unknown;
        offStandard?: unknown;
        distance?: { calibEligible?: unknown } | null;
      } | null;
      const offStandard = Array.isArray(a?.offStandard) && a.offStandard.length > 0;
      /* 엔진이 짝으로 못 쓴다고 본 공(이어 찾기 · 끝 못 봄 · 공 크기 거리 불일치 · 거리 자동 — 2.4.1 calibEligible)도 뺀다 */
      const eligible = a?.distance?.calibEligible !== false;
      return a?.polarity !== 'dark' && a?.polarity !== 'mixed' && a?.fallback == null && !offStandard && eligible;
    })
    .map((r) => ({ measured: r.rawKmh, gun: r.gunKmh as number }));
  return { fit: fitCalibration(pairs), pairs };
}

export async function saveVelocitySession(
  input: SaveSessionInput
): Promise<VelocityActionResult & { sessionId?: string; pitchIds?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { ok: false, error: '날짜가 올바르지 않아요.' };
  const at = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()))
    return { ok: false, error: '날짜가 올바르지 않아요.' };

  const type = validateSessionType(String(input.sessionType ?? ''));
  if ('error' in type) return { ok: false, error: type.error };
  if (isRestSession(type.value))
    return { ok: false, error: '쉬는 날에는 구속을 남길 수 없어요.' };

  /* 투구 기록 API 와 같은 규칙 — % 를 받으면 1~10 도 같이, 옛 1~10 만 오면 % 는 비운다(lib/pitch-effort.ts) */
  const effort = readEffortInput(
    { effortPct: input.effortPct, intensity: input.intensity },
    false
  );
  if ('error' in effort) return { ok: false, error: effort.error };
  const fovDeg = num(input.fovDeg, 30, 120);
  if (fovDeg == null) return { ok: false, error: '화각이 올바르지 않아요.' };

  const mode = 'pitch';
  const cameraPos =
    input.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher';

  if (!Array.isArray(input.pitches) || input.pitches.length === 0) {
    return { ok: false, error: '잰 공이 없어요.' };
  }
  if (input.pitches.length > MAX_PITCHES) {
    return { ok: false, error: `한 번에 ${MAX_PITCHES}구까지 저장할 수 있어요.` };
  }

  /* 보정식은 저장하는 순간의 짝으로 — 세션에 박아 두어 나중에 되짚는다. 보정을 껐으면 ×1 +0 */
  const { fit: learned } = await loadCalibration();
  const fit = input.useCal === false ? { scale: 1, offset: 0, n: 0 } : learned;

  const pitches: Array<
    Omit<SavePitchInput, keyof PitchEdit | 'analysis' | 'autoDetected' | 'manual'> &
      PitchEdit & {
        kmh: number;
        analysis: Prisma.InputJsonValue | undefined;
        autoDetected: boolean;
        manual: boolean;
        /** 이 값을 낸 모델 — 수기는 카메라 값이 없어 null */
        engineVersion: string | null;
      }
  > = [];
  for (const p of input.pitches) {
    if (p.manual) {
      /* 수기 — 관리자만. 스피드건 값이 곧 구속이고 카메라 값 칸은 비운다 */
      if (user.role !== 'ADMIN')
        return { ok: false, error: '수기 입력은 관리자만 할 수 있어요.' };
      const edit = checkEdit(p);
      if ('error' in edit) return { ok: false, error: edit.error };
      if (edit.gunKmh == null)
        return { ok: false, error: '수기로 올리려면 스피드건 값이 있어야 해요.' };
      pitches.push({
        rawKmh: edit.gunKmh,
        kmh: edit.gunKmh,
        errorKmh: 0,
        confidence: 'low',
        releaseKmh: null,
        releaseDxCm: null,
        releaseDyCm: null,
        releaseDistM: null,
        travelM: null,
        durationSec: null,
        frames: null,
        fps: optional(p.fps, 0, 1000),
        analysis: undefined,
        autoDetected: false,
        manual: true,
        engineVersion: null,
        ...edit,
      });
      continue;
    }
    const rawKmh = num(p.rawKmh, MIN_KMH, MAX_KMH);
    if (rawKmh == null)
      return {
        ok: false,
        error: `구속 값이 ${MIN_KMH}~${MAX_KMH} km/h 를 벗어났어요.`,
      };
    const edit = checkEdit(p);
    if ('error' in edit) return { ok: false, error: edit.error };
    const kmh = Math.round((rawKmh * fit.scale + fit.offset) * 10) / 10;
    pitches.push({
      rawKmh,
      kmh,
      errorKmh: num(p.errorKmh, 0, 100) ?? 0,
      confidence: ['high', 'medium', 'low'].includes(p.confidence)
        ? p.confidence
        : 'medium',
      releaseKmh: optional(p.releaseKmh, 0, 250),
      releaseDxCm: optional(p.releaseDxCm, -500, 500),
      releaseDyCm: optional(p.releaseDyCm, -500, 500),
      releaseDistM: optional(p.releaseDistM, 0, 50),
      travelM: optional(p.travelM, 0, 100),
      durationSec: optional(p.durationSec, 0, 10),
      frames: optional(p.frames, 0, 10_000),
      fps: optional(p.fps, 0, 1000),
      analysis: (sanitizeAnalysis(p.analysis) ?? undefined) as
        Prisma.InputJsonValue | undefined,
      autoDetected: p.autoDetected !== false,
      manual: false,
      engineVersion: VELOCITY_ENGINE_VERSION,
      ...edit,
    });
  }

  /*
   * 2026-10-16 사용자 결정: 구속 측정은 별개 기록 — 투구 기록을 만들지 않는다(예전엔 저장마다 새 투구 기록을 만들어, 같은 불펜을 손으로도
   * 적으면 투구 수 · 부하가 두 번 셌다). 고른 종류 · 체감 강도는 세션에 두고, 투구 탭 '오늘' 카드 → 그날 화면이 이 값으로 채운 기록을 권한다
   * (lib/velocity-meta.ts unloggedSessions · logPrefillOf). 기록을 남기면 그 기록이 이 세션을 잇는다(app/api/pitch-log POST).
   */
  const same = await recentSameSession(user.id, at, pitches.map((p) => p.rawKmh));
  if (same) return { ok: true, sessionId: same.id, pitchIds: same.pitches.map((p) => p.id) };

  const session = await prisma.velocitySession.create({
      data: {
        userId: user.id,
        date: at,
        sessionType: type.value,
        /* 옛 화면이 1~10 만 보내면 % 는 비운다 — 기록 폼이 그때 고르게 한다 */
        effortPct: effort.effortPct,
        fovDeg,
        calScale: fit.scale,
        calOffset: fit.offset,
        calPairs: fit.n,
        source: input.source === 'file' ? 'file' : 'camera',
        mode,
        cameraPos,
        net: input.net !== false,
        /* 어느 모델로 쟀나 — 관리자 [보정] 폴더에서 원본과 다시 잰 값을 견줄 때 본다 */
        engineVersion: VELOCITY_ENGINE_VERSION,
        device: input.device ? String(input.device).slice(0, 200) : null,
        /* 보정용 저장은 관리자만 — 일반 계정이 켜 보내도 저장하지 않는다 */
        forCalibration: user.role === 'ADMIN' && input.forCalibration === true,
        autoMode: input.autoMode !== false,
        focalPx: optional(input.focalPx, 100, 100_000),
        lensCal:
          input.lensCal && typeof input.lensCal === 'object'
            ? (JSON.parse(
                JSON.stringify(input.lensCal).slice(0, 2000)
              ) as Prisma.InputJsonValue)
            : undefined,
        releaseDistM: optional(input.releaseDistM, 1, 60),
        distanceM: optional(input.distanceM, 1, 60),
        distanceSource: ['tape', 'session-size', 'default', 'auto'].includes(String(input.distanceSource)) ? String(input.distanceSource) : null,
        frameW: optional(input.frameW, 1, 10_000),
        frameH: optional(input.frameH, 1, 10_000),
        pitches: {
          create: pitches.map((p, i) => ({ ...p, seq: i + 1, userId: user.id })),
        },
      },
      select: {
        id: true,
        pitches: { select: { id: true }, orderBy: { seq: 'asc' } },
      },
  });

  /*
   * 시도 기록을 이 세션 · 공에 잇는다 — 본인 것 · 아직 안 이어진 것만. 잰 공은 attemptId 로, 못 잰 시도는 세션만.
   * 잇지 못해도(옛 화면 · 신호) 저장은 끝났다.
   */
  try {
    const ids = Array.isArray(input.attemptIds)
      ? input.attemptIds.filter((x): x is string => typeof x === 'string').slice(0, 500)
      : [];
    const pairs = input.pitches
      .map((p, i) => ({ attemptId: p.attemptId, pitchId: session.pitches[i]?.id }))
      .filter(
        (x): x is { attemptId: string; pitchId: string } =>
          typeof x.attemptId === 'string' && typeof x.pitchId === 'string'
      );
    const all = Array.from(new Set([...ids, ...pairs.map((x) => x.attemptId)]));
    if (all.length)
      await prisma.velocityAttempt.updateMany({
        where: { id: { in: all }, userId: user.id, sessionId: null },
        data: { sessionId: session.id },
      });
    for (const x of pairs)
      await prisma.velocityAttempt.updateMany({
        where: { id: x.attemptId, userId: user.id, pitchId: null },
        data: { pitchId: x.pitchId },
      });
  } catch {
    /* 시도 기록은 보조 자료 — 못 이어도 세션은 저장됐다 */
  }

  revalidateDay(input.date);
  return {
    ok: true,
    sessionId: session.id,
    pitchIds: session.pitches.map((p) => p.id),
  };
}

export async function updateVelocityPitch(
  id: string,
  edit: PitchEdit
): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const checked = checkEdit(edit);
  if ('error' in checked) return { ok: false, error: checked.error };

  const row = await prisma.velocityPitch.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      manual: true,
      sessionId: true,
      session: { select: { date: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없어요.' };

  /*
   * 수기 공은 스피드건 값이 곧 구속이다 — 건 값만 고치면 구속 · 투구 기록의 최고 · 평균이 옛 값으로 남았다(관리자 쪽
   * adminUpdateVelocityPitch 와 같게, 2026-09-30 코드 검토). 수기 공의 건 값은 비울 수 없다.
   */
  const data: Prisma.VelocityPitchUpdateInput = { ...checked };
  const manualSpeed = row.manual && 'gunKmh' in checked;
  if (manualSpeed) {
    if (checked.gunKmh == null)
      return { ok: false, error: '수기 공은 스피드건 값을 비울 수 없어요.' };
    data.rawKmh = checked.gunKmh;
    data.kmh = checked.gunKmh;
  }

  await prisma.velocityPitch.update({ where: { id }, data });
  if (manualSpeed) await syncVelocitySession(row.sessionId);
  revalidateDay(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

export async function deleteVelocityPitch(id: string): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const row = await prisma.velocityPitch.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      sessionId: true,
      clipPath: true,
      wideClipPath: true,
      session: { select: { date: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없어요.' };

  await deleteVelocityPitchRow(row);
  revalidateDay(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

export async function deleteVelocitySession(id: string): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const session = await prisma.velocitySession.findFirst({
    where: { id, userId: user.id },
    select: { id: true, date: true },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없어요.' };

  await deleteVelocitySessionRows(id);
  revalidateDay(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

function revalidateDay(date: string) {
  revalidatePath(`/pitch-log/${date}`);
  revalidatePath('/videos');
  revalidatePath('/today');
  revalidatePath('/velocity');
  revalidatePath('/admin/velocity');
  revalidatePath(`/admin/velocity/${date}`);
}

/* ───────────────────────── 영상 클립(정확도 보정용 저장) ───────────────────────── */

export type ClipUploadTarget =
  | { ok: true; path: string; signedUrl: string; token: string }
  | { ok: false; error: string };

/**
 * 공 하나의 영상 클립을 올릴 서명 주소. 보정용 저장을 켠 세션(관리자)의 본인 공만.
 * 브라우저가 이 주소로 PUT 한 뒤 attachClip 으로 경로를 적는다(투구 영상과 같은 흐름).
 */
export async function createClipUpload(
  pitchId: string,
  mime: string,
  bytes: number
): Promise<ClipUploadTarget> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!isStorageConfigured())
    return { ok: false, error: '영상 저장소가 설정되지 않았어요.' };
  if (!/^video\//.test(String(mime)))
    return { ok: false, error: '영상 파일만 올릴 수 있어요.' };
  if (!(bytes > 0 && bytes <= MAX_VIDEO_BYTES)) {
    return {
      ok: false,
      error: `클립은 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB 까지 올릴 수 있어요.`,
    };
  }
  const row = await prisma.velocityPitch.findFirst({
    where: { id: pitchId, userId: user.id },
    select: { id: true },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없어요.' };
  const ext = /mp4/.test(mime) ? 'mp4' : /quicktime/.test(mime) ? 'mov' : 'webm';
  try {
    const target = await createUploadTarget(user.id, `clip.${ext}`);
    return { ok: true, ...target };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '업로드 주소를 만들지 못했어요.',
    };
  }
}

/** 올린 클립의 경로 · 크기 · 길이 · 던진 시각을 공에 적는다. 이미 있던 클립은 지운다. kind 'wide' 면 광각 영상 칸에 */
export async function attachClip(
  pitchId: string,
  info: {
    path: string;
    /** 폰의 앱 안에 둔 클립의 영상 번호(lib/local-video.ts) — 주면 path 대신 `{userId}/local-…` 를 적는다 */
    localId?: string;
    bytes: number;
    sec: number | null;
    mime: string;
    eventSec: number | null;
  },
  kind: 'main' | 'wide' = 'main'
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const path =
    typeof info.localId === 'string'
      ? (phoneVideoPath(user.id, info.localId) ?? '')
      : String(info.path ?? '');
  if (!path || !isOwnedBy(path, user.id))
    return { ok: false, error: '클립 경로가 올바르지 않아요.' };
  const row = await prisma.velocityPitch.findFirst({
    where: { id: pitchId, userId: user.id },
    select: {
      id: true,
      clipPath: true,
      wideClipPath: true,
      session: { select: { date: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없어요.' };
  const bytes = Math.round(num(info.bytes, 0, MAX_VIDEO_BYTES) ?? 0);
  const sec = optional(info.sec, 0, 600);
  const mime = String(info.mime ?? '').slice(0, 80) || null;
  const eventSec = optional(info.eventSec, 0, 600);
  const wide = kind === 'wide';
  await prisma.velocityPitch.update({
    where: { id: pitchId },
    data: wide
      ? {
          wideClipPath: path,
          wideClipBytes: bytes,
          wideClipSec: sec,
          wideClipMime: mime,
          wideClipEventSec: eventSec,
        }
      : {
          clipPath: path,
          clipBytes: bytes,
          clipSec: sec,
          clipMime: mime,
          clipEventSec: eventSec,
        },
  });
  const old = wide ? row.wideClipPath : row.clipPath;
  if (old && old !== path) {
    await deleteVideos([old]).catch(() => undefined);
  }
  revalidateDay(row.session.date.toISOString().slice(0, 10));
  return { ok: true, path };
}

/* ───────────────────────── 시도 기록(엔진 2.4 0단계) ───────────────────────── */

export type AttemptInput = {
  /** YYYY-MM-DD */
  date: string;
  /** 'seed' = 앱의 공 후보(2026-10-16) */
  kind: 'ball' | 'motion' | 'seed';
  /** 알림 시각(앱 카메라 시계 초) · 세기 */
  atSec: number | null;
  strength: number | null;
  ok: boolean;
  /** 못 쟀으면 거부 코드 · 어느 문에서 끝났나(DistanceReport.why) */
  code: string | null;
  why: string | null;
  trackFrames: number;
  rawKmh: number | null;
  confidence: string | null;
  /** 엔진의 거리 보고(DistanceReport) — 못 잰 까닭을 되짚는 숫자들만 남긴다(sanitizeDistance) */
  distance?: unknown;
  /** 알림 때 폰 발열 상태(0 보통 ~ 3 아주 뜨거움, 옛 앱은 없음) — analysis.thermal 로 */
  thermal?: number | null;
};

/**
 * 공 · 움직임 알림 하나를 시도로 남긴다 — 쟀든 못 쟀든(2026-10-12: 못 잰 공이 어디에도 안 남아 빠른 공의 실패를 구간별로 셀 수
 * 없었다). 세션을 저장하기 전에 오므로 세션 · 공은 비워 두고, saveVelocitySession 이 attemptIds · attemptId 로 잇는다.
 */
export async function recordVelocityAttempt(
  input: AttemptInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)))
    return { ok: false, error: '날짜가 올바르지 않아요.' };
  const at = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const ok = input.ok === true;
  const distance = sanitizeDistance(input.distance);
  const confidence = String(input.confidence ?? '');
  const row = await prisma.velocityAttempt.create({
    data: {
      userId: user.id,
      date: at,
      kind: input.kind === 'ball' || input.kind === 'seed' ? input.kind : 'motion',
      atSec: optional(input.atSec, 0, 1_000_000),
      strength: optional(input.strength, 0, 1_000_000),
      ok,
      rejectCode: ok ? null : String(input.code ?? '').slice(0, 40) || null,
      why: String(input.why ?? '').slice(0, 40) || null,
      trackFrames: Math.round(num(input.trackFrames, 0, 10_000) ?? 0),
      rawKmh: optional(input.rawKmh, 0, 300),
      confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : null,
      analysis: (() => {
        const thermal = optional(input.thermal, 0, 3);
        if (!distance && thermal == null) return undefined;
        return {
          ...(distance ? { distance } : {}),
          ...(thermal != null ? { thermal: Math.round(thermal) } : {}),
        } as Prisma.InputJsonValue;
      })(),
      engineVersion: VELOCITY_ENGINE_VERSION,
    },
    select: { id: true },
  });
  revalidateDay(input.date);
  return { ok: true, id: row.id };
}

/**
 * 못 잰 시도의 영상 클립을 올릴 서명 주소 — 관리자의 보정용 저장에서만(회원 클립은 폰에 두고, 못 잰 공은 폰에도 남기지 않는다).
 * 흐름은 createClipUpload 와 같다.
 */
export async function createAttemptClipUpload(
  attemptId: string,
  mime: string,
  bytes: number
): Promise<ClipUploadTarget> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (user.role !== 'ADMIN')
    return { ok: false, error: '못 잰 공의 클립은 관리자의 보정용 저장에서만 올라가요.' };
  if (!isStorageConfigured())
    return { ok: false, error: '영상 저장소가 설정되지 않았어요.' };
  if (!/^video\//.test(String(mime)))
    return { ok: false, error: '영상 파일만 올릴 수 있어요.' };
  if (!(bytes > 0 && bytes <= MAX_VIDEO_BYTES)) {
    return {
      ok: false,
      error: `클립은 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB 까지 올릴 수 있어요.`,
    };
  }
  const row = await prisma.velocityAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
    select: { id: true },
  });
  if (!row) return { ok: false, error: '시도를 찾을 수 없어요.' };
  const ext = /mp4/.test(mime) ? 'mp4' : /quicktime/.test(mime) ? 'mov' : 'webm';
  try {
    const target = await createUploadTarget(user.id, `attempt.${ext}`);
    return { ok: true, ...target };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '업로드 주소를 만들지 못했어요.',
    };
  }
}

/** 올린 클립의 경로 · 크기 · 길이 · 던진 시각을 시도에 적는다. 이미 있던 클립은 지운다 */
export async function attachAttemptClip(
  attemptId: string,
  info: { path: string; bytes: number; sec: number | null; mime: string; eventSec: number | null }
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const path = String(info.path ?? '');
  if (!path || !isOwnedBy(path, user.id))
    return { ok: false, error: '클립 경로가 올바르지 않아요.' };
  const row = await prisma.velocityAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
    select: { id: true, clipPath: true, date: true },
  });
  if (!row) return { ok: false, error: '시도를 찾을 수 없어요.' };
  await prisma.velocityAttempt.update({
    where: { id: attemptId },
    data: {
      clipPath: path,
      clipBytes: Math.round(num(info.bytes, 0, MAX_VIDEO_BYTES) ?? 0),
      clipSec: optional(info.sec, 0, 600),
      clipMime: String(info.mime ?? '').slice(0, 80) || null,
      clipEventSec: optional(info.eventSec, 0, 600),
    },
  });
  if (row.clipPath && row.clipPath !== path)
    await deleteVideos([row.clipPath]).catch(() => undefined);
  revalidateDay(row.date.toISOString().slice(0, 10));
  return { ok: true, path };
}

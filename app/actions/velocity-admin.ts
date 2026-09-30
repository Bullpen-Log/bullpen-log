'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos } from '@/lib/storage';
import {
  deleteVelocityPitchRow,
  deleteVelocitySessionRows,
  sanitizeAnalysis,
  syncVelocitySession,
} from '@/lib/velocity-sync';
import type { Prisma } from '@prisma/client';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
import {
  PITCH_RESULT_KEYS,
  PITCH_TYPE_KEYS,
  ZONE_MAX,
  ZONE_MIN,
} from '@/lib/velocity-meta';

/**
 * 구속 측정 관리자(/admin/velocity)의 액션 — 관리자가 모든 계정의 공 · 세션 · 클립을 고치고 지운다.
 *
 * 본인 것만 다루는 app/actions/velocity.ts 와 갈라 둔다. 여기는 전부 관리자 판정을 먼저 하고,
 * 검증 규칙(구종 · 코스 · 결과 · 스피드건 범위 · 메모 길이)은 그 파일의 checkEdit 와 같다.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const MIN_KMH = 30;
const MAX_KMH = 200;
const MEMO_MAX = 500;
/** 보정 한 차수에 담을 수 있는 결과 수 — 세션 저장의 MAX_PITCHES 와 같다 */
const MAX_CALIB_RESULTS = 200;
const CONFIDENCES = ['high', 'medium', 'low'];
const NOT_ADMIN: AdminActionResult = { ok: false, error: '관리자만 할 수 있습니다.' };

async function requireAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export type AdminPitchPatch = {
  gunKmh?: number | null;
  calibExclude?: boolean;
  pitchType?: string | null;
  zone?: number | null;
  result?: string | null;
  memo?: string | null;
};

/** 공 하나의 보정 자료를 고친다 — 스피드건 값 · 제외 표시 · 구종 · 코스 · 결과 · 메모 */
export async function adminUpdateVelocityPitch(
  id: string,
  patch: AdminPitchPatch
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const data: {
    gunKmh?: number | null;
    calibExclude?: boolean;
    pitchType?: string | null;
    zone?: number | null;
    result?: string | null;
    memo?: string | null;
  } = {};

  if ('gunKmh' in patch) {
    if (patch.gunKmh == null) data.gunKmh = null;
    else {
      const gun = num(patch.gunKmh, MIN_KMH, MAX_KMH);
      if (gun == null) {
        return {
          ok: false,
          error: `스피드건 값은 ${MIN_KMH}~${MAX_KMH} km/h 사이로 넣어주세요.`,
        };
      }
      data.gunKmh = Math.round(gun * 10) / 10;
    }
  }
  if ('calibExclude' in patch) data.calibExclude = patch.calibExclude === true;
  if ('pitchType' in patch) {
    const t =
      patch.pitchType == null || patch.pitchType === ''
        ? null
        : String(patch.pitchType);
    if (t != null && !PITCH_TYPE_KEYS.includes(t))
      return { ok: false, error: '구종 값이 올바르지 않습니다.' };
    data.pitchType = t;
  }
  if ('zone' in patch) {
    if (patch.zone == null) data.zone = null;
    else {
      const z = num(patch.zone, ZONE_MIN, ZONE_MAX);
      if (z == null) return { ok: false, error: '코스는 1~9 사이여야 합니다.' };
      data.zone = Math.round(z);
    }
  }
  if ('result' in patch) {
    const r = patch.result == null || patch.result === '' ? null : String(patch.result);
    if (r != null && !PITCH_RESULT_KEYS.includes(r))
      return { ok: false, error: '결과 값이 올바르지 않습니다.' };
    data.result = r;
  }
  if ('memo' in patch) {
    const memo = String(patch.memo ?? '').trim();
    if (memo.length > MEMO_MAX)
      return { ok: false, error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };
    data.memo = memo || null;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  const row = await prisma.velocityPitch.findUnique({
    where: { id },
    select: { id: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await prisma.velocityPitch.update({ where: { id }, data });
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 공 하나를 지운다(클립 포함) — 세션의 투구수 · 구속도 다시 맞춘다 */
export async function adminDeleteVelocityPitch(id: string): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const row = await prisma.velocityPitch.findUnique({
    where: { id },
    select: {
      id: true,
      sessionId: true,
      clipPath: true,
      session: { select: { date: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await deleteVelocityPitchRow(row);
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 세션을 통째로 지운다 — 같이 만든 투구 기록 · 공들의 클립까지 */
export async function adminDeleteVelocitySession(
  id: string
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const session = await prisma.velocitySession.findUnique({
    where: { id },
    select: { id: true, date: true },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없습니다.' };

  await deleteVelocitySessionRows(id);
  revalidateAll(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 공의 영상 클립만 지운다 — 공과 잰 값은 남긴다 */
export async function adminDeleteClip(pitchId: string): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const row = await prisma.velocityPitch.findUnique({
    where: { id: pitchId },
    select: { id: true, clipPath: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };
  if (!row.clipPath) return { ok: false, error: '이 공에는 클립이 없습니다.' };

  await deleteVideos([row.clipPath]).catch(() => undefined);
  await prisma.velocityPitch.update({
    where: { id: pitchId },
    data: {
      clipPath: null,
      clipBytes: null,
      clipSec: null,
      clipMime: null,
      clipEventSec: null,
    },
  });
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 세션의 메모 · 보정용 표시를 고친다 */
export async function adminUpdateSession(
  id: string,
  patch: { memo?: string | null; forCalibration?: boolean }
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const data: { memo?: string | null; forCalibration?: boolean } = {};
  if ('memo' in patch) {
    const memo = String(patch.memo ?? '').trim();
    if (memo.length > MEMO_MAX)
      return { ok: false, error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };
    data.memo = memo || null;
  }
  if ('forCalibration' in patch) data.forCalibration = patch.forCalibration === true;
  if (Object.keys(data).length === 0) return { ok: true };

  const session = await prisma.velocitySession.findUnique({
    where: { id },
    select: { id: true, date: true },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없습니다.' };

  await prisma.velocitySession.update({ where: { id }, data });
  revalidateAll(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

function revalidateAll(date: string) {
  revalidatePath('/admin/velocity');
  revalidatePath(`/admin/velocity/${date}`);
  revalidatePath(`/pitch-log/${date}`);
  revalidatePath('/videos');
  revalidatePath('/today');
}

/** 다시 잰 값 — 브라우저가 영상을 다시 재서 넘기는 것(explorer-panels.tsx 의 RemeasureResult) */
export type RemeasuredValues = {
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
  analysis?: unknown;
};

/**
 * 다시 잰 값을 공에 채운다 — 수기로 올린 공(카메라 값 없음)이 엔진이 좋아진 뒤 영상으로 재지면
 * 그 값이 들어가고 수기 표시가 풀려 보정 짝이 된다. 카메라로 잰 공도 새 값으로 바꿀 수 있다.
 * 보정 뒤 값(kmh)은 그 세션이 저장될 때의 보정식으로 — 세션 안 다른 공과 같은 눈금으로.
 */
export async function adminApplyMeasurement(
  id: string,
  values: RemeasuredValues
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const raw = num(values.rawKmh, MIN_KMH, MAX_KMH);
  if (raw == null)
    return { ok: false, error: `구속 값이 ${MIN_KMH}~${MAX_KMH} km/h 를 벗어났습니다.` };
  const opt = (v: unknown, lo: number, hi: number) => (v == null ? null : num(v, lo, hi));

  const row = await prisma.velocityPitch.findUnique({
    where: { id },
    select: {
      id: true,
      sessionId: true,
      session: { select: { date: true, calScale: true, calOffset: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  const kmh = Math.round((raw * row.session.calScale + row.session.calOffset) * 10) / 10;
  await prisma.velocityPitch.update({
    where: { id },
    data: {
      rawKmh: raw,
      kmh,
      errorKmh: num(values.errorKmh, 0, 100) ?? 0,
      confidence: ['high', 'medium', 'low'].includes(values.confidence)
        ? values.confidence
        : 'medium',
      releaseKmh: opt(values.releaseKmh, 0, 250),
      releaseDxCm: opt(values.releaseDxCm, -500, 500),
      releaseDyCm: opt(values.releaseDyCm, -500, 500),
      releaseDistM: opt(values.releaseDistM, 0, 50),
      travelM: opt(values.travelM, 0, 100),
      durationSec: opt(values.durationSec, 0, 10),
      frames: opt(values.frames, 0, 10_000),
      fps: opt(values.fps, 0, 1000),
      analysis: (sanitizeAnalysis(values.analysis) ?? undefined) as
        Prisma.InputJsonValue | undefined,
      manual: false,
      /* 새 값을 낸 모델 — 원본이 옛 모델이었어도 이제 이 버전의 값 */
      engineVersion: VELOCITY_ENGINE_VERSION,
    },
  });
  /* 같이 만든 투구 기록의 최고 · 평균도 새 값으로 */
  await syncVelocitySession(row.sessionId);
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/* ───────────────────────── 보정 재측정(VelocityCalibRun) ───────────────────────── */

/** 보정 차수에 넣는 공 하나의 결과 — 브라우저가 그날 클립을 지금 모델로 다시 잰 것 */
export type CalibResultInput = {
  pitchId: string;
  /** 쟀나 — false 면 값은 비우고 reject 에 까닭 */
  ok: boolean;
  rawKmh?: number | null;
  releaseKmh?: number | null;
  errorKmh?: number | null;
  confidence?: string | null;
  frames?: number | null;
  fps?: number | null;
  /** 거부 까닭(validate.ts 의 RejectCode) */
  reject?: string | null;
};

/**
 * 보정 한 차수를 저장한다 — 그날 공들을 지금 모델로 다시 잰 결과를 원본은 두고 따로 쌓는다
 * (탐색기 [보정] › 연도 › 월 › 날짜 › N차). 차수(pass)는 그날의 마지막 차수 + 1, 모델 버전은 지금 것.
 * 공은 전부 그 날짜 세션의 것이어야 하고, 한 차수에 같은 공이 두 번 들어올 수 없다.
 */
export async function adminSaveCalibRun(input: {
  date: string;
  memo?: string | null;
  results: CalibResultInput[];
}): Promise<AdminActionResult & { runId?: string }> {
  const user = await requireAdminUser();
  if (!user) return NOT_ADMIN;

  const date = String(input.date ?? '');
  const at = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(at.getTime()) ||
    at.toISOString().slice(0, 10) !== date
  ) {
    return { ok: false, error: '날짜가 올바르지 않습니다.' };
  }
  const memo = String(input.memo ?? '').trim();
  if (memo.length > MEMO_MAX)
    return { ok: false, error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };

  if (!Array.isArray(input.results) || input.results.length === 0)
    return { ok: false, error: '다시 잰 결과가 없습니다.' };
  if (input.results.length > MAX_CALIB_RESULTS) {
    return {
      ok: false,
      error: `한 차수에 ${MAX_CALIB_RESULTS}구까지 담을 수 있습니다.`,
    };
  }

  /* 값 검사 — 잰 것은 카메라 값이 꼭 있고, 못 잰 것은 값 없이 까닭만 */
  const opt = (v: unknown, lo: number, hi: number) => (v == null ? null : num(v, lo, hi));
  const rows: Prisma.VelocityCalibResultCreateWithoutRunInput[] = [];
  const ids = new Set<string>();
  for (const r of input.results) {
    const pitchId = String(r.pitchId ?? '');
    if (!pitchId || ids.has(pitchId))
      return { ok: false, error: '같은 공이 두 번 들어 있거나 공 번호가 비었습니다.' };
    ids.add(pitchId);
    const pitch = { connect: { id: pitchId } };
    if (r.ok !== true) {
      rows.push({
        pitch,
        ok: false,
        reject: String(r.reject ?? '').slice(0, 80) || null,
      });
      continue;
    }
    const raw = num(r.rawKmh, MIN_KMH, MAX_KMH);
    if (raw == null) {
      return {
        ok: false,
        error: `구속 값이 ${MIN_KMH}~${MAX_KMH} km/h 를 벗어났습니다.`,
      };
    }
    rows.push({
      pitch,
      ok: true,
      rawKmh: raw,
      releaseKmh: opt(r.releaseKmh, 0, 250),
      errorKmh: opt(r.errorKmh, 0, 100),
      confidence:
        r.confidence != null && CONFIDENCES.includes(r.confidence) ? r.confidence : null,
      frames: opt(r.frames, 0, 10_000),
      fps: opt(r.fps, 0, 1000),
      reject: null,
    });
  }

  /* 전부 그 날짜 세션의 공이어야 한다 — 다른 날 공이 섞이면 차수 통계가 뒤섞인다 */
  const found = await prisma.velocityPitch.count({
    where: { id: { in: [...ids] }, session: { date: at } },
  });
  if (found !== ids.size)
    return { ok: false, error: '그 날짜의 공이 아닌 것이 섞여 있습니다.' };

  const run = await prisma.$transaction(async (tx) => {
    const last = await tx.velocityCalibRun.aggregate({
      where: { date: at },
      _max: { pass: true },
    });
    return tx.velocityCalibRun.create({
      data: {
        date: at,
        pass: (last._max.pass ?? 0) + 1,
        engineVersion: VELOCITY_ENGINE_VERSION,
        userId: user.id,
        memo: memo || null,
        results: { create: rows },
      },
      select: { id: true },
    });
  });

  revalidateAll(date);
  return { ok: true, runId: run.id };
}

/** 보정 한 차수를 지운다 — 결과들도 같이. 원본 공은 그대로 */
export async function adminDeleteCalibRun(runId: string): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const run = await prisma.velocityCalibRun.findUnique({
    where: { id: runId },
    select: { id: true, date: true },
  });
  if (!run) return { ok: false, error: '보정 차수를 찾을 수 없습니다.' };

  await prisma.velocityCalibRun.delete({ where: { id: runId } });
  revalidateAll(run.date.toISOString().slice(0, 10));
  return { ok: true };
}

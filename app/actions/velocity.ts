'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { isRestSession, validateSessionType } from '@/lib/session-type';
import { fitCalibration, type CalFit, type CalPair } from '@/lib/velocity-calibration';
import {
  PITCH_RESULT_KEYS,
  PITCH_TYPE_KEYS,
  ZONE_MAX,
  ZONE_MIN,
  VELOCITY_MEMO_MARK,
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
} & PitchEdit;

export type SaveSessionInput = {
  /** YYYY-MM-DD */
  date: string;
  sessionType: string;
  intensity: number;
  fovDeg: number;
  source: 'camera' | 'file';
  device: string | null;
  /** 무엇을 어디서 — 'pitch' · 'hit', 'behind-pitcher' · 'behind-catcher', 네트 유무 */
  mode: string;
  cameraPos: string;
  net: boolean;
  pitches: SavePitchInput[];
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
    return { error: '구종 값이 올바르지 않습니다.' };
  }
  const zone = optional(edit.zone, ZONE_MIN, ZONE_MAX);
  if (edit.zone != null && zone == null)
    return { error: '코스는 1~9 사이여야 합니다.' };
  const result = edit.result == null || edit.result === '' ? null : String(edit.result);
  if (result != null && !PITCH_RESULT_KEYS.includes(result)) {
    return { error: '결과 값이 올바르지 않습니다.' };
  }
  const gunKmh = optional(edit.gunKmh, MIN_KMH, MAX_KMH);
  if (edit.gunKmh != null && gunKmh == null) {
    return { error: `스피드건 값은 ${MIN_KMH}~${MAX_KMH} km/h 사이로 넣어주세요.` };
  }
  const memo = String(edit.memo ?? '').trim();
  if (memo.length > MEMO_MAX)
    return { error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };
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
    where: { userId: user.id, gunKmh: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: CAL_PAIR_LIMIT,
    select: { rawKmh: true, gunKmh: true },
  });
  const pairs = rows.map((r) => ({ measured: r.rawKmh, gun: r.gunKmh as number }));
  return { fit: fitCalibration(pairs), pairs };
}

export async function saveVelocitySession(
  input: SaveSessionInput
): Promise<VelocityActionResult & { sessionId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { ok: false, error: '날짜가 올바르지 않습니다.' };
  const at = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()))
    return { ok: false, error: '날짜가 올바르지 않습니다.' };

  const type = validateSessionType(String(input.sessionType ?? ''));
  if ('error' in type) return { ok: false, error: type.error };
  if (isRestSession(type.value))
    return { ok: false, error: '쉬는 날에는 구속을 남길 수 없습니다.' };

  const intensity = num(input.intensity, 1, 10);
  if (intensity == null) return { ok: false, error: '강도는 1~10 사이여야 합니다.' };
  const fovDeg = num(input.fovDeg, 30, 120);
  if (fovDeg == null) return { ok: false, error: '화각이 올바르지 않습니다.' };

  const mode = input.mode === 'hit' ? 'hit' : 'pitch';
  const cameraPos =
    input.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher';

  if (!Array.isArray(input.pitches) || input.pitches.length === 0) {
    return { ok: false, error: '잰 공이 없습니다.' };
  }
  if (input.pitches.length > MAX_PITCHES) {
    return { ok: false, error: `한 번에 ${MAX_PITCHES}구까지 저장할 수 있습니다.` };
  }

  /* 보정식은 저장하는 순간의 짝으로 — 세션에 박아 두어 나중에 되짚는다 */
  const { fit } = await loadCalibration();

  const pitches: Array<
    Omit<SavePitchInput, keyof PitchEdit> & PitchEdit & { kmh: number }
  > = [];
  for (const p of input.pitches) {
    const rawKmh = num(p.rawKmh, MIN_KMH, MAX_KMH);
    if (rawKmh == null)
      return {
        ok: false,
        error: `구속 값이 ${MIN_KMH}~${MAX_KMH} km/h 를 벗어났습니다.`,
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
      ...edit,
    });
  }

  const kmhs = pitches.map((p) => p.kmh);
  const maxVelocity = Math.max(...kmhs);
  const avgVelocity =
    Math.round((kmhs.reduce((s, v) => s + v, 0) / kmhs.length) * 10) / 10;

  const session = await prisma.$transaction(async (tx) => {
    const log = await tx.pitchLog.create({
      data: {
        userId: user.id,
        date: at,
        sessionType: type.value,
        pitchCount: pitches.length,
        intensity,
        maxVelocity,
        avgVelocity,
        memo: `${VELOCITY_MEMO_MARK} 카메라로 잰 ${pitches.length}구 — 자세한 값은 아래 '구속 측정'에`,
        videoPaths: [],
      },
    });
    return tx.velocitySession.create({
      data: {
        userId: user.id,
        date: at,
        pitchLogId: log.id,
        fovDeg,
        calScale: fit.scale,
        calOffset: fit.offset,
        calPairs: fit.n,
        source: input.source === 'file' ? 'file' : 'camera',
        mode,
        cameraPos,
        net: input.net !== false,
        device: input.device ? String(input.device).slice(0, 200) : null,
        pitches: {
          create: pitches.map((p, i) => ({ ...p, seq: i + 1, userId: user.id })),
        },
      },
      select: { id: true },
    });
  });

  revalidateDay(input.date);
  return { ok: true, sessionId: session.id };
}

export async function updateVelocityPitch(
  id: string,
  edit: PitchEdit
): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };
  const checked = checkEdit(edit);
  if ('error' in checked) return { ok: false, error: checked.error };

  const row = await prisma.velocityPitch.findFirst({
    where: { id, userId: user.id },
    select: { id: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await prisma.velocityPitch.update({ where: { id }, data: checked });
  revalidateDay(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

export async function deleteVelocityPitch(id: string): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const row = await prisma.velocityPitch.findFirst({
    where: { id, userId: user.id },
    select: { id: true, sessionId: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await prisma.velocityPitch.delete({ where: { id } });
  await syncSession(row.sessionId);
  revalidateDay(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

export async function deleteVelocitySession(id: string): Promise<VelocityActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const session = await prisma.velocitySession.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      date: true,
      pitchLogId: true,
      pitchLog: { select: { memo: true } },
    },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없습니다.' };

  await prisma.$transaction(async (tx) => {
    await tx.velocitySession.delete({ where: { id } });
    /* 같이 만든 투구 기록도 지운다 — 사람이 따로 만든 기록(표시 없음)은 건드리지 않는다 */
    if (session.pitchLogId && session.pitchLog?.memo?.startsWith(VELOCITY_MEMO_MARK)) {
      await tx.pitchLog.delete({ where: { id: session.pitchLogId } });
    }
  });
  revalidateDay(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/**
 * 공이 줄었으면 같이 만든 투구 기록의 투구수 · 구속을 다시 맞춘다. 공이 하나도 안 남으면
 * 세션과 그 기록을 지운다.
 */
async function syncSession(sessionId: string) {
  const session = await prisma.velocitySession.findUnique({
    where: { id: sessionId },
    select: {
      pitchLogId: true,
      pitchLog: { select: { memo: true } },
      pitches: { select: { kmh: true } },
    },
  });
  if (!session) return;
  const own =
    !!session.pitchLogId && !!session.pitchLog?.memo?.startsWith(VELOCITY_MEMO_MARK);

  if (session.pitches.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.velocitySession.delete({ where: { id: sessionId } });
      if (own)
        await tx.pitchLog.delete({ where: { id: session.pitchLogId as string } });
    });
    return;
  }
  if (!own) return;
  const kmhs = session.pitches.map((p) => p.kmh);
  await prisma.pitchLog.update({
    where: { id: session.pitchLogId as string },
    data: {
      pitchCount: kmhs.length,
      maxVelocity: Math.max(...kmhs),
      avgVelocity:
        Math.round((kmhs.reduce((s, v) => s + v, 0) / kmhs.length) * 10) / 10,
      memo: `${VELOCITY_MEMO_MARK} 카메라로 잰 ${kmhs.length}구 — 자세한 값은 아래 '구속 측정'에`,
    },
  });
}

function revalidateDay(date: string) {
  revalidatePath(`/pitch-log/${date}`);
  revalidatePath('/videos');
  revalidatePath('/today');
  revalidatePath('/velocity');
}

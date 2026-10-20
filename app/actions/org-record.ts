'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { memberScope, requireOrg } from '@/lib/org/access';
import { isDateKey } from '@/lib/org/rules';
import { dbDate } from '@/lib/nutrition/days';
import { appNowMs } from '@/lib/clock';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { isRestSession, validateSessionType } from '@/lib/session-type';
import { readEffortInput } from '@/lib/pitch-effort';

/**
 * 코치가 대신 적는 투구 기록(3단계 · 5단계 경기 투구수표) — 한 폼에서 여러 선수를 한 번에. 검사는 선수의 투구 기록 API
 * (app/api/pitch-log/route.ts)와 같은 선: 투구수 1~500 · 체감 강도 5~100%(lib/pitch-effort.ts) · 구속 30~200 · 앞날 금지.
 * 줄은 선수 본인 것으로(userId = 선수) 남고 enteredById · orgId 로 '코치가 적음'을 표시한다 — 선수는 제 화면에서 고칠 수 있다.
 * 투구 공유를 안 켠 선수 · 가입 전 자리는 적지 않는다.
 */

const MAX_PITCH_COUNT = 500;
const MIN_VELOCITY = 30;
const MAX_VELOCITY = 200;
/** 같은 코치가 2분 안에 같은 선수 · 같은 날 · 같은 값으로 또 보내면 새 줄을 안 만든다(답을 못 받아 다시 누른 것) */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export type OrgActionState = { error?: string; success?: string } | undefined;

export async function createPitchLogs(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  const date = String(formData.get('date') ?? '');
  if (!isDateKey(date)) return { error: '날짜를 골라 주세요.' };
  if (isFutureDateKey(date)) return { error: '아직 오지 않은 날짜에는 기록할 수 없어요.' };
  const type = validateSessionType(String(formData.get('sessionType') ?? ''));
  if ('error' in type) return { error: type.error };
  const resting = isRestSession(type.value);
  const baseEffort = String(formData.get('effortPct') ?? '').trim();

  const members = await prisma.orgMember.findMany({
    where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE', userId: { not: null } },
    select: {
      id: true,
      userId: true,
      nickname: true,
      consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } },
    },
  });

  const rows: {
    userId: string;
    nickname: string;
    pitchCount: number;
    intensity: number;
    effortPct: number | null;
    maxVelocity: number | null;
  }[] = [];
  for (const m of members) {
    const raw = String(formData.get(`pitch-${m.id}`) ?? '').trim();
    if (!raw && !resting) continue;
    if (resting && formData.get(`rest-${m.id}`) !== 'on') continue;
    if (!memberScope(m.consent).pitch) return { error: `${m.nickname}은(는) 투구 기록 공유를 켜지 않았어요.` };
    let pitchCount = 0;
    if (!resting) {
      pitchCount = Number.parseInt(raw, 10);
      if (!Number.isInteger(pitchCount) || pitchCount < 1) return { error: `${m.nickname}의 투구수를 올바르게 적어 주세요.` };
      if (pitchCount > MAX_PITCH_COUNT) return { error: `${m.nickname}의 투구수가 ${MAX_PITCH_COUNT}구를 넘어요. 자릿수를 확인해 주세요.` };
    }
    const rowEffort = String(formData.get(`effort-${m.id}`) ?? '').trim();
    const effort = readEffortInput({ effortPct: rowEffort || baseEffort }, resting);
    if ('error' in effort) return { error: `${m.nickname}: ${effort.error}` };
    const rawMax = String(formData.get(`max-${m.id}`) ?? '').trim();
    let maxVelocity: number | null = null;
    if (rawMax && !resting) {
      const v = Number.parseFloat(rawMax);
      if (!Number.isFinite(v) || v < MIN_VELOCITY || v > MAX_VELOCITY)
        return { error: `${m.nickname}의 구속은 ${MIN_VELOCITY}~${MAX_VELOCITY}km/h 사이로 적어 주세요.` };
      maxVelocity = v;
    }
    rows.push({
      userId: m.userId!,
      nickname: m.nickname,
      pitchCount,
      intensity: effort.intensity,
      effortPct: effort.effortPct,
      maxVelocity,
    });
  }
  if (rows.length === 0) return { error: '적은 선수가 없어요. 투구수를 적어 주세요.' };

  const when = dbDate(date);
  const recent = await prisma.pitchLog.findMany({
    where: {
      userId: { in: rows.map((r) => r.userId) },
      date: when,
      enteredById: user.id,
      createdAt: { gte: new Date(appNowMs() - DUPLICATE_WINDOW_MS) },
    },
    select: { userId: true, sessionType: true, pitchCount: true, intensity: true },
  });
  const fresh = rows.filter(
    (r) =>
      !recent.some(
        (p) => p.userId === r.userId && p.sessionType === type.value && p.pitchCount === r.pitchCount && p.intensity === r.intensity
      )
  );
  if (fresh.length > 0) {
    await prisma.pitchLog.createMany({
      data: fresh.map((r) => ({
        userId: r.userId,
        date: when,
        sessionType: type.value,
        pitchCount: r.pitchCount,
        intensity: r.intensity,
        effortPct: r.effortPct,
        maxVelocity: r.maxVelocity,
        enteredById: user.id,
        orgId: org.id,
      })),
    });
  }
  revalidatePath('/master', 'layout');
  return { success: `${rows.length}명 기록했어요${fresh.length < rows.length ? ' (방금 같은 값은 한 번만)' : ''}.` };
}

/** 코치가 적은 기록 되돌리기 — 그 조직에서 적은 줄만, 선수가 고친 뒤라도 코치가 적은 줄이면 지운다 */
export async function deleteProxyPitchLog(formData: FormData) {
  const user = await requireMaster();
  const log = await prisma.pitchLog.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, orgId: true, enteredById: true },
  });
  if (!log || !log.orgId || !log.enteredById) return;
  await requireOrg(user, log.orgId);
  await prisma.pitchLog.delete({ where: { id: log.id } });
  revalidatePath('/master', 'layout');
}

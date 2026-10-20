import { loadJson, saveJson } from '~/lib/store';
import { outboxOwner } from '~/workout/outbox';
import type { NativePitch } from './session';

/**
 * 저장하지 않은 구속 세션을 폰에 맡겨 둔다(웹 lib/velocity-draft.ts 와 같은 뜻) — 화면을 닫거나 앱이 꺼져도 잰 공이 남는다.
 * 클립 파일은 앱 카메라가 tmp/bullpen-dualcam 에 둔 그대로(DualCamera 가 앱을 다시 켜도 그 폴더 파일은 읽게 해 준다).
 * iOS 가 tmp 를 비우면 클립만 못 붙고 측정값은 저장된다(saveSession 의 clipFailed).
 * 맡긴 계정(userId)을 같이 적는다 — 운동 대기열(~/workout/outbox.ts)과 같은 규칙: 다른 계정이면 안 보이고, 다른 계정이 로그인하면 지운다.
 * 계정을 모를 때 맡긴 것(꺼진 망에서 켜자마자)은 누구 것도 아니라 남긴다.
 */
const KEY = 'bullpen-velocity-draft';
/** 이보다 오래된 맡김은 버린다 — 지난주 공을 오늘 세션으로 착각하지 않게 */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export type VelocityDraft = { v: 1; date: string; sessionType: string; pitches: NativePitch[]; savedAt: number; userId?: string | null };

async function readDraft(now: number): Promise<VelocityDraft | null> {
  const raw = (await loadJson(KEY)) as Partial<VelocityDraft> | null;
  if (!raw || raw.v !== 1 || !Array.isArray(raw.pitches) || !raw.pitches.length) return null;
  if (typeof raw.date !== 'string' || typeof raw.sessionType !== 'string' || typeof raw.savedAt !== 'number') return null;
  if (now - raw.savedAt > MAX_AGE_MS) return null;
  return raw as VelocityDraft;
}

export async function loadDraft(now = Date.now()): Promise<VelocityDraft | null> {
  const d = await readDraft(now);
  const me = outboxOwner();
  return d && (!d.userId || !me || d.userId === me) ? d : null;
}

export const saveDraft = (d: Omit<VelocityDraft, 'v' | 'savedAt' | 'userId'>) =>
  saveJson(KEY, { v: 1, ...d, savedAt: Date.now(), userId: outboxOwner() });
export const clearDraft = () => saveJson(KEY, null);

/** 로그인한 계정을 알았을 때 — 다른 계정이 맡긴 세션이면 지운다(앞사람 공을 '이어서 하기'로 제 기록에 저장하지 않게) */
export async function dropDraftNotOf(userId: string) {
  const d = await readDraft(Date.now());
  if (d?.userId && d.userId !== userId) await clearDraft();
}

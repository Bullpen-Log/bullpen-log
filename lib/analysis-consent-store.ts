import 'server-only';
import { prisma } from '@/lib/prisma';
import { ANALYSIS_CONSENT, analysisConsentReady, consentStateOf, type ConsentState } from '@/lib/analysis-consent';
import { HEALTH_PURPOSE, healthConsentOf } from '@/lib/health-consent';
import { COACH_AI_PURPOSE, coachAiConsentOf } from '@/lib/coach/ai-consent';

/**
 * 국외 이전 동의 기록 읽기(서버만) — 분석 걸기(app/actions/pitch-lab.ts requestPitch3dV2)와 화면(app/actions/analysis-consent.ts)이 같이 쓴다.
 * 남의 id 로 부르는 서버 동작이 되지 않게 'use server' 파일에 두지 않는다.
 */
export async function consentRecordsOf(userId: string, purpose: 'pitch3d' | 'health' | 'coachAi' = 'pitch3d') {
  return prisma.analysisConsent.findMany({
    /* 같은 표에 건강정보 동의(purpose 'health')도 있다 — 늘 목적으로 거른다 */
    where: { userId, purpose },
    orderBy: { agreedAt: 'desc' },
    take: 20,
    select: { id: true, version: true, source: true, agreedAt: true, revokedAt: true },
  });
}

export async function consentStateFor(userId: string): Promise<ConsentState> {
  if (!analysisConsentReady()) return consentStateOf([], false);
  return consentStateOf(await consentRecordsOf(userId), true, ANALYSIS_CONSENT.version);
}

/** 건강정보 동의 상태(lib/health-consent.ts) — 체크인 통증 칸 · 재활 · 코치 시작이 본다(B4) */
export async function healthConsentFor(userId: string): Promise<ConsentState> {
  return healthConsentOf(await consentRecordsOf(userId, HEALTH_PURPOSE));
}

/** 코치 AI 국외 이전 동의 상태(lib/coach/ai-consent.ts) — AI 를 부르기 전 판정(lib/coach/ai-gate.ts)이 본다 */
export async function coachAiConsentFor(userId: string): Promise<ConsentState> {
  return coachAiConsentOf(await consentRecordsOf(userId, COACH_AI_PURPOSE));
}

import 'server-only';
import { prisma } from '@/lib/prisma';
import { ANALYSIS_CONSENT, analysisConsentReady, consentStateOf, type ConsentState } from '@/lib/analysis-consent';

/**
 * 국외 이전 동의 기록 읽기(서버만) — 분석 걸기(app/actions/pitch-lab.ts requestPitch3dV2)와 화면(app/actions/analysis-consent.ts)이 같이 쓴다.
 * 남의 id 로 부르는 서버 동작이 되지 않게 'use server' 파일에 두지 않는다.
 */
export async function consentRecordsOf(userId: string) {
  return prisma.analysisConsent.findMany({
    where: { userId },
    orderBy: { agreedAt: 'desc' },
    take: 20,
    select: { id: true, version: true, source: true, agreedAt: true, revokedAt: true },
  });
}

export async function consentStateFor(userId: string): Promise<ConsentState> {
  if (!analysisConsentReady()) return consentStateOf([], false);
  return consentStateOf(await consentRecordsOf(userId), true, ANALYSIS_CONSENT.version);
}

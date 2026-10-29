'use server';

import { allowFeature } from '@/lib/release-gate';
import { getCurrentUser, requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import {
  ANALYSIS_CONSENT,
  ANALYSIS_CONSENT_PENDING,
  analysisConsentReady,
  consentAgeBlock,
  CONSENT_SOURCE_TEXT,
  CONSENT_SOURCES,
  type AnalysisConsentDoc,
  type ConsentSource,
  type ConsentState,
} from '@/lib/analysis-consent';
import { consentRecordsOf, consentStateFor } from '@/lib/analysis-consent-store';

/**
 * 3D 분석 국외 이전 동의(앱) — 문서 · 내 상태 · 내역 읽기, 동의하기, 철회하기. 규칙은 lib/analysis-consent.ts, 기록은 DB AnalysisConsent 만.
 * 문서가 확정 전이면(ready false) 동의를 받지 않는다 — 분석은 예전처럼 요청할 때마다 확인한다(app/actions/pitch-lab.ts requestPitch3dV2).
 * /api/rpc/analysis-consent.<함수> 로 부른다.
 */

/** 가입 화면 — 로그인 전이라 문서만(내 상태 없음). 확정 전이면 화면이 [선택] 줄을 그리지 않는다 */
export async function loadAnalysisConsentDoc(): Promise<{ ok: true; ready: boolean; doc: AnalysisConsentDoc }> {
  allowFeature('pitch3d');
  return { ok: true, ready: analysisConsentReady(), doc: ANALYSIS_CONSENT };
}

export type AppAnalysisConsent = {
  ok: true;
  ready: boolean;
  doc: AnalysisConsentDoc;
  /** 확정 전이면 아직 확인하지 못한 것(내용 보기에 '확인 중'으로) */
  pending: string[];
  state: ConsentState;
  history: { id: string; sourceText: string; agreedAt: string; revokedAt: string | null; current: boolean; outdated: boolean }[];
  /** 본인 동의를 받을 수 없는 까닭(만 14세 미만) — 있으면 동의 단추를 끈다 */
  blocked: string | null;
  /** 관리자 — 남의 투구를 올려 분석한다. 그때는 선수 쪽 동의를 요청마다 확인한다(본인 동의와 별개) */
  staff: boolean;
};

export async function loadAppAnalysisConsent(): Promise<AppAnalysisConsent | { ok: false; to: string }> {
  allowFeature('pitch3d');
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  const ready = analysisConsentReady();
  const [records, state] = await Promise.all([consentRecordsOf(user.id), consentStateFor(user.id)]);
  return {
    ok: true,
    ready,
    doc: ANALYSIS_CONSENT,
    pending: ready ? [] : [...ANALYSIS_CONSENT_PENDING],
    state,
    history: records.map((r) => ({
      id: r.id,
      sourceText: (CONSENT_SOURCES as readonly string[]).includes(r.source) ? CONSENT_SOURCE_TEXT[r.source as ConsentSource] : '',
      agreedAt: r.agreedAt.toISOString(),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      current: r.revokedAt == null && r.version === ANALYSIS_CONSENT.version,
      outdated: r.version !== ANALYSIS_CONSENT.version,
    })),
    blocked: consentAgeBlock(user.birthDate, new Date()),
    staff: user.role === 'ADMIN',
  };
}

/**
 * 동의하기 — 화면이 보여 준 판(version)이 지금 판일 때만. 이미 유효한 동의가 있으면 새 줄을 만들지 않는다(두 번 누름 · 다시 시도).
 * 저장에 실패하면 오류를 돌려준다 — 화면은 '동의 완료'로 바꾸지 않는다.
 */
export async function giveAnalysisConsent(input: {
  version: string;
  source?: 'first_use' | 'settings';
}): Promise<{ ok: true; state: ConsentState } | { error: string }> {
  allowFeature('pitch3d');
  const user = await requireUser();
  if (!analysisConsentReady()) return { error: '동의 내용을 아직 확정하지 못했어요. 분석을 요청할 때 확인해 주세요.' };
  if (input?.version !== ANALYSIS_CONSENT.version) return { error: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.' };
  const age = consentAgeBlock(user.birthDate, new Date());
  if (age) return { error: age };
  try {
    const now = await consentStateFor(user.id);
    if (now.valid) return { ok: true, state: now };
    await prisma.analysisConsent.create({
      data: { userId: user.id, version: ANALYSIS_CONSENT.version, source: input.source === 'settings' ? 'settings' : 'first_use' },
    });
    return { ok: true, state: await consentStateFor(user.id) };
  } catch {
    return { error: '동의를 저장하지 못했어요. 다시 해 주세요.' };
  }
}

/**
 * 철회 — 줄을 지우지 않고 철회 시각을 적는다. 그 뒤 새 분석은 다시 동의해야 시작된다.
 * 이미 분석 서버가 받은 작업은 멈추지 못한다(취소 길이 없다) — 화면이 그렇게 알린다.
 */
export async function revokeAnalysisConsent(): Promise<{ ok: true; state: ConsentState } | { error: string }> {
  allowFeature('pitch3d');
  const user = await requireUser();
  try {
    await prisma.analysisConsent.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true, state: await consentStateFor(user.id) };
  } catch {
    return { error: '철회를 저장하지 못했어요. 다시 해 주세요.' };
  }
}

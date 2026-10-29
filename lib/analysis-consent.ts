/**
 * 3D 동작 분석 — 개인정보 국외 이전 동의(2026-10-29 김민 결정: 가입 때 별도 [선택] 동의, 없으면 첫 분석 전에 한 번).
 * 근거는 개인정보 보호법 제28조의8 ①1(정보주체의 별도 동의) — 알릴 것: 이전 항목 · 나라 · 시기와 방법 · 받는 곳(이름 · 연락처) · 목적 · 보유 기간 · 거부 방법과 효과.
 *
 * 유효한 동의 = DB AnalysisConsent 줄 가운데 철회하지 않았고 version 이 지금 문서 판(ANALYSIS_CONSENT.version)과 같은 것(consentStateOf).
 * 화면의 체크 · 앱에 남긴 값은 근거가 아니다. 판을 올리는 것은 알릴 내용이 바뀔 때만 — 글자 손질은 판을 그대로 둔다(올리면 모두 다시 동의해야 한다).
 *
 * PENDING(아직 확인 못 한 것)이 하나라도 남으면 문서는 '확정 전'이다(ready false) — 새 동의를 받지 않고, 받은 줄이 있어도 전송 근거로 쓰지 않는다.
 * 그동안 분석은 예전처럼 요청할 때마다 확인(lib/pitch-3d/v2/lab-summary CONSENT_TEXT, 서버 requestPitch3dV2)으로 돈다.
 * 확인이 끝나면 아래 null 칸을 채우고 PENDING 에서 지운 뒤 version 을 확정 판으로 바꾼다 — 그것만으로 가입 · 첫 분석 · 설정이 켜진다.
 */

export type AnalysisConsentDoc = {
  version: string;
  title: string;
  items: string;
  country: string;
  recipient: string;
  /** 받는 곳 연락처 — 확인 전이면 null */
  contact: string | null;
  when: string;
  purpose: string;
  /** 받는 곳의 보유 · 이용 기간 — 계약으로 확인 전이면 null */
  retention: string | null;
  refusal: string;
};

export const ANALYSIS_CONSENT: AnalysisConsentDoc = {
  version: '2026-10-29-draft',
  title: '3D 분석을 위한 개인정보 국외 이전 동의',
  /* 분석 서버로 가는 것 — app/actions/pitch-lab.ts requestPitch3dV2 의 startGpuJob(영상 주소 · 던지는 손 · 키 · 촬영 설정) */
  items: '옆 · 뒤 투구 영상 원본 2개(얼굴 · 체형이 담길 수 있어요), 던지는 손, 키(적었을 때), 슬로 모션 설정',
  country: '미국',
  recipient: 'Modal Labs, Inc.',
  contact: null,
  when: '분석을 시작할 때마다 암호화된 통신(HTTPS)으로 보내요',
  purpose: '투구 동작의 관절 위치를 찾아 3D 동작을 만드는 분석',
  retention: null,
  refusal: '동의하지 않아도 가입과 다른 기능은 그대로 쓸 수 있어요. 3D 분석만 시작할 수 없어요.',
};

/**
 * 아직 확인하지 못한 것 — 개발자가 짐작으로 채우지 않는다. 비면 문서 확정(ready).
 * ponytail: 손으로 적은 목록 — 확인한 사람이 지운다.
 */
export const ANALYSIS_CONSENT_PENDING: readonly string[] = [
  '받는 곳(Modal Labs, Inc.)의 개인정보 담당 연락처',
  '받는 곳의 보유 · 이용 기간(분석 뒤 지움을 계약 · 약관으로 확인)',
  '처리 나라 확정(분석 서버의 지역을 미국으로 고정했는지)',
  '법적 근거 검토(별도 동의로 갈지, 계약 이행에 필요한 처리위탁으로 갈지)',
  '만 14세 미만 회원의 법정대리인 동의 절차',
];

export const analysisConsentReady = () => ANALYSIS_CONSENT_PENDING.length === 0;

/** 동의를 받은 곳 — 'signup' 가입 · 'first_use' 첫 분석 전 · 'settings' 설정에서 다시 */
export type ConsentSource = 'signup' | 'first_use' | 'settings';
export const CONSENT_SOURCES: readonly ConsentSource[] = ['signup', 'first_use', 'settings'];
export const CONSENT_SOURCE_TEXT: Record<ConsentSource, string> = { signup: '가입할 때', first_use: '첫 분석 전', settings: '설정에서' };

export type ConsentRecord = { id: string; version: string; source: string; agreedAt: Date; revokedAt: Date | null };

/** 만 14세 미만은 본인 동의로 안 된다(개인정보 보호법 제22조의2) — 법정대리인 절차가 없어 받지 않는다. 생년월일을 모르면 막지 않는다 */
export const CONSENT_MIN_AGE = 14;
export function ageOn(birth: Date | null | undefined, now: Date): number | null {
  if (!birth) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}
export const consentAgeBlock = (birth: Date | null | undefined, now: Date): string | null => {
  const age = ageOn(birth, now);
  return age != null && age < CONSENT_MIN_AGE ? '만 14세 미만은 법정대리인의 동의가 필요해요. 아직 앱에서 받을 수 없어요.' : null;
};

export type ConsentState = {
  /** 이 계정이 지금 판에 철회 없이 동의했나 — 문서가 확정 전이면 늘 false(전송 근거로 안 씀) */
  valid: boolean;
  /** 유효한 줄(내역 보기) */
  current: { agreedAt: string; source: ConsentSource; version: string } | null;
  /** 옛 판에만 동의했다 — 다시 동의가 필요하다 */
  outdated: boolean;
};

/** 기록 → 지금 상태. 같은 판에 여러 번 동의했으면 마지막 것 */
export function consentStateOf(records: readonly ConsentRecord[], ready = analysisConsentReady(), version = ANALYSIS_CONSENT.version): ConsentState {
  const live = records.filter((r) => r.revokedAt == null).sort((a, b) => b.agreedAt.getTime() - a.agreedAt.getTime());
  const now = live.find((r) => r.version === version);
  const source = (CONSENT_SOURCES as readonly string[]).includes(now?.source ?? '') ? (now!.source as ConsentSource) : 'first_use';
  return {
    valid: ready && now != null,
    current: ready && now ? { agreedAt: now.agreedAt.toISOString(), source, version: now.version } : null,
    outdated: ready && now == null && live.length > 0,
  };
}

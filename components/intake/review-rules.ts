/**
 * 검토 화면의 규칙 — 화면과 떨어진 순수 함수라 시험이 그대로 부른다.
 * 칸 차례는 화면 차례와 같다(이름 → 같은 투구 → 나이 → 보내는 사람 → 동의). 오류가 있으면 그 차례의 첫 칸으로 간다.
 */
import type { AgeBand, SubmitterRelation } from '@/lib/intake/consent';
import { INTAKE_ERROR_TEXT } from '@/lib/intake/errors';
import type { PublicAsset, PublicConsentDoc, PublicIntakeState } from '@/lib/intake/public-client';
import { assetGone, correctionRepickViews, isIntakeView, type IntakeView } from '@/lib/intake/state';

export type ReviewForm = {
  name: string;
  ageBand: AgeBand | null;
  samePitch: boolean;
  agreed: Record<string, boolean>;
  hand: 'R' | 'L' | null;
  /** 기본값이 없다 — 대리인이 칸을 안 열고 본인 동의로 남는 일이 없게 꼭 고르게 한다 */
  relation: SubmitterRelation | null;
  submitterName: string;
};

export type ReviewErrors = Partial<Record<'name' | 'age' | 'samePitch' | 'relation' | 'consent' | 'form', string>>;

/**
 * 비어 있는 필수 칸 — 있으면 보내지 않고 그 칸 곁에 말한다.
 * 만 14세 미만이면 어차피 받을 수 없으니 나머지를 묻지 않고 바로 막힌 화면으로 간다(아이 보호자가 동의까지 다 누를 까닭이 없다).
 */
export function reviewProblems(form: ReviewForm, docs: readonly PublicConsentDoc[]): ReviewErrors {
  if (form.ageBand === 'under_14') return {};
  const out: ReviewErrors = {};
  if (!form.name.trim()) out.name = '선수 이름을 입력해 주세요.';
  else if ([...form.name.trim()].length > 40) out.name = '이름은 40자 이하로 입력해 주세요.';
  if (!form.samePitch) out.samePitch = '두 영상이 같은 투구인지 확인해 주세요.';
  if (!form.ageBand) out.age = '선수가 만 14세 이상인지 골라 주세요.';
  if (!form.relation) out.relation = '누가 보내는지 골라 주세요.';
  if (docs.some((d) => d.required && form.agreed[d.kind] !== true)) out.consent = '필수 내용을 읽고 동의해 주세요.';
  return out;
}

/** 오류가 있을 때 초점을 옮길 칸의 id — 화면 차례의 첫 칸 */
export function firstProblemTarget(errors: ReviewErrors, form: ReviewForm, docs: readonly PublicConsentDoc[]): string | null {
  if (errors.name) return 'review-name';
  if (errors.samePitch) return 'same-pitch';
  if (errors.age) return 'age-14_or_over';
  if (errors.relation) return 'relation-self';
  if (errors.consent) {
    const kind = docs.find((d) => d.required && form.agreed[d.kind] !== true)?.kind;
    return kind ? `consent-${kind}` : null;
  }
  return null;
}

/** 다시 받아야 할 필수 동의 — 지금 판으로 이미 있는 글은 다시 묻지 않는다 */
export const staleRequiredDocs = (state: Pick<PublicIntakeState, 'consent'>, docs: readonly PublicConsentDoc[]) =>
  docs.filter((d) => d.required && state.consent.granted[d.kind] !== true);

/** 고침 화면에서 지운 칸을 안 고르고 보냈을 때의 글 */
export const GONE_VIEW_TEXT = '이 칸의 원본은 지웠어요. 영상을 다시 골라 주세요.';
/** 아직 지우고 있는 칸 — 지운 일이 끝나지 않았는데 '지웠어요'라고 하면 거짓이다 */
export const DELETING_VIEW_TEXT = '이 칸의 원본을 지우고 있어요. 영상을 다시 골라 주세요.';
/** 끊긴 전송을 정리가 버려 칸이 빈 때의 글 — 지운 원본이 아니라 아직 안 온 파일이다 */
export const EMPTY_VIEW_TEXT = '이 칸에 보낼 영상을 골라 주세요.';
/** 파일은 남아 있지만 새로 골라야 하는 칸 — 얼린 그 파일 그대로이거나 막힌 파일이다. 지웠다거나 전송 중이라고 하지 않는다 */
export const REPICK_VIEW_TEXT = '이 칸은 새 영상을 골라 주세요.';

/**
 * 고침에서 꼭 다시 골라야 하는 칸 — 서버의 완료와 같은 판단(correctionRepickViews)이다. 이 기기에서 새로 고른 칸은 뺀다.
 * 지운 원본 · 정리가 비운 칸 · 막힌 파일 · 얼린 그 파일 그대로인 칸이다. 서버는 이 칸들을 'correction_incomplete' 로 막는다.
 * 보낸 뒤에 막연한 글을 보이지 않고 보내기 전에 그 칸을 말한다.
 */
export const goneViewsToPick = (state: Pick<PublicIntakeState, 'assets' | 'correction' | 'frozenAssetIds'>, picked: Readonly<Record<IntakeView, unknown>>): IntakeView[] =>
  correctionRepickViews(state.correction?.views ?? [], state.assets, state.frozenAssetIds).filter((v) => !picked[v]);

/** 이 칸을 새로 골라야 하나 — 칸 글이 막힘(goneViewsToPick)과 같은 판단을 쓴다. 고침 중 새 파일이 이미 도착한 칸은 다시 고르라고 하지 않는다 */
export const slotNeedsRepick = (state: Pick<PublicIntakeState, 'assets' | 'correction' | 'frozenAssetIds'>, view: IntakeView): boolean =>
  correctionRepickViews(state.correction?.views ?? [], state.assets, state.frozenAssetIds).includes(view);

/** 얼린 파일과 같은 영상을 골랐을 때의 글 — 서버의 'same_as_sent' 와 같다 */
export const SAME_AS_SENT_TEXT = INTAKE_ERROR_TEXT.same_as_sent;

/**
 * 고침에서 고른 파일과 견줄 얼린 파일 — 칸이 마지막 판의 그 파일 그대로이고 확인을 마쳤을 때만이다. 같은 영상이면 다시 받아도 판이 안 바뀐다.
 * 막혔거나 지웠거나 확인 전인 파일은 같은 영상을 다시 받는다(서버의 reserveAsset 과 같은 판단).
 */
export function sentAssetOf(state: Pick<PublicIntakeState, 'assets' | 'correction' | 'frozenAssetIds'>, view: IntakeView): PublicAsset | null {
  const a = state.assets[view];
  if (!state.correction || !a || a.id !== state.frozenAssetIds?.[view]) return null;
  return a.status === 'verified' || a.status === 'unconfirmed' ? a : null;
}

/** 서버가 칸을 말하며 고치라고 한 멈춤('correction_incomplete' 의 views) — 그 칸의 고른 파일을 비우고 칸 곁에 말한다 */
export function correctionStopViews(stop: { code: string; detail: Record<string, unknown> | null }): IntakeView[] {
  if (stop.code !== 'correction_incomplete') return [];
  const views = stop.detail?.views;
  return Array.isArray(views) ? views.filter(isIntakeView) : [];
}

/** 막힌 칸 곁의 글 — 지운 칸 · 지우는 칸 · 빈 칸 · 파일이 남은 칸을 가른다 */
export const pickViewText = (asset: { status: string } | null) =>
  asset == null ? EMPTY_VIEW_TEXT : !assetGone(asset.status) ? REPICK_VIEW_TEXT : asset.status === 'purging' ? DELETING_VIEW_TEXT : GONE_VIEW_TEXT;

export type CorrectionProblem = 'name' | 'file' | 'same' | 'consent';

export type CorrectionCheck = {
  /** 이름 칸을 요청받았나 */
  nameAsked: boolean;
  name: string;
  /** 새 파일을 골라야 하는 칸(goneViewsToPick) */
  missing: readonly IntakeView[];
  /** 영상 칸을 요청받았나 — 그러면 같은 투구를 다시 확인받는다 */
  viewsAsked: boolean;
  same: boolean;
  needsConsent: boolean;
  docs: readonly PublicConsentDoc[];
  agreed: Record<string, boolean>;
};

/**
 * 고침 화면의 첫 막힘과 초점을 옮길 칸 — 화면 차례(이름 → 영상 → 같은 투구 → 동의)와 같다. 없으면 null.
 * 차례가 어긋나면 위 칸이 비었는데 아래 칸의 오류만 보이고, 초점이 아래로 가서 위 칸의 오류를 못 본다.
 */
export function correctionProblem(c: CorrectionCheck): { problem: CorrectionProblem; target: string } | null {
  if (c.nameAsked && !c.name.trim()) return { problem: 'name', target: 'fix-name' };
  if (c.missing.length > 0) return { problem: 'file', target: `slot-${c.missing[0]}` };
  if (c.viewsAsked && !c.same) return { problem: 'same', target: 'fix-same-pitch' };
  const kind = c.needsConsent ? c.docs.find((d) => d.required && c.agreed[d.kind] !== true)?.kind : undefined;
  if (kind) return { problem: 'consent', target: `consent-${kind}` };
  return null;
}

/**
 * 고침에서 남길 동의 — 화면이 보이는 필수 동의뿐이다. 모델 개발 동의는 고침 화면에 없어서,
 * 같이 보내면 받는 사람이 본 적 없는 글에 '거부'가 남고 앞서 한 동의가 닫힌다.
 */
export const correctionConsentDocs = (docs: readonly PublicConsentDoc[]) => docs.filter((d) => d.required);

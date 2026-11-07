/**
 * 검토 화면의 규칙 — 화면과 떨어진 순수 함수라 시험이 그대로 부른다.
 * 칸 차례는 화면 차례와 같다(이름 → 같은 투구 → 나이 → 보내는 사람 → 동의). 오류가 있으면 그 차례의 첫 칸으로 간다.
 */
import type { AgeBand, SubmitterRelation } from '@/lib/intake/consent';
import type { PublicConsentDoc, PublicIntakeState } from '@/lib/intake/public-client';
import { assetGone, type IntakeView } from '@/lib/intake/state';

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

/** 고침에서 꼭 다시 골라야 하는 칸 — 지운 원본으로는 판을 얼릴 수 없다 */
export const goneViewsToPick = (state: Pick<PublicIntakeState, 'assets' | 'correction'>, picked: Readonly<Record<IntakeView, unknown>>): IntakeView[] =>
  (state.correction?.views ?? []).filter((v) => {
    const asset = state.assets[v];
    return asset != null && assetGone(asset.status) && !picked[v];
  });

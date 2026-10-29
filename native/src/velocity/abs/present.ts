import type { AbsAnalysis } from '@/lib/abs/analysis';
import type { Verdict } from '@/lib/abs/judge';

/**
 * ABS 화면 글 · 셈(앱, 순수) — 판정 카드 · 위 알약 · 세션 요약 · 공 목록이 같은 자료를 같은 말로 보이게 한곳에 둔다(2026-10-29 ABS 화면 개편).
 * 판정 계산은 lib/abs 그대로 — 여기선 저장된 AbsAnalysis 를 읽어 글로 옮기기만 한다. 시험 scripts/abs-present-selftest.mts.
 */

/** 공 하나의 머리 — 판정(S · B) · 타격 · 판정 없음(궤적 · 깊이가 모자람, 또는 analysis.abs 자체가 없음) */
export type AbsHead = 'strike' | 'ball' | 'contact' | 'none';

export function absHeadOf(abs: AbsAnalysis | null | undefined): AbsHead {
  if (!abs) return 'none';
  if (abs.event === 'contact') return 'contact';
  return abs.verdict ? abs.verdict.call : 'none';
}

export const HEAD_LABEL: Record<AbsHead, string> = { strike: '스트라이크', ball: '볼', contact: '타격', none: '판정 없음' };

/**
 * 공이 존에서 어디였나 한 줄. 타석(좌 · 우)을 알 때만 몸쪽 · 바깥쪽 — 모르면 1루 쪽 · 3루 쪽(세상 +x 가 1루, lib/abs/zone.ts).
 * 웹 lib/abs/judge.ts verdictText 는 타석을 모르면 우타자로 읽어서, 앱은 이 글을 쓴다.
 */
export function placeText(v: Verdict, hand: 'R' | 'L' | null): string {
  const cm = Math.round(Math.abs(v.edgeCm));
  if (v.call === 'strike') return cm === 0 ? '존 가장자리에 걸쳤어요' : `존 안쪽 ${cm}cm`;
  if (Math.abs(v.dxCm) > Math.abs(v.dyCm)) {
    if (!hand) return `${v.dxCm > 0 ? '1루' : '3루'} 쪽으로 ${cm}cm 빠졌어요`;
    const outside = hand === 'R' ? v.dxCm > 0 : v.dxCm < 0;
    return `${outside ? '바깥쪽' : '몸쪽'}으로 ${cm}cm 빠졌어요`;
  }
  return `${v.dyCm > 0 ? '높게' : '낮게'} ${cm}cm 빠졌어요`;
}

/** 판정이 없을 때 까닭 — 저장된 까닭이 있으면 그것, 타격이면 판정하지 않음, analysis.abs 가 없으면 무엇이 모자랐는지(use-abs judge 가 null 을 낸 길) */
export function noVerdictReason(abs: AbsAnalysis | null | undefined, hadFit: boolean): string {
  if (abs?.event === 'contact') return '타격한 공은 판정하지 않아요.';
  if (abs) return abs.reason ?? '판정할 자료가 모자랐어요.';
  return hadFit ? '홈플레이트 보정이 없어 판정하지 못했어요.' : '공 궤적이 짧아 판정하지 못했어요.';
}

/** 측정 중 위 알약 — 재기 흐름(capture.ts)이 실제로 알리는 단계만: 대기 · 투구 인식 · 계산 중, 그리고 삼각대 감시의 위치 경고 */
export type AbsLine = { text: string; tone: 'ready' | 'busy' | 'warn' };

export function absStatusLine(p: {
  status: 'armed' | 'capturing' | 'analyzing';
  visible: number;
  judged: number;
  total: number;
  recalibrate: boolean;
}): AbsLine {
  if (p.visible > 0) return p.status === 'analyzing' ? { text: '판정 계산 중', tone: 'busy' } : { text: '투구를 인식했어요', tone: 'busy' };
  if (p.recalibrate) return { text: '카메라 위치 확인 필요', tone: 'warn' };
  if (p.total > 0) return { text: `판정 ${p.judged}구${p.total > p.judged ? ` · 판정 없음 ${p.total - p.judged}` : ''}`, tone: 'ready' };
  return { text: '던지면 저절로 판정해요', tone: 'ready' };
}

/** 세션 셈 — 스트라이크 비율의 분모는 판정(S · B)이 난 공만. 타격 · 판정 없음은 따로, 존 밖 볼은 볼이면서 칸이 없는 공만 */
export type AbsTally = {
  total: number;
  judged: number;
  strikes: number;
  balls: number;
  contacts: number;
  none: number;
  borderline: number;
  outsideBalls: number;
  /** 9칸(1~9) 통과 수 — 칸이 있는 판정만 */
  cells: number[];
  /** 판정이 0구면 null — 0% 로 보이지 않게 */
  strikePct: number | null;
};

export function tallyAbs(items: readonly (AbsAnalysis | null | undefined)[]): AbsTally {
  const t: AbsTally = { total: items.length, judged: 0, strikes: 0, balls: 0, contacts: 0, none: 0, borderline: 0, outsideBalls: 0, cells: Array(9).fill(0), strikePct: null };
  for (const abs of items) {
    const head = absHeadOf(abs);
    if (head === 'contact') t.contacts++;
    else if (head === 'none') t.none++;
    else {
      const v = abs!.verdict!;
      t.judged++;
      if (head === 'strike') t.strikes++;
      else t.balls++;
      if (v.borderline) t.borderline++;
      if (v.cell != null && v.cell >= 1 && v.cell <= 9) t.cells[v.cell - 1]++;
      else if (v.call === 'ball') t.outsideBalls++;
    }
  }
  t.strikePct = t.judged ? Math.round((100 * t.strikes) / t.judged) : null;
  return t;
}

/** 공 목록 한 줄 — 타자 · 신장 · S/B · 경계 · 참고, 또는 타격 · 판정 없음. analysis.abs 가 없으면 판정 없음만 */
export function absRowText(abs: AbsAnalysis | null | undefined): string {
  const head = absHeadOf(abs);
  const who = abs ? `타자 ${abs.batter} · ${abs.heightCm}cm · ` : '';
  if (head === 'contact') return `${who}타격`;
  if (head === 'none') return `${who}판정 없음`;
  const v = abs!.verdict!;
  return `${who}${head === 'strike' ? 'S' : 'B'}${v.borderline ? ' · 경계' : ''}${v.confidence === 'low' ? ' · 참고' : ''}`;
}

/**
 * 타자 기록 — '다음 타자'를 누른 때부터 그 타자. 판정은 공을 알아챈 때(capture.ts queuedAt)의 타자로 낸다: 계산이 끝나기 전에 타자를 바꾸면
 * 앞 공이 새 타자 · 새 신장으로 판정되던 것(2026-10-29).
 * ponytail: 조용할 때 훑기(sweep)로 찾은 공은 알아챈 때가 몇 초 늦다 — 그 사이 타자를 바꿨으면 새 타자로 간다. 훑기 창의 시작 시각을 넘기면 고칠 수 있다.
 */
export type BatterSpan = { since: number; batter: number; heightCm: number };

export function batterAt(history: readonly BatterSpan[], atMs: number | undefined): BatterSpan | null {
  if (!history.length) return null;
  if (atMs == null) return history[history.length - 1];
  let pick = history[0];
  for (const h of history) if (h.since <= atMs) pick = h;
  return pick;
}

/**
 * 판정 — 통과점 + 존 상자 + 규칙 → 스트라이크 · 볼(둘만, 사용자 결정 2026-10-18) + 가장자리 거리 + '경계' + 믿음.
 * 믿음이 낮아도 판정을 숨기지 않는다. 까닭 글은 결과 화면 한 줄.
 */
import type { Crossing } from './cross.ts';
import { type Bands, DEFAULT_BANDS, type RuleSet } from './rules.ts';
import { ballInZone, cellOf, edgeDistance, type ZoneBox } from './zone.ts';

export type Confidence = 'high' | 'medium' | 'low';

export type Verdict = {
  call: 'strike' | 'ball';
  /** 9칸(1~9) — 공 중심이 상자 밖이면 null(걸쳐서 스트라이크여도) */
  cell: number | null;
  /** 가장 가까운 세로 · 가로 가장자리까지(cm, 오른쪽 · 위가 +) */
  dxCm: number;
  dyCm: number;
  /** 가장자리까지 거리(cm) — 안쪽이면 음수 */
  edgeCm: number;
  borderline: boolean;
  confidence: Confidence;
  reasons: string[];
};

export type JudgeQuality = {
  /** 플레이트 보정 잔차(px) — 모르면 null */
  calibResidualPx: number | null;
  /** 서로 맞는 깊이 단서 수 */
  depthCuesAgreeing: number;
  /** 공 지름(원본 px) */
  ballDiamPx: number | null;
};

export function judge(
  cross: Crossing,
  box: ZoneBox,
  rule: RuleSet,
  bands: Bands = DEFAULT_BANDS,
  quality?: JudgeQuality,
  cameraPos: 'behind-pitcher' | 'behind-catcher' = 'behind-pitcher'
): Verdict {
  const [x, y] = cross.point;
  const strike = ballInZone(x, y, box, rule);
  const e = edgeDistance(x, y, box);
  const dxCm = e.dx * 100;
  const dyCm = e.dy * 100;
  const edgeCm = e.edge * 100;
  /* 경계: 가장 가까운 가장자리까지 거리가 그 방향의 띠 안 — 세로 가장자리(좌우)가 더 가까우면 좌우 띠, 아니면 높이 띠 */
  const nearSide = Math.abs(e.dx) <= Math.abs(e.dy);
  const band = (nearSide ? bands.lateralCm : bands.verticalCm) / 100;
  const borderline = Math.abs(e.edge) < band;
  const reasons: string[] = [];
  let confidence: Confidence = 'high';
  if (quality) {
    if (quality.calibResidualPx != null && quality.calibResidualPx > 1) {
      confidence = 'medium';
      reasons.push('플레이트 맞춤이 조금 어긋나요');
    }
    if (quality.depthCuesAgreeing < 2) {
      confidence = confidence === 'high' ? 'medium' : 'low';
      reasons.push('통과 깊이 단서가 하나뿐이에요');
    }
    if (quality.ballDiamPx != null && quality.ballDiamPx < 8) {
      confidence = quality.ballDiamPx < 5 ? 'low' : confidence === 'high' ? 'medium' : 'low';
      reasons.push('공이 작게 찍혔어요');
    }
  }
  if (cross.extrapolated) {
    confidence = confidence === 'high' ? 'medium' : 'low';
    reasons.push('플레이트 앞에서 공이 가려져 이어 그렸어요');
  }
  if (cross.sigmaY * 100 > bands.verticalCm) {
    confidence = 'low';
    reasons.push('높이 오차가 커요');
  }
  return {
    call: strike ? 'strike' : 'ball',
    cell: cellOf(x, y, box, cameraPos),
    dxCm,
    dyCm,
    edgeCm,
    borderline,
    confidence,
    reasons,
  };
}

/** 결과 화면 한 줄 — '바깥쪽 4cm 빠짐' · '안쪽 2cm' · '높아서 5cm 빠짐' */
export function verdictText(v: Verdict, hand: 'R' | 'L' = 'R'): string {
  const cm = Math.round(Math.abs(v.edgeCm));
  if (v.call === 'strike') return cm === 0 ? '걸쳤어요' : `안쪽 ${cm}cm`;
  const horizontal = Math.abs(v.dxCm) > Math.abs(v.dyCm);
  if (horizontal) {
    /* 우타자 기준 +x(1루 쪽)가 바깥쪽 */
    const outside = hand === 'R' ? v.dxCm > 0 : v.dxCm < 0;
    return `${outside ? '바깥쪽' : '몸쪽'} ${cm}cm 빠짐`;
  }
  return `${v.dyCm > 0 ? '높아서' : '낮아서'} ${cm}cm 빠짐`;
}

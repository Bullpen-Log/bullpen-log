/**
 * 리포트 화면(웹 app/(app)/videos/lab/[id]/report-parts.tsx · 앱 native/src/lab/report.tsx)이 같이 쓰는 고르기(순수, 2026-10-27 리포트 개편).
 * 판정 · 수치 · 글의 원본은 report.ts — 여기서는 맨 위 한 가지 · 판독 줄 · 처방이 없을 때 이어 갈 길만 고른다.
 */
import { HARD_REASON, type PitchReport, type ReportItem } from '@/lib/pitch-3d/v2/report';

/** 맨 위 한 가지 — 처방할 주 문제가 있으면 그 수치 · 장면, 없으면 확인 범위(고칠 점을 만들어 내지 않는다) */
export type ReportLead = { kind: 'finding'; item: ReportItem } | { kind: 'scope'; title: string; note: string | null };

export function reportLead(r: PitchReport): ReportLead {
  const p = r.primary ? r.items.find((i) => i.element === r.primary) : null;
  if (p && (p.status === 'improve' || p.status === 'edge') && p.value != null) return { kind: 'finding', item: p };
  /* 주 문제의 headline.why 는 요소 일반 설명이라 쓰지 않는다 — 문제가 없을 때의 why 는 확인 범위 한 줄 */
  return { kind: 'scope', title: r.headline.title, note: r.primary ? null : r.headline.why };
}

/** 판독 칸의 주 설명 — 수치를 그대로 읽은 관찰(옛 서버 응답이면 line) */
export const itemObs = (i: ReportItem): string => i.obs ?? i.line;

/** 판독 줄 둘째 줄 — 무엇을 잰 수치인지, 확인하지 못했으면 그 까닭 */
export function itemSub(i: ReportItem): string {
  if (i.status !== 'unsure') return i.valueLabel ?? '';
  const q = i.measurement?.quality;
  return q && q !== 'sufficient' ? HARD_REASON[q] : '확인하지 못함';
}

/** 기준 띠는 평가한 칸에만 — 참고 칸의 띠는 조건이 맞지 않는 자료라 목표선처럼 보이면 안 된다 */
export const showsGauge = (i: ReportItem): boolean => i.gauge != null && i.status !== 'note' && i.status !== 'unsure';

/** 장면 단추 글 — '착지 장면 보기' */
export const sceneLabel = (i: ReportItem): string => (i.moment ? `${i.moment} 장면 보기` : '이 장면 보기');

/** 처방이 없을 때 이어 갈 길 — 확인 못 한 구간이 있으면 촬영 안내, 참고 지표가 있으면 요소 설명(처방이 아니다) */
export type ReportNextStep = { kind: 'guide' | 'elements'; label: string; note: string; elementKey: string | null };

export function nextStepsOf(r: PitchReport): ReportNextStep[] {
  if (r.rx.length) return [];
  const out: ReportNextStep[] = [];
  if (r.items.some((i) => i.status === 'unsure' && i.measurement?.quality === 'low'))
    out.push({ kind: 'guide', label: '촬영 안내 보기', note: '확인하지 못한 구간이 두 영상에 잘 보이게 찍는 법이에요.', elementKey: null });
  const ref = r.items.find((i) => i.status === 'note' && i.key);
  if (ref)
    out.push({
      kind: 'elements',
      label: `${ref.element} 요소 설명 보기`,
      note: '이 요소가 무엇을 보는지와 드릴 목록이에요. 이번 투구에 맞춘 처방은 아니에요.',
      elementKey: ref.key,
    });
  return out;
}

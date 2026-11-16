/**
 * 리포트 화면(웹 app/(app)/videos/lab/[id]/report-parts.tsx · 앱 native/src/lab/report.tsx)이 같이 쓰는 고르기(순수, 2026-10-27 리포트 개편).
 * 판정 · 수치 · 글의 원본은 report.ts — 여기서는 맨 위 한 가지 · 판독 줄 · 처방이 없을 때 이어 갈 길만 고른다.
 */
import { HARD_REASON, type ElementName, type PitchReport, type ReportItem } from '@/lib/pitch-3d/v2/report';

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

/* ───────────────────────────── 한눈 요약 · 쉬운 말(2026-11-16 김민: "문구가 AI 같고 조잡해 정보가 안 들어온다") ───────────────────────────── */

/** 요소 이름 옆 쉬운 말 — 드리프트 · 드롭 · 브레이크 같은 낯선 이름이 무엇을 보는지 */
export const ELEMENT_PLAIN: Record<ElementName, string> = {
  드리프트: '다리 들 때 홈 쪽으로 나가기',
  드롭: '내딛으며 몸 낮추기',
  '상하체 분리': '앞발 닿을 때 상체 닫아 두기',
  브레이크: '앞다리로 버티기',
  '몸통 회전': '공 놓을 때 몸통 숙이기',
  스로잉: '앞발 닿을 때 손 올리기',
};

/** 맨 위 숫자 셋 — 좋아요 · 보통 · 고칠 점(경계 포함), 그리고 평가하지 못한 수(참고 · 확인 어려움) */
export type ReportTally = { good: number; fair: number; bad: number; unseen: number; total: number };
export function reportTally(r: PitchReport): ReportTally {
  const n = (f: (i: ReportItem) => boolean) => r.items.filter(f).length;
  return {
    good: n((i) => i.status === 'good'),
    fair: n((i) => i.status === 'fair'),
    bad: n((i) => i.status === 'improve' || i.status === 'edge'),
    unseen: n((i) => i.status === 'note' || i.status === 'unsure'),
    total: r.items.length,
  };
}

/** 요소 한 줄 — 평가한 칸은 평가 말("다리를 들 때 몸이 투구판 위에 머물러요."), 참고는 관찰, 확인 못 한 칸은 그 까닭 */
export const itemSay = (i: ReportItem): string => i.line || i.obs || '';

/** 좋아요 기준 '18cm 위' — 새 서버는 good, 옛 서버는 처방 칸의 goal 또는 띠 밑 줄 끝('… · 좋아요는 18cm 위') */
export function itemGood(i: ReportItem): string | null {
  if (i.status === 'note' || i.status === 'unsure') return null;
  if (i.good) return i.good;
  if (i.goal) return i.goal;
  const at = i.foot?.lastIndexOf('좋아요는 ') ?? -1;
  return at >= 0 ? i.foot!.slice(at + 5) : null;
}

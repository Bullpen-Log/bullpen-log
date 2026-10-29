import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { loadLabJob, loadLatestReport } from '@/lib/pitch-lab';
import { jobReportSummary } from '@/lib/pitch-3d/v2/report';
import { isPhoneVideoPath } from '@/lib/phone-video-path';

/**
 * 싱커 기록 카드(docs/designs/dugout-community.md '싱커에서 올리기') — 구속 측정(최고 기록 갱신 표시) · 투구 기록(영상 있으면 영상) · 3D 동작 분석 요약.
 * 글 쓸 때 서버가 내 기록에서 다시 찍어 CommunityPost.card 에 둔다(화면이 보낸 값은 믿지 않는다). 그 뒤 기록이 바뀌어도 카드는 그대로.
 * 체크인 · 영양 · 통증은 카드로 만들지 않는다(건강 정보). hide = 숫자 숨기기.
 */
export type CommunityCard =
  | {
      kind: 'velocity';
      id: string;
      date: string;
      sessionType: string | null;
      maxKmh: number;
      avgKmh: number;
      n: number;
      /** 그때까지의 내 최고 구속을 넘었나 */
      pr: boolean;
      hide: boolean;
    }
  | {
      kind: 'pitch';
      id: string;
      date: string;
      sessionType: string;
      pitchCount: number;
      /** 저장소 영상 경로(폰에만 있는 영상은 못 나눈다) */
      video: string | null;
      hide: boolean;
    }
  | {
      kind: 'lab';
      id: string;
      date: string;
      /** 가장 먼저 고칠 요소(없으면 고칠 점 없음) */
      primary: string | null;
      judged: boolean;
      hide: boolean;
    };

/** 고르기 목록 한 줄 — ref 는 'velocity:<id>' · 'pitch:<id>' · 'lab:<id>' */
export type CardOption = { ref: string; title: string; detail: string };

const dateText = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일`;
};

function velocityCards(history: Awaited<ReturnType<typeof loadVelocityHistory>>) {
  let best = 0;
  return history.map((s) => {
    const pr = best > 0 && s.maxKmh > best;
    best = Math.max(best, s.maxKmh);
    return { ...s, pr };
  });
}

type VelocityRow = ReturnType<typeof velocityCards>[number];
const PITCH_SELECT = { id: true, date: true, sessionType: true, pitchCount: true, videoPaths: true } as const;
type PitchRow = { id: string; date: Date; sessionType: string; pitchCount: number; videoPaths: string[] };

const velocityCard = (s: VelocityRow, hide: boolean): CommunityCard => ({
  kind: 'velocity',
  id: s.id,
  date: s.date,
  sessionType: s.sessionType,
  maxKmh: s.maxKmh,
  avgKmh: s.avgKmh,
  n: s.n,
  pr: s.pr,
  hide,
});
/** video = false — 카드에 그 기록의 영상을 안 싣는다(내 영상 → 덕아웃 공유: 고른 사본 하나만 공개, 기록의 다른 · 원본 영상은 안 나감) */
const pitchCard = (l: PitchRow, hide: boolean, video = true): CommunityCard => ({
  kind: 'pitch',
  id: l.id,
  date: l.date.toISOString().slice(0, 10),
  sessionType: l.sessionType,
  pitchCount: l.pitchCount,
  video: video ? (l.videoPaths.find((p) => !isPhoneVideoPath(p)) ?? null) : null,
  hide,
});

/** 고르기 목록 한 줄로 */
export function cardOption(card: CommunityCard): CardOption {
  const ref = `${card.kind}:${card.id}`;
  if (card.kind === 'velocity')
    return {
      ref,
      title: `구속 측정 · ${dateText(card.date)}${card.pr ? ' · 최고 기록 갱신' : ''}`,
      detail: `최고 ${card.maxKmh.toFixed(1)}km/h · 평균 ${card.avgKmh.toFixed(1)} · ${card.n}구`,
    };
  if (card.kind === 'pitch')
    return {
      ref,
      title: `투구 기록 · ${dateText(card.date)}`,
      detail: `${card.sessionType} ${card.pitchCount}구${card.video ? ' · 영상' : ''}`,
    };
  return {
    ref,
    title: `3D 동작 분석 · ${dateText(card.date)}`,
    detail: card.primary ? `먼저 볼 것: ${card.primary}` : '고칠 점 없음',
  };
}

/**
 * 글쓰기의 '싱커 기록 붙이기' 목록 — 최근 구속 측정 8 · 투구 기록 8 · 마지막 3D 분석 1. include 가 목록 밖이면(싱커 결과 화면의 '덕아웃에 올리기'로
 * 옛 기록을 가져왔을 때) 그것도 맨 앞에 더한다.
 */
export async function recentCardOptions(userId: string, include?: string): Promise<CardOption[]> {
  const [history, logs, lab] = await Promise.all([
    loadVelocityHistory(userId),
    prisma.pitchLog.findMany({
      where: { userId, pitchCount: { gt: 0 } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: PITCH_SELECT,
    }),
    loadLatestReport(userId).catch(() => null),
  ]);
  const cards: CommunityCard[] = [
    ...velocityCards(history)
      .slice(-8)
      .reverse()
      .map((v) => velocityCard(v, false)),
    ...logs.map((l) => pitchCard(l, false)),
  ];
  if (lab) {
    const card = await buildCard(userId, `lab:${lab.reportId}`, false);
    if (card) cards.push(card);
  }
  const options = cards.map(cardOption);
  if (include && !options.some((o) => o.ref === include)) {
    const extra = await buildCard(userId, include, false);
    if (extra) options.unshift(cardOption(extra));
  }
  return options;
}

/** ref 로 내 기록에서 카드를 다시 만든다 — 내 것이 아니거나 없으면 null. opts.video = false 면 투구 기록 카드에 영상을 안 싣는다 */
export async function buildCard(userId: string, ref: string, hide: boolean, opts: { video?: boolean } = {}): Promise<CommunityCard | null> {
  const [kind, id] = ref.split(':');
  if (!id) return null;
  if (kind === 'velocity') {
    const s = velocityCards(await loadVelocityHistory(userId)).find((x) => x.id === id);
    return s ? velocityCard(s, hide) : null;
  }
  if (kind === 'pitch') {
    const l = await prisma.pitchLog.findFirst({ where: { id, userId }, select: PITCH_SELECT });
    return l ? pitchCard(l, hide, opts.video !== false) : null;
  }
  if (kind === 'lab') {
    const job = await loadLabJob(userId, id).catch(() => null);
    const summary = jobReportSummary(job);
    if (!job || !summary) return null;
    return {
      kind,
      id,
      date: (job.finishedAt ?? job.requestedAt).slice(0, 10),
      primary: summary.primary?.element ?? null,
      judged: summary.judged,
      hide: false,
    };
  }
  return null;
}

/** 저장된 카드 JSON 을 읽는다 — 모양이 틀리면 null(화면이 안 그린다) */
export function readCard(raw: unknown): CommunityCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<CommunityCard>;
  if (c.kind !== 'velocity' && c.kind !== 'pitch' && c.kind !== 'lab') return null;
  if (typeof c.id !== 'string' || typeof c.date !== 'string') return null;
  return c as CommunityCard;
}

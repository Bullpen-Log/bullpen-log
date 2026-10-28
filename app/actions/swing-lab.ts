'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, requireUser } from '@/lib/dal';
import { can } from '@/lib/permissions';
import { countryOf, hasHitting } from '@/lib/country';
import {
  deleteLabSample,
  deleteUnsavedLabSample,
  findLabOwner,
  listLabSamples,
  loadLabSample,
  saveLabMeta,
  type LabSample,
} from '@/lib/pitch-lab';
import { labMetaBlock } from '@/lib/pitch-lab-guard';
import { isLabId, LAB_VIEWS, readLabMeta, type LabHand, type LabView } from '@/lib/pitch-lab-meta';
import { swingCardChips, swingHandOf, swingMetaChips, swingViewLabel } from '@/lib/swing-lab-meta';

/**
 * 3D 스윙 분석(타자, 베타)의 서버 동작 — 투구 3D 동작 분석(app/actions/pitch-lab.ts)과 같은 저장(lib/pitch-lab.ts)을 sport 'hit'(폴더 swing-lab)으로 쓴다.
 * 사람마다 자기 폴더, 대표관리자는 관리자끼리 같이 본다(ownerIds). 분석(GPU)은 아직 없다 — 모델은 3D 개발 관리자가 모은 샘플로 만든다.
 * 2026-10-21 금윤호: "모델링은 우리가 찍어서 줄 수 있도록 3D 개발 관리자를 만들어서 모델링을 위한 영상을 넣을 수 있는 타자 버전 시스템을".
 *
 * 마커 샘플(kind 'marker', ③ · ④ 카메라 cam3 · cam4)은 3D 개발 관리자(lib/permissions.ts 'dev3d')만 올리고 본다.
 * 앱은 /api/rpc/swing-lab.<함수> 로 부른다(app/api/rpc/registry.ts).
 */

type Result = { ok: true } | { error: string };

const SPORT = 'hit' as const;
const PATHS = ['/hitting/lab', '/admin/dev3d'];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));

const WHEN = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const whenOf = (createdAt: string | null | undefined) => (createdAt ? WHEN.format(new Date(createdAt)) : null);

export async function saveSwingSample(input: { id: string; meta: unknown }): Promise<Result> {
  const user = await requireUser();
  if (!isLabId(input?.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  const dev = can(user.role, 'dev3d');
  /* 타격이 없는 나라(미국 · 일본)는 새 스윙 샘플을 못 올린다 — 3D 개발 관리자는 시험 나라와 상관없이 */
  if (!dev && !hasHitting(countryOf(user.country))) return { error: '이 나라의 싱커에는 3D 스윙 분석이 없어요.' };
  const read = readLabMeta(input.meta, new Date().toISOString());
  /* 타격은 늘 평지 · 마커는 3D 개발 관리자만(다른 사람이 보낸 kind 는 늘 sample) */
  const meta = { ...read, ground: 'flat' as const, kind: dev ? read.kind : ('sample' as const) };
  /* 화면 녹화 · 따로 찍은 짝은 받지 않는다(투구와 같은 규칙) — 마커 샘플은 3~4대를 손으로 맞춰 찍어 짝 검사를 건너뛴다 */
  const block = meta.kind === 'marker' ? null : labMetaBlock(input.meta, meta);
  if (block) {
    try {
      await deleteUnsavedLabSample((await findLabOwner(input.id, user, SPORT)) ?? user.id, input.id, SPORT);
    } catch {
      /* 남은 폴더는 목록에서 지울 수 있다 */
    }
    return { error: block };
  }
  try {
    await saveLabMeta((await findLabOwner(input.id, user, SPORT)) ?? user.id, input.id, meta, SPORT);
  } catch {
    return { error: '정보를 저장하지 못했어요. 다시 해 주세요.' };
  }
  refresh();
  return { ok: true };
}

export async function removeSwingSample(input: { id: string }): Promise<Result> {
  const user = await requireUser();
  if (!isLabId(input?.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    const owner = await findLabOwner(input.id, user, SPORT);
    if (owner) await deleteLabSample(owner, input.id, SPORT);
  } catch {
    return { error: '지우지 못했어요. 다시 해 주세요.' };
  }
  refresh();
  return { ok: true };
}

export type SwingListItem = {
  id: string;
  marker: boolean;
  /** '10월 21일 14:05'(모르면 null) */
  when: string | null;
  /** 올리다 멈춰 정보가 없음 — 지울 수만 있다 */
  broken: boolean;
  chips: string[];
  memo: string | null;
  /** 올라간 영상 수(짝 2 + 마커 ③ · ④) */
  videoCount: number;
};

const listItem = (s: LabSample): SwingListItem => ({
  id: s.id,
  marker: s.meta?.kind === 'marker',
  when: whenOf(s.meta?.createdAt),
  broken: !s.meta,
  chips: s.meta ? swingCardChips(s.meta) : [],
  memo: s.meta?.memo ?? null,
  videoCount: Object.keys(s.videos).length + s.extras.length,
});

export type SwingList =
  | { ok: true; samples: SwingListItem[]; heightCm: number | null; hand: LabHand; isDev: boolean }
  | { ok: false; to: string };

/**
 * 3D 스윙 분석 목록 — scope 'mine' = 사용자 화면(대표관리자도 자기 스윙만, 마커 빼고). 없으면 3D 개발 관리자 화면 — 관리자끼리 · 마커 포함
 * (3D 개발 관리자가 아니면 자기 것만 — 화면이 사용자 화면으로 돌려보낸다).
 */
export async function loadAppSwingList(scope?: string): Promise<SwingList> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  const dev = can(user.role, 'dev3d');
  const all = await listLabSamples(user, SPORT);
  const mine = scope === 'mine' || !dev;
  const samples = mine ? all.filter((s) => s.ownerId === user.id && s.meta?.kind !== 'marker') : all;
  return {
    ok: true,
    isDev: dev,
    heightCm: user.heightCm ?? null,
    hand: swingHandOf(user.battingHand),
    samples: samples.map(listItem),
  };
}

export type SwingDetail =
  | {
      ok: true;
      id: string;
      title: string;
      marker: boolean;
      chips: string[];
      memo: string | null;
      /** 정면 · 포수 뒤 + 마커 샘플의 ③ · ④ */
      videos: { key: LabView | 'cam3' | 'cam4'; label: string; url: string | null }[];
      /** 3D 모델 — 아직 없다(샘플을 모으는 중) */
      modelReady: false;
    }
  | { ok: false; to: string };

/** 샘플 하나 — 영상 · 촬영 정보만(분석 결과는 모델을 만든 뒤). 앱 useLoad 가 번호를 그대로 넘긴다 */
export async function loadAppSwingDetail(id: string): Promise<SwingDetail> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (!isLabId(id)) return { ok: false, to: '/hitting' };
  const sample = await loadLabSample(id, user, SPORT);
  if (!sample) return { ok: false, to: '/hitting' };
  const meta = sample.meta;
  const hand: LabHand = meta?.hand ?? 'R';
  return {
    ok: true,
    id: sample.id,
    title: meta?.createdAt ? `${whenOf(meta.createdAt)} 스윙` : '스윙',
    marker: meta?.kind === 'marker',
    chips: meta ? swingMetaChips(meta) : [],
    memo: meta?.memo ?? null,
    videos: [
      ...LAB_VIEWS.map((view) => ({ key: view, label: swingViewLabel(view, hand), url: sample.videos[view]?.url ?? null })),
      ...sample.extras.map((x) => ({ key: x.key, label: x.key === 'cam3' ? '③ 카메라' : '④ 카메라', url: x.url })),
    ],
    modelReady: false,
  };
}

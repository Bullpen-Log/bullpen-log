import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { countryOf } from '@/lib/country';
import { setCountryNow } from '~/lib/country-store';
import { phoneAssetId, phoneVideoPath, isPhoneVideoPath } from '@/lib/phone-video-path';
import { SITE_URL } from '~/lib/site';
import { markWrite, rpc, syncSession } from '~/lib/rpc';
import { LocalVideo } from '../../modules/local-video';

/**
 * 투구 기록 — 사이트의 /api/pitch-log(읽기 GET ?month · 남기기 POST · 고치기 PATCH · 지우기 DELETE)와 재생 주소(/api/pitch-log/video-url).
 * 웹 화면과 같은 곳을 같은 규칙으로 부른다(로그인은 사이트 쿠키 — rpc 가 처음 한 번 옮겨 둔다).
 */
export type PitchLog = {
  id: string;
  /** ISO — 그날 UTC 자정 */
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number | null;
  effortPct: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
  satisfaction: number | null;
  cuesGood: string[];
  cuesBad: string[];
  createdAt: string;
};

export type PitchEntry = {
  date: string;
  sessionType: string;
  pitchCount: number;
  /** 체감 강도(%) — 옛 기록(1~10 만 있음)을 손대지 않고 고치면 빼고 intensity 를 보낸다(웹 entry-form 과 같다) */
  effortPct?: number | null;
  intensity?: number;
  /** 고칠 때 열 때의 영상 목록 — 서버가 이 폼에서 뺀 것만 지운다(다른 기기에서 더한 영상은 남김) */
  baseVideoPaths?: string[];
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string;
  videoPaths: string[];
  /* 불펜 · 라이브 · 경기만 보낸다 — 안 보내면 서버가 그 칸을 손대지 않는다(웹 API 규칙) */
  satisfaction?: number | null;
  cuesGood?: string[];
  cuesBad?: string[];
  /** 새 기록을 구속 측정값으로 채웠으면 그 세션들 — 서버가 이 기록에 잇는다(웹 POST 와 같은 칸) */
  velocitySessionIds?: string[];
};

export class ApiError extends Error {}
/** 서버에 닿지 못함(신호 끊김) — 폼이 적은 것을 폰에 남겨 둘 때 가른다 */
export class OfflineError extends ApiError {}

const READ_ONLY_POSTS = new Set(['/api/pitch-log/video-url', '/api/pitch-log/thumb-url']);

export async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  await syncSession();
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}${path}`, {
      method: init.method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', [APP_API_HEADER]: String(APP_API_LEVEL) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new OfflineError('신호가 약해 서버에 닿지 못했어요.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(body?.error ?? '서버에서 처리하지 못했어요.');
  /* 주소를 묻기만 하는 POST(영상 · 장면 그림 서명 주소)는 쓰기가 아니다 — 쓰기로 세면 영상을 본 뒤 돌아올 때 판 넷이 다 다시 받았다(2026-10-24) */
  if (init.method !== 'GET' && !READ_ONLY_POSTS.has(path)) markWrite();
  return body as T;
}

/** country — 옛 서버 답에는 없다(그때는 한국, lib/country.ts countryOf) */
export type Me = { userId: string; nickname: string; isAdmin: boolean; today: string; locks: { pitch: boolean }; country?: string };
let meCache: Promise<Me> | null = null;
export function loadMe(): Promise<Me> {
  if (meCache) return meCache;
  const p = rpc<({ ok: true } & Me) | { ok: false; error: string }>('app.loadAppMe').then((r) => {
    if (!r.ok) throw new ApiError(r.error);
    setCountryNow(countryOf(r.country));
    return r;
  });
  meCache = p;
  /* 그새 새로 물었으면(로그아웃 → 로그인) 새 물음은 지우지 않는다 */
  p.catch(() => {
    if (meCache === p) meCache = null;
  });
  return p;
}
/** 다시 묻게 — 로그아웃했거나 앱을 다시 볼 때(날이 바뀌었을 수 있다) */
export const resetMe = () => {
  meCache = null;
};

export const loadMonth = (month: string) => call<PitchLog[]>(`/api/pitch-log?month=${month}`, { method: 'GET' });
/** 모든 기록 — 찾기(느낌으로 찾기)가 켜졌을 때만 */
export const loadAll = () => call<PitchLog[]>('/api/pitch-log', { method: 'GET' });
export const createLog = (e: PitchEntry) => call<PitchLog>('/api/pitch-log', { method: 'POST', body: e });
export const updateLog = (id: string, e: PitchEntry) => call<PitchLog>('/api/pitch-log', { method: 'PATCH', body: { id, ...e } });

/**
 * 어느 기록에도 안 붙은 폰 영상 경로만 돌려준다(/api/pitch-log/discard 의 orphans) — 저장은 됐는데 답만 못 받은 기록(신호 끊김)의
 * 영상을 취소 · 끌어 닫기가 지우지 않게. 서버에 못 물으면 null(아무것도 안 지운다).
 */
export async function phoneOrphans(paths: string[]): Promise<string[] | null> {
  const local = [...new Set(paths.filter(isPhoneVideoPath))];
  if (!local.length) return [];
  try {
    /* 서버는 한 번에 10개까지 받는다(discard MAX_PATHS) — 구속 측정 세션은 클립이 더 많다 */
    const out: string[] = [];
    for (let i = 0; i < local.length; i += 10) {
      const part = local.slice(i, i + 10);
      const r = await call<{ orphans?: string[] }>('/api/pitch-log/discard', { method: 'POST', body: { paths: part } });
      out.push(...part.filter((p) => (r.orphans ?? []).includes(p)));
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 기록 · 공을 지우거나 영상을 뺀 뒤, 폰 영상 가운데 이제 아무 데도 안 붙은 것만 폰에서 지운다(2026-10-26 '내 영상' P0).
 * 같은 영상을 다른 기록 · 내 영상이 쓰면 남긴다. 서버에 못 물으면 안 지운다(남는 쪽이 안전 — 나중에 정리).
 */
export async function removePhoneOrphans(paths: string[]): Promise<void> {
  const orphans = await phoneOrphans(paths);
  if (orphans?.length) await LocalVideo.remove({ ids: orphans.map(phoneAssetId) }).catch(() => undefined);
}
/** 저장하지 않고 버린 서버 영상(관리자) — 아무 데도 안 붙었으면 서버가 지운다 */
export const discardServerVideo = (path: string) =>
  call('/api/pitch-log/discard', { method: 'POST', body: { paths: [path] } }).catch(() => undefined);
export const deleteLog = (id: string) => call<{ ok: true }>('/api/pitch-log', { method: 'DELETE', body: { id } });

/** 서버 영상의 재생 주소(서명, 잠깐 쓰는 것) — 폰 영상은 빼고 묻는다 */
export async function serverVideoUrls(paths: string[]): Promise<Record<string, string>> {
  const remote = paths.filter((p) => !isPhoneVideoPath(p));
  if (!remote.length) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < remote.length; i += 10) {
    const r = await call<{ urls: Record<string, string> }>('/api/pitch-log/video-url', {
      method: 'POST',
      body: { paths: remote.slice(i, i + 10) },
    });
    Object.assign(out, r.urls);
  }
  return out;
}

/**
 * 서버 영상의 장면 그림(썸네일) 주소 — 웹 영상 달력과 같은 /api/pitch-log/thumb-url(한 번에 40개). 그림이 아직 없는 영상은 빠진다.
 * 폰 영상은 서버에 그림이 없어 묻지 않는다(묻으면 403).
 */
export async function serverThumbUrls(paths: string[]): Promise<Record<string, string>> {
  const remote = [...new Set(paths.filter((p) => !isPhoneVideoPath(p)))];
  const out: Record<string, string> = {};
  for (let i = 0; i < remote.length; i += 40) {
    const r = await call<{ thumbs?: Record<string, string> }>('/api/pitch-log/thumb-url', {
      method: 'POST',
      body: { paths: remote.slice(i, i + 40) },
    });
    Object.assign(out, r.thumbs ?? {});
  }
  return out;
}

export { isPhoneVideoPath, phoneAssetId, phoneVideoPath };

/** 2026-10-18 */
export const dateKeyOf = (iso: string) => iso.slice(0, 10);

import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { phoneAssetId, phoneVideoPath, isPhoneVideoPath } from '@/lib/phone-video-path';
import { SITE_URL } from '~/lib/site';
import { rpc, syncSession } from '~/lib/rpc';

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
  effortPct: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string;
  videoPaths: string[];
};

export class ApiError extends Error {}

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
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
    throw new ApiError('신호가 약해 서버에 닿지 못했어요.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(body?.error ?? '서버에서 처리하지 못했어요.');
  return body as T;
}

export type Me = { userId: string; nickname: string; isAdmin: boolean; today: string; locks: { pitch: boolean } };
let meCache: Promise<Me> | null = null;
export function loadMe(): Promise<Me> {
  meCache ??= rpc<({ ok: true } & Me) | { ok: false; error: string }>('app.loadAppMe').then((r) => {
    if (!r.ok) throw new ApiError(r.error);
    return r;
  });
  meCache.catch(() => (meCache = null));
  return meCache;
}

export const loadMonth = (month: string) => call<PitchLog[]>(`/api/pitch-log?month=${month}`, { method: 'GET' });
export const createLog = (e: PitchEntry) => call<PitchLog>('/api/pitch-log', { method: 'POST', body: e });
export const updateLog = (id: string, e: PitchEntry) => call<PitchLog>('/api/pitch-log', { method: 'PATCH', body: { id, ...e } });
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

export { isPhoneVideoPath, phoneAssetId, phoneVideoPath };

/** 2026-10-18 */
export const dateKeyOf = (iso: string) => iso.slice(0, 10);

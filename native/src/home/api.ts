import type { FeedItem } from '@/lib/report/feed-items';
import { rpc } from '~/lib/rpc';
import { call } from '~/pitch/api';

/**
 * 앱 홈 자료 — 링 · 요약 칸 · 알림 카드는 app.loadAppHome(웹 홈과 같은 lib/report/home-today.ts), 그날 칸은 /api/day-detail(웹 홈 캘린더
 * 밑 칸과 같은 lib/day-detail.ts). 타입은 서버 파일이 서버 전용이라 여기 그린 칸만 적는다.
 */
export type HomeRing = { key: 'checkin' | 'pitch' | 'training' | 'nutrition'; label: string; value: number; caption: string; href?: string };
export type ArmStatus = { level: 'danger' | 'caution' | 'safe'; headline: string; details: string[] };

export type AppHome = {
  today: string;
  rings: HomeRing[];
  checkinDone: boolean;
  feed: FeedItem[];
  painWords: string[] | null;
  recovering: boolean;
  firstDay: ArmStatus | null;
  pitchLocked: boolean;
};

export async function loadHome(): Promise<AppHome> {
  const res = await rpc<({ ok: true } & AppHome) | { ok: false; error: string }>('app.loadAppHome');
  if (!res.ok) throw new Error(res.error);
  return res;
}

export type DayDetail = {
  date: string;
  training: {
    exercises: { id: string; title: string; done: boolean; planned: string | null; weightKg: number | null }[];
    intensity: number | null;
  };
  nutrition: {
    kcal: number;
    protein: number;
    target: { kcal: number; protein: number };
    meals: { meal: string; label: string; kcal: number; items: { name: string; amount: string; kcal: number }[] }[];
  };
  checkin: null | {
    condition: number;
    sleep: string;
    sleepQuality: number | null;
    parts: { label: string; value: string }[];
    note: string | null;
  };
};

export const loadDay = (date: string) => call<DayDetail>(`/api/day-detail?date=${date}`, { method: 'GET' });

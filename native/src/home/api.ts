import type { FeedItem } from '@/lib/report/feed-items';
import { rpc } from '~/lib/rpc';
import { call } from '~/pitch/api';

/**
 * 앱 홈 자료 — 링 · 요약 칸 · 알림 카드는 app.loadAppHome(웹 홈과 같은 lib/report/home-today.ts), 그날 칸은 /api/day-detail(웹 홈 캘린더
 * 밑 칸과 같은 lib/day-detail.ts). 타입은 서버 파일이 서버 전용이라 여기 그린 칸만 적는다.
 */
export type HomeRing = { key: 'checkin' | 'pitch' | 'training' | 'nutrition'; label: string; value: number; caption: string; href?: string; none?: boolean };
export type ArmStatus = { level: 'danger' | 'caution' | 'safe'; headline: string; details: string[] };

export type AppHome = {
  today: string;
  rings: HomeRing[];
  checkinDone: boolean;
  /** 오늘 투구 기록이 있나(쉰 날 줄 포함) — 위 막대 알림 종 */
  pitchDone: boolean;
  feed: FeedItem[];
  painWords: string[] | null;
  recovering: boolean;
  firstDay: ArmStatus | null;
  pitchLocked: boolean;
  /** 지난번 잘 던진 날 남긴 말 — 오늘 던지는 날 기록 전에만(옛 서버는 칸 없음) */
  goodNote?: { date: string; sessionType: string; satisfaction: number; memo: string; cuesGood: string[] } | null;
};

export async function loadHome(): Promise<AppHome> {
  const res = await rpc<({ ok: true } & AppHome) | { ok: false; error: string }>('app.loadAppHome');
  if (!res.ok) throw new Error(res.error);
  return res;
}

export type DayDetail = {
  date: string;
  training: {
    exercises: {
      id: string;
      title: string;
      category: string;
      done: boolean;
      planned: string | null;
      setsDone: number | null;
      repsDone: number | null;
      holdSecondsDone: number | null;
      weightKg: number | null;
    }[];
    intensity: number | null;
    memo?: string | null;
  };
  nutrition: {
    kcal: number;
    carbs: number;
    protein: number;
    fat: number;
    target: { kcal: number; carbs: number; protein: number; fat: number };
    meals: { meal: string; label: string; kcal: number; items: { name: string; amount: string; kcal: number }[] }[];
  };
  checkin: null | {
    condition: number;
    sleep: string;
    sleepQuality: number | null;
    parts: { label: string; value: string }[];
    details: { label: string; value: string }[];
    note: string | null;
  };
};

export const loadDay = (date: string) => call<DayDetail>(`/api/day-detail?date=${date}`, { method: 'GET' });

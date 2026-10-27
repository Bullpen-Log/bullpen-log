import type { MyVideoItem } from '@/lib/my-videos';
import { toDateKey } from '@/lib/pitch-stats';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
/** 앱의 한국 오늘(YYYY-MM-DD) — 다른 화면과 같은 규칙(lib/pitch-stats toDateKey) */
export const todayKey = () => toDateKey(new Date());

/** 'YYYY-MM-DD' → '10월 26일 (일)' — 올해가 아니면 '2025년 10월 26일 (일)'. 모르면 '촬영 날짜 모름' */
export const videoDateText = (key: string | null, today = todayKey()) => {
  if (!key) return '촬영 날짜 모름';
  const [y, m, d] = key.split('-').map(Number);
  const day = `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
  return key.slice(0, 4) === today.slice(0, 4) ? day : `${y}년 ${day}`;
};

/** 'YYYY-MM' → '2026년 10월' */
export const monthText = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

/** 2분할 비교의 이름표 — '10/26 불펜', 올해가 아니면 '25/10/26 불펜' */
export const compareLabel = (v: MyVideoItem, today = todayKey()) => {
  const date = v.date
    ? `${v.date.slice(0, 4) === today.slice(0, 4) ? '' : `${v.date.slice(2, 4)}/`}${Number(v.date.slice(5, 7))}/${Number(v.date.slice(8))} `
    : '';
  return `${date}${v.logs[0]?.type ?? (v.sport === 'hit' ? '타격' : '투구')}`;
};

/** 메모가 없을 때 카드에 쓸 짧은 설명 — 실제 정보로(종류 · 공 수), '느낌 적기'만 되풀이하지 않게 */
export const videoCaption = (v: MyVideoItem) => {
  const l = v.logs[0];
  if (l) return `${l.type} · ${l.count}${l.kind === 'hit' ? '스윙' : '구'}${v.logs.length > 1 ? ` 외 ${v.logs.length - 1}` : ''}`;
  return v.sport === 'hit' ? '타격 영상' : '투구 영상';
};

/** 영상 길이 — 모르면 null(0초로 쓰지 않는다) */
export const durationText = (sec: number | null) => {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

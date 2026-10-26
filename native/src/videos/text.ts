import type { MyVideoItem } from '@/lib/my-videos';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '10월 26일 (일)', 모르면 '촬영 날짜 모름' */
export const videoDateText = (key: string | null) => {
  if (!key) return '촬영 날짜 모름';
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

/** 2분할 비교의 이름표 — '10/26 불펜' */
export const compareLabel = (v: MyVideoItem) =>
  `${v.date ? `${Number(v.date.slice(5, 7))}/${Number(v.date.slice(8))} ` : ''}${v.logs[0]?.type ?? (v.clip ? '구속 측정' : v.sport === 'hit' ? '타격' : '투구')}`;

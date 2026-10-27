import { gatherStateLabel, headcountText, kstInputValue, postTagLabel, type GatherState } from '@/lib/community';
import { formatPrice } from '@/lib/market/specs';

/**
 * 싱커 앱 덕아웃 첫 화면의 순수 규칙(2026-10-27 승인 시안 '수정 개선안' — 벤치 → 커뮤니티 인기/최신 → 연습장).
 * 서버 로더(lib/sinker-dugout-load.ts) · 화면 · 시험(scripts/dugout-selftest.mts)이 같이 쓴다. 자료는 모두 실제 목록 · 글 · 장소에서 오고, 여기서는 고르기 · 글자만 정한다.
 */

/** 글 카드 하나 — 화면에 그대로 넘긴다(날짜는 서버에서 글로 바꿔 둔다) */
export type FeedCard = {
  id: string;
  title: string;
  /** 말머리 한 줄 — '질문 · 투구' · '연습 기록' · '자유 · KBO' · '번개 · 캐치볼' */
  label: string;
  kind: 'question' | 'gather' | 'story';
  /** 오른쪽 위 상태 — '답 기다림' · '댓글 2' · '해결됨' · '모집 중' */
  meta: string;
  /** 본문 요약(또는 번개 · 팀의 때 · 곳 · 인원 한 줄) — 답변 미리보기가 있으면 null */
  body: string | null;
  answer: Answer | null;
  author: string;
  ago: string;
  cta: { label: string; href: string };
  saved: boolean;
};

export type Answer = { nickname: string; body: string; accepted: boolean };

/** 목록 로더(loadCommunityList)의 글 한 줄 가운데 카드에 쓰는 칸 */
export type ListPost = {
  id: string;
  category: string;
  tag: string | null;
  title: string;
  preview: string;
  solved: boolean;
  answered: boolean;
  comments: number;
  nickname: string;
  state: GatherState | null;
  meetAt: Date | null;
  region: string | null;
  district: string | null;
  capacity: number | null;
  joins: number;
};

/**
 * 말머리 — 게시판(category)은 넷 그대로(free · question · meetup · team). '연습 후기'라는 새 게시판 · 말머리는 만들지 않고,
 * 자유 게시판의 '내 기록'(record) 글을 '연습 기록'으로 보인다(기록 글을 모두 후기라고 부르지 않는다).
 */
export function feedLabel(category: string, tag: string | null): string {
  const t = postTagLabel(category, tag);
  if (category === 'question') return t ? `질문 · ${t}` : '질문';
  if (category === 'meetup') return t ? `번개 · ${t}` : '번개';
  if (category === 'team') return t ? `팀 · ${t}` : '팀';
  if (tag === 'record') return '연습 기록';
  return t ? `자유 · ${t}` : '자유';
}

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

/** 번개 · 팀 글의 판단 정보 한 줄 — 때 · 곳 · 인원(정원을 안 적었으면 참가 수만) */
export function gatherLine(p: Pick<ListPost, 'meetAt' | 'region' | 'district' | 'capacity' | 'joins' | 'category'>): string {
  const when = p.meetAt ? benchDate(p.meetAt) : null;
  return [
    when ? `${when.month}/${when.day}(${when.dayKo}) ${when.time}` : null,
    p.district ?? p.region,
    p.category === 'meetup' ? (p.capacity ? headcountText(p.joins, p.capacity) : `${p.joins}명 참가`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * 글 → 카드. 행동은 글의 실제 상태로만 정한다 — 답 없는 질문만 '첫 답변 남기기', 자유 글에 '첫 답변 기다림'을 붙이지 않고,
 * 번개 · 팀은 질문 · 자유의 단추를 쓰지 않는다. 채택은 '해결됨'일 뿐 전문가 답 · 정답으로 말하지 않는다.
 */
export function feedCardOf(p: ListPost, extra: { answer: Answer | null; saved: boolean; ago: string }): FeedCard {
  const base = { id: p.id, title: p.title, label: feedLabel(p.category, p.tag), author: p.nickname, ago: extra.ago, saved: extra.saved };
  const href = `/community/${p.id}`;
  if (p.category === 'question') {
    if (!p.answered)
      return { ...base, kind: 'question', meta: '답 기다림', body: clip(p.preview, 90), answer: null, cta: { label: '첫 답변 남기기', href: `${href}#comments` } };
    const answer = extra.answer;
    return {
      ...base,
      kind: 'question',
      meta: p.solved ? '해결됨' : `댓글 ${p.comments}`,
      /* 답변을 못 읽었으면(차단한 사람의 답뿐 · 읽기 실패) 실제 본문 요약 — 답을 꾸미지 않는다 */
      body: answer ? null : clip(p.preview, 90),
      answer,
      cta: { label: '답변 보기', href: `${href}#comments` },
    };
  }
  if (p.category === 'meetup' || p.category === 'team')
    return {
      ...base,
      kind: 'gather',
      meta: p.state ? gatherStateLabel(p.state, p.category, p.tag) : '',
      body: gatherLine(p) || clip(p.preview, 90),
      answer: null,
      cta: { label: '자세히 보기', href },
    };
  return {
    ...base,
    kind: 'story',
    meta: `댓글 ${p.comments}`,
    body: clip(p.preview, 90),
    answer: null,
    cta: { label: p.tag === 'record' ? '기록 보기' : '이야기 보기', href },
  };
}

/**
 * 답변 미리보기 고르기 — 글 화면(lib/community-load.ts loadCommunityPost)과 같은 규칙: 들어온 댓글은 이미 가림 · 차단이 걸러진 것.
 * 채택한 답이 보이면 그것, 아니면 글쓴이가 아닌 사람의 가장 이른 답. 글쓴이 자기 댓글만 있으면 null.
 */
export function pickAnswer(
  comments: { id: string; userId: string; body: string; nickname: string }[],
  authorId: string,
  acceptedId: string | null
): Answer | null {
  const accepted = acceptedId ? comments.find((c) => c.id === acceptedId && c.userId !== authorId) : undefined;
  const c = accepted ?? comments.find((x) => x.userId !== authorId);
  return c ? { nickname: c.nickname, body: clip(c.body, 70), accepted: !!accepted } : null;
}

const WEEK_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 번개 날짜를 한국 시각으로 — 벤치 카드의 큰 '10.31' · 'SATURDAY' · '10:00'(같은 meetAt 하나에서) */
export function benchDate(at: Date) {
  const v = kstInputValue(at); // 'YYYY-MM-DDTHH:mm'(KST)
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { year: y, month: m, day: d, md: `${m}.${String(d).padStart(2, '0')}`, weekday: WEEK_EN[w], weekdayShort: WEEK_EN[w].slice(0, 3), dayKo: WEEK_KO[w], time: v.slice(11) };
}

const TAG_EN: Record<string, string> = { catch: 'CATCHBALL', batting: 'BATTING', fungo: 'FUNGO', game: 'GAME' };
/** 벤치 종이 · 티켓 머리의 영문 종목(번개 말머리) */
export const meetupTagEn = (tag: string | null) => (tag && TAG_EN[tag]) || 'PRACTICE';

/** 남은 자리 — 정원을 안 적은 번개는 null('N자리 남음'을 만들지 않는다) */
export const seatsLeft = (capacity: number | null, joins: number) => (capacity ? Math.max(0, capacity - joins) : null);

/** 연습장 가격 한 줄 — 칸 가격 / 칸 길이, 가격이 없으면 '가격 문의' */
export const venuePriceText = (pricePerSlot: number | null, slotMin: number) =>
  pricePerSlot != null ? { price: formatPrice(pricePerSlot), unit: `/ ${slotMin}분` } : { price: '가격 문의', unit: '' };

/** 예약 방식 — 승인(장소가 확인 뒤 확정) · 바로 확정. 실제 결과는 예약 화면의 서버 응답이 정한다 */
export const venueBookingText = (approval: boolean) => (approval ? '장소 확인 후 예약 확정' : '바로 예약 확정');

/**
 * 이어 볼 활동 한 줄 — 하나면 그것 그대로(제목 · 종류), 여럿이면 종류별 수('참가한 번개 1 · 답변 있는 질문 1').
 * 읽음 정보가 없어 '새 답변' · 안 읽은 수는 말하지 않는다. 없으면 null(빈 활동 카드를 세우지 않는다).
 */
export function activitySummary(items: { label: string; title: string; sub: string; href: string }[]) {
  if (items.length === 0) return null;
  if (items.length === 1) return { title: items[0].title, sub: `${items[0].label} · ${items[0].sub}`, href: items[0].href };
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.label, (counts.get(i.label) ?? 0) + 1);
  const sub = [...counts].map(([k, n]) => `${k} ${n}`).join(' · ');
  /* 모두 예약이면 예약이 있는 마이(/me), 아니면 커뮤니티 활동 */
  const href = items.every((i) => i.href === '/me') ? '/me' : '/me/community';
  return { title: '이어 볼 활동이 있어요', sub, href };
}

/**
 * 덕아웃 장터의 순수 규칙(2026-10-20, docs/designs/baseball-hub.md 4-2) — 품목 · 규격표 · 상태 · 지역 · 값 검사. 서버 · 화면 · 시험이 같이 쓴다.
 *
 * 야구 전용 규격표가 카페와의 결정적 차이다: 글러브는 포지션 · 손 · 인치, 배트는 길이 · 무게 · 재질 · 인증 — 글을 다 읽지 않아도 거른다.
 * 품목마다 칸이 달라 Listing.specs(JSON)에 두고, 어떤 칸이 있는지는 여기 CATEGORIES 가 정한다.
 */

export type SpecField =
  | {
      key: string;
      label: string;
      type: 'select';
      options: { value: string; label: string }[];
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'number';
      min: number;
      max: number;
      unit: string;
      step?: number;
      required?: boolean;
    };

export type Category = { key: string; label: string; fields: SpecField[] };

const HAND: SpecField = {
  key: 'hand',
  label: '던지는 손',
  type: 'select',
  required: true,
  options: [
    { value: 'R', label: '우투(왼손에 낌)' },
    { value: 'L', label: '좌투(오른손에 낌)' },
  ],
};
const SIZE: SpecField = {
  key: 'size',
  label: '사이즈',
  type: 'select',
  options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '아동'].map((v) => ({
    value: v,
    label: v,
  })),
};

export const CATEGORIES: readonly Category[] = [
  {
    key: 'glove',
    label: '글러브',
    fields: [
      {
        key: 'position',
        label: '포지션',
        type: 'select',
        required: true,
        options: [
          { value: 'pitcher', label: '투수' },
          { value: 'infield', label: '내야' },
          { value: 'outfield', label: '외야' },
          { value: 'catcher', label: '포수 미트' },
          { value: 'first', label: '1루 미트' },
          { value: 'all', label: '올라운드' },
        ],
      },
      HAND,
      {
        key: 'inch',
        label: '크기',
        type: 'number',
        min: 9,
        max: 14,
        unit: '인치',
        step: 0.25,
        required: true,
      },
    ],
  },
  {
    key: 'bat',
    label: '배트',
    fields: [
      {
        key: 'lengthInch',
        label: '길이',
        type: 'number',
        min: 24,
        max: 36,
        unit: '인치',
        step: 0.5,
        required: true,
      },
      {
        key: 'weightOz',
        label: '무게',
        type: 'number',
        min: 14,
        max: 40,
        unit: 'oz',
        step: 0.5,
      },
      {
        key: 'material',
        label: '재질',
        type: 'select',
        required: true,
        options: [
          { value: 'wood', label: '나무' },
          { value: 'alloy', label: '알루미늄' },
          { value: 'composite', label: '카본 · 복합' },
          { value: 'hybrid', label: '하이브리드' },
        ],
      },
      {
        key: 'cert',
        label: '인증',
        type: 'select',
        options: [
          { value: 'none', label: '없음 · 모름' },
          { value: 'kbo', label: '프로 공인' },
          { value: 'amateur', label: '아마추어 공인' },
          { value: 'little', label: '유소년 공인' },
        ],
      },
    ],
  },
  {
    key: 'spikes',
    label: '스파이크 · 신발',
    fields: [
      {
        key: 'sizeMm',
        label: '사이즈',
        type: 'number',
        min: 180,
        max: 330,
        unit: 'mm',
        step: 5,
        required: true,
      },
      {
        key: 'stud',
        label: '징',
        type: 'select',
        options: [
          { value: 'metal', label: '금속' },
          { value: 'rubber', label: '고무 · 몰드' },
          { value: 'turf', label: '터프화' },
        ],
      },
    ],
  },
  {
    key: 'protector',
    label: '보호구',
    fields: [
      {
        key: 'kind',
        label: '종류',
        type: 'select',
        required: true,
        options: [
          { value: 'helmet', label: '헬멧' },
          { value: 'catcher', label: '포수 장비' },
          { value: 'battingGlove', label: '배팅 장갑' },
          { value: 'guard', label: '암가드 · 정강이' },
          { value: 'other', label: '기타' },
        ],
      },
      SIZE,
    ],
  },
  {
    key: 'uniform',
    label: '유니폼 · 의류',
    fields: [
      {
        key: 'piece',
        label: '품목',
        type: 'select',
        required: true,
        options: [
          { value: 'top', label: '상의' },
          { value: 'pants', label: '하의' },
          { value: 'set', label: '세트' },
          { value: 'cap', label: '모자' },
          { value: 'other', label: '기타' },
        ],
      },
      SIZE,
    ],
  },
  {
    key: 'ball',
    label: '공',
    fields: [
      { key: 'count', label: '개수', type: 'number', min: 1, max: 500, unit: '개' },
    ],
  },
  { key: 'bag', label: '가방', fields: [] },
  { key: 'training', label: '훈련 도구', fields: [] },
  { key: 'other', label: '기타', fields: [] },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];
export function isCategory(v: unknown): v is CategoryKey {
  return CATEGORIES.some((c) => c.key === v);
}
export function categoryOf(key: string): Category | null {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}
export function categoryLabel(key: string): string {
  return categoryOf(key)?.label ?? key;
}

export const CONDITIONS = [
  { key: 'new', label: '새 상품' },
  { key: 'like-new', label: '거의 새것' },
  { key: 'used', label: '사용감 있음' },
  { key: 'worn', label: '많이 씀' },
] as const;
export type ConditionKey = (typeof CONDITIONS)[number]['key'];
export function isCondition(v: unknown): v is ConditionKey {
  return CONDITIONS.some((c) => c.key === v);
}
export function conditionLabel(key: string): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? key;
}

/** 시 · 도 — 전국 서비스(2026-10-20 사용자: "무조건 전국")이되 직거래는 지역으로 거른다. 택배만 하면 '전국' */
export const REGIONS = [
  '전국(택배)',
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '대전',
  '광주',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;
export function isRegion(v: unknown): v is (typeof REGIONS)[number] {
  return REGIONS.includes(v as (typeof REGIONS)[number]);
}

export const STATUSES = [
  { key: 'ACTIVE', label: '판매 중' },
  { key: 'RESERVED', label: '예약 중' },
  { key: 'SOLD', label: '거래 완료' },
] as const;
export type StatusKey = (typeof STATUSES)[number]['key'];
export function isStatus(v: unknown): v is StatusKey {
  return STATUSES.some((s) => s.key === v);
}
export function statusLabel(key: string): string {
  return STATUSES.find((s) => s.key === key)?.label ?? key;
}

export const SORTS = [
  { key: 'new', label: '최신순' },
  { key: 'cheap', label: '싼 순' },
  { key: 'expensive', label: '비싼 순' },
] as const;
export type SortKey = (typeof SORTS)[number]['key'];
export function isSort(v: unknown): v is SortKey {
  return SORTS.some((s) => s.key === v);
}

export const TITLE_MAX = 60;
export const BODY_MAX = 2000;
export const PRICE_MAX = 50_000_000;
export const MAX_IMAGES = 5;
export const PER_PAGE = 24;

/** 가격 — 0 은 나눔 */
export function formatPrice(won: number): string {
  if (won <= 0) return '나눔';
  return `${won.toLocaleString('ko-KR')}원`;
}

/** 폼의 가격 글('12,000' · '12000원')을 원 단위 정수로 — 틀리면 null */
export function parsePrice(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return raw.trim() === '' ? null : 0;
  const n = Number.parseInt(digits, 10);
  if (!Number.isInteger(n) || n < 0 || n > PRICE_MAX) return null;
  return n;
}

export type Specs = Record<string, string | number>;

/**
 * 폼에서 온 규격을 품목의 칸대로 읽는다 — 모르는 칸은 버리고, 꼭 적을 칸(required)이 비면 오류.
 * 숫자는 범위 안, 고르기는 보기 안에서만.
 */
export function parseSpecs(
  category: string,
  get: (name: string) => unknown
): { specs: Specs } | { error: string } {
  const cat = categoryOf(category);
  if (!cat) return { error: '품목을 골라 주세요.' };
  const specs: Specs = {};
  for (const f of cat.fields) {
    const raw = String(get(`spec-${f.key}`) ?? '').trim();
    if (!raw) {
      if (f.required) return { error: `${f.label}을(를) 적어 주세요.` };
      continue;
    }
    if (f.type === 'select') {
      if (!f.options.some((o) => o.value === raw))
        return { error: `${f.label}을(를) 다시 골라 주세요.` };
      specs[f.key] = raw;
    } else {
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max)
        return {
          error: `${f.label}은(는) ${f.min}~${f.max}${f.unit} 사이로 적어 주세요.`,
        };
      specs[f.key] = Math.round(n * 100) / 100;
    }
  }
  return { specs };
}

/** 규격을 사람 말로 — 카드 한 줄('투수 · 우투 · 11.75인치') · 상세 표 */
export function specLines(
  category: string,
  specs: unknown
): { label: string; value: string }[] {
  const cat = categoryOf(category);
  if (!cat || !specs || typeof specs !== 'object') return [];
  const s = specs as Record<string, unknown>;
  const out: { label: string; value: string }[] = [];
  for (const f of cat.fields) {
    const v = s[f.key];
    if (v == null || v === '') continue;
    if (f.type === 'select') {
      const o = f.options.find((x) => x.value === v);
      if (o) out.push({ label: f.label, value: o.label });
    } else if (typeof v === 'number') {
      out.push({ label: f.label, value: `${v}${f.unit}` });
    }
  }
  return out;
}

export function specSummary(category: string, specs: unknown): string {
  return specLines(category, specs)
    .map((l) => l.value)
    .join(' · ');
}

/** 내 프로필로 미리 채우는 규격 — 던지는 손(글러브). 그 밖은 비워 둔다 */
export function prefillSpecs(
  category: string,
  user: { throwingHand?: string | null }
): Specs {
  const out: Specs = {};
  if (category === 'glove' && user.throwingHand) {
    const h = user.throwingHand.toLowerCase();
    out.hand = h.includes('좌') || h.startsWith('l') ? 'L' : 'R';
  }
  return out;
}

/** 목록 거르기 — 주소의 쿼리를 읽는다. 틀린 값은 무시 */
export type ListingFilter = {
  category?: CategoryKey;
  condition?: ConditionKey;
  region?: string;
  q?: string;
  sort: SortKey;
  page: number;
  /** 거래 완료도 보기 */
  all?: boolean;
};

export function readFilter(get: (k: string) => string | undefined): ListingFilter {
  const category = get('category');
  const condition = get('condition');
  const region = get('region');
  const sort = get('sort');
  const page = Number.parseInt(get('page') ?? '1', 10);
  return {
    category: isCategory(category) ? category : undefined,
    condition: isCondition(condition) ? condition : undefined,
    region: isRegion(region) ? region : undefined,
    q: (get('q') ?? '').trim().slice(0, 40) || undefined,
    sort: isSort(sort) ? sort : 'new',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    all: get('all') === '1',
  };
}

export function filterHref(f: Partial<ListingFilter>): string {
  const sp = new URLSearchParams();
  if (f.category) sp.set('category', f.category);
  if (f.condition) sp.set('condition', f.condition);
  if (f.region) sp.set('region', f.region);
  if (f.q) sp.set('q', f.q);
  if (f.sort && f.sort !== 'new') sp.set('sort', f.sort);
  if (f.page && f.page > 1) sp.set('page', String(f.page));
  if (f.all) sp.set('all', '1');
  const s = sp.toString();
  return s ? `/market?${s}` : '/market';
}

/** 사진 — 올릴 때 쓰는 종류 · 크기(브라우저가 lib/shrink-image.ts 로 줄여 올린다) */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const MESSAGE_MAX = 1000;

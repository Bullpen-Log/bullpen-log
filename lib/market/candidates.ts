/**
 * 덕아웃 레슨 · 연습장 수집 후보(2026-10-26, 대표관리자만) — 값 · 이름표 · 수집 자료 읽기(순수). 표는 prisma FacilityCandidate.
 *
 * 수집 자료(dugout-facility-candidates.json, schemaVersion 6)의 약속: candidates 배열만 후보로 가져오고(보류 · 범위 밖 · 퇴역은 안 가져온다),
 * 모든 후보는 미확인 · 연락 전 · 동의 요청 전 · 관리자만 보기 · 공개 · 예약 꺼짐 · 레슨 · 대관 모름(null) 상태로 온다. 그 약속이 깨진 파일은 통째로 막는다.
 * 지도 일치 · 공개 안내는 근거 수준일 뿐 현재 영업 · 서비스 확정이 아니다 — 확인한 값은 관리자 칸(offersLessons …)에 따로 적는다.
 */

export const COLLECTION_STATUS = { UNVERIFIED: '미확인', VERIFIED: '정보 확인함' } as const;
export const BUSINESS_STATUS = { UNKNOWN: '영업 모름', OPEN: '영업 중', CLOSED: '폐업 · 이전' } as const;
export const CONTACT_STATUS = { NOT_CONTACTED: '연락 전', CONTACTED: '연락함', NO_ANSWER: '답 없음', DO_NOT_CONTACT: '연락 사절' } as const;
export const CONSENT_STATUS = { NOT_REQUESTED: '동의 요청 전', REQUESTED: '동의 요청함', AGREED: '동의함', REFUSED: '거절' } as const;

export const MAP_STATUS: Record<string, string> = {
  NAME_ADDRESS_MATCH: '상호 · 주소 일치',
  ADDRESS_MATCH_NAME_VARIANT: '주소 일치 · 상호 표기 다름',
  NAME_MATCH_ADDRESS_DIFFERENT: '상호 비슷 · 주소 다름',
  NAVER_NEW_CANDIDATE: '지도 업체로 새로 추가',
};

/** 공개 안내 근거 수준 — 어느 것도 '지금 제공한다'는 확정이 아니다 */
export const NOTICE_LEVEL: Record<string, string> = {
  PUBLIC_NOTICE_FOUND: '공개 안내 있음',
  PUBLIC_TEXT_MENTION: '소개 글에 언급',
  KEYWORD_ONLY: '키워드만',
  CATEGORY_ONLY: '업종만',
  PRICE_CATEGORY_ONLY: '가격 분류만',
  SPACE_USE_MENTION_ONLY: '공간 이용 목적에만 언급',
  PARTIAL_ZONE_RENTAL_NOTICE: '일부 구역 대관 안내',
  NOT_OFFERED_IN_NOTICE: '안내에 제공 안 함',
  NOT_ESTABLISHED: '근거 없음',
};

export type StatusMap = Record<string, string>;
export const isStatus = (map: StatusMap, v: unknown): v is string => typeof v === 'string' && Object.hasOwn(map, v);
export const labelOf = (map: StatusMap, v: string | null | undefined) => (v && map[v]) || (v ?? '—');

/** 관리자 승인은 업체 동의 · 정보 확인 뒤에만 */
export const canApprove = (c: { consentStatus: string; collectionStatus: string }) =>
  c.consentStatus === 'AGREED' && c.collectionStatus === 'VERIFIED';

/** 배팅 · 연습공간 쪽 후보 — 지도 점 색만 가른다(레슨 확정 아님) */
export const isPracticeType = (typeHint: string) => typeHint.startsWith('배팅') || typeHint === '연습공간 후보';

/** 손으로 넣는 좌표 — 한국 안쪽만(lib/geocode.ts 와 같은 범위) */
export function readCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  if (String(lat ?? '').trim() === '' || String(lng ?? '').trim() === '') return null;
  return Number.isFinite(a) && Number.isFinite(b) && a >= 32 && a <= 39.5 && b >= 124 && b <= 132 ? { lat: a, lng: b } : null;
}

/** 가져오기가 쓰는 칸(수집 칸) — 관리자 칸(연락 · 동의 · 확인 · 승인 · 메모)은 없다 */
export type CandidateImportRow = {
  id: string;
  name: string;
  typeHint: string;
  region: string;
  district: string | null;
  roadAddress: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapStatus: string | null;
  lessonNotice: string | null;
  rentalNotice: string | null;
  hardballNotice: string | null;
  sharedPlaceGroup: string | null;
  duplicateGroup: string | null;
  collected: Record<string, unknown>;
  collectedAt: string;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 수집 후보 하나가 지켜야 할 처음 상태 — 하나라도 다르면 파일을 막는다 */
const INITIAL: [string, unknown][] = [
  ['collectionStatus', 'UNVERIFIED'],
  ['businessStatus', 'UNKNOWN'],
  ['contactStatus', 'NOT_CONTACTED'],
  ['consentStatus', 'NOT_REQUESTED'],
  ['visibility', 'ADMIN_ONLY'],
  ['publicProfile', false],
  ['bookingEnabled', false],
  ['offersLessons', null],
  ['offersRental', null],
];

/** 수집 자료 파일 → 가져올 줄. candidates 배열만 읽는다. 약속이 하나라도 깨지면 rows 없이 errors 만 */
export function readCandidateFile(d: unknown): { rows: CandidateImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const f = (d ?? {}) as Raw;
  if (f.schemaVersion !== 6) errors.push(`schemaVersion 이 6 이 아니에요(${String(f.schemaVersion)})`);
  const list = Array.isArray(f.candidates) ? (f.candidates as Raw[]) : null;
  if (!list) return { rows: [], errors: [...errors, 'candidates 배열이 없어요'] };
  const expected = (f.counts as Raw | undefined)?.candidates;
  if (typeof expected === 'number' && expected !== list.length) errors.push(`counts.candidates ${expected} ≠ 실제 ${list.length}`);
  const collectedAt = str(f.collectedAt);
  if (!collectedAt || !/^\d{4}-\d{2}-\d{2}$/.test(collectedAt)) errors.push('collectedAt 이 날짜가 아니에요');
  const seen = new Set<string>();
  const rows: CandidateImportRow[] = [];
  for (const c of list) {
    const id = str(c.id);
    const where = id ?? `#${rows.length + 1}`;
    if (!id || !/^(semas|naver):\S+$/.test(id)) errors.push(`${where}: id 모양이 달라요`);
    else if (seen.has(id)) errors.push(`${id}: id 가 겹쳐요`);
    else seen.add(id);
    for (const [k, v] of INITIAL) if (c[k] !== v) errors.push(`${where}: ${k} 가 ${JSON.stringify(v)} 가 아니에요`);
    const name = str(c.name);
    const region = str(c.region);
    const typeHint = str(c.typeHint);
    if (!name || !region || !typeHint) errors.push(`${where}: 이름 · 지역 · 분류 단서가 비었어요`);
    const lat = num(c.lat);
    const lng = num(c.lng);
    if ((lat == null) !== (lng == null) || (lat != null && !readCoords(lat, lng))) errors.push(`${where}: 좌표가 이상해요`);
    const map = (c.mapReview ?? {}) as Raw;
    rows.push({
      id: id ?? '',
      name: name ?? '',
      typeHint: typeHint ?? '',
      region: region ?? '',
      district: str(c.district),
      roadAddress: str(c.roadAddress),
      address: str(c.address),
      lat,
      lng,
      mapStatus: str(map.status),
      lessonNotice: str(map.lessonNotice),
      rentalNotice: str(map.rentalNotice),
      hardballNotice: str(map.hardballNotice),
      sharedPlaceGroup: str(map.sharedPlaceGroup),
      duplicateGroup: str(c.possibleDuplicateGroup),
      collected: c,
      collectedAt: collectedAt ?? '',
    });
  }
  return errors.length ? { rows: [], errors } : { rows, errors };
}

/** 목록 · 상세의 '검토 필요' 표시 — 같은 지도 장소 · 중복 의심은 합치지 않고 사람이 본다 */
export function reviewFlags(c: { sharedPlaceGroup: string | null; duplicateGroup: string | null; lat: number | null }): string[] {
  return [c.sharedPlaceGroup && '같은 지도 장소', c.duplicateGroup && '중복 의심', c.lat == null && '좌표 없음'].filter(Boolean) as string[];
}

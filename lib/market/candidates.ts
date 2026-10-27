/**
 * 덕아웃 레슨 · 연습장 수집 후보(2026-10-26, 대표관리자만) — 값 · 이름표 · 통합 자료 읽기 · 가져오기 계획(순수). 표는 prisma FacilityCandidate.
 *
 * 통합 자료(combined-facilities.json, schemaVersion 1 · 기준일 2026-10-26): candidates 430곳만 후보다(sourceIdMapping · mergeLog · addressReview 는 연결 · 검토 이력).
 * 모든 후보는 미확인 · 연락 전 · 동의 요청 전 · 관리자만 보기 · 공개 · 예약 꺼짐 · 레슨 · 대관 · 경식구 모름(null) · 전화 없음으로 온다 — 약속이 깨진 파일은 통째로 막는다.
 * operationsReview 는 네이버 플레이스 공개 화면을 본 근거일 뿐 현재 영업 · 서비스 확정이 아니다 — 업체에 확인한 값은 관리자 칸(offersLessons …)에 따로 적는다.
 *
 * 자료의 상태 → 표 칸(뜻을 그대로 옮긴다):
 *   collectionStatus · businessStatus · contactStatus · consentStatus → 같은 이름 칸(처음 값 = 표 기본값).
 *   offersLessons · offersRental · offersHardball · phone · verifiedAt · lastContactedAt → 같은 이름 칸(null = 아직 모름, false 로 바꾸지 않는다).
 *   visibility ADMIN_ONLY · publicProfile false → approvedAt 이 비어 있음(공개로 옮기는 길은 아직 없다 — 승인해도 사용자에게 안 보인다).
 *   bookingEnabled false → 후보에는 예약이 없다. 예약은 나중에 정식 연습장(Venue) · 레슨장(Org)으로 옮긴 뒤 그쪽 스위치로 따로 켠다.
 */

export const COLLECTION_STATUS = { UNVERIFIED: '미확인', VERIFIED: '정보 확인함' } as const;
export const BUSINESS_STATUS = { UNKNOWN: '영업 모름', OPEN: '영업 중(업체 확인)', CLOSED: '폐업 · 이전(업체 확인)' } as const;
export const CONTACT_STATUS = { NOT_CONTACTED: '연락 전', CONTACTED: '연락함', NO_ANSWER: '답 없음', DO_NOT_CONTACT: '연락 사절' } as const;
export const CONSENT_STATUS = { NOT_REQUESTED: '동의 요청 전', REQUESTED: '동의 요청함', AGREED: '동의함', REFUSED: '거절' } as const;

export const ORIGIN_GROUP: Record<string, string> = { ORIGINAL_178: '기존 수집', ADDITIONAL_256: '추가 발견' };

/** 주소 검토(통합 자료 addressReview) — 처음 공공자료 주소와 지금 지도 주소가 달라 옛 좌표를 비운 곳 */
export const MAP_STATUS: Record<string, string> = {
  SOURCE_ADDRESS_DIFFERS_COORDINATE_WITHHELD: '처음 주소와 지도 주소가 달라 좌표 비움',
};

/* 공개 근거 수준 — 어느 것도 '지금 제공한다 · 영업한다'는 확정이 아니다(직접 확인 필요) */
export const OPERATION_NOTICE: Record<string, string> = {
  RECENT_PUBLIC_ACTIVITY: '90일 안 소식 있음',
  LISTED_HOURS_OR_PRODUCTS: '시간표 · 상품만',
  INFORMATION_INSUFFICIENT: '근거 부족',
};
export const LESSON_NOTICE: Record<string, string> = {
  PUBLIC_NOTICE: '공개 안내 있음',
  PUBLIC_MENTION: '본문 언급만',
  KEYWORD_ONLY: '키워드만',
  EXPLICIT_RENTAL_ONLY: '대관만 운영 안내',
  NOT_ESTABLISHED: '근거 미확보',
};
export const HARDBALL_NOTICE: Record<string, string> = {
  EXPLICIT_HARDBALL_NOTICE: '경식구 공개 안내 있음',
  PROGRAM_SPECIFIC_HARDBALL: '선수반 한정',
  HISTORICAL_HARDBALL_NOTICE: '과거 안내',
  SOFT_OR_SAFETY_BALL_NOTICE: '연식 · 안전구 안내',
  NOT_ESTABLISHED: '근거 미확보',
};
export const RENTAL_NOTICE: Record<string, string> = {
  PUBLIC_NOTICE: '대관 공개 안내 있음',
  PARTIAL_ZONE_NOTICE: '일부 구역 대여 안내',
  EXPLICIT_NOT_OFFERED: '안내상 대관 안 함',
  OTHER_SPORT_ONLY: '다른 종목 대관만',
  NOT_ESTABLISHED: '근거 미확보',
};
/** 적용 범위 — 그 프로그램 · 구역에만. 시설 전체로 넓히지 않는다 */
export const NOTICE_SCOPE: Record<string, string> = {
  UNCONFIRMED: '범위 미확인',
  LISTED_PROGRAM_CURRENT_SCHEDULE_UNCONFIRMED: '안내된 프로그램 · 현재 일정 미확인',
  ELITE_AND_AMATEUR_CONSULTATION_NOTICE: '엘리트 · 사회인 상담 안내',
  YOUTH_TRIAL_CLASS: '유소년 체험반',
  COACH_INTRO_ONLY: '코치 소개만',
  OPERATOR_COACHING_NOT_ESTABLISHED: '업체 직접 코칭 근거 없음',
  SPACE_USE_ONLY: '공간 이용 용도 표현만',
  LISTED_SERVICE_OR_ZONE: '안내된 서비스 · 구역만',
  HOBBY_PROGRAM: '취미반만',
  BOOKABLE_CATCH_AND_TOSS_ZONES: '예약 캐치볼 · 토스 구역만',
  SHARED_BLOG_BRANCH_SCOPE_UNCONFIRMED: '공통 블로그 · 지점 적용 미확인',
  HISTORICAL_BATTING_NOTICE: '과거 배팅 안내',
  YOUTH_PROGRAM: '유소년반만',
  HISTORICAL_EQUIPMENT_NOTICE: '과거 장비 안내',
  PLAYER_PROGRAM_ONLY: '선수반 한정',
  YOUNG_CHILD_EVENT: '저학년 행사만',
  YOUTH_INTRO_PROGRAM: '유소년 입문반만',
  PITCHING_MACHINE_ZONE: '피칭머신 구역만',
  YOUNG_CHILD_FIELDING: '저학년 수비만',
  SPACE_RENTAL_SCOPE_UNCONFIRMED: '대관 범위 미확인',
  FULL_SPACE_NOTICE: '전관 안내',
  PARTIAL_ZONE: '일부 구역',
  FULL_AND_PARTIAL_NOTICE: '전관 · 일부 구역 안내',
  NO_RENTAL_NOTICE: '대관 안 함 안내',
  PARTIAL_ZONE_AND_MULTI_SPORT_SPACE: '일부 구역 · 다목적 공간',
  PARTIAL_ZONE_FULL_SPACE_NOT_OFFERED: '일부 구역만 · 전관 안 함',
  FUTSAL_ONLY_NOTICE: '풋살 대관만 안내',
};
export const SOURCE_KIND: Record<string, string> = {
  HOME: '홈',
  INFORMATION: '정보',
  NEWS: '소식',
  BOOKING_PRODUCTS: '예약 상품',
  PRICE_LIST: '가격표',
  KEYWORDS: '키워드',
};
export const COORDS_ACCURACY: Record<string, string> = {
  BUILDING_ONLY: '공공자료 건물 참조(출입구 · 층 · 입주 업체 확인 전)',
  NOT_ESTABLISHED: '좌표 근거 미확보',
  UNRESOLVED: '위치 미해결',
};
export const COORDS_SOURCE: Record<string, string> = { MANUAL: '관리자가 손으로', KAKAO_GEOCODE: '관리자가 주소로 찾음' };

export type StatusMap = Record<string, string>;
export const isStatus = (map: StatusMap, v: unknown): v is string => typeof v === 'string' && Object.hasOwn(map, v);
export const labelOf = (map: StatusMap, v: string | null | undefined) => (v && map[v]) || (v ?? '—');

/** 관리자 승인은 업체 동의 · 정보 확인 뒤에만 */
export const canApprove = (c: { consentStatus: string; collectionStatus: string }) =>
  c.consentStatus === 'AGREED' && c.collectionStatus === 'VERIFIED';

/** 배팅 · 연습공간 쪽 후보 — 지도 점 색만 가른다(레슨 확정 아님) */
export const isPracticeType = (typeHint: string) => typeHint.startsWith('배팅') || typeHint.startsWith('연습');

/** 손으로 넣는 좌표 — 한국 안쪽만(lib/geocode.ts 와 같은 범위) */
export function readCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  if (String(lat ?? '').trim() === '' || String(lng ?? '').trim() === '') return null;
  return Number.isFinite(a) && Number.isFinite(b) && a >= 32 && a <= 39.5 && b >= 124 && b <= 132 ? { lat: a, lng: b } : null;
}

/** 가져오기가 쓰는 칸(수집 칸) — 관리자 칸(연락 · 동의 · 확인 · 승인 · 메모 · 전화)은 없다. reviewTags 는 계획이 만든다 */
export type CollectedFields = {
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
  operationNotice: string | null;
  /** 야구장 후보만(lib/market/field-candidates.ts) — 레슨 · 연습장은 null */
  accessNotice: string | null;
  identityNotice: string | null;
  originGroup: string | null;
  sharedPlaceGroup: string | null;
  duplicateGroup: string | null;
  collected: Record<string, unknown>;
  collectedAt: string;
};
export const COLLECTED_KEYS = [
  'name', 'typeHint', 'region', 'district', 'roadAddress', 'address', 'lat', 'lng', 'mapStatus', 'lessonNotice', 'rentalNotice',
  'hardballNotice', 'operationNotice', 'accessNotice', 'identityNotice', 'originGroup', 'sharedPlaceGroup', 'duplicateGroup', 'collected', 'collectedAt', 'reviewTags',
] as const;

export type CandidateImportRow = {
  /** 통합 후보 id — 새로 만들 때만 기본키로 쓴다 */
  id: string;
  /** 이전 후보 id(sourceCandidateIds) — 이미 있는 행을 이걸로 찾는다 */
  sourceIds: string[];
  placeIds: string[];
  fileTags: string[];
  fields: CollectedFields;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});

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
  ['offersHardball', null],
  ['phone', null],
  ['verifiedAt', null],
  ['lastContactedAt', null],
];

export type CombinedFile = { reviewedDate: string; rows: CandidateImportRow[]; mappingCount: number; mergeCount: number };

/**
 * 통합 자료 파일 → 가져올 줄. candidates 만 후보로 읽고, 연결표(sourceIdMapping) · 통합 이력(mergeLog) · 주소 검토(addressReview)는
 * 숫자 · 연결이 맞는지 보는 데만 쓴다. 약속이 하나라도 깨지면 rows 없이 errors 만.
 */
export function readCombinedFile(d: unknown): { file: CombinedFile | null; errors: string[] } {
  const errors: string[] = [];
  const f = obj(d);
  if (f.schemaVersion !== 1) errors.push(`schemaVersion 이 1 이 아니에요(${String(f.schemaVersion)})`);
  const reviewedDate = str(f.reviewedDate);
  if (!reviewedDate || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedDate)) errors.push('reviewedDate 가 날짜가 아니에요');
  const list = Array.isArray(f.candidates) ? (f.candidates as Raw[]) : null;
  const mapping = Array.isArray(f.sourceIdMapping) ? (f.sourceIdMapping as Raw[]) : null;
  const merges = Array.isArray(f.mergeLog) ? (f.mergeLog as Raw[]) : null;
  const addressReview = Array.isArray(f.addressReview) ? (f.addressReview as Raw[]) : [];
  if (!list || !mapping || !merges) return { file: null, errors: [...errors, 'candidates · sourceIdMapping · mergeLog 배열이 다 있어야 해요'] };
  const counts = obj(f.counts);
  const sc = obj(f.sourceCounts);
  if (counts.total !== list.length) errors.push(`counts.total ${String(counts.total)} ≠ 실제 ${list.length}`);
  if (sc.combinedUniquePlaces !== list.length) errors.push(`sourceCounts.combinedUniquePlaces ≠ 실제 ${list.length}`);
  if (sc.totalInputRecords !== mapping.length) errors.push(`sourceCounts.totalInputRecords ≠ 연결표 ${mapping.length}`);
  if (sc.mergedDuplicateRecords !== merges.length) errors.push(`sourceCounts.mergedDuplicateRecords ≠ 통합 이력 ${merges.length}`);

  const withheld = new Map(addressReview.map((a) => [str(a.placeId), str(a.matchKind)]));
  const seen = new Set<string>();
  const allSource = new Set<string>();
  const rows: CandidateImportRow[] = [];
  for (const c of list) {
    const id = str(c.id);
    const where = id ?? `#${rows.length + 1}`;
    if (!id || !/^(semas|naver):\S+$/.test(id)) errors.push(`${where}: id 모양이 달라요`);
    else if (seen.has(id)) errors.push(`${id}: id 가 겹쳐요`);
    else seen.add(id);
    for (const [k, v] of INITIAL) if (c[k] !== v) errors.push(`${where}: ${k} 가 ${JSON.stringify(v)} 가 아니에요`);
    const sourceIds = strs(c.sourceCandidateIds);
    if (!id || !sourceIds.includes(id)) errors.push(`${where}: sourceCandidateIds 에 자기 id 가 없어요`);
    for (const s of sourceIds) {
      if (allSource.has(s)) errors.push(`${s}: 이전 id 가 두 후보에 걸려요`);
      allSource.add(s);
    }
    const placeIds = strs(c.placeIds);
    const placeId = str(c.placeId);
    if (!placeId || !placeIds.includes(placeId)) errors.push(`${where}: placeId 가 placeIds 에 없어요`);
    const name = str(c.name);
    const region = str(c.region);
    const typeHint = str(c.typeHint);
    const address = str(c.address);
    if (!name || !region || !typeHint || !address) errors.push(`${where}: 이름 · 지역 · 분류 단서 · 주소가 비었어요`);
    const lat = num(c.lat);
    const lng = num(c.lng);
    if ((lat == null) !== (lng == null) || (lat != null && !readCoords(lat, lng))) errors.push(`${where}: 좌표가 이상해요`);
    if (lat != null && c.coordinatesNeedReview !== true) errors.push(`${where}: 좌표가 있는데 coordinatesNeedReview 가 true 가 아니에요`);
    const mapStatus = placeId ? (withheld.get(placeId) ?? null) : null;
    if (mapStatus && lat != null) errors.push(`${where}: 주소가 달라 좌표를 비운 곳인데 좌표가 있어요`);
    const ops = obj(c.operationsReview);
    const status = (k: string) => str(obj(ops[k]).status);
    const operationNotice = str(obj(ops.operation).evidenceStatus);
    if (!operationNotice || !status('lesson') || !status('rental') || !status('hardball')) errors.push(`${where}: operationsReview 근거 수준이 비었어요`);
    rows.push({
      id: id ?? '',
      sourceIds,
      placeIds,
      fileTags: strs(c.reviewPriorityTags),
      fields: {
        name: name ?? '',
        typeHint: typeHint ?? '',
        region: region ?? '',
        district: null,
        /* 표시 주소는 지도 주소(address) 하나 — 처음 공공자료 주소(sourceAddresses)로 되돌리지 않는다 */
        roadAddress: null,
        address,
        lat,
        lng,
        mapStatus,
        lessonNotice: status('lesson'),
        rentalNotice: status('rental'),
        hardballNotice: status('hardball'),
        operationNotice,
        accessNotice: null,
        identityNotice: null,
        originGroup: strs(c.originGroups)[0] ?? null,
        sharedPlaceGroup: null,
        duplicateGroup: null,
        collected: c,
        collectedAt: reviewedDate ?? '',
      },
    });
  }
  const mapped = new Set(mapping.map((m) => str(m.sourceCandidateId)));
  if (mapped.size !== mapping.length) errors.push('연결표에 같은 이전 id 가 두 번 있어요');
  if (mapped.size !== allSource.size || [...allSource].some((s) => !mapped.has(s))) errors.push('후보의 이전 id 와 연결표가 맞지 않아요');
  for (const m of mapping) if (!seen.has(str(m.canonicalCandidateId) ?? '')) errors.push(`${String(m.sourceCandidateId)}: 연결 대상 후보가 없어요`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const m of merges) {
    const r = byId.get(str(m.canonicalCandidateId) ?? '');
    if (!r || !strs(m.sourceCandidateIds).every((s) => r.sourceIds.includes(s))) errors.push(`통합 이력 ${String(m.canonicalCandidateId)}: 후보의 이전 id 와 맞지 않아요`);
  }
  if (num(counts.coordinatesMissing) !== rows.filter((r) => r.fields.lat == null).length) errors.push('counts.coordinatesMissing 이 좌표 없는 후보 수와 달라요');
  return errors.length
    ? { file: null, errors }
    : { file: { reviewedDate: reviewedDate!, rows, mappingCount: mapping.length, mergeCount: merges.length }, errors };
}

/** 가져오기가 보는 기존 행 — 수집 칸 + 관리자 칸 */
export type ExistingCandidate = {
  id: string;
  mergedIntoId: string | null;
  coordsEdited: boolean;
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
  operationNotice: string | null;
  accessNotice: string | null;
  identityNotice: string | null;
  originGroup: string | null;
  sharedPlaceGroup: string | null;
  duplicateGroup: string | null;
  reviewTags: string[];
  collected: unknown;
  collectedAt: Date | string;
  collectionStatus: string;
  businessStatus: string;
  contactStatus: string;
  consentStatus: string;
  offersLessons: boolean | null;
  offersRental: boolean | null;
  offersHardball: boolean | null;
  phone: string | null;
  consentScope: string | null;
  verifiedAt: Date | string | null;
  lastContactedAt: Date | string | null;
  adminNote: string | null;
  approvedAt: Date | string | null;
};

/** 관리자가 손댄 기록(연락 · 동의 · 확인 · 승인 · 메모 · 전화 · 좌표)이 있나 — 있으면 통합 · 덮어쓰기에 조심한다 */
export function hasAdminData(r: ExistingCandidate) {
  return (
    r.collectionStatus !== 'UNVERIFIED' ||
    r.businessStatus !== 'UNKNOWN' ||
    r.contactStatus !== 'NOT_CONTACTED' ||
    r.consentStatus !== 'NOT_REQUESTED' ||
    r.offersLessons !== null ||
    r.offersRental !== null ||
    r.offersHardball !== null ||
    !!r.phone ||
    !!r.consentScope ||
    !!r.verifiedAt ||
    !!r.lastContactedAt ||
    !!r.adminNote ||
    !!r.approvedAt ||
    r.coordsEdited
  );
}

/** 지도 장소 id — 통합 자료(placeIds) · 처음 자료(externalPlaceId · 지도 주소) 어느 모양이든 */
export function placeIdsOf(collected: unknown): string[] {
  const c = obj(collected);
  const fromUrl = str(obj(c.mapReview).placeUrl)?.match(/place\/(\d+)/)?.[1];
  return [...new Set([...strs(c.placeIds), str(c.placeId), str(c.externalPlaceId), fromUrl].filter((x): x is string => !!x))];
}

/** 키 차례에 상관없이 같은 값인지(jsonb 는 키 차례를 바꾼다) */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Raw)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Raw)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/* 업체 확인값과 공개 근거가 엇갈리는지 — 고치지 않고 확인 우선 꼬리표만 단다 */
const SAYS_YES = new Set(['PUBLIC_NOTICE', 'EXPLICIT_HARDBALL_NOTICE', 'PARTIAL_ZONE_NOTICE']);
const SAYS_NO = new Set(['EXPLICIT_NOT_OFFERED', 'OTHER_SPORT_ONLY']);
function conflictTags(r: ExistingCandidate | undefined, f: CollectedFields): string[] {
  if (!r) return [];
  const tags: string[] = [];
  const check = (label: string, verified: boolean | null, notice: string | null) => {
    if (verified === true && (!notice || notice === 'NOT_ESTABLISHED' || SAYS_NO.has(notice))) tags.push(`${label}: 업체 확인값과 공개 근거가 달라요`);
    if (verified === false && notice && SAYS_YES.has(notice)) tags.push(`${label}: 업체 확인값과 공개 근거가 달라요`);
  };
  check('레슨', r.offersLessons, f.lessonNotice);
  check('대관', r.offersRental, f.rentalNotice);
  check('경식구', r.offersHardball, f.hardballNotice);
  const contacted = r.contactStatus !== 'NOT_CONTACTED' || r.consentStatus !== 'NOT_REQUESTED' || !!r.approvedAt;
  if (contacted && (r.name !== f.name || (r.roadAddress ?? r.address) !== f.address)) tags.push('연락 기록이 있는데 상호 · 주소가 바뀌었어요 — 같은 사업자인지 확인');
  if (r.coordsEdited && f.mapStatus) tags.push('관리자 좌표가 있는데 주소가 바뀐 곳이에요 — 위치 다시 확인');
  return tags;
}

export type ImportOp =
  | { kind: 'create'; candidateId: string; id: string; data: CollectedFields & { reviewTags: string[] } }
  | { kind: 'update'; candidateId: string; id: string; data: Partial<CollectedFields & { reviewTags: string[] }>; changed: string[]; pushHistory: boolean }
  | { kind: 'same'; candidateId: string; id: string }
  | { kind: 'merge'; candidateId: string; id: string; into: string }
  /** 통합 대상 이전 기록인데 관리자 기록이 있어 잇지 않고 둔다(후보 자체는 위 create · update · same 중 하나로 처리) */
  | { kind: 'hold'; candidateId: string; id: string; into: string; reason: string }
  /** 후보를 쓰지 않았다 — 사람이 볼 충돌 */
  | { kind: 'conflict'; candidateId: string; id: string | null; reason: string };

export type ImportPlan = { ops: ImportOp[]; untouched: string[]; tally: Record<ImportOp['kind'], number> & { untouched: number } };

/**
 * 가져오기 계획(순수) — 통합 후보마다 기존 행을 이전 id(sourceIds) · 지도 장소 id 로 찾는다.
 * - 자기 id 행이 있으면 그 행, 없으면 이전 id 로 찾은 첫 행을 고친다(기본키는 그대로). 아무것도 없으면 새로 만든다(기본키 = 통합 id).
 * - 같은 후보에 걸린 나머지 이전 행은 지우지 않고 대표 행으로 잇는다(merge). 그 행에 관리자 기록이 있으면 잇지 않고 충돌로 남긴다.
 * - 이전 id 로는 안 걸리는데 같은 지도 장소 id 를 쓰는 다른 행이 있으면 만들지 않고 충돌로 남긴다(같은 곳을 두 번 만들지 않게).
 * - 고치는 칸은 수집 칸뿐. 관리자가 손으로 고친 좌표(coordsEdited)는 그대로. 바뀐 게 없으면 쓰지 않는다(다시 돌려도 같은 결과).
 * - 자료에 없는 기존 행은 지우지 않고 untouched 로 알린다.
 */
export function planImport(file: CombinedFile, existing: ExistingCandidate[]): ImportPlan {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byPlace = new Map<string, string[]>();
  for (const r of existing) for (const p of placeIdsOf(r.collected)) byPlace.set(p, [...(byPlace.get(p) ?? []), r.id]);
  const ops: ImportOp[] = [];
  const touched = new Set<string>();
  for (const row of file.rows) {
    const known = new Set([row.id, ...row.sourceIds]);
    const hits = row.sourceIds.filter((s) => byId.has(s));
    if (!hits.includes(row.id) && byId.has(row.id)) hits.unshift(row.id);
    const stray = [...new Set(row.placeIds.flatMap((p) => byPlace.get(p) ?? []))].filter((id) => !known.has(id));
    hits.forEach((h) => touched.add(h));
    stray.forEach((s) => touched.add(s));
    if (stray.length) {
      ops.push({ kind: 'conflict', candidateId: row.id, id: hits[0] ?? null, reason: `같은 지도 장소 id 를 쓰는 다른 기록(${stray.join(', ')}) — 자동으로 잇지 않음` });
      continue;
    }
    const primaryId = byId.has(row.id) ? row.id : hits[0];
    const primary = primaryId ? byId.get(primaryId) : undefined;
    const others = hits.filter((h) => h !== primaryId).map((h) => byId.get(h)!);
    const blocked = others.filter((o) => o.mergedIntoId !== primaryId && hasAdminData(o));
    const tags = [...new Set([...row.fileTags, ...conflictTags(primary, row.fields)])];
    if (blocked.length) tags.push('통합 대상 이전 기록에 연락 · 동의 기록이 있어요 — 사업자 확인 뒤 정리');
    const want = { ...row.fields, reviewTags: tags };
    if (!primary) ops.push({ kind: 'create', candidateId: row.id, id: row.id, data: want });
    else {
      const keepCoords = primary.coordsEdited;
      const changed = COLLECTED_KEYS.filter((k) => {
        if (keepCoords && (k === 'lat' || k === 'lng')) return false;
        const now = k === 'collectedAt' ? new Date(primary.collectedAt).toISOString().slice(0, 10) : primary[k];
        return stableJson(now) !== stableJson(want[k]);
      });
      if (!changed.length) ops.push({ kind: 'same', candidateId: row.id, id: primary.id });
      else
        ops.push({
          kind: 'update',
          candidateId: row.id,
          id: primary.id,
          data: Object.fromEntries(changed.map((k) => [k, want[k]])),
          changed,
          pushHistory: changed.includes('collected'),
        });
    }
    for (const o of others) {
      if (o.mergedIntoId === primaryId) continue;
      if (hasAdminData(o)) ops.push({ kind: 'hold', candidateId: row.id, id: o.id, into: primaryId!, reason: '통합 대상 이전 기록에 관리자 기록이 있어 잇지 않음' });
      else ops.push({ kind: 'merge', candidateId: row.id, id: o.id, into: primaryId! });
    }
  }
  const untouched = existing.filter((r) => !touched.has(r.id)).map((r) => r.id);
  const tally = { create: 0, update: 0, same: 0, merge: 0, hold: 0, conflict: 0, untouched: untouched.length };
  for (const o of ops) tally[o.kind] += 1;
  return { ops, untouched, tally };
}

/** 목록 · 상세의 '확인 필요' 표시 — 합치지 않고 사람이 본다 */
export function reviewFlags(c: { lat: number | null; reviewTags?: string[] | null; mergedIntoId?: string | null }): string[] {
  return [c.mergedIntoId && '통합된 이전 기록', c.lat == null && '위치 확인 필요', ...(c.reviewTags ?? [])].filter(Boolean) as string[];
}

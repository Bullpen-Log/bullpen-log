import type { CombinedFile } from '@/lib/market/candidates';

/**
 * 덕아웃 야구장 수집 후보(2026-10-27, 대표관리자만) — 야구장 672곳 조사 파일(5차 중간본) 읽기(순수). 표는 레슨 · 연습장과 같은 prisma FacilityCandidate.
 *
 * 파일: metadata · fields(구장 한 줄씩) · evidence(출처) · sourceReview3~5 · reviewAudit~5(점검 기록). fields 만 후보이고 나머지는 그 구장 근거로 collected 에 함께 둔다.
 * 모든 구장은 관리자만 · 연락 전 · 동의 요청 전 · 공개 · 예약 꺼짐으로 온다 — 약속이 깨지면 파일을 통째로 막는다. 조사 결과는 공개 출처를 본 근거일 뿐
 * 현재 운영 · 대관 가능 확정이 아니다(운영기관 연락 · 현장 확인 없음). 공개 출처 연락처는 phone 칸(업체에게 직접 받은 번호)에 넣지 않는다.
 *
 * 자료 → 표 칸:
 *   fieldId → id(새로 만들 때만 기본키) · sourceCandidateIds → 이전 id(다시 가져올 때 같은 곳 찾기) · field-kakao-<번호> → 지도 장소 id 'kakao:<번호>'
 *     (네이버 장소 번호와 숫자가 겹쳐도 다른 곳으로 보게 이름표를 붙인다).
 *   cityKey '경기|수원시' → region(430곳과 같은 정식 이름) · district. addresses[0] → address. 좌표는 자료에 없다(null — 지도엔 안 뜨고 '위치 확인 필요').
 *   accessReviewStatus → accessNotice · review5Identity → identityNotice · operationStatus5 → operationNotice(야구장 값). 레슨 · 대관 · 경식구 근거 칸은 비운다.
 *   5차에서 낮춤 · 4차 근거 보류 · 대응 불확실 · 출처 못 찾음 · 출처 엇갈림 · 중복 기록 → 확인 우선 꼬리표.
 * 휴대전화 번호는 근거째 가린다(조사 규칙: 개인 휴대전화는 기록하지 않음 — 원본 파일에는 남아 있다).
 */

export const FIELD_TYPE_HINT = '야구장 후보';
export const FIELD_ORIGIN = 'BASEBALL_FIELDS';
export const isFieldType = (typeHint: string) => typeHint === FIELD_TYPE_HINT;

/** 이용 경로 근거 — 공개 출처에서 찾은 만큼. '공개 신청 · 대관 안내'도 지금 빈 시간 · 외부 팀 허용 확정이 아니다 */
export const ACCESS_NOTICE: Record<string, string> = {
  PUBLIC_APPLICATION: '공개 신청 · 대관 안내 있음',
  INQUIRY_ONLY: '문의 창구만',
  PURPOSE_ONLY: '용도 근거만(리그 · 행사 등)',
  CURRENT_RESTRICTION: '현재 이용 제한 공지',
  PAST_ONLY: '과거 · 기간 끝난 안내만',
  NOT_ESTABLISHED: '이용 근거 미확보',
};
/** 근거가 이 구장(이 면)을 가리키는지 */
export const IDENTITY_NOTICE: Record<string, string> = {
  SAME_UNIT: '같은 장소 · 면',
  WHOLE_SITE: '단지 전체 단위',
  UNSURE: '장소 · 면 대응 불확실',
  SOURCE_NOT_FOUND: '출처 못 찾음',
};
/** 운영 근거(야구장) — operationNotice 에 레슨 · 연습장 값과 따로 들어간다 */
export const FIELD_OPERATION_NOTICE: Record<string, string> = {
  FIELD_OPERATING: '운영 근거 있음(원문)',
  FIELD_OPERATING_REFERENCE: '운영 근거 참고(공식 원문 없음)',
  FIELD_UNCONFIRMED: '운영 · 폐쇄 미확인',
  FIELD_TEMP_CLOSED: '공사 · 이용 중지 공지',
  FIELD_PLANNED_CHANGE: '공사 · 개장 · 철거 예정(미확인)',
  FIELD_CONVERTED_REFERENCE: '용도 전환 참고(공식 원문 없음)',
};

/* 조사 파일의 글 → 코드. 모르는 글이 오면 막는다(뜻을 짐작하지 않는다) */
const ACCESS_FROM: Record<string, string> = {
  '공개 신청·대관 안내 확보': 'PUBLIC_APPLICATION',
  '문의 창구만 확보': 'INQUIRY_ONLY',
  '용도 근거만 확보': 'PURPOSE_ONLY',
  '현재 이용제한 공지': 'CURRENT_RESTRICTION',
  '과거·기간종료 안내만': 'PAST_ONLY',
  '운영·이용 근거 미확보': 'NOT_ESTABLISHED',
};
const IDENTITY_FROM: Record<string, string> = {
  '같은 장소·면': 'SAME_UNIT',
  '단지 전체 단위': 'WHOLE_SITE',
  '대응 불확실': 'UNSURE',
  '출처 못 찾음': 'SOURCE_NOT_FOUND',
};
const OPERATION_FROM: Record<string, string> = {
  '현재 운영 근거 있음(5차 원문)': 'FIELD_OPERATING',
  '현재 운영 근거 있음(5차 원문)(5차 공식·공개 원문 근거 없음 — 참고)':
    'FIELD_OPERATING_REFERENCE',
  '현재 운영·폐쇄 미확인': 'FIELD_UNCONFIRMED',
  '기간 공사·이용 중지 공지': 'FIELD_TEMP_CLOSED',
  '공사·개장·철거 예정(실제 미확인)': 'FIELD_PLANNED_CHANGE',
  '과거 시설 용도 전환(5차 공식·공개 원문 근거 없음 — 참고)':
    'FIELD_CONVERTED_REFERENCE',
};
/** cityKey 앞 → 레슨 · 연습장 430곳과 같은 정식 지역 이름(조사 파일은 광주 · 전남을 '호남'으로 묶었다) */
const REGION_FROM: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  호남: '전남광주통합특별시',
  광주: '전남광주통합특별시',
  전남: '전남광주통합특별시',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

export type FieldReviewFile = CombinedFile & { maskedPhones: number };

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strs = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
const obj = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};

const ID = /^field-(kakao-\d+|(unit-)?[0-9a-f]{5,})$/;
const MOBILE = /(?<!\d)01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/g;
export const MOBILE_MASK = '[휴대전화 가림]';

/** 휴대전화 번호를 가린 사본 + 가린 수 */
export function maskMobiles<T>(v: T): { value: T; count: number } {
  let count = 0;
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string')
      return x.replace(MOBILE, () => {
        count += 1;
        return MOBILE_MASK;
      });
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object')
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  return { value: walk(v) as T, count };
}

/* 구장 한 줄이 지켜야 할 처음 상태 — 있는 칸만 본다(조사 파일엔 업체 확인 칸이 없다). 앞 다섯은 꼭 있어야 한다 */
const REQUIRED: [string, unknown][] = [
  ['visibility', 'ADMIN_ONLY'],
  ['contactStatus', 'NOT_CONTACTED'],
  ['consentStatus', 'NOT_REQUESTED'],
  ['publicProfile', false],
  ['bookingEnabled', false],
];
const IF_PRESENT: [string, unknown][] = [
  ['collectionStatus', 'UNVERIFIED'],
  ['businessStatus', 'UNKNOWN'],
  ['offersLessons', null],
  ['offersRental', null],
  ['offersHardball', null],
  ['phone', null],
  ['verifiedAt', null],
  ['lastContactedAt', null],
];
/** 구장마다 근거로 함께 둘 점검 기록(fieldId 로 거름) */
const AUDIT_KEYS = [
  'sourceReview3',
  'sourceReview4',
  'sourceReview5',
  'reviewAudit',
  'reviewAudit3',
  'reviewAudit4',
  'reviewAudit5',
] as const;

/** metadata.counts 의 글별 수 ↔ 실제 수 */
function sameCounts(
  label: string,
  want: unknown,
  got: Map<string, number>,
  errors: string[]
) {
  const w = obj(want);
  const keys = new Set([...Object.keys(w), ...got.keys()]);
  for (const k of keys)
    if ((w[k] ?? 0) !== (got.get(k) ?? 0))
      errors.push(
        `metadata.counts.${label} '${k}' ${String(w[k] ?? 0)} ≠ 실제 ${got.get(k) ?? 0}`
      );
}

/**
 * 야구장 조사 파일 → 가져올 줄(planImport 가 그대로 받는 모양). 약속이 하나라도 깨지면 rows 없이 errors 만.
 */
export function readFieldReviewFile(d: unknown): {
  file: FieldReviewFile | null;
  errors: string[];
} {
  const errors: string[] = [];
  const f = obj(d);
  const meta = obj(f.metadata);
  const counts = obj(meta.counts);
  const reviewedDate = str(meta.checkedAt);
  if (!reviewedDate || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedDate))
    errors.push('metadata.checkedAt 가 날짜가 아니에요');
  const list = Array.isArray(f.fields) ? (f.fields as Raw[]) : null;
  const evidence = Array.isArray(f.evidence) ? (f.evidence as Raw[]) : null;
  if (!list || !evidence)
    return {
      file: null,
      errors: [...errors, 'fields · evidence 배열이 다 있어야 해요'],
    };
  if (counts.totalRows !== list.length)
    errors.push(
      `metadata.counts.totalRows ${String(counts.totalRows)} ≠ 실제 ${list.length}`
    );

  const group = (rows: unknown) => {
    const m = new Map<string, Raw[]>();
    for (const r of Array.isArray(rows) ? (rows as Raw[]) : []) {
      const k = str(r.fieldId) ?? '';
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const evidenceBy = group(evidence);
  const evidenceIds = new Set(evidence.map((e) => str(e.evidenceId)));
  const audits = AUDIT_KEYS.map((k) => [k, group(f[k])] as const);

  const seen = new Set<string>();
  const allSource = new Set<string>();
  const tally = {
    access: new Map<string, number>(),
    identity: new Map<string, number>(),
    operation: new Map<string, number>(),
  };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let maskedPhones = 0;
  const rows: FieldReviewFile['rows'] = [];
  for (const c of list) {
    const id = str(c.fieldId);
    const where = id ?? `#${rows.length + 1}`;
    if (!id || !ID.test(id)) errors.push(`${where}: fieldId 모양이 달라요`);
    else if (seen.has(id)) errors.push(`${id}: fieldId 가 겹쳐요`);
    else seen.add(id);
    for (const [k, v] of REQUIRED)
      if (c[k] !== v) errors.push(`${where}: ${k} 가 ${JSON.stringify(v)} 가 아니에요`);
    for (const [k, v] of IF_PRESENT)
      if (k in c && c[k] !== v)
        errors.push(`${where}: ${k} 가 ${JSON.stringify(v)} 가 아니에요`);

    /* 정리 때 새로 갈라낸 면(field-unit-…)은 이전 id 가 없다 — 자기 id 를 늘 넣어 다시 가져올 때 같은 곳을 찾게 */
    const sourceIds = [
      ...new Set([...(id ? [id] : []), ...strs(c.sourceCandidateIds)]),
    ];
    for (const s of sourceIds) {
      if (!ID.test(s)) errors.push(`${where}: 이전 id ${s} 모양이 달라요`);
      if (allSource.has(s)) errors.push(`${s}: 이전 id 가 두 구장에 걸려요`);
      allSource.add(s);
    }
    const placeIds = [
      ...new Set(
        [id ?? '', ...sourceIds]
          .map((s) => s.match(/^field-kakao-(\d+)$/)?.[1])
          .filter((x): x is string => !!x)
      ),
    ].map((n) => `kakao:${n}`);

    const name = str(c.name);
    const address = strs(c.addresses)[0] ?? null;
    const [regionKey, district] = (str(c.cityKey) ?? '')
      .split('|')
      .map((s) => s.trim());
    const region = REGION_FROM[regionKey ?? ''] ?? null;
    if (!name || !address) errors.push(`${where}: 이름 · 주소가 비었어요`);
    if (!region) errors.push(`${where}: 모르는 지역 '${regionKey ?? ''}'`);

    const accessText = str(c.accessReviewStatus) ?? '';
    const identityText = str(c.review5Identity) ?? '';
    const operationText = str(c.operationStatus5) ?? '';
    const accessNotice = ACCESS_FROM[accessText];
    const identityNotice = IDENTITY_FROM[identityText];
    const operationNotice = OPERATION_FROM[operationText];
    if (!accessNotice) errors.push(`${where}: 모르는 이용 상태 '${accessText}'`);
    if (!identityNotice) errors.push(`${where}: 모르는 장소 대응 '${identityText}'`);
    if (!operationNotice) errors.push(`${where}: 모르는 운영 상태 '${operationText}'`);
    bump(tally.access, accessText);
    bump(tally.identity, identityText);
    bump(tally.operation, operationText);

    for (const e of strs(c.evidenceIds))
      if (!evidenceIds.has(e)) errors.push(`${where}: 근거 ${e} 가 evidence 에 없어요`);

    const dup = str(c.duplicateGroupId);
    const canonical = str(c.canonicalCandidateId);
    const tags = [
      c.review5Downgraded && '5차에서 이용 상태를 낮춤 — 사람 확인',
      Array.isArray(c.heldPriorReferences5) &&
        c.heldPriorReferences5.length > 0 &&
        '4차 근거가 5차 대조와 어긋나 보류 — 사람 확인',
      identityNotice === 'UNSURE' && '근거가 이 구장 · 면인지 불확실',
      identityNotice === 'SOURCE_NOT_FOUND' && '5차에서 출처를 못 찾음',
      strs(c.sourceConflicts).length > 0 && '출처끼리 엇갈림',
      dup && canonical && canonical !== id && `같은 구장 중복 기록 — 대표 ${canonical}`,
    ].filter((t): t is string => typeof t === 'string');

    const own = (rs: Raw[] | undefined) => rs ?? [];
    const masked = maskMobiles({
      ...c,
      placeIds,
      evidence: own(evidenceBy.get(id ?? '')),
      audit: Object.fromEntries(audits.map(([k, m]) => [k, own(m.get(id ?? ''))])),
    });
    maskedPhones += masked.count;
    rows.push({
      id: id ?? '',
      sourceIds,
      placeIds,
      fileTags: tags,
      fields: {
        name: name ?? '',
        typeHint: FIELD_TYPE_HINT,
        region: region ?? '',
        district: district || null,
        roadAddress: null,
        address,
        lat: null,
        lng: null,
        mapStatus: null,
        lessonNotice: null,
        rentalNotice: null,
        hardballNotice: null,
        operationNotice: operationNotice ?? null,
        accessNotice: accessNotice ?? null,
        identityNotice: identityNotice ?? null,
        originGroup: FIELD_ORIGIN,
        sharedPlaceGroup: null,
        duplicateGroup: dup,
        collected: masked.value,
        collectedAt: reviewedDate ?? '',
      },
    });
  }
  sameCounts('accessStatus', counts.accessStatus, tally.access, errors);
  sameCounts('identity5', counts.identity5, tally.identity, errors);
  sameCounts('operationStatus5', counts.operationStatus5, tally.operation, errors);
  for (const r of rows) {
    const canonical = str(obj(r.fields.collected).canonicalCandidateId);
    if (r.fields.duplicateGroup && (!canonical || !seen.has(canonical)))
      errors.push(`${r.id}: 중복 묶음의 대표 구장이 파일에 없어요`);
  }
  return errors.length
    ? { file: null, errors }
    : {
        file: {
          reviewedDate: reviewedDate!,
          rows,
          mappingCount: allSource.size,
          mergeCount: 0,
          maskedPhones,
        },
        errors,
      };
}

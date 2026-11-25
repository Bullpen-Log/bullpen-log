/**
 * 싱커위키(SINKER-WIKI01) — 웹과 앱(native/)이 같이 쓰는 글 · 출처 · 사진 모양.
 *
 * 글은 권한 확인 뒤에만 응답으로 전달한다. 이 파일은 모양만 담아 웹과 앱에서 같이 쓴다.
 */

/** 글 묶음 — 과학적 강도 순위가 아니라 찾기 위한 칸이다 */
export type WikiCategoryId =
  | 'pitching-mechanics'
  | 'training-concepts'
  | 'movements-postures'
  | 'equipment'
  | 'records-metrics'
  | 'basic-terms';

/**
 * 글의 단계. draft(쓰는 중) → reviewed(출처 · 문구 점검 끝) → published(권한이 필요한 묶음에 실림) → retracted(내림).
 * 편집상의 공개 승인은 publicRelease로 따로 기록한다.
 */
export type WikiStatus = 'draft' | 'reviewed' | 'published' | 'retracted';

/**
 * 출처의 성격 — 확신 정도를 숫자로 매기지 않고 무엇을 어떻게 본 자료인지만 적는다.
 */
export type WikiSourceDesign =
  | 'controlled-trial' /* 대조 실험(무작위 배정 포함) */
  | 'training-study' /* 훈련 전후 비교 실험 */
  | 'observational' /* 측정 · 상관(원인을 정하지 않음) */
  | 'systematic-review' /* 체계적 문헌고찰 */
  | 'scoping-review' /* 범위 검토 */
  | 'narrative-review' /* 서술형 검토 · 해설 */
  | 'clinical-commentary' /* 임상 해설(실험 아님) */
  | 'teaching-reference' /* 공식 교육 · 운동 설명 자료 */
  | 'coaching-material' /* 코칭 교육 자료 */
  | 'standard' /* 표준 · 단위 */
  | 'product-contract'; /* 이 앱의 실제 코드 계약(과학 근거가 아님) */

/** 출처를 어디까지 실제로 읽었나 */
export type WikiCheckScope =
  | 'metadata-abstract' /* 서지 정보 + 초록만 */
  | 'full-text-section' /* 본문 일부(어느 부분인지 note 에) */
  | 'page-text' /* 웹 페이지 본문 */
  | 'pdf-text' /* PDF 본문 텍스트 */
  | 'source-code'; /* 저장소 코드 */

export type WikiSourceCheck = {
  /** 실제로 확인한 주체 — 사람 전문가를 지어내지 않는다(예: 'GPT02 (AI)', 'Claude 투구기록 세션 (AI)') */
  by: string;
  /** 확인한 날(YYYY-MM-DD) — 출판 연도와 다르다 */
  at: string;
  scope: WikiCheckScope;
  note?: string;
};

export type WikiSource = {
  /** 바뀌지 않는 번호(S01 …) */
  id: string;
  title: string;
  /** 저자 — 확인한 그대로. 모르면 빈 배열 */
  authors: string[];
  /** 출판 연도. 확인하지 못했으면 null(지어내지 않는다) */
  year: number | null;
  /** 학술지 · 기관 · 저장소 */
  venue: string;
  design: WikiSourceDesign;
  url: string;
  /** DOI 는 원문 기록에서 읽은 것만. 없으면 생략 */
  doi?: string;
  pmid?: string;
  pmcid?: string;
  /** 누구를 대상으로 무엇을 했나(사람 수 · 과제 · 기간) */
  population?: string;
  /** 실제로 잰 것 */
  measured?: string;
  /** 이 자료로 말할 수 없는 것 · 한계 */
  limits: string;
  checks: WikiSourceCheck[];
};

/** 주장과 출처를 잇는 방식 */
export type WikiClaimRole = 'supports' | 'background' | 'contrasts' | 'limits';

export type WikiClaim = {
  /** 글 안에서 바뀌지 않는 번호 */
  id: string;
  /** 우리말로 새로 쓴 주장(원문 문장을 옮기지 않는다) */
  text: string;
  /** 출처 번호 → 역할. 출처 없이 편집부 설명이면 editorial: true 와 빈 배열 */
  sources: { id: string; role: WikiClaimRole; note?: string }[];
  /** 출처 없이 이 앱의 편집 설명으로 쓴 주장 — 그렇다고 글에 밝힌다 */
  editorial?: boolean;
};

export type WikiAsset = {
  id: string;
  /** 비공개 묶음의 사진을 준비할 때 쓰는 원래 파일 경로 */
  src: string;
  width: number;
  height: number;
  /** 화면 읽기 · 그림이 안 뜰 때 대신 보이는 설명 */
  alt: string;
  caption: string;
  creator: string;
  /** 원본 파일 페이지(라이선스가 적힌 곳) */
  sourcePage: string;
  /** 원본 파일 주소 */
  originalUrl: string;
  originalSha1: string;
  originalWidth: number;
  originalHeight: number;
  license: string;
  licenseUrl: string;
  /** 화면에 그대로 적는 출처 표기 */
  credit: string;
  /** 바꾼 것(크기 줄임 등). 없으면 '변경 없음' */
  modification: string;
  /** 파일별로 라이선스 · 작성자 · 내용을 확인한 기록 */
  verified: WikiSourceCheck;
  /** 이 사진으로 말하지 않는 것(색=세기 같은) */
  scopeNote: string;
};

export type WikiSection = {
  /** 이 칸의 제목(읽기 순서 2~5) */
  heading: string;
  /** 문단들 — 줄바꿈 없는 우리말 문단. 낯선 말 연결은 화면이 matcher 로 붙인다 */
  paragraphs: string[];
  /** 짧은 목록(선택) */
  bullets?: string[];
};

export type WikiRevision = {
  version: number;
  date: string;
  /** 바꾼 이유 */
  reason: string;
  /** 실제로 쓴 주체 */
  author: string;
  /** 검토한 주체와 검토 종류. 아직 없으면 null — 미리 채우지 않는다 */
  review: { by: string; at: string; kind: 'self' | 'independent'; note?: string } | null;
};

export type WikiArticle = {
  /** 바뀌지 않는 번호(wk-…) */
  id: string;
  /** 주소 — ASCII, 바뀌지 않음 */
  slug: string;
  title: string;
  /** 영어 이름표 */
  english: string;
  /** 사람이 확인한 다른 이름(검색 · 문맥 연결용). 저장된 운동 이름을 고치지 않는다 */
  aliases: string[];
  /**
   * 본문에서 저절로 연결해도 되는 이름 — aliases 중 뜻이 하나뿐인 것만.
   * 뜻이 여럿인 말(drop · hold · set)과 짧은 줄임말은 넣지 않는다.
   */
  autoLink: string[];
  category: WikiCategoryId;
  topics?: string[];
  /** '코칭에서 쓰는 표현' 같은 꼬리표 — 측정된 정의가 아님을 밝힐 때 */
  label?: string;
  /** 한 줄 뜻(쉬운 우리말) */
  summary: string;
  /** 짧게 읽기(R1) — 화면 맨 위에 늘 보이는 층. 아래 본문 · 주장에서 옮겨 쓴 것이지 새 주장이 아니다 */
  reading: WikiReading;
  /** 처음 만나는 곳과 왜 구별하나 */
  encounter: WikiSection;
  /** 설명 · 맥락(또는 장비 구별 · 준비) */
  explain: WikiSection;
  /** 이 말로 말할 수 없는 것 · 자주 헷갈리는 것 */
  notEstablished: WikiSection;
  related: string[];
  prerequisites: string[];
  confusable: string[];
  claims: WikiClaim[];
  /** 사진(선택) — 없으면 화면이 '확인된 장비 사진을 준비 중이에요' */
  assetIds?: string[];
  status: WikiStatus;
  /** 비로그인 공개 여부 — 현재 배포 묶음은 로그인한 회원만 읽는다 */
  publicRelease: false;
  revisions: WikiRevision[];
  /** 내린 글이면 그 까닭(묘비 문구) */
  retraction?: { at: string; reason: string };
};

/**
 * 짧게 읽기 — card 는 홈 · 목록 카드의 한 줄, example 은 예시 한 문장, keyPoints 는 접지 않고 늘 보이는 꼭 알아둘 점 1~2개
 * (코칭 표현인지 · 측정 한계 · 헷갈리는 말처럼 그 말에 꼭 붙어야 하는 한계). 자세한 설명 · 근거 · 편집 정보는 펼쳐서 본다.
 */
export type WikiReading = { card: string; example: string; keyPoints: readonly string[] };

/** 아직 쓰지 않은 말 — 빈 글을 만들지 않고 목록으로만 둔다 */
export type WikiBacklogItem = {
  term: string;
  english?: string;
  category: WikiCategoryId;
  /** 어디서 나왔나(앱 장비 목록 등) */
  origin: string;
  note?: string;
};

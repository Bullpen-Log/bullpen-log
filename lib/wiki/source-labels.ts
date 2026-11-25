import type { WikiSource, WikiSourceCheck } from '@/lib/wiki/types';

export const SOURCE_DESIGN_LABEL: Record<WikiSource['design'], string> = {
  'controlled-trial': '대조 실험',
  'training-study': '훈련 실험',
  observational: '관찰 · 상관 연구',
  'systematic-review': '체계적 문헌고찰',
  'scoping-review': '범위 검토',
  'narrative-review': '서술형 검토',
  'clinical-commentary': '임상 해설',
  'teaching-reference': '공식 운동 설명 자료',
  'coaching-material': '코칭 교육 자료',
  standard: '표준 · 단위',
  'product-contract': '앱 코드 계약(과학 근거 아님)',
};

export const CHECK_SCOPE_LABEL: Record<WikiSourceCheck['scope'], string> = {
  'metadata-abstract': '서지 정보와 초록만 확인',
  'full-text-section': '본문 일부 확인',
  'page-text': '웹 페이지 본문 확인',
  'pdf-text': 'PDF 본문 확인',
  'source-code': '저장소 코드 확인',
};

export const CLAIM_ROLE_LABEL = {
  supports: '뒷받침',
  background: '배경',
  contrasts: '다른 결과',
  limits: '한계',
} as const;

/**
 * 코치 지식 카드(docs/designs/ai-coach-knowledge-memory.md 3절 — AI 코치 2판 1단계, 2026-11-17). 우리가 정리한 코칭 기준을 규칙 글
 * (ai-prompt.ts COACH_SYSTEM — 앱이 하는 일 · 맥락 읽는 법)과 떼어 관리한다. 고정 글이라 규칙 글과 한 덩이로 캐시에 올라간다(ai.ts).
 *
 * 약속(자체 시험 coach:ai-test 가 지킨다)
 *   - 숫자 처방이 없다 — 투구 수 · 휴식일 · 세트 · 무게 · 시간은 앱 엔진만 말한다(D1).
 *   - 두 종류(D3): 안전 카드('이건 하지 않는다 · 이럴 땐 전문가로 · 지어내지 않는다')는 초안이어도 싣는다. 코칭 카드('이럴 땐 이렇게 권한다')는
 *     검토자가 적힌 것만 싣는다(shippedCards) — 다섯 장 모두 2026-11-21 김민 검토(SK20 은 규칙 글과 같아 뺐다).
 *   - 코치가 할 수 있는 일로만 쓴다(D4): 일정 바꾸기 넷(시간 · 쉬기 · 옮기기 · 바쁜 주) · 설명 · 되묻기 · 다른 화면으로 보내기(체크인 · 투구 기록 ·
 *     암케어 · 전문가).
 *   - 출처는 내부 추적용 번호만(CARD_SOURCES) — 화면 · AI 답에는 기관 이름을 쓰지 않는다(2026-10-09 규칙). 카드 글에도 이름이 없다.
 *   - 실은 카드 전부가 글자 수로 4,000 안(한국어는 글자 하나가 토큰 하나 안팎 — 어림, D2 의 '40장 · 4,000토큰').
 *
 * 카드는 저장소 밖 자료(v0.3 coach-authorities-20261105 · v0.2 coach-knowledge-20261105)의 같은 번호 카드를 우리 말로 다시 쓴 것이다 —
 * 판별은 설계 문서 3-1 · 3-4(v0.3 16장 + v0.2 9장). 자료 글을 옮기지 않았다. 순수 파일.
 */

export type CardKind = 'safety' | 'coaching';

export type CoachCard = {
  /** 자료의 카드 번호(K · SK) — 어느 자료에서 왔는지 되짚게 그대로 둔다 */
  id: string;
  kind: CardKind;
  /** 언제 */
  when: string;
  /** 할 것 */
  do: string;
  /** 하지 않을 것 */
  dont: string;
  /** 근거 자료 번호(CARD_SOURCES) — 우리 방침에서 나온 카드는 빈 목록 */
  sources: readonly CardSourceId[];
  /** 코칭 카드는 by 가 있어야 실린다(D3). 안전 카드는 비어 있어도 실린다 */
  review: { by: string | null; at: string | null };
};

/** 근거 자료 — 내부 추적용. 화면 · AI 에 보내지 않는다 */
export const CARD_SOURCES = {
  AM01: '투수 팔꿈치 인대 부상 입장문 — https://asmi.org/position-statement-for-tommy-john-injuries-in-baseball-pitchers/',
  AM02: '청소년 투수 입장문 — https://asmi.org/position-statement-for-adolescent-baseball-pitchers/',
  AM03: '투구와 롱토스 동작 비교 — https://pubmed.ncbi.nlm.nih.gov/21212502/',
  AM04: '웨이티드볼 운동의 동작 분석 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5435148/',
  AM05: '롱토스 측정값의 개인차 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6822207/',
  AM07: '웨이티드볼 6주 프로그램과 부상 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6044122/',
  AC01: '성인 저항운동 처방 리뷰 종합(2026) — https://pubmed.ncbi.nlm.nih.gov/41843416/',
  AC02: '저항운동 계획 안내(2026) — https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf',
  AC03: '건강한 성인의 운동 양과 질 — https://researchconnect.buffalo.edu/en/publications/quantity-and-quality-of-exercise-for-developing-and-maintaining-c/',
  AC06: '운동 중 온열질환 합의문(2023) — https://pubmed.ncbi.nlm.nih.gov/37036463/',
  NS02: '경기력을 위한 역도 입장문 — https://www.nsca.com/globalassets/about/position-statements/weighlifting-for-sports-performance.pdf',
  NS03: '쉬다가 운동 재개 합의 지침(2019) — https://www.nsca.com/contentassets/202023e9d6c440dab582d9d87c0f3729/cscca_and_nsca_joint_consensus_guidelines_for.1.pdf',
  NS04: '청소년 저항운동 입장문(2009) — https://www.nsca.com/globalassets/about/position-statements/position_stand_youth_resistance_training---2009.pdf',
  NS05: '장기 운동 발달 입장문 — https://www.nsca.com/globalassets/about/position-statements/nsca_position_statement_long-term_athletic_development.pdf',
  DL02: '센서로 본 던지기 부하 정의(현장 글)',
  DL03: '센서 부하 첫 달(현장 글)',
  DL04: '비시즌 부하 늘리기(현장 글)',
  DL12: '대학 투수진 부하 자료 활용(현장 글)',
  DL13: '드릴 · 공 무게별 부하(현장 글)',
  DL15: '연구 논문 읽는 법(현장 글)',
  DL17: '부하 센서 검증 연구 모음(현장 글)',
  TA01: '자주 묻는 질문(현장 글)',
  TA03: '프로그램 자주 바꾸지 않기(현장 글)',
  TA04: '대학 투수 구속 사례(현장 글)',
  TA10: '팀 코치와 함께하기(현장 글)',
  PDF02: '웨이티드볼 4주 입문(현장 자료)',
  RS01: '웨이티드볼 6주 연구 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6044122/',
  RS02: '급성 · 만성 부하 비율을 버리자는 논문 — https://pubmed.ncbi.nlm.nih.gov/33332011/',
  RS03: '착용 센서 대 동작 분석 비교 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6348088/',
  RS06: '팀 종목 부하 비율 메타분석 — https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2026.1896651/full',
} as const;

export type CardSourceId = keyof typeof CARD_SOURCES;

const DRAFT = { by: null, at: null } as const;
/** 코칭 카드 검토(D3) — 2026-11-21 김민이 다섯 장을 읽고 그대로 실었다 */
const REVIEWED_1121 = { by: '김민', at: '2026-11-21' } as const;

export const COACH_CARDS: readonly CoachCard[] = [
  /* ── 안전 카드(초안이어도 싣는다) ── */
  {
    id: 'K01',
    kind: 'safety',
    when: '나이 · 몸 상태 · 목적에 따라 답이 달라질 때',
    do: '맥락의 나이대와 오늘 신호를 먼저 보고 그 사람에게 맞는 말만 한다',
    dont: '성인 · 청소년 · 프로 이야기를 섞어 권하지 않는다. 성장기에게 성인 기준을 옮기지 않는다',
    sources: ['AM01', 'AM02', 'NS04', 'NS05', 'AC01'],
    review: DRAFT,
  },
  {
    id: 'K03',
    kind: 'safety',
    when: '맥락에 없는 투구(팀 불펜 · 야수 송구 · 경기 전 몸풀기)를 말할 때',
    do: '구수와 세기를 한 번 묻고 투구 기록에 남겨 달라고 한다. 오늘 운동이 부담되면 쉬기나 시간 줄이기를 제안한다',
    dont: '기록에 없으니 안 던진 것으로 보거나, 적게 던졌으니 괜찮다고 말하지 않는다',
    sources: ['AM01', 'AM03', 'AM05'],
    review: DRAFT,
  },
  {
    id: 'K05',
    kind: 'safety',
    when: '구속이나 던진 거리로 팔 부담을 셈해 달라고 할 때',
    do: '앱은 구속으로 팔 부담을 재지 않는다고 말하고, 팔 상태는 앱이 기록으로 계산한 값만 전한다',
    dont: '구속 · 거리만으로 팔에 걸린 힘이나 다칠 가능성을 말하지 않는다',
    sources: ['AM05'],
    review: DRAFT,
  },
  {
    id: 'K06',
    kind: 'safety',
    when: '무게가 다른 공(웨이티드볼)으로 던지는 법을 물을 때',
    do: '이 코치는 그 훈련을 짜지 않는다고 말하고, 하려면 지도자와 함께 정하라고 한다. 성장기에게는 권하지 않는다',
    dont: '공이 무겁거나 가벼우니 더 안전하다 · 더 위험하다고 단정하지 않는다',
    sources: ['AM04', 'AM07'],
    review: DRAFT,
  },
  {
    id: 'K07',
    kind: 'safety',
    when: '새로 아프다는 말이 나올 때',
    do: '오늘 체크인에 적어 달라고 하고, 계속 아프면 의사나 트레이너와 상의하라고 한다. 필요하면 그날 쉬기를 제안하고, 더 세게 하는 이야기는 미룬다',
    dont: '진단하거나 낫는 기간 · 다시 던져도 되는 날을 정하지 않는다',
    sources: ['AM01', 'AM02'],
    review: DRAFT,
  },
  {
    id: 'K08',
    kind: 'safety',
    when: '피곤하다 · 구속이나 제구가 떨어졌다고 할 때',
    do: '언제부터 · 잠과 운동 힘듦은 어땠는지 한두 가지만 묻고, 그날 시간 줄이기나 쉬기를 제안할 수 있다',
    dont: '영상 한 장이나 구속이 떨어진 것만으로 다쳤다고 말하지 않는다',
    sources: ['AM01', 'AM02'],
    review: DRAFT,
  },
  {
    id: 'K11',
    kind: 'safety',
    when: '근력 운동으로 구속이 얼마나 오르는지 물을 때',
    do: '근력과 구속은 따로 본다고 말하고, 같은 조건에서 잰 구속 기록으로 확인하자고 한다',
    dont: '근력이 오르면 구속도 오른다고 약속하지 않는다',
    sources: ['AC01', 'NS02'],
    review: DRAFT,
  },
  {
    id: 'K16',
    kind: 'safety',
    when: '오래 쉬다가 다시 운동하거나 던지려 할 때',
    do: '쉰 까닭(그냥 쉼 · 아팠음 · 다침)을 묻고, 처음에는 가볍게 시작하도록 시간 줄이기를 제안한다. 다쳐서 쉬었으면 전문가와 다시 시작할 단계를 정하라고 한다',
    dont: '다친 뒤 다시 던져도 된다고 허락하지 않는다',
    sources: ['NS03'],
    review: DRAFT,
  },
  {
    id: 'K20',
    kind: 'safety',
    when: '더운 날 어지러움 · 두통 · 메스꺼움 · 심한 근육 경련을 말할 때',
    do: '운동을 멈추고 시원한 곳에서 쉬며 주변 사람이나 의료진의 도움을 받으라고 먼저 말한다. 그날은 쉬기를 제안한다',
    dont: '회복 운동으로 바꾸면 된다거나 다시 해도 된다고 말하지 않는다',
    sources: ['AC06'],
    review: DRAFT,
  },
  {
    id: 'SK02',
    kind: 'safety',
    when: '오늘 체크인이 없거나 일부만 있을 때',
    do: '모르는 것은 모른다고 하고 체크인을 권한다',
    dont: '비어 있는 칸을 통증 없음 · 잘 쉼으로 읽지 않는다',
    sources: [],
    review: DRAFT,
  },
  {
    id: 'SK04',
    kind: 'safety',
    when: '운동이나 던지기를 더 늘리자고 할 때',
    do: '비교할 최근 기록과 그 뒤 몸 반응부터 보자고 하고, 앱이 짜는 양을 따르자고 한다',
    dont: '기록이 모자란데 양 · 세기를 올리자고 하지 않는다',
    sources: ['DL03', 'DL04'],
    review: DRAFT,
  },
  {
    id: 'SK08',
    kind: 'safety',
    when: '하루에 일부만 했거나 암케어만 했을 때',
    do: '과제마다 다 함 · 일부 · 안 함을 따로 말한다',
    dont: '암케어만 한 날을 계획한 운동을 다 한 날로 말하지 않는다',
    sources: [],
    review: DRAFT,
  },
  {
    id: 'SK09',
    kind: 'safety',
    when: '얼마나 빨라질지 · 다른 사람 사례처럼 될지 물을 때',
    do: '지금 기록으로는 약속할 수 없다고 말하고, 같은 조건에서 잰 구속을 기준으로 목표를 두자고 한다',
    dont: '다른 사람 사례의 구속 · 기간을 그 사람의 결과로 약속하지 않는다',
    sources: ['DL04', 'TA04'],
    review: DRAFT,
  },
  {
    id: 'SK13',
    kind: 'safety',
    when: '최근 투구량을 평소와 견준 부하 비율로 안전한지 물을 때',
    do: '평소보다 갑자기 늘었다 · 줄었다로만 말하고, 앱이 계산한 팔 상태를 그대로 전한다',
    dont: '그 비율 하나로 안전하다 · 위험하다고 단정하지 않는다',
    sources: ['DL02', 'DL03', 'DL12', 'DL13', 'DL17', 'RS02', 'RS03', 'RS06'],
    review: DRAFT,
  },
  {
    id: 'SK18',
    kind: 'safety',
    when: '운동이나 센 훈련을 놓쳤을 때',
    do: '다음 등판과 오늘 상태를 보고 남은 날을 그대로 가거나, 원하면 옮기기 하나만 제안한다',
    dont: '놓친 센 운동을 빈 날에 몰아넣지 않는다',
    sources: ['PDF02', 'TA03'],
    review: DRAFT,
  },
  {
    id: 'SK21',
    kind: 'safety',
    when: '구속이 올랐다 · 떨어졌다고 할 때',
    do: '같은 조건(재는 방법 · 마운드인지 평지인지 · 전력인지)에서 잰 값끼리만 견주자고 한다',
    dont: '최고 구속과 평균 구속, 조건이 다른 값을 섞어 견주지 않는다',
    sources: ['DL13', 'DL15', 'DL17', 'RS01', 'RS03'],
    review: DRAFT,
  },
  {
    id: 'SK24',
    kind: 'safety',
    when: '사용자가 지난 기록이나 지난 말을 고칠 때',
    do: '고친 사실로 다시 말하고, 투구 · 운동 기록이면 앱에서도 고쳐 달라고 한다',
    dont: '고치기 전 숫자로 계속 말하지 않는다',
    sources: [],
    review: DRAFT,
  },
  {
    id: 'SK25',
    kind: 'safety',
    when: '운동이 효과가 없다고 할 때',
    do: '실제로 한 날 · 재는 조건 · 다른 변화(잠 · 경기)를 먼저 보자고 한다',
    dont: '안 한 운동을 효과 없는 증거로 말하지 않는다',
    sources: ['PDF02', 'TA01', 'TA03', 'TA10'],
    review: DRAFT,
  },
  {
    id: 'SK28',
    kind: 'safety',
    when: '일정을 바꾸거나 바꾸자고 할 때',
    do: '바꿀 거리는 사용자가 [적용]을 눌러야 바뀐다고 말한다',
    dont: '아직 안 바뀌었거나 막힌 변경을 바뀌었다고 말하지 않는다',
    sources: [],
    review: DRAFT,
  },

  /* 개인 비서 5단계(2026-11-20) — 웨이트 · 잠 · 컨디셔닝 · 회복. 할 것은 앱이 하는 일로만, 숫자는 '앱 기준' 덩이(lib/coach/know.ts)에서만 */
  {
    id: 'PA01',
    kind: 'safety',
    when: '웨이트 자세 · 운동하는 법 · 이 운동이 왜 필요한지 물을 때',
    do: 'read_exercise_info 로 앱 설명을 읽고 그 안에서 답한다. 무게 · 세트는 오늘 운동 처방과 앱 기준으로만 말한다',
    dont: '최대 무게 재기나 더 못 들 때까지 하기를 권하지 않고, 설명에 없는 동작 요령을 지어내지 않는다',
    sources: ['AC01', 'NS02'],
    review: DRAFT,
  },
  {
    id: 'PA02',
    kind: 'safety',
    when: '잠이 부족하다 · 피곤하다고 할 때',
    do: '오늘 운동 가볍게(change_today lighter)나 시간 줄이기를 제안하고, 같은 시각에 자고 일어나기 같은 생활 습관 한 가지만 짧게 권한다',
    dont: '수면제 · 약 · 카페인 · 보충제를 권하지 않고, 몇 시간을 자라는 숫자를 처방하지 않는다',
    sources: [],
    review: DRAFT,
  },
  {
    id: 'PA03',
    kind: 'safety',
    when: '달리기 · 유산소 · 컨디셔닝을 하고 싶다고 할 때',
    do: '이번 주 일정의 운동 · 회복 날 안에서 하게 하고, 등판 전날과 다음 날은 가볍게 하라고 한다. 오늘 운동에 넣으려면 change_today 카드로',
    dont: '시간 · 거리 · 심박 같은 숫자를 지어내지 않고, 등판 앞뒤로 센 달리기를 권하지 않는다',
    sources: ['AC03'],
    review: DRAFT,
  },
  {
    id: 'PA04',
    kind: 'safety',
    when: '얼음 · 마사지 · 스트레칭 같은 회복 방법을 물을 때',
    do: '앱의 회복 암케어(armcare_today) · 가벼운 움직임 · 잠 · 끼니를 챙기라고 하고, 쉬는 날 수는 앱 기준의 휴식표로 설명한다',
    dont: '어떤 처치를 치료처럼 단정하지 않고, 아픈데 참고 던지라고 하지 않는다',
    sources: ['AM02'],
    review: DRAFT,
  },

  /* ── 코칭 카드(검토자가 적혀야 실린다 — D3). 2026-11-21 김민 검토 다섯 장 · SK20(팀 훈련과 겹칠 때)은 규칙 글과 같은 말이라 뺐다 ── */
  {
    id: 'K12',
    kind: 'coaching',
    when: '시간이 없어 운동을 자주 못 할 때',
    do: '할 수 있는 날과 시간에 맞춰 시간 줄이기 · 바쁜 주를 제안하고, 짧게라도 꾸준히 하는 쪽을 권한다',
    dont: '다 못 하면 소용없다고 말하지 않는다',
    sources: ['AC01', 'AC02', 'AC03'],
    review: REVIEWED_1121,
  },
  {
    id: 'SK07',
    kind: 'coaching',
    when: '계획을 바꾸고 싶다고 할 때',
    do: '바꾸는 까닭을 묻고, 바꾼 뒤 무엇으로 확인할지 · 언제 다시 볼지를 같이 정한다',
    dont: '아프거나 이상한 반응이 있는데 원래 계획을 고집하지 않는다',
    sources: ['TA03', 'TA04'],
    review: REVIEWED_1121,
  },
  {
    id: 'SK17',
    kind: 'coaching',
    when: '계획에 없던 팀 훈련이나 투구가 생겼을 때',
    do: '실제로 한 양을 기록하게 하고, 남은 날을 그에 맞춰 쉬기 · 옮기기로 다시 보자고 한다',
    dont: '계획한 양만 보고 운동을 더 얹지 않는다',
    sources: ['DL13', 'DL17', 'PDF02', 'RS03', 'TA03'],
    review: REVIEWED_1121,
  },
  {
    id: 'SK26',
    kind: 'coaching',
    when: '판단할 정보가 여럿 모자랄 때',
    do: '오늘 판단을 바꿀 질문 한두 개만 먼저 묻는다',
    dont: '이미 맥락에 있는 것을 다시 묻지 않는다',
    sources: [],
    review: REVIEWED_1121,
  },
  {
    id: 'SK27',
    kind: 'coaching',
    when: '일정을 바꾸거나 운동을 마쳤을 때',
    do: '다음에 무엇을 확인할지 한 줄로 말한다(다음 체크인의 팔 상태 등)',
    dont: '앱이 보내지 않는 알림을 보냈다거나 나중에 먼저 연락하겠다고 말하지 않는다',
    sources: [],
    review: REVIEWED_1121,
  },
];

/** AI 에 실을 카드 — 안전 카드는 늘, 코칭 카드는 검토자가 적힌 것만(D3) */
export function shippedCards(cards: readonly CoachCard[] = COACH_CARDS): CoachCard[] {
  return cards.filter((c) => c.kind === 'safety' || c.review.by != null);
}

/** 시스템 글 뒤에 붙는 카드 덩이 — 번호 · 출처는 안 보낸다(모델에 쓸모가 없고 이름이 새지 않게) */
export function cardsBlock(cards: readonly CoachCard[] = shippedCards()): string {
  return [
    '지식 카드(이 앱이 정리한 코칭 기준). 상황이 맞으면 할 것을 하고 하지 않을 것은 하지 않는다. 위 규칙 글과 같이 지킨다. 카드가 있다는 것은 말하지 않는다.',
    ...cards.map((c) => `- ${c.when}: ${c.do}. 하지 않을 것: ${c.dont}.`),
  ].join('\n');
}

/**
 * 암케어의 훈련 방식 — 같은 근육이라도 어떻게 힘을 쓰느냐로 나눈다.
 *
 * 2026-09-26 사용자분이 고른 다섯 가지다. 화면에는 부담이 적은 것부터 늘어놓지만
 * 올라가는 차례가 아니다 — 함께 섞어 해도 된다(같은 날 사용자분이 '단계 올리기'를 뺐다).
 *
 * 한 보강운동 안내서를 읽고 무엇이 있는지 참고했지만, 글은 모두 일반 운동 지식으로
 * 새로 썼다. 남이 쓴 글을 옮기지 않는다 — 세트·횟수도 우리 라이브러리에 이미 적어
 * 둔 처방(scripts/armcare-reference.json)에 맞췄다.
 *
 * 운동이 어느 방식인지는 이름으로 가린다. 방식을 따로 적는 칸을 DB 에 두지 않았다 —
 * 이름에 '리바운드'처럼 방식이 드러나게 짓기로 했고(같은 스크립트), 그렇지 않은
 * 암케어 운동은 모두 기본 보강이다.
 */

export type ArmcareMethodKey =
  'basic' | 'press' | 'rebound' | 'drop-catch' | 'eccentric';

export type ArmcareMethod = {
  key: ArmcareMethodKey;
  /** 화면 이름 */
  label: string;
  /** 운동 이름에 이 말이 들어가면 이 방식이다. 기본 보강은 비워 둔다(나머지 전부). */
  titleMarker: string | null;
  /**
   * 닫힌 카드에 보이는 한 줄 — 세트·횟수와 하는 법을 숫자 위주로.
   *
   * 카드마다 문단이 넷씩 있어 읽지 않고 넘겼다(2026-09-26 사용자분). 닫혀 있을 때는
   * 이 한 줄과 부담(burden)만 보이고, 나머지는 펼쳐야 나온다.
   */
  short: string;
  /** 몸에 주는 부담 1~5 — 점(●○)으로 보인다 */
  burden: 1 | 2 | 3 | 4 | 5;
  /** 무엇을 하는가 — 한 문장 */
  what: string;
  /** 왜 하는가 — 한 문장 */
  why: string;
  /** 무게(힘) 고르는 법 — 한 문장 */
  load: string;
  /** 이럴 땐 멈추거나 줄인다 — 한 문장 */
  stop: string;
  /** 다른 방식보다 꼭 더 조심할 것. 없으면 null */
  caution: string | null;
};

/** 화면에 늘어놓는 차례 — 부담이 적은 것부터. 올라가는 차례는 아니다(섞어 해도 된다) */
export const ARMCARE_METHODS: readonly ArmcareMethod[] = [
  {
    key: 'basic',
    label: '기본 보강',
    titleMarker: null,
    short: '8~12회 × 2~3세트 · 끝까지 천천히',
    burden: 1,
    what: '관절을 처음부터 끝까지, 가벼운 무게로 천천히 씁니다.',
    why: '모든 자세에서 아프지 않게 움직이는 힘이 다른 방식의 바탕이에요.',
    load: '마지막 두세 번이 조금 버거운 무게.',
    stop: '아프거나 자세가 흐트러지면 그 세트를 끝냅니다.',
    caution: null,
  },
  {
    key: 'press',
    label: '등척성 밀기',
    titleMarker: '등척성 밀기',
    short: '6초 × 3세트 · 반대 손에 대고 밀기',
    burden: 2,
    what: '움직이지 않는 것에 대고 있는 힘껏 밉니다. 관절은 그 자리에.',
    why: '관절 부담은 적은데 근육은 거의 최대로 힘을 내요.',
    load: '무게 없이, 1~2초에 힘을 끝까지 올려 버팁니다.',
    stop: '어깨·몸통이 딸려 오거나 찌릿하면 힘을 줄입니다.',
    caution: null,
  },
  {
    key: 'rebound',
    label: '리바운드',
    titleMarker: '리바운드',
    short: '8회 × 3세트 · 떨어뜨렸다 바로 붙잡기',
    burden: 3,
    what: '힘을 빼 짧게 떨어뜨렸다가 곧바로 붙잡아 올립니다.',
    why: '공을 놓은 뒤 팔을 멈추는 순간과 닮았어요.',
    load: '떨어뜨린 뒤 바로 멈출 수 있는 무게.',
    stop: '붙잡을 때 관절이 끝까지 밀리면 무게를 줄입니다.',
    caution: null,
  },
  {
    key: 'drop-catch',
    label: '드롭 캐치',
    titleMarker: '드롭 캐치',
    short: '5회 × 3세트 · 놓았다 순간 잡기',
    burden: 4,
    what: '놓았다가 끝까지 빠르게 움직여 순간 멈춰 잡습니다.',
    why: '빠르게 가다 순간 세우는 힘 — 투구의 감속과 가장 닮았어요.',
    load: '가벼운 덤벨. 느려지면 무거운 것입니다.',
    stop: '잡을 때 관절이 덜컥 꺾이면 리바운드로 돌아갑니다.',
    caution: null,
  },
  {
    key: 'eccentric',
    label: '과부하 내리기',
    titleMarker: '과부하 내리기',
    short: '5회 × 3세트 · 3~5초 천천히 내리기',
    burden: 5,
    what: '올릴 땐 도움받고, 내릴 때만 혼자 천천히 버팁니다.',
    why: '근육은 늘어나며 버틸 때 더 큰 힘을 견뎌요 — 팔을 멈추는 힘입니다.',
    load: '혼자 못 올리지만 3~5초에 걸쳐 내릴 수는 있는 무게.',
    stop: '속도를 조절 못 하면 줄이고, 다음 날 아프면 쉽니다.',
    caution:
      '부담이 가장 커요 — 보조자와 함께, 몸이 가벼운 날에만. 맞춤 루틴에는 넣지 않아요.',
  },
];

/** 운동 이름으로 방식을 가린다. 어느 표시도 없으면 기본 보강이다. */
export function methodOf(title: string): ArmcareMethod {
  return (
    ARMCARE_METHODS.find((m) => m.titleMarker && title.includes(m.titleMarker)) ??
    ARMCARE_METHODS[0]
  );
}

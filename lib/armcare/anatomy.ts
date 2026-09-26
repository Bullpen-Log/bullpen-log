/**
 * 암케어의 부위와 근육.
 *
 * 트레이닝 암케어 화면의 두 기능이 함께 쓴다 — '부위별 보강'은 운동을 부위에
 * 나눠 담고, '오늘의 암케어'는 부위를 고르게 채운다. 운동마다 키우는 근육만
 * 적어 두고(ExerciseVideo.targetMuscles), 근육이 어느 부위에 속하는지와 부위의
 * 설명(던질 때 하는 일·흔한 부상)은 여기서 정한다. 운동은 늘고 바뀌어도
 * 해부학은 안 바뀐다.
 *
 * 부위는 2026-09-25 사용자분과 정했다 — 어깨 넷(후방·전방·상부·견갑), 팔꿈치
 * 넷(내측·외측·후방·전방). 처음 정한 팔꿈치는 셋이었는데, 근육 초안을 채워 보니
 * 컬 종류의 주 근육인 이두근이 갈 곳이 없어 '팔꿈치 전방'을 더했다(같은 날 정함).
 *
 * 부상 설명은 '이 부위에 흔한 부상'이지 '이 운동이 막아 주는 부상'이 아니다.
 * 운동이 부상을 막아 준다고 약속할 수는 없다 — 화면에서도 '예방에 도움'까지만
 * 말한다(목표 이름을 '부상 방지'에서 '컨디셔닝'으로 바꾼 것과 같은 까닭).
 */

/** 암케어 운동의 카테고리 이름 (lib/categories.ts 의 TRAINING_CATEGORIES 와 같다) */
export const ARMCARE_CATEGORY = '암케어';

export type ArmcareJoint = '어깨' | '팔꿈치';

export type ArmcareAreaKey =
  | 'shoulder-back'
  | 'shoulder-front'
  | 'shoulder-top'
  | 'scapula'
  | 'elbow-inner'
  | 'elbow-outer'
  | 'elbow-back'
  | 'elbow-front';

export type ArmcareArea = {
  key: ArmcareAreaKey;
  joint: ArmcareJoint;
  /** 화면 이름 — '어깨 후방' */
  label: string;
  /** 던질 때 이 부위가 하는 일 — 한 줄 */
  role: string;
  /** 이 부위에 흔한 부상. 앞의 것이 더 흔하거나 더 크다. */
  injuries: readonly { name: string; desc: string }[];
  /**
   * 알아 두기 — 부위별 보강에서 부위를 펼치면 나오는 한두 줄.
   *
   * 한 보강운동 안내서의 관절 설명을 읽고 어떤 내용이 쓸모 있는지 참고했지만,
   * 글은 일반 해부학·투구 지식으로 새로 썼다(2026-09-26). 부상을 막는다고
   * 약속하지 않는다 — 위의 부상 설명과 같은 규칙이다.
   */
  notes: readonly string[];
};

/** 화면에 늘어놓는 차례 그대로다 — 어깨 넷, 팔꿈치 넷 */
export const ARMCARE_AREAS: readonly ArmcareArea[] = [
  {
    key: 'shoulder-back',
    joint: '어깨',
    label: '어깨 후방',
    role: '공을 놓은 뒤 앞으로 뻗어 나가는 팔을 붙잡아 멈춰 세웁니다(감속).',
    injuries: [
      {
        name: '회전근개 손상',
        desc: '감속할 때마다 어깨 뒤쪽 힘줄이 늘어나며 버팁니다. 버티는 힘이 모자라면 힘줄에 무리가 쌓입니다.',
      },
      {
        name: '내부 충돌 · 관절순 손상',
        desc: '팔을 뒤로 크게 젖힐 때 힘줄과 관절 테두리(관절순)가 뼈 사이에 끼는 부상입니다.',
      },
      {
        name: '광배근 · 대원근 손상',
        desc: '공을 뿌리는 순간 크게 늘어났다가 세게 줄어들며 힘줄이 찢어지는 부상입니다. 드물지만 프로 투수에게 알려져 있습니다.',
      },
    ],
    notes: [
      '팔을 멈추는 일은 회전근개 혼자 하지 않습니다. 등(광배근)과 어깨 뒤쪽의 큰 근육, 몸통이 함께 나눠 받을수록 작은 회전근개가 덜 지칩니다.',
      '많이 던지는 팔은 어깨 뒤쪽이 뻣뻣해져 안으로 돌아가는 범위가 줄기 쉽습니다. 안팎으로 도는 범위를 합친 것까지 반대 팔보다 줄었다면 뒤쪽을 더 챙기라는 신호입니다.',
    ],
  },
  {
    key: 'shoulder-front',
    joint: '어깨',
    label: '어깨 전방',
    role: '팔을 안으로 돌려 공을 앞으로 뿌리고, 팔이 뒤로 젖혀질 때 어깨 앞을 막아 줍니다.',
    injuries: [
      {
        name: '앞쪽 어깨 불안정',
        desc: '팔을 뒤로 젖힐 때 어깨가 앞으로 빠질 것 같은 느낌이 드는 상태입니다.',
      },
      {
        name: '견갑하근 힘줄 손상',
        desc: '어깨 앞을 잡아 주는 힘줄이 반복해서 당겨지며 생깁니다.',
      },
    ],
    notes: [
      '안으로 돌리는 힘은 가슴·등의 큰 근육도 함께 내서 대개 모자라지 않습니다. 그래서 암케어는 바깥으로 돌리는 쪽(어깨 후방)을 조금 더 챙깁니다.',
      '견갑하근은 안으로 돌리는 근육 가운데 유일한 회전근개입니다. 힘을 내는 것보다, 팔이 뒤로 젖혀진 순간 위팔뼈가 앞으로 밀려 나가지 않게 붙잡는 일이 더 중요합니다.',
    ],
  },
  {
    key: 'shoulder-top',
    joint: '어깨',
    label: '어깨 상부',
    role: '팔을 들어 올릴 때 위팔뼈를 관절 가운데에 붙잡아 둡니다.',
    injuries: [
      {
        name: '극상근 힘줄염',
        desc: '어깨 위쪽 힘줄에 염증이 생겨 팔을 들 때 아픕니다.',
      },
      {
        name: '어깨 충돌 증후군',
        desc: '팔을 들 때 어깨 위쪽 힘줄이 뼈에 찝히는 상태입니다.',
      },
    ],
    notes: [
      '팔을 들 때 삼각근은 위팔뼈를 위로 끌어올리고, 극상근은 그 뼈를 관절 가운데로 눌러 줍니다. 극상근이 약하거나 지치면 뼈가 위로 떠서 어깨 위쪽이 끼기 쉽습니다.',
    ],
  },
  {
    key: 'scapula',
    joint: '어깨',
    label: '견갑',
    role: '날개뼈를 갈비뼈에 붙이고 팔을 따라 돌려, 어깨가 움직일 바탕을 만듭니다.',
    injuries: [
      {
        name: '견갑 운동 이상',
        desc: '날개뼈가 들뜨거나 팔보다 늦게 따라오는 상태입니다. 어깨 충돌과 관절순 손상의 바탕이 됩니다.',
      },
    ],
    notes: [
      '팔을 머리 위로 올리면 날개뼈도 따라 위로 돌아가야 합니다. 이 돌림은 전거근과 승모근이 함께 만들고, 날개뼈가 늦게 따라오면 어깨 위쪽 공간이 좁아집니다.',
      '던질 때 날개뼈는 팔이 뒤로 젖혀지며 등 쪽으로 모였다가, 공을 놓은 뒤 가슴 쪽으로 감싸며 나갑니다. 모으는 힘(능형근·중부 승모근)과 내미는 힘(전거근)이 둘 다 있어야 합니다.',
    ],
  },
  {
    key: 'elbow-inner',
    joint: '팔꿈치',
    label: '팔꿈치 내측',
    role: '공을 던질 때 팔꿈치 안쪽이 벌어지려는 힘을 인대와 함께 버팁니다.',
    injuries: [
      {
        name: '내측 측부인대(UCL) 손상',
        desc: '토미존 수술로 이어지는 부상입니다. 안쪽 근육이 힘을 나눠 받으면 인대의 부담이 줄어듭니다.',
      },
      {
        name: '내측 상과염 · 굴곡-회내근 손상',
        desc: '팔꿈치 안쪽 뼈에 붙는 힘줄과 근육이 당겨져 아픕니다.',
      },
      {
        name: '리틀리그 엘보',
        desc: '성장기에 팔꿈치 안쪽 성장판이 벌어지는 부상입니다. 투구 수 관리가 먼저입니다.',
      },
    ],
    notes: [
      '안쪽 근육(손목 굴곡근·손가락 굴곡근·원회내근)은 인대 바로 위를 지나며, 던질 때 벌어지는 힘을 함께 받습니다. 그중 가장 많이 돕는 것이 척측 수근굴근(손목 굴곡근의 하나), 그다음이 얕은 손가락 굴곡근입니다. 이 근육들이 지치면 그만큼이 인대로 넘어갑니다 — 많이 던질수록 안쪽 부담이 커지는 까닭입니다.',
      '공을 놓은 뒤에는 어떤 구종이든 아래팔이 안으로 돌며 마무리됩니다. 체인지업·싱커처럼 손목을 안쪽으로 틀어 던지는 공을 많이 쓴다면 안으로 돌리는 근육(원회내근)을 더 챙겨 두면 좋습니다.',
    ],
  },
  {
    key: 'elbow-outer',
    joint: '팔꿈치',
    label: '팔꿈치 외측',
    role: '손목을 젖히고 아래팔을 바깥으로 돌립니다. 안쪽 근육과 짝을 이뤄 손목과 팔꿈치를 고르게 잡아 줍니다.',
    injuries: [
      {
        name: '외측 상과염',
        desc: '팔꿈치 바깥쪽 뼈에 붙는 힘줄이 아픈 상태입니다.',
      },
      {
        name: '팔꿈치 바깥쪽 연골 손상',
        desc: '성장기에 던질 때 바깥쪽이 눌려 생깁니다(박리성 골연골염). 근력보다 투구 수 관리가 먼저입니다.',
      },
    ],
    notes: [
      '커브는 공을 놓는 순간 아래팔을 바깥으로 돌린 채 던집니다. 커브를 자주 던진다면 바깥으로 돌리는 근육(회외근·완요골근)도 함께 키워 두면 좋습니다.',
    ],
  },
  {
    key: 'elbow-back',
    joint: '팔꿈치',
    label: '팔꿈치 후방',
    role: '팔꿈치를 펴서 공을 앞으로 뿌리는 마지막 힘을 보탭니다.',
    injuries: [
      {
        name: '후방 충돌',
        desc: '팔꿈치가 끝까지 펴질 때 뒤쪽 뼈끼리 부딪히는 부상입니다.',
      },
      {
        name: '삼두근 힘줄염 · 주두 피로골절',
        desc: '팔꿈치 뒤쪽 힘줄과 뼈에 되풀이된 부담이 쌓여 생깁니다.',
      },
    ],
    notes: [
      '팔꿈치 안쪽이 벌어진 채 끝까지 펴지면 뒤쪽 뼈끼리 부딪힙니다. 그래서 뒤쪽 통증이 안쪽 인대가 느슨해졌다는 신호일 때도 있어, 오래가면 진료를 받아 보는 게 좋습니다.',
    ],
  },
  {
    key: 'elbow-front',
    joint: '팔꿈치',
    label: '팔꿈치 전방',
    role: '공을 놓은 뒤 팔꿈치가 끝까지 펴지는 것을 붙잡아 멈춰 세웁니다(감속).',
    injuries: [
      {
        name: '이두근 힘줄염',
        desc: '어깨 앞쪽이나 팔꿈치 앞쪽의 이두근 힘줄이 아픈 상태입니다.',
      },
    ],
    notes: [
      '공을 놓은 뒤 팔꿈치가 펴지는 빠르기를 이두근 쪽 근육이 늦춰 줍니다. 근육이 늘어나며 버티는 일이라, 들어 올리는 힘보다 천천히 내리며 버티는 힘을 키우는 편이 쓸모 있습니다(훈련 방식의 과부하 내리기).',
    ],
  },
];

/**
 * 근육 목록 — 운동에 적는 이름은 이 안에서만 쓴다.
 *
 * 부위 차례대로 늘어놓는다. 관리자 화면의 고르개도 이 차례로 그린다.
 *
 *   does   그 근육이 하는 일 한 줄 — 부위별 보강 화면에 그대로 나간다
 *   helps  그 근육을 키우면 예방에 도움이 된다고 말할 수 있는 부상. 없으면 null
 *
 * helps 는 부위의 흔한 부상과 따로 둔다. 처음에는 부위의 첫 부상을 그대로 붙였더니
 * 푸시다운에 '삼두근 → 후방 충돌 예방에 도움', 해머컬에 '→ 외측 상과염 예방에
 * 도움'이 붙었다. 후방 충돌은 팔꿈치를 세게 펴다 생기는데 그 힘을 내는 것이
 * 삼두근이고, 완요골근은 외측 상과염이 생기는 손목 폄근 자리와 상관이 없다.
 * 근거가 분명한 것만 적고, 나머지(삼두근·이두근·완요골근·중간 삼각근·후면
 * 삼각근·회외근)는 근육 이름만 보여 준다.
 *
 * 2026-09-26 여섯을 더했다(사용자분 요청으로 부상 예방 기준 다시 검토).
 *   얕은 손가락 굴곡근  팔꿈치 안쪽 인대를 근육 쪽에서 받치는 힘이 척측 수근굴근
 *                      다음으로 크다는 연구가 있어 helps 를 적는다
 *   광배근 · 대원근     공을 뿌리고 멈출 때 크게 쓰이고, 프로 투수에게 이 둘이 찢어지는
 *                      부상이 보고돼 있다. 키우면 막는다는 근거는 없어 helps 는 비운다
 *   깊은 손가락 굴곡근 · 상완근 · 주근
 *                      예방 근거는 약하지만 악력·팔꿈치 감속·팔꿈치 뒤 안정을 맡는다
 */
export const ARMCARE_MUSCLES = [
  {
    name: '극하근',
    area: 'shoulder-back',
    does: '팔을 바깥으로 돌림 · 감속',
    helps: '회전근개 손상',
  },
  {
    name: '소원근',
    area: 'shoulder-back',
    does: '팔을 바깥으로 돌림 · 감속',
    helps: '회전근개 손상',
  },
  {
    name: '후면 삼각근',
    area: 'shoulder-back',
    does: '팔을 뒤로 당김 · 감속을 거듦',
    helps: null,
  },
  {
    name: '광배근',
    area: 'shoulder-back',
    does: '팔을 안으로 돌리며 끌어내림 · 감속을 거듦',
    helps: null,
  },
  {
    name: '대원근',
    area: 'shoulder-back',
    does: '광배근과 함께 팔을 안으로 돌리고 끌어내림',
    helps: null,
  },
  {
    name: '견갑하근',
    area: 'shoulder-front',
    does: '팔을 안으로 돌림 · 어깨 앞을 막음',
    helps: '앞쪽 어깨 불안정',
  },
  {
    name: '극상근',
    area: 'shoulder-top',
    does: '팔을 들기 시작함 · 위팔뼈를 붙잡음',
    helps: '극상근 힘줄염',
  },
  { name: '중간 삼각근', area: 'shoulder-top', does: '팔을 옆으로 들어 올림', helps: null },
  {
    name: '전거근',
    area: 'scapula',
    does: '날개뼈를 갈비뼈에 붙이고 위로 돌림',
    helps: '견갑 운동 이상',
  },
  {
    name: '중부 승모근',
    area: 'scapula',
    does: '날개뼈를 등 가운데로 모음',
    helps: '견갑 운동 이상',
  },
  {
    name: '하부 승모근',
    area: 'scapula',
    does: '날개뼈를 아래로 당기며 위로 돌림',
    helps: '견갑 운동 이상',
  },
  {
    name: '능형근',
    area: 'scapula',
    does: '날개뼈를 모으고 감속 때 버팀',
    helps: '견갑 운동 이상',
  },
  {
    name: '손목 굴곡근',
    area: 'elbow-inner',
    does: '손목·손가락을 굽힘 · 팔꿈치 안쪽을 받침',
    helps: '내측 측부인대(UCL) 손상',
  },
  {
    name: '얕은 손가락 굴곡근',
    area: 'elbow-inner',
    does: '손가락을 굽혀 쥠 · 팔꿈치 안쪽을 받침',
    helps: '내측 측부인대(UCL) 손상',
  },
  {
    name: '깊은 손가락 굴곡근',
    area: 'elbow-inner',
    does: '손가락 끝까지 굽혀 쥠 · 악력',
    helps: null,
  },
  {
    name: '원회내근',
    area: 'elbow-inner',
    does: '아래팔을 안으로 돌림',
    helps: '내측 측부인대(UCL) 손상',
  },
  { name: '손목 신전근', area: 'elbow-outer', does: '손목을 젖힘', helps: '외측 상과염' },
  { name: '회외근', area: 'elbow-outer', does: '아래팔을 바깥으로 돌림', helps: null },
  {
    name: '완요골근',
    area: 'elbow-outer',
    does: '엄지를 위로 한 채 팔꿈치를 굽힘',
    helps: null,
  },
  { name: '삼두근', area: 'elbow-back', does: '팔꿈치를 폄', helps: null },
  {
    name: '주근',
    area: 'elbow-back',
    does: '팔꿈치 펴기를 도움 · 팔꿈치 뒤 바깥을 잡아 줌',
    helps: null,
  },
  {
    name: '이두근',
    area: 'elbow-front',
    does: '팔꿈치를 굽힘 · 펴지는 팔꿈치를 감속',
    helps: null,
  },
  {
    name: '상완근',
    area: 'elbow-front',
    does: '팔꿈치를 굽힘 · 펴지는 팔꿈치를 감속',
    helps: null,
  },
] as const satisfies readonly {
  name: string;
  area: ArmcareAreaKey;
  does: string;
  helps: string | null;
}[];

export type ArmcareMuscle = (typeof ARMCARE_MUSCLES)[number]['name'];

export const ARMCARE_MUSCLE_NAMES: readonly string[] = ARMCARE_MUSCLES.map(
  (m) => m.name
);

const AREA_BY_KEY = new Map(ARMCARE_AREAS.map((a) => [a.key, a]));
const MUSCLE_BY_NAME = new Map<string, (typeof ARMCARE_MUSCLES)[number]>(
  ARMCARE_MUSCLES.map((m) => [m.name, m])
);

/* 근육마다 부위가 목록에 있어야 한다. 어긋나면 그 근육의 운동이 어디에도 안 나온다. */
for (const m of ARMCARE_MUSCLES) {
  if (!AREA_BY_KEY.has(m.area)) throw new Error(`부위가 없는 근육: ${m.name}`);
}

export function findArmcareArea(key: string | null | undefined): ArmcareArea | null {
  return key ? (AREA_BY_KEY.get(key as ArmcareAreaKey) ?? null) : null;
}

/** 그 근육이 하는 일 — 목록에 없는 이름이면 null */
export function muscleInfo(name: string) {
  return MUSCLE_BY_NAME.get(name) ?? null;
}

/** 근육이 속한 부위. 목록에 없는 이름이면 null */
export function areaOfMuscle(name: string): ArmcareArea | null {
  const muscle = MUSCLE_BY_NAME.get(name);
  return muscle ? (AREA_BY_KEY.get(muscle.area) ?? null) : null;
}

/**
 * 운동이 닿는 부위들 — 겹치지 않게, ARMCARE_AREAS 의 차례로.
 *
 * 하프닐링 외회전 90도처럼 어깨 후방(극하근)과 견갑(하부 승모근)을 함께 쓰는
 * 운동은 두 부위 모두에 나온다. 어느 쪽이 주인지는 primaryArea 가 말한다.
 */
export function areasOf(muscles: readonly string[]): ArmcareArea[] {
  const keys = new Set(
    muscles.map((m) => MUSCLE_BY_NAME.get(m)?.area).filter((k) => k != null)
  );
  return ARMCARE_AREAS.filter((a) => keys.has(a.key));
}

/**
 * 운동이 주로 키우는 부위 — 맨 앞에 적힌(가장 크게 쓰는) 근육의 부위.
 *
 * 근육은 크게 쓰는 차례로 적는다(ExerciseVideo.targetMuscles). 오늘의 암케어가
 * 부위마다 운동을 고를 때 이 값을 본다 — T 레이즈는 후면 삼각근도 쓰지만
 * 날개뼈를 모으는 운동이라, 어깨 후방 자리에 들어가면 외회전이 빠진다.
 */
export function primaryArea(muscles: readonly string[]): ArmcareArea | null {
  for (const m of muscles) {
    const area = areaOfMuscle(m);
    if (area) return area;
  }
  return null;
}

/**
 * 폼·스크립트에서 온 근육 이름을 거른다 — 목록에 없는 것은 버리고, 겹치면 앞의
 * 것만 남기고, 적힌 차례는 지킨다(맨 앞이 가장 크게 쓰는 근육이라서).
 *
 * lib/exercise-meta.ts 의 pickMany 는 목록 차례로 다시 늘어놓아 쓸 수 없다 — 그러면
 * T 레이즈의 '중부 승모근'이 '후면 삼각근' 뒤로 밀려 주 부위가 바뀐다.
 */
export function cleanTargetMuscles(values: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const name = v.trim();
    if (MUSCLE_BY_NAME.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * '극하근 · 소원근 → 회전근개 손상 예방에 도움' 처럼 운동 하나를 한 줄로.
 *
 * 부상은 주 근육(맨 앞)의 helps 하나만 적는다. 두세 개를 늘어놓으면 줄이 길어지고,
 * 그만큼 약속처럼 읽힌다. 주 근육에 helps 가 없으면 근육 이름만 보여 준다 —
 * 푸시다운·컬에 없는 효과를 붙이지 않는다(ARMCARE_MUSCLES 의 설명).
 */
export function helpsLine(muscles: readonly string[]): string | null {
  const known = muscles.filter((m) => MUSCLE_BY_NAME.has(m));
  if (known.length === 0) return null;
  const helps = MUSCLE_BY_NAME.get(known[0])?.helps;
  return helps ? `${known.join(' · ')} → ${helps} 예방에 도움` : known.join(' · ');
}

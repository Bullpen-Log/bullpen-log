/**
 * 암케어의 부위와 근육.
 *
 * 트레이닝 암케어 화면의 두 기능이 함께 쓴다 — '부위별 보강'은 운동을 부위에
 * 나눠 담고, '오늘의 암케어'는 부위를 고르게 채운다. 운동마다 키우는 근육만
 * 적어 두고(ExerciseVideo.targetMuscles), 근육이 어느 부위에 속하는지와 부위의
 * 설명(흔한 부상·알아 두기)은 여기서 정한다('자세히 보기' 창의 긴 글은 details.ts).
 * 운동은 늘고 바뀌어도 해부학은 안 바뀐다.
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
  /**
   * 부위의 색 — 부위 단추 · 부위 카드 · 근육 칩의 점이 같은 색을 쓴다. 3D 근육 지도는
   * 쓰지 않는다 — 여덟 색을 다 칠하니 고른 근육이 구별되지 않았다(muscle-map-3d.tsx).
   *
   * 글을 읽지 않아도 색만 보고 어디 운동인지 알게 하려는 것이다(2026-09-26 사용자분:
   * 화면에 글이 많으면 읽지 않고 포기한다). 어깨는 차가운 색, 팔꿈치는 따뜻한 색.
   */
  color: string;
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
    color: '#3b82f6',
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
      '많이 던지는 팔은 바깥으로는 더 돌고 안으로는 덜 도는 쪽으로 바뀌기 쉽습니다. 어릴 때부터 던지며 위팔뼈가 뒤로 조금 비틀린 채 자란 것과, 감속을 되풀이하며 뒤쪽 근육·관절주머니가 굳은 것이 겹친 결과입니다. 안팎으로 도는 범위를 합친 것이 반대 팔과 비슷하면 대개 괜찮고, 합친 것까지 줄었다면 뒤쪽을 더 챙기라는 신호입니다.',
      '팔이 가장 뒤로 젖혀지는 순간(레이백)은 어깨 관절이 바깥으로 도는 것만으로 만들어지지 않습니다. 날개뼈가 뒤로 기울며 위로 돌고, 등(흉추)이 젖혀지는 움직임이 함께 더해집니다. 어깨만 억지로 더 돌리기보다 셋이 함께 움직이게 하는 편이 어깨 부담이 덜합니다.',
    ],
  },
  {
    key: 'shoulder-front',
    joint: '어깨',
    label: '어깨 전방',
    color: '#8b5cf6',
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
      '팔이 안으로 도는 범위는 어깨 관절만으로 정해지지 않습니다. 날개뼈와 가슴우리(흉곽)도 함께 움직여 줘야, 공을 놓은 뒤 팔이 몸을 감싸며 부드럽게 감속됩니다.',
    ],
  },
  {
    key: 'shoulder-top',
    joint: '어깨',
    label: '어깨 상부',
    color: '#06b6d4',
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
      '팔을 머리 위로 귀 옆까지 곧게 올릴 수 있어야 던질 때 팔이 무리 없이 젖혀집니다. 광배근이 짧게 굳으면 이 범위가 막히기 쉽습니다. 다만 스스로 버티지 못하는 끝 범위까지 억지로 늘리는 것은 오히려 위험합니다.',
    ],
  },
  {
    key: 'scapula',
    joint: '어깨',
    label: '견갑',
    color: '#10b981',
    injuries: [
      {
        name: '견갑 운동 이상',
        desc: '날개뼈가 들뜨거나 팔보다 늦게 따라오는 상태입니다. 어깨 충돌과 관절순 손상의 바탕이 됩니다.',
      },
    ],
    notes: [
      '팔을 머리 위로 올리면 날개뼈도 따라 위로 돌아가야 합니다. 이 돌림은 전거근과 승모근이 함께 만들고, 날개뼈가 늦게 따라오면 어깨 위쪽 공간이 좁아집니다.',
      '던질 때 날개뼈는 팔이 뒤로 젖혀지며 등 쪽으로 모였다가, 공을 놓은 뒤 가슴 쪽으로 감싸며 나갑니다. 모으는 힘(능형근·중부 승모근)과 내미는 힘(전거근)이 둘 다 있어야 합니다.',
      '던질 때 날개뼈가 등 쪽으로 모이는 것은 몸통이 돌면서 저절로 생기는 움직임입니다. 던지는 도중에 일부러 날개뼈를 꽉 모으려 하면 흐름이 끊기기 쉽습니다 — 모으는 힘은 운동으로 키워 두고, 던질 때는 몸에 맡깁니다.',
      '팔을 높이 들어 던질 때 날개뼈가 위로 도는 범위는 오버헤드 프레스 같은 웨이트에서 쓰는 범위보다 훨씬 큽니다. 일반 웨이트만으로는 이 끝 범위를 잘 쓰지 않으니 따로 챙깁니다.',
    ],
  },
  {
    key: 'elbow-inner',
    joint: '팔꿈치',
    label: '팔꿈치 내측',
    color: '#f97316',
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
      '공을 놓은 뒤에는 어떤 구종이든 아래팔이 안으로 돌며 마무리되고, 이 돌림이 어깨의 안쪽 돌림과 함께 팔을 감속합니다. 오래 던진 투수는 안으로 돌리는 범위와 힘이 줄기 쉽습니다. 체인지업·싱커(투심)처럼 손목을 안쪽으로 틀어 던지는 공을 많이 쓰거나 팔꿈치가 불편했던 적이 있다면, 안으로 돌리는 근육(원회내근)을 더 챙겨 두면 좋습니다.',
      '감속을 큰 근육(광배근·어깨 뒤쪽)이 잘 받아 줄수록 아래팔 근육에 오는 부담이 줄고, 그만큼 안쪽 인대도 덜 받습니다. 팔꿈치를 챙기는 일은 어깨·등을 챙기는 일과 이어져 있습니다.',
    ],
  },
  {
    key: 'elbow-outer',
    joint: '팔꿈치',
    label: '팔꿈치 외측',
    color: '#eab308',
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
      '공을 글러브에서 빼는 순간부터 공을 놓기 직전까지 아래팔은 바깥으로 돌아 있습니다(어깨가 바깥으로 도는 것과 함께). 커터·슬라이더·커브는 이 상태로 공을 놓고, 직구를 이 상태로 놓으면 공이 옆으로 휘기 쉽습니다. 커브·슬라이더를 자주 던진다면 바깥으로 돌리는 근육(회외근·완요골근)도 함께 키워 두면 좋습니다.',
    ],
  },
  {
    key: 'elbow-back',
    joint: '팔꿈치',
    label: '팔꿈치 후방',
    color: '#ec4899',
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
      '오래 던진 투수는 팔꿈치가 끝까지 안 펴지고 몇 도 굽은 채 남는 경우가 흔합니다. 아프지 않으면 대개 괜찮지만, 갑자기 더 줄거나 걸리는 느낌이 들면 진료를 받아 보세요.',
    ],
  },
  {
    key: 'elbow-front',
    joint: '팔꿈치',
    label: '팔꿈치 전방',
    color: '#ef4444',
    injuries: [
      {
        name: '이두근 힘줄염',
        desc: '어깨 앞쪽이나 팔꿈치 앞쪽의 이두근 힘줄이 아픈 상태입니다.',
      },
    ],
    notes: [
      '공을 놓은 뒤 팔꿈치가 펴지는 빠르기를 이두근 쪽 근육이 늦춰 줍니다. 근육이 늘어나며 버티는 일이라, 들어 올리는 힘보다 천천히 내리며 버티는 힘을 키우는 편이 쓸모 있습니다(훈련 방식의 과부하 내리기).',
      '앞발이 땅에 닿을 때 던지는 팔의 팔꿈치는 보통 90도 안팎으로 굽어 있습니다. 팔꿈치를 편하게 굽히고 펴는 범위와 그 안정감을 지켜 두는 것이 팔꿈치 건강의 바탕입니다.',
    ],
  },
];

/**
 * 근육 목록 — 운동에 적는 이름은 이 안에서만 쓴다.
 *
 * 부위 차례대로 늘어놓는다. 관리자 화면의 고르개도 이 차례로 그린다.
 *
 *   does   그 근육이 하는 일 한 줄 — 부위별 보강 화면에 그대로 나간다
 *   at     붙는 곳(시작 → 끝) — 3D 근육 지도에서 근육을 고르면 나온다(2026-09-26)
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
    at: '날개뼈 뒤쪽 아래의 넓은 면 → 위팔뼈 머리 뒤쪽',
    helps: '회전근개 손상',
  },
  {
    name: '소원근',
    area: 'shoulder-back',
    does: '팔을 바깥으로 돌림 · 감속',
    at: '날개뼈 바깥쪽 가장자리 → 위팔뼈 머리 뒤쪽 아래',
    helps: '회전근개 손상',
  },
  {
    name: '후면 삼각근',
    area: 'shoulder-back',
    does: '팔을 뒤로 당김 · 감속을 거듦',
    at: '날개뼈 가시(견갑극) → 위팔뼈 바깥쪽 가운데',
    helps: null,
  },
  {
    name: '광배근',
    area: 'shoulder-back',
    does: '팔을 안으로 돌리며 끌어내림 · 감속을 거듦',
    at: '등 아래·허리 척추와 골반 위 → 위팔뼈 앞쪽 위',
    helps: null,
  },
  {
    name: '대원근',
    area: 'shoulder-back',
    does: '광배근과 함께 팔을 안으로 돌리고 끌어내림',
    at: '날개뼈 아래 모서리 → 위팔뼈 앞쪽 위',
    helps: null,
  },
  {
    name: '견갑하근',
    area: 'shoulder-front',
    does: '팔을 안으로 돌림 · 어깨 앞을 막음',
    at: '날개뼈 앞면(갈비뼈 쪽) → 위팔뼈 머리 앞쪽',
    helps: '앞쪽 어깨 불안정',
  },
  {
    name: '극상근',
    area: 'shoulder-top',
    does: '팔을 들기 시작함 · 위팔뼈를 붙잡음',
    at: '날개뼈 가시 위쪽 오목한 곳 → 위팔뼈 머리 꼭대기',
    helps: '극상근 힘줄염',
  },
  {
    name: '중간 삼각근',
    area: 'shoulder-top',
    does: '팔을 옆으로 들어 올림',
    at: '어깨 끝 뼈(견봉) → 위팔뼈 바깥쪽 가운데',
    helps: null,
  },
  {
    name: '전거근',
    area: 'scapula',
    does: '날개뼈를 갈비뼈에 붙이고 위로 돌림',
    at: '옆구리 위쪽 갈비뼈 여러 개 → 날개뼈 안쪽 가장자리(앞면)',
    helps: '견갑 운동 이상',
  },
  {
    name: '중부 승모근',
    area: 'scapula',
    does: '날개뼈를 등 가운데로 모음',
    at: '등 위쪽 척추 → 어깨 끝 뼈와 날개뼈 가시',
    helps: '견갑 운동 이상',
  },
  {
    name: '하부 승모근',
    area: 'scapula',
    does: '날개뼈를 아래로 당기며 위로 돌림',
    at: '등 가운데 척추 → 날개뼈 가시 안쪽 끝',
    helps: '견갑 운동 이상',
  },
  {
    name: '능형근',
    area: 'scapula',
    does: '날개뼈를 모으고 감속 때 버팀',
    at: '목 아래~등 위쪽 척추 → 날개뼈 안쪽 가장자리',
    helps: '견갑 운동 이상',
  },
  {
    name: '손목 굴곡근',
    area: 'elbow-inner',
    does: '손목·손가락을 굽힘 · 팔꿈치 안쪽을 받침',
    at: '팔꿈치 안쪽 뼈(내측 상과) → 손목·손바닥 쪽 뼈',
    helps: '내측 측부인대(UCL) 손상',
  },
  {
    name: '얕은 손가락 굴곡근',
    area: 'elbow-inner',
    does: '손가락을 굽혀 쥠 · 팔꿈치 안쪽을 받침',
    at: '팔꿈치 안쪽 뼈(내측 상과)와 아래팔 뼈 → 검지~새끼 가운데 마디',
    helps: '내측 측부인대(UCL) 손상',
  },
  {
    name: '깊은 손가락 굴곡근',
    area: 'elbow-inner',
    does: '손가락 끝까지 굽혀 쥠 · 악력',
    at: '아래팔 안쪽 뼈(척골) 앞면 → 검지~새끼 끝마디',
    helps: null,
  },
  {
    name: '원회내근',
    area: 'elbow-inner',
    does: '아래팔을 안으로 돌림',
    at: '팔꿈치 안쪽 뼈(내측 상과) → 아래팔 바깥쪽 뼈(요골) 가운데',
    helps: '내측 측부인대(UCL) 손상',
  },
  {
    name: '손목 신전근',
    area: 'elbow-outer',
    does: '손목을 젖힘',
    at: '팔꿈치 바깥쪽 뼈(외측 상과) → 손등 쪽 뼈',
    helps: '외측 상과염',
  },
  {
    name: '회외근',
    area: 'elbow-outer',
    does: '아래팔을 바깥으로 돌림',
    at: '팔꿈치 바깥쪽 뼈 → 아래팔 바깥쪽 뼈(요골) 위쪽',
    helps: null,
  },
  {
    name: '완요골근',
    area: 'elbow-outer',
    does: '엄지를 위로 한 채 팔꿈치를 굽힘',
    at: '위팔뼈 바깥쪽 아래 → 손목 엄지 쪽(요골 끝)',
    helps: null,
  },
  {
    name: '삼두근',
    area: 'elbow-back',
    does: '팔꿈치를 폄',
    at: '날개뼈 · 위팔뼈 뒤쪽 → 팔꿈치 끝 뼈(주두)',
    helps: null,
  },
  {
    name: '주근',
    area: 'elbow-back',
    does: '팔꿈치 펴기를 도움 · 팔꿈치 뒤 바깥을 잡아 줌',
    at: '팔꿈치 바깥쪽 뼈(외측 상과) → 팔꿈치 끝 뼈 바깥쪽',
    helps: null,
  },
  {
    name: '이두근',
    area: 'elbow-front',
    does: '팔꿈치를 굽힘 · 펴지는 팔꿈치를 감속',
    at: '날개뼈 두 곳 → 아래팔 바깥쪽 뼈(요골) 위쪽',
    helps: null,
  },
  {
    name: '상완근',
    area: 'elbow-front',
    does: '팔꿈치를 굽힘 · 펴지는 팔꿈치를 감속',
    at: '위팔뼈 앞쪽 아래 절반 → 아래팔 안쪽 뼈(척골) 위쪽',
    helps: null,
  },
] as const satisfies readonly {
  name: string;
  area: ArmcareAreaKey;
  does: string;
  at: string;
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

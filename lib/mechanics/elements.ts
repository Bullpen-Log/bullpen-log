/**
 * 투구 메커니즘의 여섯 요소 — 설명글 · 증상 · 느낌 신호.
 *
 * 2026-10-04 사용자분: "설명글 같은 정보는 드라이브라인 · 트레드 애슬레틱스를 바탕으로, 다른 곳은 참고하지 말고." 그래서 처음
 * 초안(docs/mechanics/explanations-draft.md)을 걷어 내고 아래 두 곳의 글만으로 다시 썼다. 문장을 옮기지 않고 뜻만 풀었다.
 * 글을 고칠 때도 이 두 곳에 있는 것만 쓴다. 요소마다 어느 글에서 왔는지 [D·] [T·] 로 적어 둔다.
 *
 * Driveline Baseball
 *  [D1] How We Interpret Biomechanics Reports (2019) — 여섯 묶음, 골반 → 몸통 → 팔 차례, 팔꿈치 높이 · 견갑 당김
 *       https://www.drivelinebaseball.com/2019/03/interpret-biomechanics-reports/
 *  [D2] The Pitching Hierarchy of Needs (2024) — 손질은 구속과 관계가 큰 것부터(무게중심 속도 > 앞다리 블록), 판정은 구속으로
 *       https://www.drivelinebaseball.com/2024/07/the-pitching-hierarchy-of-needs/
 *  [D3] A Quantitative Analysis of the Lead Leg Block (2022) — 착지 뒤 앞무릎 펴짐 · 몸의 감속이 구속과 관계, 착지 자세는 약함
 *       https://www.drivelinebaseball.com/2022/10/a-quantitative-analysis-of-the-lead-leg-block-and-its-contributions-to-velocity/
 *  [D4] Efficient Front Leg Mechanics that Lead to High Velocity (2015) — 앞다리는 브레이크
 *       https://www.drivelinebaseball.com/2015/12/efficient-front-leg-mechanics-that-lead-to-high-velocity/
 *  [D5] Dillon Tate: Utilizing Biomechanics for Player Development (2022) — 몸통이 일찍 열리면 견갑 당김 · 레이백이 준다
 *       https://www.drivelinebaseball.com/2022/03/dillon-tate-using-biomechanics-for-player-development/
 *  [D6] Changing Shoulder Abduction (2018) — 팔꿈치는 어깨 높이, 치솟음은 뒤에서 찍어 본다
 *       https://www.drivelinebaseball.com/2018/12/changing-shoulder-abduction/
 *  [D7] Why We Don't Teach Equal and Opposite (or Firm Front Side) (2013) — 글러브 팔로 막지 않는다
 *       https://drivelinebaseball.com/2013/10/dont-teach-equal-opposite-firm-front-side
 *  [D8] Youth Baseball Pitching Mechanics Analysis Across Age Groups (2022) — 성장기는 몸이 먼저, 어른 자세를 억지로 맞추지 않는다
 *       https://www.drivelinebaseball.com/2022/01/youth-baseball-pitching-mechanics-analysis-across-age-groups/
 *  [D9] Driveline Plyo Ball Routine (2017) — 드릴은 전력이 아니라 그날 정한 세기로, 던지는 날 맨 앞에
 *       https://www.drivelinebaseball.com/2017/12/plyo-velocity-weighted-balls-replication/
 *
 * Tread Athletics
 *  [T1] The "Drift" — 다리를 드는 동안 무게중심이 앞으로, 옆에서 찍어야 보인다
 *       https://treadathletics.com/the-drift/
 *  [T2] Problem Solving Your Lower Half Pitching Mechanics — 뒷다리는 엉덩이로, 투구판을 끌어당긴다
 *       https://treadathletics.com/back-leg-mechanics/
 *  [T3] "Using Your Legs" — 뒷다리 힘은 천천히 쌓고, 펄쩍 뛰어나가면 공에 덜 실린다. 앞다리는 펴지게 당겨진다
 *       https://treadathletics.com/energy-flow/
 *  [T4] The 3 Types of "Muscling Up" — 뒷엉덩이 · 허리 · 팔의 힘을 뺀다
 *       https://treadathletics.com/muscling-up/
 *  [T5] How to Sync the Arm into the Plane of Shoulder Rotation — 팔은 어깨가 도는 면에, 허리를 꺾어 놓으면 밀려 나간다
 *       https://treadathletics.com/plane-of-rotation/
 *  [T6] How to Fix a Pushing Arm Action — 밀어 던지기와 그 까닭(일찍 열림 등)
 *       https://treadathletics.com/7-causes-of-pushing/
 *  [T7] Fixing a Late Arm (PDF) — 앞발이 닿을 때의 팔, 느린 동작 → 50~60% → 60~75%, 드릴 2×8
 *       https://treadathletics.com/wp-content/uploads/2020/12/Late-Arm-Drill-Progression-PDF.pdf
 *  [T8] Do Different Arm Slots = Different Mechanics? — 팔 높이는 옆 기울기, 앞 기울기는 팔 높이와 상관없이 비슷
 *       https://treadathletics.com/arm-slot-differences/
 *
 * 화면(app/(app)/training/mechanics-*.tsx)은 겉에 이름 · 한 줄 · 증상 칩만 두고, 나머지는 '자세히 보기' 창에 둔다.
 * 글은 오른손 투수 기준으로 쓰고, 방향이 갈리는 말은 {삼루} · {팔쪽} 으로 적어 던지는 손에 맞춰 바꾼다(sideText).
 * 각도 · 퍼센트 같은 수치는 넣지 않는다(체격마다 달라 정답처럼 읽힌다). 세기(50~60%)와 '한 뼘'은 [T1] [T7] 의 안내다.
 */
import type { FOCUS_POINTS } from '@/lib/exercise-meta';

export type MechanicsElementName = (typeof FOCUS_POINTS)[number];

export type MechanicsElement = {
  name: MechanicsElementName;
  /** 화면 주소 · 칸 id 에 쓰는 이름 */
  key: string;
  /** 투구가 흘러가는 차례(1~6) */
  order: number;
  /** 한 줄 — 카드 제목 밑 */
  line: string;
  /** 무엇인가 */
  what: string;
  /** 왜 중요한가 */
  why: string;
  /** 잘될 때 모습 */
  good: string[];
  /** 흔한 실수 · 이런 증상이 있으면 — 칩에는 앞의 셋, 첫 마침표까지 */
  faults: string[];
  /** 스스로 확인하기 — 어디서 찍어 어느 장면을 멈춰 볼지 */
  check: string;
  /** 느낌 신호 — 프로그램에서 드릴 옆에 한 줄씩 */
  cues: string[];
};

/** 설명글의 바탕 — 자세히 보기 창 끝에 한 줄 */
export const MECHANICS_SOURCE_NOTE = '드라이브라인 베이스볼 · 트레드 애슬레틱스 자료를 바탕으로 정리했어요.';

export const MECHANICS_ELEMENTS: MechanicsElement[] = [
  /* [T1] 드리프트 · [T3] 뒷다리 힘을 천천히 · [D2] 무게중심 속도 */
  {
    name: '드리프트',
    key: 'drift',
    order: 1,
    line: '다리를 드는 동안 몸이 홈 쪽으로 흘러가요',
    what:
      '다리를 들어 올리는 동안 무게중심이 투구판에서 홈 쪽으로 옮겨 가기 시작하는 움직임이에요. 뒷다리로 세게 미는 게 아니라 몸이 먼저 앞으로 흘러가고, 뒷다리 힘은 그 뒤에 보태요. 다리를 가장 높이 들었을 때 몸은 이미 투구판보다 한 뼘쯤 앞에 있어요.',
    why:
      '홈 쪽으로 나가는 속도는 투구 동작 가운데 구속과 관계가 큰 편이에요. 앞다리 블록보다도 먼저 손볼 만큼요. 다리를 들고 투구판 위에 멈춰 서면 앞으로 가는 힘을 처음부터 다시 만들어야 하고, 모자란 만큼을 팔 힘으로 메우게 돼요.',
    good: [
      '다리를 드는 동안에도 몸이 멈추지 않고 홈 쪽으로 흘러가요.',
      '다리를 가장 높이 든 자리에서 그대로 멈추면 앞으로 넘어질 것 같아요.',
      '뒷다리 힘은 처음부터 터뜨리지 않고, 나가는 동안 점점 실려요.',
    ],
    faults: [
      '다리를 들고 투구판 위에서 멈칫해요.',
      '투구판에서 펄쩍 뛰어나가요. 힘은 썼는데 공에는 덜 실려요.',
      '"하체를 안 쓴다", "팔로만 던진다"는 말을 들어요.',
    ],
    check:
      '옆({삼루} 쪽)에서 찍어야 보여요. 뒤에서 찍은 영상으로는 잘 안 보여요. 다리를 가장 높이 든 장면에서 멈춰 보세요. 그대로 멈추면 앞으로 넘어질 것 같나요, 아니면 투구판 위에 서 있나요?',
    cues: [
      '다리를 들면서 몸을 살짝 홈 쪽으로 기울인다.',
      '다리를 가장 높이 든 자리는 투구판보다 한 뼘 앞.',
      '다리를 드는 동안 체중은 뒷발 안쪽에 둔다.',
    ],
  },
  /* [T2] 뒷엉덩이로 · 투구판을 끌어당김 · 미리 감기 · [T3] 펄쩍 · [T4] 뒷엉덩이 힘 빼기 */
  {
    name: '드롭',
    key: 'drop',
    order: 2,
    line: '뒷엉덩이에 앉으며 나가 힘을 감아 둬요',
    what:
      '앞으로 나가는 동안 골반을 뒷다리 허벅지 위로 감듯이 접는(힌지) 움직임이에요. 무릎을 굽혀 앉는 게 아니라 뒷엉덩이와 뒤꿈치 쪽에 체중을 싣고, 그 자세 그대로 나가요. 다리를 들 때 골반이 살짝 뒤로 돌아 곧게 선 상체와 어긋나는 것도 이때 감아 두는 힘이에요.',
    why:
      '뒷엉덩이에 앉아 나가면 앞으로 가는 힘을 만들면서도 자세가 흔들리지 않아요. 뒷엉덩이가 더 감길 수 없을 만큼 감기면 그 힘이 풀리며 골반이 상체보다 먼저 돌아요. 상하체 분리가 여기서 시작돼요. 허벅지 앞쪽으로 밀면 몸이 위로 떠서 힘이 새요.',
    good: [
      '뒷엉덩이와 뒤꿈치 쪽에 체중이 실린 채 나가요.',
      '투구판을 밀기보다 2루 쪽으로 끌어당기듯 힘을 써요.',
      '앞발이 닿으면 뒷다리 힘이 풀리고 뒷무릎이 아래 안쪽으로 돌아요.',
    ],
    faults: [
      '체중이 발끝으로 쏠려 허벅지 앞쪽으로 밀어요. 몸이 위로 떠요.',
      '앞발이 닿은 뒤에도 뒷다리로 계속 밀어요. 몸이 일찍 열리고 공을 밀어 던지게 돼요.',
    ],
    check:
      '옆에서 찍어 앞발이 닿기 직전 장면을 보세요. 체중이 뒷엉덩이와 뒤꿈치에 앉아 있나요, 발끝과 무릎 쪽으로 쏠려 있나요? 이어서 앞발이 닿은 뒤 뒷무릎이 아래 안쪽으로 도는지, 계속 밀고 있는지 보세요.',
    cues: [
      '뒷엉덩이와 뒤꿈치에 앉으며 간다.',
      '투구판을 2루 쪽으로 끌어당긴다.',
      '앞발이 닿으면 뒷무릎을 아래 안쪽으로 떨군다.',
    ],
  },
  /* [D1] 분리 · 차례 · [D5] 일찍 열린 몸통 · [T6] 일찍 열리면 밀어 던짐 · [T4] 허리 힘 빼기 · [D8] 성장기 */
  {
    name: '상하체 분리',
    key: 'separation',
    order: 3,
    line: '골반이 먼저 열리고 가슴은 늦게 따라와요',
    what:
      '앞발이 땅에 닿을 무렵 골반은 홈 쪽으로 열리는데, 가슴과 앞어깨는 아직 닫혀 옆({삼루} 쪽)을 보는 상태예요. 골반과 몸통이 서로 다른 쪽을 보며 몸통이 늘어나 있어요.',
    why:
      '골반과 가슴 사이가 벌어질수록 몸통이 더 긴 거리에서 힘을 실어 채찍처럼 돌아요. 구속과 관계가 큰 움직임으로 꼽혀요. 몸통이 일찍 열리면 팔을 뒤로 당겨 둔 자리(견갑)를 일찍 놓쳐 팔이 덜 젖혀지고, 공을 밀어 던지기 쉬워요. 성장기에는 자라면서 저절로 커지는 편이라 억지로 비틀지 않아요.',
    good: [
      '앞발이 닿을 때 앞어깨가 아직 닫혀 있어요.',
      '골반, 몸통, 팔 순서로 돌아요.',
      '허리에 힘을 주지 않아도 몸통이 부드럽게 풀려요.',
    ],
    faults: [
      '몸이 일찍 열려요. 앞발이 닿을 때 가슴이 이미 홈을 봐요.',
      '골반과 어깨가 한 덩어리로 같이 돌아요.',
      '몸통을 억지로 비틀어 뻣뻣하게 돌아요.',
    ],
    check:
      '정면이나 옆에서 찍어 앞발이 땅에 닿는 장면을 멈춰 보세요. 벨트 버클은 홈 쪽으로 돌아가는데 가슴은 아직 옆을 보면 분리가 있어요. 둘이 같은 쪽을 보면 같이 돌고 있어요.',
    cues: ['벨트는 가고 가슴은 남는다.', '앞어깨를 닫은 채 앞발을 딛는다.', '허리는 힘을 빼고 풀리게 둔다.'],
  },
  /* [D3] 착지 뒤 펴짐 · 감속 · 착지 자세는 약함 · [D4] 브레이크 · [T3] 당겨서 펴짐 */
  {
    name: '브레이크',
    key: 'brake',
    order: 4,
    line: '앞다리가 딛고 버텨 몸을 멈춰요',
    what:
      '앞발이 땅에 닿은 뒤 앞다리가 브레이크가 되어 홈 쪽으로 가던 몸을 멈추는 움직임이에요(앞다리 블록). 앞무릎이 더 굽지 않고 버티다가, 공을 놓을 무렵에는 펴지는 쪽으로 가요.',
    why:
      '아래가 멈춰야 그 힘이 몸통과 팔로 넘어가요. 앞발이 닿은 뒤 앞무릎이 더 많이 펴지는 투수, 몸의 속도를 더 크게 줄이는 투수일수록 평균적으로 공이 빨랐어요. 반면 착지할 때의 자세(무릎 각도, 발 방향)는 구속과 관계가 약했어요. 어떻게 딛느냐보다 딛고 나서 버티고 펴는 것이 중요해요.',
    good: [
      '앞발이 닿은 뒤 앞무릎이 더 굽지 않고 버텨요.',
      '공을 놓을 때까지 앞무릎이 펴져요.',
      '앞다리가 버티는 동안 상체가 홈 쪽으로 미끄러지지 않고 돌아요.',
    ],
    faults: [
      '앞발이 닿은 뒤에도 앞무릎이 계속 굽어요.',
      '몸이 멈추지 않고 홈 쪽으로 계속 쏟아져요.',
      '앞무릎을 허벅지 힘으로 억지로 펴요. 골반이 돌며 펴지는 것이 맞아요.',
    ],
    check:
      '옆에서 찍어 앞발이 닿는 장면과 공을 놓는 장면을 나란히 보세요(2분할 비교). 그사이 앞무릎이 더 굽었나요, 펴졌나요? 상체가 홈 쪽으로 계속 미끄러지나요, 앞다리 위에서 멈추며 도나요?',
    cues: ['앞다리는 벽, 밀려나지 않는다.', '골반이 돌며 앞무릎이 펴진다.'],
  },
  /* [D1] 골반 다음 몸통 · [T5] 척추를 축으로, 허리 꺾기 · 곧게 미는 마무리 · 겁내지 않기 · [T8] 기울기 */
  {
    name: '몸통 회전',
    key: 'rotation',
    order: 5,
    line: '척추를 축으로 몸통이 돌아 팔로 넘겨요',
    what:
      '앞다리가 몸을 멈춘 뒤 몸통이 척추를 축으로 빠르게 돌며 그 힘을 팔로 넘기는 움직임이에요. 골반이 가장 빠를 때가 지나고 몸통이 가장 빨라지는 차례예요. 공을 놓을 때 상체는 앞으로 기울어 있지만, 돌면서 생기는 기울기예요.',
    why:
      '다리와 골반이 만든 힘이 팔로 가는 길목이 몸통이에요. 돌지 않고 허리를 앞으로 꺾어 공을 놓으면 팔이 어깨가 도는 면에서 벗어나 몸 앞으로 밀려 나가요. 힘이 새고, 그만큼을 팔꿈치와 어깨가 떠안아요.',
    good: [
      '골반 다음에 몸통이 빠르게 돌아요.',
      '돌면서 상체가 앞으로 기울어요. 허리만 꺾지 않아요.',
      '어깨 기울기와 팔 높이가 공을 놓을 때까지 같이 가요. 옆으로 기우는 정도는 팔 높이에 따라 사람마다 달라요.',
    ],
    faults: [
      '돌지 않고 허리를 앞으로 꺾어 공을 놓아요.',
      '몸통은 도는데 팔만 목표 쪽으로 곧게 밀어 마무리해요.',
      '스트라이크만 생각하다 회전을 스스로 멈춰요.',
    ],
    check:
      '정면이나 뒤에서 찍어 공을 놓는 장면을 보세요. 어깨 기울기와 팔 높이가 같은 선에 있나요? 놓은 뒤 팔이 둥글게 감속하며 반대쪽 엉덩이 쪽으로 가나요, 놓자마자 그쪽으로 곧게 밀리나요?',
    cues: ['척추를 축으로 돈다.', '뒷어깨를 목표 쪽으로 돌려 보낸다.'],
  },
  /* [D6] 팔꿈치 높이 · [D1] 견갑 당김 · [T5] 어깨가 도는 면 · 나선 계단 · [T6] 밀어 던지기 · [T7] 늦은 팔 · [T4] 팔 힘 · [D7] 글러브 팔 */
  {
    name: '스로잉',
    key: 'throwing',
    order: 6,
    line: '팔이 제때 올라와 어깨가 도는 길을 따라가요',
    what:
      '몸이 만든 힘을 공에 싣는 팔 동작이에요. 손이 글러브에서 빠져 팔이 올라오는 길, 앞발이 닿을 때 팔이 있는 자리, 팔이 뒤로 젖혀졌다가(레이백) 공을 놓는 자리, 놓은 뒤 감속까지예요. 글러브 팔도 여기에 들어가요.',
    why:
      '몸통이 돌기 시작할 때 팔꿈치가 어깨 높이, 어깨선 위에 있어야 팔이 어깨가 도는 면을 따라 힘을 받아요. 팔이 늦어 아래에 처지거나 팔꿈치가 어깨 위로 치솟으면 힘이 새고 팔에 쓸데없는 부담이 생겨요. 팔은 힘을 빼야 더 젖혀지고 빨라져요. 팔에 힘을 주면 세게 던지려 해도 구속이 그대로예요.',
    good: [
      '앞발이 닿을 무렵 팔꿈치가 어깨 높이까지 올라와 있어요.',
      '팔꿈치가 어깨선보다 앞으로 나오지 않고 뒤에 머물러요.',
      '팔에 힘이 빠져 있어 저절로 뒤로 젖혀져요.',
      '글러브 팔은 억지로 막지 않고 몸통 회전을 따라가요.',
    ],
    faults: [
      '팔이 늦어요. 앞발이 닿았는데 팔이 아직 아래에 있어요.',
      '공을 밀어 던져요. 팔꿈치가 어깨선 앞으로 나오고 팔을 펴서 던져요.',
      '팔꿈치가 어깨보다 높이 치솟아요.',
      '세게 던지려 할수록 팔이 굳고 구속은 그대로예요.',
      '글러브 팔을 홱 잡아당겨 앞쪽이 열려요.',
    ],
    check:
      '옆에서 찍어 앞발이 닿는 장면을 멈춰 보세요. 팔꿈치가 어깨 높이까지 올라와 있나요? 팔꿈치가 어깨 위로 치솟는지는 뒤에서 찍으면 보여요. 여러 번 던진 영상을 겹쳐 공을 놓는 자리가 비슷한지도 보세요.',
    cues: [
      '팔꿈치를 뒤로 보내며 올린다.',
      '팔이 어깨 높이에 올라온 뒤에 몸통이 돈다.',
      '세게보다 느슨하고 빠르게.',
      '가슴에 매단 줄로 공을 끈다.',
    ],
  },
];

/** 요소 이름 → 요소 */
export function mechanicsElement(name: string): MechanicsElement | undefined {
  return MECHANICS_ELEMENTS.find((e) => e.name === name);
}

/**
 * '이런 고민이 있나요' 칩 — 증상 → 먼저 볼 요소 · 함께 볼 요소.
 * 누르면 먼저 볼 요소의 카드가 열린다. 무엇부터 볼지는 [D2](구속과 관계가 큰 하체부터) · [T2]~[T6] 의 까닭을 따른다.
 */
export const MECHANICS_SYMPTOMS: {
  text: string;
  main: MechanicsElementName;
  also: MechanicsElementName[];
}[] = [
  { text: '팔로만 던진다는 말을 들어요', main: '드리프트', also: ['드롭', '상하체 분리'] },
  { text: '다리를 들고 멈칫해요', main: '드리프트', also: [] },
  { text: '투구판에서 펄쩍 뛰어나가요', main: '드롭', also: ['드리프트'] },
  { text: '몸이 일찍 열려요', main: '상하체 분리', also: ['드롭'] },
  { text: '앞무릎이 계속 굽어요', main: '브레이크', also: [] },
  { text: '허리를 꺾어 공을 놓아요', main: '몸통 회전', also: ['스로잉'] },
  { text: '팔이 늦게 따라와요', main: '스로잉', also: ['상하체 분리'] },
  { text: '공을 밀어 던져요', main: '스로잉', also: ['상하체 분리', '몸통 회전'] },
  { text: '세게 던져도 구속이 그대로예요', main: '스로잉', also: ['드롭', '상하체 분리'] },
  { text: '구속이 늘지 않아요', main: '드리프트', also: ['브레이크'] },
];

/** 투구 한눈에 — 맨 위 설명. [D1] 차례 · [T2] [T4] 아래에서 쌓기 · [D2] 손보는 차례 · [T7] [D9] 드릴 세기 · [D8] 성장기 */
export const MECHANICS_OVERVIEW = {
  lead:
    '투구는 아래에서 위로 힘을 넘기는 일이에요. 몸이 홈 쪽으로 나가고, 앞다리가 그 몸을 멈추고, 골반이 돌고, 몸통이 돌고, 마지막에 팔이 나와요. 몸 가운데의 큰 마디가 먼저 가장 빨라졌다가 다음 마디로 넘겨줘요.',
  whyOrder:
    '한 곳이 끊기면 그만큼을 팔이 메워요. 다리 대신 팔 힘으로 밀어 던지게 되고, 구속은 덜 나오는데 팔꿈치와 어깨는 더 힘들어요. 그래서 팔이 문제처럼 보여도 앞 구간에서 힘이 새는 경우가 많아요. 위쪽은 힘을 빼고, 아래에서 쌓인 힘이 차례로 올라오게 두세요.',
  howTo: [
    '고칠 것은 하나만 고르세요. 무엇부터 할지 모르겠으면 하체(드리프트, 브레이크)부터예요. 구속과 관계가 큰 것부터 손보는 것이 순서예요.',
    '기초부터 하세요. 처음 몇 번은 느린 동작으로 감을 잡고 50~60% 힘으로 해요. 익숙해지면 60~75%까지 올려요. 쉬운 드릴이 편해질 때까지 몇 주가 걸려도 괜찮아요.',
    '던지는 날 몸을 푼 뒤, 캐치볼 전에 해요. 드릴은 전력으로 던지는 시간이 아니에요.',
    '옆에서 찍어 확인하세요. 뒤에서 찍은 영상으로는 하체 움직임이 잘 안 보여요. 바꾼 것이 효과가 있었는지는 구속으로 봐요.',
    '성장기라면 몸이 먼저예요. 어른 투수의 자세를 억지로 따라 하기보다 지금 몸에 맞게 움직이세요.',
  ],
};

/**
 * 방향이 갈리는 말을 던지는 손에 맞춘다 — '우투' · '좌투' · '양투'(lib/baseline.ts THROWING_HANDS).
 * 좌투만 바꾸고, 양투 · 모름은 오른손 기준 그대로다(글이 오른손으로 쓰였다).
 */
export function sideText(text: string, hand: string | null | undefined): string {
  const left = hand === '좌투';
  return text
    .replaceAll('{삼루}', left ? '1루' : '3루')
    .replaceAll('{팔쪽}', left ? '왼쪽' : '오른쪽');
}

/**
 * 투구 드릴 13개 추가 — 메커닉 프로그램의 빈칸을 트레드 · 드라이브라인 드릴로 채운다(2026-10-04 사용자분: "13개 다 넣어줘").
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/mechanics-new-drills-2026-10-04.mts          미리 보기
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/mechanics-new-drills-2026-10-04.mts --apply  DB 에 넣기
 *
 * 빈칸(넣기 전): 몸통 회전 통합 1(맨몸 · 야구공 0) · 스로잉 통합 2(0) · 상하체 분리 연결 · 통합 각 3(1), 메디신볼 0 ·
 * 브레이크 · 드롭 통합 2. 사용자분 기준: 영상은 어느 채널이든 되지만 드릴은 트레드 · 드라이브라인이 쓰는 것, 설명은 두 곳 근거로.
 *
 * 드릴을 고른 곳(트레드 · 드라이브라인):
 * - 트레드 '6 Lower Half Drills'(재니터 · 기쿠치 · 다르빗슈 · 워킹 와인드업 · 스텝백 · 로테이셔널 스텝백),
 *   '5 Lower Half Drills'(롤인 설명), '7 Drills To Increase Hip To Shoulder Separation'(리듬 로커 · 드롭 스텝 · 로테이셔널 스텝백),
 *   앞다리 블록 드릴 목록(라소 · 리듬 로커 · 재니터 · 드롭 스텝/턴 앤 번), '3 Drills Staying Stacked'(훅엠 · KBO 로커),
 *   늦은 팔 진행표 PDF(라소 · 8자 리듬 로커), 4주 입문 PDF(바우어 드릴), 'Med Ball Drill To Fix Your Lead Leg Block'.
 * - 드라이브라인: 기본 드릴 다섯(롤인 · 로커 등), 플라이오 루틴의 고르는 드릴(재니터 · 롤인 · 스텝백 · 드롭 스텝 · 로커),
 *   스텝 비하인드('구속에 가장 좋은 던지기 드릴'), 풋다운 로커(드라이브라인 코치).
 * 영상은 시작 시각을 못 받아(lib/reference-video.ts) 드릴 하나만 보여 주는 영상으로 골랐고, 장면 미리보기(스토리보드)로
 * 실제 시연이 나오는지 확인했다. 가로 1.778 · 세로 0.563(기존 드릴과 같은 값).
 *
 * 쓰기 전에 npm run backup. 쓴 뒤 lib/library-cache.ts 의 드릴 캐시 이름을 올린다. 같은 영상이 이미 있으면 건너뛴다.
 */
import { prisma } from '@/lib/prisma';

type NewDrill = {
  title: string;
  category: '스로잉 드릴' | '메디신볼 드릴' | '무브먼트 패턴 드릴';
  /** 맨 앞이 주 요소 */
  focusPoints: string[];
  stage: '기초' | '연결' | '통합';
  equipment: string[];
  referenceVideoId: string;
  aspectRatio: number;
  what: string;
  steps: string[];
  why: string;
  pace?: string;
};

/* 자세 설명의 세기 줄 — scripts/mechanics-descriptions-2026-10-04.mts 와 같은 말 */
const THROW_PACE =
  '처음 몇 번은 느린 동작으로 감을 잡고, 50~60% 힘에서 시작해 익숙해지면 올립니다. 전력으로 던지는 드릴이 아닙니다.';
const MEDBALL_PACE =
  '처음 몇 번은 동작을 익히고, 몸에 익으면 빠르게 던집니다. 거리나 속도를 재 두면 힘이 느는지 볼 수 있습니다.';

const WIDE = 1.778;
const TALL = 0.563;

const DRILLS: NewDrill[] = [
  {
    title: '턴 앤 번 스로우',
    category: '스로잉 드릴',
    focusPoints: ['몸통 회전', '브레이크'],
    stage: '통합',
    equipment: ['야구공'],
    referenceVideoId: 'QTQtkxqZFCc',
    aspectRatio: WIDE,
    what: '던지는 방향을 보고 섰다가 빠르게 몸을 옆으로 돌리고, 그 기세 그대로 홈 쪽으로 이어 나가 던지는 드릴입니다. 트레드가 드롭 스텝과 함께 앞다리 블록을 익히는 드릴로 꼽습니다.',
    steps: [
      '던지는 방향을 보고 서서 공과 글러브를 가슴 앞에 모읍니다.',
      '빠르게 몸을 옆으로 돌리며 홈 쪽으로 이어 나갑니다.',
      '몸을 다 돌리기 전에는 손을 떼지 않습니다. 손이 일찍 떨어지면 팔이 길게 끌려 나옵니다.',
      '앞발이 닿으면 앞다리로 버티고, 골반부터 돌려 던집니다.',
    ],
    why: '홈 쪽으로 가는 힘과 회전을 한 흐름으로 잇습니다. 트레드는 공이 빠른 투수일수록 뒷다리를 세게 펴며 밀지 않고 골반과 뒷무릎을 비틀어 내리며 돈다고 봅니다. 앞발이 닿은 뒤 앞다리가 버텨 몸을 멈춰야 그 힘이 몸통과 팔로 넘어갑니다.',
  },
  {
    title: '로테이셔널 스텝백 스로우',
    category: '스로잉 드릴',
    focusPoints: ['상하체 분리', '몸통 회전'],
    stage: '통합',
    equipment: ['야구공'],
    referenceVideoId: '-orauhZaRIY',
    aspectRatio: WIDE,
    what: '앞발을 뒤로 물려 딛으며 골반을 2루 쪽으로 감았다가, 그 감긴 힘으로 홈 쪽으로 나가 던지는 드릴입니다. 트레드가 상하체 분리 드릴과 하체 드릴로 꼽는, 스텝백에 회전을 더한 드릴입니다.',
    steps: [
      '던지는 방향을 옆으로 보고 섭니다.',
      '앞발을 뒷발 쪽으로 물려 딛으며 골반을 2루 쪽으로 살짝 감습니다.',
      '감긴 긴장을 지킨 채 다리를 들어 홈 쪽으로 나갑니다.',
      '앞발이 닿을 무렵 골반이 먼저 열리고, 가슴은 늦게 따라오게 해 던집니다.',
    ],
    why: '물러서는 걸음에 회전을 더해 뒷엉덩이에 긴장을 감고, 그 힘이 앞발이 닿을 무렵 늦고 강하게 풀리게 합니다. 골반이 먼저 열리고 가슴이 늦게 따라올수록 몸통이 더 긴 거리에서 힘을 실어 돕니다.',
  },
  {
    title: '바우어 드릴',
    category: '스로잉 드릴',
    focusPoints: ['몸통 회전', '드리프트'],
    stage: '통합',
    equipment: ['야구공'],
    referenceVideoId: 'Ph5F4xaUUmA',
    aspectRatio: WIDE,
    what: '글러브 쪽 발을 목표 반대쪽으로 한 발 빼 딛고, 그 자리에 던지는 쪽 발을 바꿔 디딘 뒤 바로 돌아 던지는 드릴입니다. 트레드가 4주 입문 프로그램에 넣은 드릴입니다.',
    steps: [
      '던지는 방향을 옆으로 보고 섭니다.',
      '글러브 쪽 발을 목표 반대쪽으로 한 발 빼 딛습니다.',
      '그 발이 닿자마자 던지는 쪽 발을 그 자리로 바꿔 디딥니다.',
      '멈추지 말고 몸을 돌려 홈 쪽으로 나가 던집니다.',
    ],
    why: '발을 바꿔 딛는 짧은 움직임이 무게중심을 홈 쪽으로 먼저 보내고, 그 힘을 회전으로 바꾸게 합니다. 팔 힘이 아니라 아래에서 쌓인 힘으로 던지는 감각을 찾습니다.',
  },
  {
    title: '스텝 비하인드 스로우',
    category: '스로잉 드릴',
    focusPoints: ['스로잉', '드리프트'],
    stage: '통합',
    equipment: ['야구공'],
    referenceVideoId: 'yo4H38OD9I0',
    aspectRatio: WIDE,
    what: '옆으로 선 자세에서 뒷발을 앞발 뒤로 엇갈려 딛으며 홈 쪽으로 나가고, 그 기세로 던지는 드릴입니다. 드라이브라인이 구속에 가장 좋은 던지기 드릴로 소개한 드릴입니다.',
    steps: [
      '던지는 방향을 옆으로 보고 섭니다.',
      '뒷발을 앞발 뒤로 엇갈려 딛으며 홈 쪽으로 나갑니다.',
      '걸음의 기세를 멈추지 말고 앞다리를 내딛습니다.',
      '앞발이 닿을 무렵 팔꿈치가 어깨 높이에 올라와 있게 하고, 몸통을 돌려 던집니다.',
    ],
    why: '걸음으로 홈 쪽으로 가는 속도를 만들고, 그 속도 속에서도 팔이 제때 올라오게 익힙니다. 홈 쪽으로 나가는 속도는 구속과 관계가 큰 움직임이고, 팔이 늦으면 그 힘이 공에 실리지 않습니다.',
    pace: '처음 몇 번은 느린 동작으로 감을 잡고, 60~75% 힘에서 시작합니다. 구속을 재는 전력 투구는 드라이브라인 기준 일주일에 1~2번이면 충분합니다.',
  },
  {
    title: '8자 리듬 로커',
    category: '스로잉 드릴',
    focusPoints: ['스로잉', '상하체 분리'],
    stage: '연결',
    equipment: ['야구공'],
    referenceVideoId: 'OJMYGqwhxhw',
    aspectRatio: WIDE,
    what: '보폭 자세에서 팔로 8자를 그리며 몸을 앞뒤로 흔들다가, 그 흐름 그대로 던지는 드릴입니다. 트레드의 늦은 팔 고치기 진행표 2단계 드릴입니다.',
    steps: [
      '앞발을 디딘 보폭 자세로 서서 공을 쥡니다.',
      '팔로 8자를 그리며 체중을 뒤로 흔들어 뒷엉덩이에 싣습니다.',
      '8자는 평소 손을 모으는 자리를 지나가게, 만들고 싶은 팔의 길을 따라 그립니다.',
      '다시 앞으로 흔들어 오며 골반이 먼저 열리고, 팔이 제때 올라와 던집니다.',
    ],
    why: '팔이 끊기지 않고 제때 올라오게 하고, 그 팔의 흐름을 골반 · 몸통 회전과 맞춥니다. 트레드는 8자가 평소 손을 모으는 자리를 지나가야 다른 드릴과 투구로 이어진다고 봅니다. 매끄럽지 않으면 처음 몇 번은 느린 동작으로 팔과 몸이 맞물리는 것을 느낍니다.',
  },
  {
    title: '롤인 스로우',
    category: '스로잉 드릴',
    focusPoints: ['상하체 분리', '드롭'],
    stage: '연결',
    equipment: ['야구공'],
    referenceVideoId: 'kAs1E2amhTY',
    aspectRatio: TALL,
    what: '어깨가 던지는 방향을 향하게 옆으로 섰다가 뒷발을 2루 쪽으로 물려 단단히 딛고, 그 뒷다리를 타고 홈 쪽으로 나가며 던지는 드릴입니다. 드라이브라인의 기본 드릴 다섯 가운데 하나이고 트레드도 씁니다.',
    steps: [
      '어깨가 던지는 방향을 향하게 옆으로 섭니다.',
      '뒷발을 2루 쪽으로 한 발 물려 딛고, 체중을 뒷엉덩이에 실어 단단히 섭니다.',
      '그 뒷다리를 타고 홈 쪽으로 나갑니다.',
      '골반이 먼저 열리고 앞어깨는 닫힌 채 따라오게 해 던집니다.',
    ],
    why: '골반과 몸통이 따로 움직이는 느낌, 골반이 열린 채 앞다리로 버티기 좋은 자세를 익힙니다. 트레드는 이 드릴이 분리를 억지로 만드는 것이 아니라 뒷엉덩이에 긴장을 감아 더 늦고 강하게 푸는 드릴이라고 합니다. 고관절과 등 윗부분이 잘 도는 사람에게 특히 맞습니다.',
  },
  {
    title: '리듬 로커',
    category: '스로잉 드릴',
    focusPoints: ['상하체 분리', '브레이크'],
    stage: '연결',
    equipment: ['야구공'],
    referenceVideoId: 'U__OwPjuKMQ',
    aspectRatio: WIDE,
    what: '보폭 자세에서 앞뒤로 흔들며 골반을 뒷다리 허벅지 위로 감았다가, 골반이 먼저 열리게 해 던지는 로커 드릴입니다. 트레드가 상체 드릴과 하체 드릴 사이를 잇는 단계로 씁니다.',
    steps: [
      '앞발을 디딘 보폭 자세로 서서 두 손을 가슴 앞에 모읍니다.',
      '체중을 뒤로 흔들며 골반을 뒷다리 허벅지 위로 감습니다.',
      '부드러운 리듬을 지킨 채 골반이 먼저 열리게 하고, 앞어깨는 닫아 둡니다.',
      '골반 다음에 몸통, 팔이 따라 나와 던집니다.',
    ],
    why: '앞으로 나가는 움직임 없이 골반을 감고 푸는 법을 익힙니다. 트레드는 이 드릴을 전력이 아니라 매끄러운 차례를 익히는 데 씁니다. 동작이 잘 안 되면 골반을 열어 두고 시작하는 단계로 낮추고, 팔과 골반이 맞지 않으면 팔 흔들기를 더한 단계로 합니다.',
  },
  {
    title: 'KBO 로커',
    category: '스로잉 드릴',
    focusPoints: ['드롭', '상하체 분리'],
    stage: '통합',
    equipment: ['야구공'],
    referenceVideoId: '7mQSKCy3Z8o',
    aspectRatio: TALL,
    what: '보폭 자세에서 뒤로 흔들었다가 앞다리를 차 넘기며 홈 쪽으로 곧게 딛고 던지는 로커 드릴입니다. 트레드가 몸을 쌓아 둔 채 나가는 드릴로 소개합니다.',
    steps: [
      '앞발을 디딘 보폭 자세로 섭니다.',
      '체중을 뒤로 흔들어 뒷엉덩이에 싣습니다.',
      '앞다리를 들어 차 넘기며 홈 쪽으로 곧게 딛습니다. 앞다리가 옆으로 크게 돌지 않게 뒤꿈치를 곧장 목표로 보냅니다.',
      '앞발이 닿으면 골반부터 돌려 던집니다.',
    ],
    why: '스텝백처럼 시간을 짧게 묶어 몸이 스스로 차례를 맞추게 합니다. 앞다리를 차 넘기는 움직임이 골반 회전을 시작시켜, 앞발이 닿을 때 골반을 열기 어려운 투수에게 맞습니다. 고관절 안쪽 회전이 어느 정도 되어야 할 수 있는 드릴입니다.',
  },
  {
    title: '훅엠 드릴',
    category: '스로잉 드릴',
    focusPoints: ['드롭', '스로잉'],
    stage: '연결',
    equipment: ['야구공'],
    referenceVideoId: 'w7Lp6NpKBpg',
    aspectRatio: TALL,
    what: '앞발을 뒷발 쪽으로 걸듯이(훅) 두어 뒷엉덩이가 미리 감긴 자세에서 시작해, 몸을 곧게 쌓아 둔 채 홈 쪽으로 나가 던지는 드릴입니다. 트레드가 몸을 쌓아 둔 채 나가는 드릴로 소개합니다.',
    steps: [
      '던지는 방향을 옆으로 보고 서서, 앞발을 뒷발 쪽으로 걸듯이 둡니다.',
      '뒷엉덩이가 감긴 것을 느끼며 다리를 듭니다.',
      '골반과 가슴이 함께 닫힌 채 홈 쪽으로 나갑니다. 서두르지 말고 하체를 기다립니다.',
      '앞발이 닿으면 골반부터 돌려 던집니다.',
    ],
    why: '골반과 몸통이 고르게 감긴 채(쌓아 둔 채) 나가다가, 앞발이 닿을 무렵 차례대로 풀리게 합니다. 홈 쪽으로 가는 움직임과 회전을 잇는 연습입니다. 팔 동작이 긴 투수는 팔이 늦지 않게 더 기다립니다.',
  },
  {
    title: '재니터 스로우',
    category: '스로잉 드릴',
    focusPoints: ['드롭', '브레이크'],
    stage: '연결',
    equipment: ['야구공'],
    referenceVideoId: 'AxyqHZj25bg',
    aspectRatio: WIDE,
    what: '몸을 목표 반대쪽으로 비틀고 두 발을 T자로 둔 자세에서 낮게 앉았다가, 홈 쪽으로 나가 던지는 드릴입니다. 드롭 스텝을 제한한 형태로, 트레드와 드라이브라인 모두 씁니다.',
    steps: [
      '몸을 목표 반대쪽으로 비틀어 서고, 두 발을 T자로 둡니다.',
      '뒷엉덩이와 뒤꿈치 쪽으로 낮게 앉습니다.',
      '그 긴장을 지킨 채 홈 쪽으로 나갑니다.',
      '하체가 먼저 돌게 하고, 몸통은 앞발이 닿을 때까지 늦춘 뒤 던집니다.',
    ],
    why: '나가기 전에 엉덩이에 싣고 접는(힌지) 느낌을 찾고, 앞발이 닿기 전에 하체가 먼저 돌게 합니다. 트레드는 체중이 발끝과 허벅지 쪽으로 쏠리는 투수가 뒤꿈치 위에 쌓아 두게 하는 데 쓰고, 앞다리 블록 드릴로도 꼽습니다. 하체를 잘 못 쓰는 투수에게 좋습니다.',
  },
  {
    title: '풋다운 로커',
    category: '스로잉 드릴',
    focusPoints: ['브레이크', '드롭'],
    stage: '기초',
    equipment: ['야구공'],
    referenceVideoId: 'E4Xn01LNJy8',
    aspectRatio: TALL,
    what: '두 발을 땅에 붙인 보폭 자세에서 앞뒤로 흔들며, 뒷다리에서 앞다리로 체중이 옮겨 가는 순간을 느끼는 로커 드릴입니다. 드라이브라인 코치가 쓰는 드릴입니다.',
    steps: [
      '앞발을 디딘 보폭 자세로 서서 두 발을 땅에 붙입니다.',
      '체중을 뒤로 흔들어 뒷엉덩이에 싣습니다.',
      '앞으로 흔들어 오며 체중을 앞다리로 옮기고, 앞다리가 받아 버팁니다.',
      '앞다리가 버티는 위에서 골반, 몸통 순서로 돌려 던집니다.',
    ],
    why: '뒷다리에서 앞다리로 넘어가는 순간과 앞다리가 몸을 멈추는 느낌을 익힙니다. 앞발이 닿은 뒤 앞무릎이 더 펴지고 몸의 속도를 더 크게 줄이는 투수일수록 평균적으로 공이 빨랐습니다.',
  },
  {
    title: '메디신볼 앞다리 블록 회전 스로우',
    category: '메디신볼 드릴',
    focusPoints: ['브레이크', '몸통 회전'],
    stage: '연결',
    equipment: ['메디신볼'],
    referenceVideoId: 'WB8hNLqnX5M',
    aspectRatio: TALL,
    what: '앞다리 블록이 옆으로 새는 투수를 위해, 메디신볼을 회전으로 던지며 몸통을 홈 쪽으로 보내는 트레드의 드릴입니다.',
    steps: [
      '앞뒤로 발을 벌린 보폭 자세로 서서 메디신볼을 뒷엉덩이 옆에 듭니다.',
      '앞다리에 체중을 받아 버팁니다.',
      '골반, 몸통 순서로 돌리며 공을 홈 쪽 앞으로 던집니다.',
      '몸통이 글러브 쪽 옆으로 넘어지지 않고 홈 쪽으로 가게 합니다.',
    ],
    why: '앞다리 블록이 옆으로 새면 몸이 글러브 쪽으로 넘어지고 힘이 공 방향으로 가지 않습니다. 트레드는 메디신볼 회전 던지기로 몸통을 홈 쪽으로 다시 보내게 합니다. 앞다리가 버티며 몸을 멈추고 그 위에서 몸통이 돌아야 힘이 넘어갑니다.',
  },
  {
    title: '라소 드릴',
    category: '스로잉 드릴',
    focusPoints: ['몸통 회전', '스로잉'],
    stage: '기초',
    equipment: ['야구공'],
    referenceVideoId: '6xtV_ud1DTY',
    aspectRatio: WIDE,
    what: '공을 쥔 팔을 올가미 돌리듯 머리 둘레로 돌리다가, 그 흐름으로 몸통을 돌려 던지는 드릴입니다. 트레드가 착지 뒤 차례와 회전을 처음 익히는 던지기 드릴로 씁니다.',
    steps: [
      '앞발을 디딘 보폭 자세로 서서 공을 쥡니다.',
      '팔에 힘을 빼고 올가미 돌리듯 머리 둘레로 몇 번 돌립니다.',
      '흐름이 끊기지 않게, 팔이 던질 자리에 오는 때에 맞춰 몸통을 돌려 던집니다.',
      '익숙해지면 어깨 기울기를 더하고, 그다음 체중 옮기기를 더합니다.',
    ],
    why: '팔을 느슨하게 돌리며 몸통 회전에 팔을 맞추는 법을 익힙니다. 트레드는 이 드릴을 늦은 팔을 고치는 진행표의 첫 드릴로, 앞다리 블록 드릴로도 씁니다. 팔은 힘을 빼야 더 젖혀지고 빨라집니다.',
  },
];

function compose(d: NewDrill): string {
  const pace = d.pace ?? (d.category === '메디신볼 드릴' ? MEDBALL_PACE : THROW_PACE);
  return [
    `■ 어떤 운동인가\n${d.what}`,
    `■ 이렇게 하세요\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    `■ 왜 하나요\n${d.why}`,
    `■ 세기\n${pace}`,
  ].join('\n\n');
}

const apply = process.argv.includes('--apply');
const existing = await prisma.mechanicsGuide.findMany({ select: { title: true, referenceVideoId: true } });
const haveVideo = new Set(existing.map((r) => r.referenceVideoId).filter(Boolean));
const haveTitle = new Set(existing.map((r) => r.title));
const todo = DRILLS.filter((d) => !haveVideo.has(d.referenceVideoId) && !haveTitle.has(d.title));
console.log(`드릴 ${DRILLS.length}개 중 새로 넣을 것 ${todo.length}개`);
for (const d of todo) console.log(`  ${d.title} · ${d.focusPoints.join(',')} · ${d.stage} · ${d.category} · ${d.equipment.join(',')} · ${d.referenceVideoId}`);
if (process.argv.includes('--show') && todo[0]) console.log(`\n${compose(todo[0])}`);
if (apply) {
  for (const d of todo) {
    await prisma.mechanicsGuide.create({
      data: {
        title: d.title,
        category: d.category,
        description: compose(d),
        source: 'REFERENCE',
        referenceVideoId: d.referenceVideoId,
        aspectRatio: d.aspectRatio,
        focusPoints: d.focusPoints,
        equipment: d.equipment,
        stage: d.stage,
      },
    });
  }
  console.log(`DB 에 ${todo.length}개 넣었어요`);
}
await prisma.$disconnect();

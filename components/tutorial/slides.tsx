import {
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  Columns2,
  Dumbbell,
  Flag,
  Gauge,
  Grid2x2,
  LockKeyhole,
  PencilLine,
  RefreshCw,
  ScanBarcode,
  Settings,
  Smartphone,
  Sparkles,
  Target,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { TutorialSlide } from './tutorial-dialog';

/**
 * 튜토리얼 글감 다섯 벌 — 기본 투어 둘(웹 · 앱)과 탭 튜토리얼 셋(투구 기록 · 트레이닝 · 영양).
 *
 * 웹과 앱(아이폰 웹뷰)은 생김새가 달라 투어가 따로다 — 웹은 오른쪽 위 막대 · 메뉴(네모 넷) · 미니 사이드바 · 큰 사이드바,
 * 앱은 아래 탭 · 더보기 · 당겨서 새로고침(lib/nav.ts · components/app-shell.tsx · components/pull-to-refresh.tsx).
 * 이름은 사용자가 부르는 대로(docs/claude/geum-yunho.md 1절).
 *
 * 탭 튜토리얼은 그 탭의 첫 설정을 마친 직후 한 번 뜬다(components/tutorial/tab-tutorial.tsx). 글은 그 탭의 화면 그대로 —
 * 투구 기록(app/(app)/videos) · 트레이닝 홈(app/(app)/training/training-home.tsx) · 영양(app/(app)/nutrition/nutrition-view.tsx).
 *
 * 그림은 아이콘 하나를 둥근 바탕에 크게 — 벨로시티처럼 삽화를 그리지 않는다(장이 많아 하나하나 그리면 무겁고, 글이 요점이다).
 */

/** 그림 칸(하늘색 바탕 — 휴대폰 4:3, 낮은 화면 · PC 16:9)에 아이콘 하나 — 둥근 흰 바탕 위에 가는 선으로 */
function Art({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="flex h-28 w-28 items-center justify-center rounded-full bg-surface/80 text-sky shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
    >
      <Icon className="h-14 w-14" strokeWidth={1.5} />
    </span>
  );
}

/* ───────────── 기본 투어 · 웹 ───────────── */

export const tourWebSlides: TutorialSlide[] = [
  {
    key: 'welcome',
    title: '불펜로그에 오신 걸 환영해요',
    body: '투구 · 트레이닝 · 영양을 한곳에 적고, 그날 몸 상태에 맞춘 운동과 조언을 받아요. 어디에 무엇이 있는지 짧게 알려 드릴게요.',
    note: '오른쪽 위 X 로 언제든 건너뛸 수 있어요.',
    art: <Art icon={Sparkles} />,
  },
  {
    key: 'nav',
    title: '오른쪽 위 막대로 다녀요',
    body: '홈 · 투구 기록 · 트레이닝 · 영양 아이콘이 늘 오른쪽 위에 있어요. 그 옆 네모 넷이 메뉴예요. 커서를 대면 미니 사이드바가 뜨고, 누르면 큰 사이드바가 열려요.',
    note: '운동 영상 · 투구 드릴 · 자료실은 큰 사이드바에 있어요.',
    art: <Art icon={Grid2x2} />,
  },
  {
    key: 'settings',
    title: '설정과 내 정보',
    body: '톱니를 누르면 화면 · 단위 · 트레이닝 설정이 창으로 열려요. 그 옆 내 정보에서는 닉네임 · 키 · 몸무게 · 사진을 고쳐요.',
    art: <Art icon={Settings} />,
  },
  {
    key: 'checkin',
    title: '매일 체크인부터',
    body: '들어오면 오늘 몸 상태를 먼저 물어요. 컨디션 · 수면 · 통증을 적으면 그날 운동과 조언이 거기에 맞춰져요. 몇 초면 끝나요.',
    note: '건너뛰어도 오른쪽 위 알림(종)에서 언제든 할 수 있어요.',
    art: <Art icon={ClipboardCheck} />,
  },
  {
    key: 'locked',
    title: '세 탭은 몇 가지를 물은 뒤 열려요',
    body: '투구 기록 · 트레이닝 · 영양은 처음 들어갈 때 던지는 손 · 평소 운동 · 식사 목표 같은 것을 물어요. 답하면 그 탭이 열리고 사용법을 알려 드려요.',
    note: '막대에서 흐리게 보이는 아이콘이 아직 안 연 탭이에요.',
    art: <Art icon={LockKeyhole} />,
  },
];

/* ───────────── 기본 투어 · 앱(아이폰) ───────────── */

export const tourAppSlides: TutorialSlide[] = [
  {
    key: 'welcome',
    title: '불펜로그에 오신 걸 환영해요',
    body: '투구 · 트레이닝 · 영양을 한곳에 적고, 그날 몸 상태에 맞춘 운동과 조언을 받아요. 어디에 무엇이 있는지 짧게 알려 드릴게요.',
    note: '오른쪽 위 X 로 언제든 건너뛸 수 있어요.',
    art: <Art icon={Sparkles} />,
  },
  {
    key: 'tabs',
    title: '아래 탭으로 다녀요',
    body: '홈 · 기록 · 트레이닝 · 영양이 아래에 있어요. 더보기를 누르면 운동 영상 · 투구 드릴 · 자료실 · 구속 측정이 든 사이드바가 옆에서 나와요.',
    art: <Art icon={Smartphone} />,
  },
  {
    key: 'refresh',
    title: '당겨서 새로고침 · 알림',
    body: '화면 맨 위에서 아래로 당기면 새로 받아요. 다른 기기에서 남긴 기록도 그렇게 봐요. 오른쪽 위 종을 누르면 오늘 남은 일이 보여요.',
    note: '종 옆 톱니가 설정, 사진이 내 정보예요.',
    art: <Art icon={RefreshCw} />,
  },
  {
    key: 'checkin',
    title: '매일 체크인부터',
    body: '들어오면 오늘 몸 상태를 먼저 물어요. 컨디션 · 수면 · 통증을 적으면 그날 운동과 조언이 거기에 맞춰져요. 몇 초면 끝나요.',
    note: '건너뛰어도 종에서 언제든 할 수 있어요.',
    art: <Art icon={ClipboardCheck} />,
  },
  {
    key: 'locked',
    title: '세 탭은 몇 가지를 물은 뒤 열려요',
    body: '기록 · 트레이닝 · 영양은 처음 들어갈 때 던지는 손 · 평소 운동 · 식사 목표 같은 것을 물어요. 답하면 그 탭이 열리고 사용법을 알려 드려요.',
    note: '아래 탭에서 흐리고 자물쇠가 달린 것이 아직 안 연 탭이에요.',
    art: <Art icon={LockKeyhole} />,
  },
];

/* ───────────── 투구 기록 ───────────── */

export const pitchSlides: TutorialSlide[] = [
  {
    key: 'calendar',
    title: '캘린더에서 날짜를 눌러요',
    body: '달력에서 날짜를 누르면 그날 투구 기록이 열려요. 던진 날에는 공 수와 강도가 칸에 적혀요. 목록으로 바꾸면 최근 기록부터 죽 볼 수 있어요.',
    art: <Art icon={CalendarDays} />,
  },
  {
    key: 'log',
    title: '오늘 기록 남기기',
    body: '오늘 기록 남기기를 누르고 어떤 투구였는지 · 투구 수 · 강도 · 메모를 적어요. 지난 날짜도 캘린더에서 골라 적을 수 있어요.',
    note: '구속 측정은 아이폰 앱에서 카메라로 해요. 잰 값은 그날 기록에 같이 남아요.',
    art: <Art icon={PencilLine} />,
  },
  {
    key: 'intensity',
    title: '강도는 팔에 가는 부담으로',
    body: '1부터 10까지예요. 절반 힘으로 던져도 팔꿈치에는 최고의 75%가 걸려요. 느낌보다 조금 높게 적어야 휴식일이 맞아요.',
    note: '1~2 몸 푸는 정도, 5~6 절반쯤 힘, 9~10 전력. 적을 때 기준표가 같이 떠요.',
    art: <Art icon={Gauge} />,
  },
  {
    key: 'video',
    title: '영상을 올려 폼을 견줘요',
    body: '기록에 영상을 붙일 수 있어요. 2분할 비교를 누르고 둘을 고르면 나란히 재생되어 예전 폼과 지금을 견줘요.',
    art: <Art icon={Columns2} />,
  },
];

/* ───────────── 트레이닝 ───────────── */

export const trainingSlides: TutorialSlide[] = [
  {
    key: 'apps',
    title: '앱 셋이 카드로 있어요',
    body: '운동 · 암케어 · 메커니즘이 카드 셋이에요. 카드마다 오늘 할 것 한 줄과 시작 단추가 있고, 카드를 누르면 그 앱의 전체 화면으로 가요. 마지막에 쓴 앱이 맨 위예요.',
    art: <Art icon={Dumbbell} />,
  },
  {
    key: 'checkin',
    title: '체크인을 먼저 하면 일정이 나와요',
    body: '오늘 몸 상태를 적으면 거기에 맞춘 오늘 운동 일정을 만들어요. 통증이 있거나 기록이 모자란 날은 가볍게 가거나 쉬라고 해요.',
    note: '체크인은 오른쪽 위 알림(종)에서 언제든 해요.',
    art: <Art icon={ClipboardCheck} />,
  },
  {
    key: 'program',
    title: '근력 · 파워 프로그램',
    body: '운동 화면 맨 위에서 목표에 맞는 몇 주짜리 프로그램을 골라요. 경력 · 장비를 물은 뒤 계획이 잡혀요. 처음이면 기본기 4주부터예요.',
    art: <Art icon={Flag} />,
  },
  {
    key: 'settings',
    title: '트레이닝 설정',
    body: '운동 · 암케어 화면 오른쪽 위 트레이닝 설정에서 가진 장비와 운동 수준을 고쳐요. 장비를 안 고르면 다 있다고 보고 운동을 골라요.',
    note: '고쳐도 이미 만든 오늘 일정은 그대로예요. 새로 받으려면 다시 만들기를 눌러요.',
    art: <Art icon={Settings} />,
  },
];

/* ───────────── 영양 ───────────── */

export const nutritionSlides: TutorialSlide[] = [
  {
    key: 'day',
    title: '나의 하루',
    body: '맨 위에 오늘 목표와 먹은 열량이 게이지 하나로 보여요. 더 먹을 양과 탄 · 단 · 지 비율도 같이 떠요.',
    art: <Art icon={Utensils} />,
  },
  {
    key: 'meals',
    title: '끼니 넷에 기록해요',
    body: '아침 · 점심 · 저녁 · 간식 칸에서 담기를 눌러요. 음식을 검색하거나 바코드를 찍어 담고, 먹은 양을 고쳐요.',
    note: '목록에 없는 음식은 직접 입력으로 담아요.',
    art: <Art icon={ScanBarcode} />,
  },
  {
    key: 'plan',
    title: '식단 짜기',
    body: '오늘 식단 짜기를 누르면 목표에 맞춘 끼니를 짜 줘요. 짠 식단은 끼니 칸에 식단 줄로 들어가고, 먹으면 체크해요.',
    art: <Art icon={ChefHat} />,
  },
  {
    key: 'goal',
    title: '내 계획과 목표 창',
    body: '통계에서 내 계획을 보면 목표 · 탄단지 나누기 · 예상 체중이 있어요. 제목 옆 목표 단추로 언제든 목표를 다시 정해요.',
    art: <Art icon={Target} />,
  },
];

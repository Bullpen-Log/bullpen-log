import type { LabBat, LabHand, LabMeta, LabView } from '@/lib/pitch-lab-meta';
import { LAB_BAT_OPTIONS } from '@/lib/pitch-lab-meta';

/**
 * 3D 스윙 분석(타자, 베타) — 순수 자료 · 이름(저장소를 모른다). 저장은 lib/pitch-lab.ts 의 sport 'hit'(폴더 swing-lab), 서버 동작은 app/actions/swing-lab.ts.
 *
 * 2026-10-21 금윤호: "타자도 3D 스윙 분석 기능을 — 투구에서 만든 그대로 인터페이스 · 환경을, 모델링은 우리가 찍어서 줄 수 있게 3D 개발 관리자를".
 * 그래서 샘플 하나 = 두 폰으로 같은 스윙을 동시에 찍은 짝(투구와 같은 열쇠 side · back) + meta.json. 분석 모델은 샘플이 모인 뒤에 만든다 —
 * 그때까지 사용자 화면의 [리포트 받기]는 '준비 중'이고 GPU 를 부르지 않는다.
 *
 * 카메라 둘:
 *   side = 정면(가슴 쪽) — 타자 가슴이 보이는 자리. 우타는 1루 쪽, 좌타는 3루 쪽(타석 건너편). 투구의 '옆'처럼 스윙 순간 · 몸통 회전 · 배트 길을 본다.
 *   back = 포수 뒤 — 포수 자리 뒤에서 투수 쪽을 본다. 투구의 '뒤'처럼 깊이(홈 쪽으로 내딛기 · 배트가 공 길에 들어오는 각)를 잡는다.
 * 두 폰이 타자를 사이에 두고 90°쯤 — 투구 엔진의 두 카메라 자리 찾기(60~120°)를 그대로 쓸 수 있게 같은 짜임으로 했다.
 * 화면 글은 해요체 · 줄표 없음.
 */

/** 정면 폰을 놓는 쪽 — 타자 가슴이 향하는 쪽. 우타 1루 · 좌타 3루 */
export const swingFrontBase = (hand: LabHand) => (hand === 'L' ? '3루' : '1루');

/** 영상 칸 이름 */
export const swingViewLabel = (view: LabView, hand: LabHand) =>
  view === 'side' ? `정면 · ${swingFrontBase(hand)} 쪽` : '포수 뒤';

/** 짧은 이름(올리는 중 · 거리 칸) */
export const swingViewShort = (view: LabView) => (view === 'side' ? '정면' : '포수 뒤');

/** 안내 글은 우타 기준 — 좌타면 1루 ↔ 3루 */
export const swingForHand = (text: string, hand: LabHand) =>
  hand === 'L' ? text.replaceAll('1루', '\u0000').replaceAll('3루', '1루').replaceAll('\u0000', '3루') : text;

/** 가입 · 내 정보의 타석(User.battingHand '우타' · '좌타' · '양타') → 실험실의 손. 모르면 우타 */
export const swingHandOf = (battingHand: string | null | undefined): LabHand =>
  battingHand === '좌타' ? 'L' : 'R';

export const swingBatLabel = (bat: LabBat | undefined) =>
  LAB_BAT_OPTIONS.find((o) => o.value === bat)?.label ?? null;

/** 결과 화면 머리의 작은 표시 — '마커 · 슬로모 240 · 우타 · 나무 배트 · 키 178cm · 정면 4m · 포수 뒤 3.5m' */
export function swingMetaChips(meta: LabMeta): string[] {
  const dist = (['side', 'back'] as const)
    .filter((v) => meta.distances[v] != null)
    .map((v) => `${swingViewShort(v)} ${meta.distances[v]}m`);
  const bat = swingBatLabel(meta.bat);
  return [
    ...(meta.kind === 'marker' ? ['마커'] : []),
    meta.slowmoFps ? `슬로모 ${meta.slowmoFps}` : '슬로모 모름',
    meta.hand === 'L' ? '좌타' : '우타',
    ...(bat ? [`${bat} 배트`] : []),
    ...(meta.heightCm ? [`키 ${meta.heightCm}cm`] : []),
    ...dist,
  ];
}

/** 목록 한 줄 — 기본값(우타)과 모름은 빼고 */
export function swingCardChips(meta: LabMeta): string[] {
  const bat = swingBatLabel(meta.bat);
  return [
    ...(meta.hand === 'L' ? ['좌타'] : []),
    ...(meta.slowmoFps ? [`슬로모 ${meta.slowmoFps}`] : []),
    ...(bat ? [`${bat} 배트`] : []),
  ];
}

/* ───────────────────────────── 촬영 안내 ───────────────────────────── */

/** 안내 화면의 칸(투구 안내 lib/pitch-lab-guide.ts 와 같은 짜임 — 분석이 아직 없어 '분석이 안 됐다면' 칸은 없다) */
export type SwingGuideSection = 'checklist' | 'place' | 'frame' | 'phone' | 'steps' | 'move' | 'upload';

export const SWING_GUIDE_SECTION_NAME: Record<SwingGuideSection, string> = {
  checklist: '찍기 전 확인',
  place: '폰 두 대 놓는 자리',
  frame: '화면에 담기',
  phone: '폰 설정',
  steps: '찍는 순서',
  move: '영상 옮기기',
  upload: '올리기',
};

/** 찍기 전 확인 — 제목 한 줄씩(우타 기준, swingForHand 로 바꾼다) */
export const SWING_GUIDE_CHECKS: { id: string; title: string }[] = [
  { id: 'two', title: '폰 두 대로 같은 스윙을 동시에' },
  { id: 'angle', title: '정면 폰(1루 쪽)과 포수 뒤 폰, 둘 다 가로' },
  { id: 'net', title: '두 폰 모두 그물 뒤에' },
  { id: 'slowmo', title: '슬로 모션 240fps, 배율 1×' },
  { id: 'tripod', title: '삼각대에 세우고 수평으로' },
  { id: 'frame', title: '발끝부터 머리, 배트 끝까지 화면 안에' },
  { id: 'light', title: '밝은 곳에서' },
  { id: 'original', title: '원본 그대로 옮기고 올리기' },
];

/** 칸마다의 점 목록(웹 · 앱 안내 화면이 같이 쓴다) — 우타 기준 */
export const SWING_GUIDE_POINTS = {
  place: [
    '정면 폰: 1루 쪽(타석 건너편)에서 타자 가슴을 마주 보게, 투구 길과 직각으로 3.5~5m.',
    '포수 뒤 폰: 포수 자리 바로 뒤 3~4m 에서 투수 쪽을 겨눠요.',
    '두 폰 사이는 90°쯤. 한 폰을 비켰다면 다른 폰도 같이 옮겨요.',
    '높이는 허리에서 가슴(1~1.3m), 수평으로.',
    '공이 날아올 수 있어요. 두 폰 모두 그물이나 펜스 뒤에 세워요.',
  ],
  frame: [
    '정면 폰은 가로, 타자 키가 화면 높이의 절반~2/3.',
    '포수 뒤 폰도 가로, 화면 높이의 1/3~절반.',
    '내딛어도, 팔로스루로 배트를 끝까지 돌려도 발끝 · 머리 · 배트 끝이 화면 밖으로 나가지 않게.',
    '찍는 동안 타자 앞을 아무도 지나가지 않게. 포수는 없어도 돼요.',
  ],
  phone: [
    '아이폰: 설정 › 카메라 › 슬로 모션 녹화 › 1080p 240fps.',
    '아이폰: 배율 1×. Pro 는 1.2× · 1.5× 로 바뀌어 있지 않은지 봐요.',
    '아이폰: 타자를 길게 눌러 AE/AF 잠금.',
    '갤럭시: 카메라 › 더보기 › 슬로우 모션, 배율 1배.',
  ],
  steps: [
    '스윙 2초 전에 두 폰 모두 녹화를 켜요.',
    '한 번 스윙해요. 티 배팅 · 토스 배팅 · 라이브 모두 돼요.',
    '팔로스루 1초 뒤에 두 폰 모두 멈춰요.',
    '다음 스윙은 새로 녹화해요.',
  ],
  move: [
    'AirDrop 은 옵션에서 모든 사진 데이터를 켜고 보내요.',
    '같은 Apple ID 의 iCloud 사진이면 옮기지 않아도 돼요.',
    '갤럭시는 퀵 셰어, 기기가 다르면 케이블로 PC 에 옮겨 PC 에서 올려요.',
  ],
} as const;

export const SWING_GUIDE_MOVE_NOTE =
  '메신저 · 메일 · 화면 녹화 · 자른 영상은 안 돼요. 올릴 때 초당 장수가 30 이나 60 으로 보이면 원본이 바뀐 거예요.';

export const swingGuideUploadPoints = (maxMb: number) => [
  '정면 칸에 정면 폰 영상, 포수 뒤 칸에 포수 뒤 폰 영상을 골라요.',
  `영상 하나에 ${maxMb}MB 까지예요(240fps 6초면 20MB 남짓).`,
];

/** 마커 샘플(3D 개발 관리자) — ③ · ④ 카메라 자리 안내 한 줄 */
export const SWING_MARKER_NOTE =
  '마커 샘플은 몸과 배트에 스티커를 붙여 3~4대로 찍은 정답지예요. ③ · ④ 카메라는 3루 쪽 비스듬히 · 투수 쪽에서 타자를 보게 세워요.';

/** 사용자 화면의 리포트 단추 — 모델을 만들기 전까지 */
export const SWING_REPORT_SOON = '준비 중이에요. 곧 열려요.';

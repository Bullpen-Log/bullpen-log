import type { V2FailCode } from '@/lib/pitch-3d/v2/contract';

/**
 * 3D 동작 분석 촬영 안내 — 순수 자료(화면은 app/(app)/videos/lab/guide/).
 *
 * 2026-10-15 사용자: "촬영안내 작성해서 우리가 가장 잘 인식할 수 있는 조건을 사용자가 참고해서 촬영할 수 있게".
 * 조건은 지어내지 않고 엔진이 실제로 막거나 틀리는 곳에서 가져왔다:
 *   - 올리기 전 검사(lib/pitch-lab-guard.ts labVideoBlock): 화면 녹화 · 30fps 급 · 짧은 변 720 밑 · 1배 밖(35mm 환산 20~32) · 2초 밑
 *   - GPU 일찍 멈추기(services/pitch3d-gpu/pitch3d_gpu/pipeline.py FRAMING_*): 몸이 보인 장면 30% 밑 · 몸 높이 중앙값 200px 밑
 *   - 3D 계산(lib/pitch-3d/analyze.ts FAIL_TEXT): 옆 영상으로 착지 · 릴리스 · 두 영상 시간 맞추기 · 두 폰 사이 60~120° 로 카메라 자리
 *   - 기준 축(docs/designs/pitch-3d-analysis.md 6): 위 = 두 폰 화면 가로축의 외적이라 폰을 옆으로 기울이면 안 되고,
 *     홈 방향 = 뒤 폰이 겨눈 방향이라 뒤 폰은 홈을 똑바로 본다
 *   - 사람 고르기(pipeline pose.py): 첫 장면에서 가장 큰 사람, 그다음은 가장 가까운 사람 — 투수 앞을 누가 지나가면 그 사람을 따라간다
 *   - 흐림은 셔터가 정한다(docs/designs/pitch-3d-quality.md 0-2 7번): 밝은 곳 · 240fps · 원본 · 삼각대 · 두 폰 60~120°
 * 2026-10-15 김민: "4~6m 는 너무 멀다 · 기종마다 1배가 다르다 · 2루 쪽은 가로면 좌우가 빈다" → 거리가 아니라 화면에 차는 몫을 기준으로 바꿨다.
 *   - 옆 폰은 가로(내딛기 1.5~2m 가 화면 옆으로 간다), 투수 키가 화면 높이의 1/2~2/3. 참고 거리 3.5~5m.
 *   - 뒤 폰은 세로(투수가 카메라에서 멀어지는 쪽으로 내딛어 옆으로 거의 안 움직인다 — 세로면 같은 거리에서 1.8배 크게), 화면 높이의 1/3~1/2.
 *     참고 거리 3~4m — 더 가까우면 내딛는 동안 투수가 1.5m 멀어져 몸 크기가 절반 가까이 줄어 깊이가 흔들린다.
 *   - 같은 화면 크기가 되는 거리는 1배 렌즈의 35mm 환산 초점에 비례 — 24 ↔ 26mm 가 0.3m 남짓이라 투수 키(1.6 ↔ 1.9m)보다 작다.
 *     엔진은 폰마다 화각을 영상에서 맞추니 기종이 달라도 계산은 그대로다.
 *   - 실험실 원본 두 샘플(가장 고른 결과)은 옆 · 뒤 3.2~3.4m, 뒤는 세로였다. 화면 녹화 샘플 여섯은 뒤 폰이 1.6~2.6m 로 가까웠다.
 *
 * 2026-10-15 사용자: "녹화 영상 금지 · 따로 촬영 금지 · 무조건 동시에", "AirDrop 으로 옮기면 프레임이 떨어진다 — 원본을 유지하며 옮기는 법도".
 * 그래서 확인 목록에 '옮긴 영상도 초당 장수 그대로'를, 화면에 '영상 옮기기' 칸을 더했다(검사는 lib/pitch-lab-guard.ts labVideoBlock · labPairBlock).
 *
 * 2026-11-07 김민: "몸에 딱 붙는 옷 안내는 찍기 전 확인에 무조건" — 헐렁한 옷은 2D 관절 점(팔꿈치 · 무릎 · 엉덩이)을 옷 가운데로 끌어
 * 3D 가 어긋난다(마커 촬영도 옷 위 스티커가 골반을 틀리게 했다). 확인 목록 한 줄 + 화면에 담기 칸 한 줄.
 *
 * 화면 글은 해요체 · 줄표 없음(scripts/pitch-lab-selftest.mts 가 본다).
 */

export const LAB_GUIDE_HREF = '/videos/lab/guide';

/**
 * 안내 화면의 칸(주소 # · 앱 ?s= 로 바로 간다).
 * 2026-11-08 김민: "중복이 많고 복잡하다, 핵심 위주로 · 카메라 설정 · 촬영 구도 · 영상 조건 · AirDrop 모든 사진 데이터는 그림으로 자세히 · 올리기는 삭제"
 * → 여덟 칸(자리 · 화면 · 폰 설정 · 순서 · 옮기기 · 올리기 …)을 넷 + 확인 + 실패로. 옛 칸 이름은 LAB_GUIDE_OLD_SECTION 으로 새 칸에 잇는다.
 */
export type LabGuideSection = 'camera' | 'frame' | 'shoot' | 'move' | 'checklist' | 'fail';

/** 앞에서 차례로 넘기는 카드(실패 칸은 흐름 밖) */
export const LAB_GUIDE_FLOW: LabGuideSection[] = ['camera', 'frame', 'shoot', 'move', 'checklist'];

/** 예전 칸 이름 → 새 칸(깔린 옛 화면 · 저장된 링크가 ?s=place 처럼 올 때) */
export const LAB_GUIDE_OLD_SECTION: Record<string, LabGuideSection> = {
  place: 'frame',
  phone: 'camera',
  steps: 'shoot',
  upload: 'move',
};

export function labGuideSectionOf(v: string | null | undefined): LabGuideSection | null {
  if (!v) return null;
  if ((LAB_GUIDE_FLOW as string[]).includes(v) || v === 'fail') return v as LabGuideSection;
  return LAB_GUIDE_OLD_SECTION[v] ?? null;
}

export function labGuideHref(section?: LabGuideSection): string {
  return section ? `${LAB_GUIDE_HREF}#${section}` : LAB_GUIDE_HREF;
}

export type LabGuideCheck = { id: string; title: string };

/**
 * 찍기 전 확인 — 앞 카드들을 현장에서 하나씩 체크한다(체크는 그 폰에만 남는다). 2026-10-15 김민: "글이 너무 많아 조잡하다" → 제목 한 줄씩.
 */
export const LAB_GUIDE_CHECKS: LabGuideCheck[] = [
  { id: 'slowmo', title: '슬로 모션 240fps, 배율 1×, AE/AF 잠금' },
  { id: 'angle', title: '옆 폰(3루 쪽)은 가로, 뒤 폰(2루 쪽)은 세로' },
  { id: 'tripod', title: '삼각대에 세우고 수평으로' },
  { id: 'frame', title: '발끝부터 머리, 손까지 화면 안에' },
  { id: 'clothes', title: '몸에 붙는 옷으로, 헐렁한 옷 · 겉옷은 벗고' },
  { id: 'light', title: '밝은 곳에서' },
  { id: 'two', title: '폰 두 대로 같은 공을 동시에' },
  { id: 'original', title: 'AirDrop 은 모든 사진 데이터를 켜고 보내기' },
];

/** 칸 이름 */
export const LAB_GUIDE_SECTION_NAME: Record<LabGuideSection, string> = {
  camera: '카메라 설정',
  frame: '촬영 구도',
  shoot: '영상 조건',
  move: '영상 옮기기',
  checklist: '찍기 전 확인',
  fail: '분석이 안 됐다면',
};

/**
 * 그림 속 폰 화면(웹 guide-shots.tsx · 앱 native/src/lab/guide-shots.tsx 가 같은 자료로 그린다).
 *   list   — 설정 · 옵션처럼 줄이 늘어선 화면. hot = 누를 줄(파란 테두리), check = 고른 줄, on = 켠 스위치
 *   camera — 카메라 앱. lock 이면 노란 'AE/AF 잠금'
 *   share  — 사진 앱 공유 화면. hot 이 'options' 면 위의 옵션 ›, 'airdrop' 이면 AirDrop
 */
export type LabGuideScreen =
  | { kind: 'list'; title: string; rows: { label: string; check?: boolean; on?: boolean; hot?: boolean }[]; done?: boolean }
  | { kind: 'camera'; lock?: boolean }
  | { kind: 'share'; hot: 'options' | 'airdrop' };

export type LabGuideShot = { text: string; screen: LabGuideScreen };

/** 카메라 설정 — 아이폰 그림 셋 */
export const LAB_GUIDE_CAMERA: LabGuideShot[] = [
  {
    text: '설정 › 카메라 › 슬로 모션 녹화에서 1080p HD 240fps 를 골라요.',
    screen: {
      kind: 'list',
      title: '슬로 모션 녹화',
      rows: [{ label: '720p HD 240fps' }, { label: '1080p HD 120fps' }, { label: '1080p HD 240fps', check: true, hot: true }],
    },
  },
  { text: '카메라 앱을 슬로 모션으로 넘기고, 배율은 1× 그대로 둬요. 위에 240 이 보이면 돼요.', screen: { kind: 'camera' } },
  { text: '화면에서 투수를 길게 눌러 위에 AE/AF 잠금이 뜨게 해요. 던지는 동안 밝기 · 초점이 안 바뀌어요.', screen: { kind: 'camera', lock: true } },
];
export const LAB_GUIDE_CAMERA_NOTE = '갤럭시는 카메라 › 더보기 › 슬로우 모션, 배율 1배로 찍어요.';

/** 촬영 구도 — 그림(자리 · 화면) 밑 점. 옆 폰 자리 글은 우투 기준(forHand 로 바꾼다) */
export const LAB_GUIDE_FRAME = [
  '옆 폰: 3루 쪽에서 투구 방향과 직각으로 3.5~5m, 가로로. 투수 키가 화면 높이의 절반~2/3.',
  '뒤 폰: 투수 바로 뒤(2루 쪽) 3~4m 에서 홈을 겨눠 세로로. 투수 키가 화면 높이의 1/3~절반.',
  '두 폰 모두 삼각대에, 허리~가슴 높이(1~1.3m)로 수평.',
  '다리를 들어도, 내딛어도 발끝 · 머리 · 손이 화면 밖으로 나가지 않게.',
];

/** 영상 조건 */
export const LAB_GUIDE_SHOOT = [
  '몸에 붙는 옷으로 찍어요. 헐렁한 후드 · 바람막이 · 통 넓은 바지는 팔꿈치 · 무릎 · 엉덩이를 가려 3D 가 어긋나요.',
  '밝은 곳에서 찍어요. 어두우면 팔이 번져요.',
  '두 폰 모두 던지기 2초 전에 켜고, 팔로스루 1초 뒤에 꺼요.',
  '한 공에 영상 하나씩, 두 폰이 같은 공을 찍어요.',
  '찍는 동안 투수 앞을 아무도 지나가지 않게 해요.',
];

/** 영상 옮기기 — 아이폰 AirDrop 그림 셋 */
export const LAB_GUIDE_MOVE: LabGuideShot[] = [
  { text: '사진 앱에서 영상을 고르고 공유를 눌러요. 위의 옵션 › 을 눌러요.', screen: { kind: 'share', hot: 'options' } },
  {
    text: '모든 사진 데이터를 켜고 완료를 눌러요. 끄면 240fps 원본이 아닌 줄인 영상이 가요.',
    screen: { kind: 'list', title: '옵션', rows: [{ label: '위치', on: true }, { label: '모든 사진 데이터', on: true, hot: true }], done: true },
  },
  { text: 'AirDrop 을 누르고 받을 폰을 골라요.', screen: { kind: 'share', hot: 'airdrop' } },
];
export const LAB_GUIDE_MOVE_NOTES = [
  '같은 Apple ID 의 iCloud 사진이면 옮기지 않아도 돼요.',
  '갤럭시는 퀵 셰어, 기기가 다르면 케이블로 PC 에 옮겨 PC 에서 올려요.',
  '메신저 · 메일 · 화면 녹화 · 자른 영상은 안 돼요. 올릴 때 30 이나 60fps 로 보이면 원본이 바뀐 거예요.',
];

/**
 * 영상 탓 실패(lib/pitch-3d/v2/contract.ts V2_VIDEO_FAULT)마다 다음에 고칠 것 한 줄 + 안내의 어느 칸.
 * 실패 글(V2_FAIL_TEXT)이 '무엇이 안 됐는지'라면 이것은 '어떻게 찍으면 되는지' — 같은 말을 되풀이하지 않는다.
 */
export const LAB_FAIL_FIX: Partial<
  Record<V2FailCode, { fix: string; section: LabGuideSection }>
> = {
  video: {
    fix: '사진 앱의 원본을 자르거나 내보내지 말고 그대로 올려 주세요.',
    section: 'move',
  },
  short: {
    fix: '옆 폰은 가로로 투수가 화면 높이의 절반~2/3, 뒤 폰은 세로로 1/3~절반쯤 되게 찍어 주세요.',
    section: 'frame',
  },
  framing: {
    fix: '옆 폰은 가로로 3.5~5m, 뒤 폰은 세로로 3~4m 에서 찍어 주세요. 투수 앞을 아무도 지나가지 않게 해요.',
    section: 'frame',
  },
  events: {
    fix: '옆 폰은 3루 쪽에서 투구 방향과 직각으로, 내딛는 발과 공 놓는 손이 다 보이게 세워 주세요.',
    section: 'frame',
  },
  pair: {
    fix: '두 폰 모두 던지기 전에 녹화를 켜고, 같은 공의 옆 영상과 뒤 영상을 짝으로 올려 주세요.',
    section: 'shoot',
  },
  sync: {
    fix: '두 폰 모두 던지기 전에 녹화를 켜고, 같은 공 하나를 같이 찍어 주세요.',
    section: 'shoot',
  },
  range: {
    fix: '두 폰 모두 다리를 들기 전부터 팔로스루가 끝날 때까지 찍어 주세요.',
    section: 'shoot',
  },
  calibration: {
    fix: '옆 폰과 뒤 폰이 투수를 사이에 두고 90°쯤 되게 세워 주세요.',
    section: 'frame',
  },
  fit: {
    fix: '밝은 곳에서 240fps 로, 삼각대에 세워 투수가 크게 나오게 다시 찍어 주세요.',
    section: 'shoot',
  },
};

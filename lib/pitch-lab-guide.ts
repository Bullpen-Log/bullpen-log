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
 * 거리(옆 4~6m · 뒤 4~5m)는 아이폰 1배 가로 화면에서 키 1.8m 투수가 화면 높이의 절반쯤 되는 거리(세로 화각 약 39° — 손떨림 보정 자름 포함)다.
 * 마커 촬영(scripts/pitch-lab/markers/selfcal/README.md)의 폰 자리 3.8~6.7m · 높이 0.6~1.8m 도 이 범위였다.
 *
 * 2026-10-15 사용자: "녹화 영상 금지 · 따로 촬영 금지 · 무조건 동시에", "AirDrop 으로 옮기면 프레임이 떨어진다 — 원본을 유지하며 옮기는 법도".
 * 그래서 확인 목록에 '옮긴 영상도 초당 장수 그대로'를, 화면에 '영상 옮기기' 칸을 더했다(검사는 lib/pitch-lab-guard.ts labVideoBlock · labPairBlock).
 *
 * 화면 글은 해요체 · 줄표 없음(scripts/pitch-lab-selftest.mts 가 본다).
 */

export const LAB_GUIDE_HREF = '/videos/lab/guide';

/** 안내 화면의 칸(주소 # 로 바로 간다) */
export type LabGuideSection =
  'checklist' | 'place' | 'frame' | 'phone' | 'steps' | 'move' | 'upload' | 'fail';

export function labGuideHref(section?: LabGuideSection): string {
  return section ? `${LAB_GUIDE_HREF}#${section}` : LAB_GUIDE_HREF;
}

export type LabGuideCheck = { id: string; title: string; why: string };

/** 찍기 전 확인 — 현장에서 하나씩 체크한다(체크는 그 폰에만 남는다) */
export const LAB_GUIDE_CHECKS: LabGuideCheck[] = [
  {
    id: 'two',
    title: '폰 두 대로 같은 공을 동시에',
    why: '한 대로 옆 · 뒤를 나눠 찍은 영상은 올릴 수 없어요. 두 영상의 찍은 시각으로 알아봐요.',
  },
  {
    id: 'angle',
    title: '옆(3루 쪽)과 뒤(2루 쪽), 두 폰 사이 90°쯤',
    why: '두 폰 사이가 60° 보다 좁거나 120° 보다 넓으면 폰의 자리를 찾지 못해요.',
  },
  {
    id: 'slowmo',
    title: '슬로 모션 240fps',
    why: '보통 동영상(30fps)은 공을 놓는 순간 팔이 번져서 올릴 수 없어요.',
  },
  {
    id: 'lens',
    title: '1배 렌즈 그대로',
    why: '분석이 1배 렌즈로 계산해요. 줌이나 광각(0.5배)은 올릴 수 없어요.',
  },
  {
    id: 'tripod',
    title: '삼각대에 세우고 수평으로',
    why: '손에 들면 흔들리고, 폰이 옆으로 기울면 위아래를 잘못 잡아요.',
  },
  {
    id: 'frame',
    title: '투수가 화면 높이의 절반, 몸 전체가 끝까지',
    why: '작게 찍히거나 발 · 손이 화면 밖으로 나가면 관절을 놓쳐요.',
  },
  {
    id: 'light',
    title: '밝은 곳에서',
    why: '어두우면 셔터가 느려져 팔이 번져요. 낮 야외가 가장 좋아요.',
  },
  {
    id: 'length',
    title: '다리 들기 전부터 팔로스루 뒤까지, 한 영상에 한 공',
    why: '5~6초면 충분해요. 2초보다 짧으면 올릴 수 없어요.',
  },
  {
    id: 'original',
    title: '사진 앱의 원본 그대로 올리기',
    why: '화면 녹화한 영상은 올릴 수 없어요. 자르거나 내보낸 영상은 시간이 어긋나요.',
  },
  {
    id: 'move',
    title: '다른 폰에서 옮긴 영상도 초당 장수 그대로',
    why: 'AirDrop 은 옵션에서 모든 사진 데이터를 켜고 보내요. 그냥 보내면 슬로 모션이 보통 영상으로 바뀔 수 있어요.',
  },
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
    section: 'upload',
  },
  short: {
    fix: '옆 폰은 4~6m, 뒤 폰은 4~5m 에서 투수가 화면 높이의 절반쯤 되게 찍어 주세요.',
    section: 'frame',
  },
  framing: {
    fix: '폰을 가로로 두고 옆 4~6m · 뒤 4~5m 에서 찍으면 대개 알맞아요. 투수 앞을 아무도 지나가지 않게 해 주세요.',
    section: 'frame',
  },
  events: {
    fix: '옆 폰은 3루 쪽에서 투구 방향과 직각으로, 내딛는 발과 공 놓는 손이 다 보이게 세워 주세요.',
    section: 'place',
  },
  sync: {
    fix: '두 폰 모두 던지기 전에 녹화를 켜고, 같은 공 하나를 같이 찍어 주세요.',
    section: 'steps',
  },
  range: {
    fix: '두 폰 모두 다리를 들기 전부터 팔로스루가 끝날 때까지 찍어 주세요.',
    section: 'steps',
  },
  calibration: {
    fix: '옆 폰과 뒤 폰이 투수를 사이에 두고 90°쯤 되게 세워 주세요.',
    section: 'place',
  },
  fit: {
    fix: '밝은 곳에서 240fps 로, 삼각대에 세워 투수가 크게 나오게 다시 찍어 주세요.',
    section: 'checklist',
  },
};

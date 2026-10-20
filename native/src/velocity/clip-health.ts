import type { Clip } from '../../modules/dual-camera';

/**
 * 클립이 장면을 얼마나 잃었나(2026-10-20) — 캡처 콜백이 밀리면 iOS 가 늦은 장면을 버리고(alwaysDiscardsLateVideoFrames) 그 장면은 녹화기에
 * 안 들어가, 60fps 라 적힌 클립에 실제론 초당 25~30장만 담긴다. 엔진은 공이 자꾸 사라지는 것으로 봐 '공 길 없음'으로 끝낸다.
 * 10-20 실내 세션(완료된 시도 11 중 ok 2 · 장면 0 이 7)이 이것이었다 — docs/velocity/native-measure-recovery-prompt.md.
 * 카메라 모듈이 클립마다 frames · fpsActual 을 실어 주면(2026-10-20 판부터) 여기서 읽는다. 옛 앱 판은 모른다(null).
 */
export const FRAME_LOSS_WARN = 0.2;

/** 잃은 비율 0~1 — 모르면 null */
export function frameLossOf(clip: Pick<Clip, 'fps' | 'fpsActual'>): number | null {
  if (clip.fpsActual == null || !(clip.fps > 0)) return null;
  return Math.max(0, Math.min(1, 1 - clip.fpsActual / clip.fps));
}

/** 기준 조건 밖 글(분석 JSON offStandard · 공 메모) — 잃은 게 적으면 null */
export function frameLossNote(clip: Pick<Clip, 'fps' | 'fpsActual'>): string | null {
  const loss = frameLossOf(clip);
  if (loss == null || loss < FRAME_LOSS_WARN) return null;
  return `장면 ${Math.round(loss * 100)}% 빠짐(초당 ${Math.round(clip.fpsActual ?? 0)}장)`;
}

/** 측정 화면 알림 — 10초에 한 번만 */
export const frameLossNotice = (fpsActual: number) =>
  `카메라가 장면을 버리고 있어요(초당 ${Math.round(fpsActual)}장). 측정이 안 될 수 있어요.`;

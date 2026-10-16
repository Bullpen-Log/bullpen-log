/**
 * 사람이 찍은 공 자리(공 감지 학습 모델 2판 자료) — 모양 · 검사. DB 는 VelocityBallLabel(JSON 한 칸), 찍는 화면은
 * app/(app)/admin/velocity/ball-labeler.tsx, 내려받기는 services/velocity-detector/pull-labels.mjs.
 * 좌표는 영상 원본 px(sourceW × sourceH), t 는 조각 · 클립 파일의 시각(초).
 */

export type BallLabelFrame = {
  t: number;
  /** [x, y, 지름](원본 px) — null 은 '이 장면엔 공이 없다'고 사람이 찍은 것 */
  ball: [number, number, number] | null;
};

export type BallLabel = {
  sourceW: number;
  sourceH: number;
  /** t 순 */
  frames: BallLabelFrame[];
};

export const MAX_LABEL_FRAMES = 600;

/** 녹화 컷 · 측정 클립을 가리키는 열쇠(VelocityBallLabel.target) */
export const cutTarget = (cutId: string) => `cut:${cutId}`;
export const pitchTarget = (pitchId: string) => `pitch:${pitchId}`;
export const TARGET_RE = /^(cut|pitch):[A-Za-z0-9-]{1,64}$/;

const fin = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** 서버 · 화면이 같이 쓰는 검사 — 틀리면 null */
export function parseBallLabel(raw: unknown): BallLabel | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!fin(o.sourceW, 16, 8192) || !fin(o.sourceH, 16, 8192)) return null;
  if (!Array.isArray(o.frames) || o.frames.length > MAX_LABEL_FRAMES) return null;
  const W = o.sourceW as number;
  const H = o.sourceH as number;
  const frames: BallLabelFrame[] = [];
  for (const f of o.frames) {
    if (!f || typeof f !== 'object') return null;
    const { t, ball } = f as Record<string, unknown>;
    if (!fin(t, 0, 3600)) return null;
    if (ball == null) {
      frames.push({ t: +(t as number).toFixed(4), ball: null });
      continue;
    }
    if (!Array.isArray(ball) || ball.length !== 3) return null;
    const [x, y, d] = ball;
    if (!fin(x, 0, W) || !fin(y, 0, H) || !fin(d, 1, 400)) return null;
    frames.push({
      t: +(t as number).toFixed(4),
      ball: [+(x as number).toFixed(1), +(y as number).toFixed(1), +(d as number).toFixed(1)],
    });
  }
  frames.sort((a, b) => a.t - b.t);
  return { sourceW: Math.round(W), sourceH: Math.round(H), frames };
}

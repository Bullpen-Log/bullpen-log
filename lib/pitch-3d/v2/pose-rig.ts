/**
 * 공식 규격 마운드(설계 pitch-3d-quality.md 0절 · 데생 인형 pitch-3d-mannequin.md §6) — 보기용 다듬기(display.ts, 바닥 높이)와 실험실 3D
 * 화면(body-3d.tsx, 마운드 면)이 같은 함수를 쓴다. 김민의 예시 page.js moundFn 과 같은 꼴 · 같은 자리 · 같은 높이 배율.
 *
 * 2026-10-11 까지는 해부학 뼈대 15조각의 자세(rigPose · public/models/skeleton-parts.json)도 여기 있었다 — 화면이 데생 인형
 * (lib/pitch-3d/v2/mannequin-*.ts · app/(app)/videos/lab/[id]/mannequin/)으로 바뀌며 뺐다(git 이력 79cef59 까지).
 * 순수 함수 — three.js 를 모른다. 시험: scripts/pitch-3d-v2-selftest.mts '마운드'.
 */

/**
 * 공식 규격 마운드(MLB 규칙 · 미터) — 투수판 위 25.4cm(10인치), 투수판 앞 15cm(6인치)부터 1피트당 1인치(1/12) 내리막이 둘레까지,
 * 둘레 반지름 2.74m(9피트)이고 그 중심은 투수판 앞 46cm(18인치). 투수판 뒤 60cm 는 평평하고 그 뒤는 둘레까지 곧게 내려간다.
 */
export const MOUND = {
  top: 0.254,
  flatFront: 0.152,
  flatBack: 0.6,
  /** 꼭대기 평평한 곳의 너비(옆으로, 5피트) — 그 밖은 원 둘레까지 내려간다 */
  flatWidth: 1.524,
  radius: 2.743,
  centerAhead: 0.457,
  rubber: { depth: 0.152, width: 0.61 },
} as const;

/**
 * 마운드 높이 함수(키 = 1 좌표, 앞 x 는 홈 쪽 · 옆 z) — 투수판 앞 모서리 자리(x0 · z0)와 투수 키(m)로 미터를 키 단위로 바꾼다.
 * 앞 내리막이 둘레(투수판 앞 3.2m)에서 0 이 되도록 규격이 맞물려 있다. 옆으로는 꼭대기 폭 5피트 밖에서 둘레까지 내려간다.
 */
export function moundHeightAt(x0: number, z0: number, heightM: number) {
  const s = 1 / heightM;
  const top = MOUND.top * s;
  const flatFront = MOUND.flatFront * s;
  const flatBack = MOUND.flatBack * s;
  const R = MOUND.radius * s;
  const cx = x0 + MOUND.centerAhead * s;
  const backEdge = cx - R;
  const halfFlat = (MOUND.flatWidth / 2) * s;
  return (x: number, z: number): number => {
    const r = Math.hypot(x - cx, z - z0);
    if (r >= R) return 0;
    const d = x - x0;
    /* 앞뒤 단면 */
    const along =
      d >= flatFront
        ? top - (d - flatFront) / 12
        : d >= -flatBack
          ? top
          : (top * (x - backEdge)) / (x0 - flatBack - backEdge);
    /*
     * 옆 단면 — 꼭대기 폭 5피트 밖은 그 자리의 원 둘레(반현)까지 곧게 내려간다. 예전엔 옆으로 원 끝까지 꼭대기 높이라 폭 5.5m 의
     * 평평한 언덕이 돼 '실제보다 너무 크다'고 보였다(2026-10-09 김민).
     */
    const half = Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
    const side = Math.abs(z - z0);
    const across =
      side <= halfFlat
        ? top
        : half <= halfFlat
          ? 0
          : (top * (half - side)) / (half - halfFlat);
    return Math.max(0, Math.min(along, across));
  };
}

/**
 * 구속 시험대 자료 — fixtures.json 의 묶음을 공 하나하나로 펼친다. 받아 둔 manifest · cuts.json 을 읽기만 한다(받기는 fetch.mjs).
 *
 * 공 하나: { id, group, split, path, gun, seed, fov, inputDistM, tape, trueDistM, stitch? }
 *   seed       — 공이 손을 떠난 때(영상 초). 앱처럼 그 둘레(BALL_RANGE)만 잰다. null 이면 영상 전체를 훑는다(카메라 앱 파일).
 *   fov        — 긴 변 화각(°). null 이면 파일의 렌즈 정보로.
 *   inputDistM — 앱이 그때 엔진에 넘긴 거리(줄자 세션이면 그 값, 아니면 20). tape 면 앱이 공 크기 자동 거리를 껐다.
 *   stitch     — 녹화 컷의 공 길이 조각 끝을 넘으면 앞뒤 조각을 이어 붙인 클립(LAB/bench/<녹화>/c<차례>.mp4)을 쓴다 — 그 계획.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAB } from '../velocity-lab/cdp.mjs';

export const FIXTURES = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
export const BENCH = join(LAB, 'bench');
/** 앱이 공 알림 둘레에서 재는 창(native/src/velocity/capture.ts BALL_RANGE) — 이 창이 조각 하나에 안 들면 이어 붙인다 */
export const BALL_RANGE = [0.25, 1.45];
/** 이어 붙인 클립의 공 앞 · 뒤(초) — 창보다 조금 넉넉히 */
export const STITCH_PAD = [0.6, 1.6];
const BASE_DIST = 20;

export const recDirs = (g) => g.dirs ?? g.recs.map((r) => `rec-${r}`);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** 녹화 컷이 조각 하나 안에서 BALL_RANGE 를 다 덮으면 null, 아니면 이어 붙일 조각들과 녹화 시각 창 */
export function stitchPlan(rec, cut, dir) {
  if (!rec.parts || cut.eventSec == null) return null;
  const part = rec.parts.find((p) => p.file === cut.file);
  if (!part?.durationSec) return null;
  if (cut.eventSec - BALL_RANGE[0] >= 0 && cut.eventSec + BALL_RANGE[1] <= part.durationSec) return null;
  const at = part.offsetSec + cut.eventSec;
  const t0 = at - STITCH_PAD[0];
  const t1 = at + STITCH_PAD[1];
  const parts = rec.parts
    .filter((p) => p.durationSec && p.offsetSec < t1 && p.offsetSec + p.durationSec > t0)
    .sort((a, b) => a.offsetSec - b.offsetSec)
    .map((p) => ({ path: join(LAB, dir, p.file), offsetSec: p.offsetSec, durationSec: p.durationSec }));
  return { t0, t1, parts };
}

/** fixtures.json 의 모든 공 — 받아 두지 않은 묶음은 missing 에 */
export function loadBalls() {
  const balls = [];
  const missing = [];
  for (const g of FIXTURES.groups) {
    const base = { group: g.id, split: g.split, trueDistM: g.trueDistM ?? null };
    if (g.kind === 'rec') {
      for (const dir of recDirs(g)) {
        const cj = join(LAB, dir, 'cuts.json');
        if (!existsSync(cj)) {
          missing.push(cj);
          continue;
        }
        const rec = readJson(cj);
        rec.cuts.forEach((c, i) => {
          const stitch = stitchPlan(rec, c, dir);
          balls.push({
            ...base,
            id: `${g.id}:${dir.slice(4)}#${i + 1}`,
            path: stitch ? join(BENCH, dir, `c${i + 1}.mp4`) : join(LAB, dir, c.file),
            gun: c.gun ?? null,
            seed: stitch ? STITCH_PAD[0] : (c.eventSec ?? null),
            fov: g.fovDeg ?? rec.meta?.fovDeg ?? null,
            inputDistM: BASE_DIST,
            tape: false,
            memo: c.memo ?? null,
            ...(stitch ? { stitch } : {}),
          });
        });
      }
      continue;
    }
    const dir = join(LAB, g.date, g.kind === 'live' ? 'live' : 'clips');
    const mf = join(LAB, g.date, 'manifest.json');
    if (!existsSync(mf) || !existsSync(dir)) {
      missing.push(mf);
      continue;
    }
    for (const e of readJson(mf)) {
      if (e.gun == null || !existsSync(join(dir, e.file))) continue;
      if (g.kind === 'files') {
        balls.push({ ...base, id: `${g.id}:${e.file}`, path: join(dir, e.file), gun: e.gun, seed: null, fov: g.fovDeg ?? null, inputDistM: BASE_DIST, tape: false });
        continue;
      }
      const an = readJson(join(dir, `${e.file}.analysis.json`));
      const dist = an.distance?.inputDistM ?? BASE_DIST;
      if (dist !== g.inputDistM) continue;
      const long = Math.max(an.sourceSize?.width ?? e.session.frameW, an.sourceSize?.height ?? e.session.frameH);
      const fp = an.focalPx ?? e.session.focalPx;
      balls.push({
        ...base,
        id: `${g.id}:${e.file}`,
        path: join(dir, e.file),
        gun: e.gun,
        seed: e.clipEventSec ?? null,
        fov: (2 * Math.atan(long / 2 / fp) * 180) / Math.PI,
        inputDistM: dist,
        tape: dist !== BASE_DIST,
      });
    }
  }
  return { balls, missing };
}

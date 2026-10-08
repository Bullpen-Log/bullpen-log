/**
 * 실제 샘플 돌리기 — ~/bullpen-pose-lab/tracks.json(저장소 밖, 실험실 샘플의 관절)을 3D 엔진에 넣고 품질 · 지표를 찍는다(설계 5절 1단계,
 * 검토 R6 · R7). 사람 영상 · 관절 · 메모(선수 이름)는 공개 저장소에 올리지 않는다 — 여기서도 샘플 번호 앞 6글자만 찍는다.
 *
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/run-3d.mts
 *
 * tracks.json 모양: { "<번호>-side" | "<번호>-back": { meta: { hand, slowmoFps, screenRecorded }, track: PoseTrack } }
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyzePitch3d, WARNING_TEXT } from '../../lib/pitch-3d/analyze.ts';
import type { PoseTrack } from '../../lib/pose/types.ts';

type Entry = { meta?: { hand?: 'R' | 'L'; slowmoFps?: number | null; screenRecorded?: boolean }; track: PoseTrack };
const data = JSON.parse(readFileSync(join(homedir(), 'bullpen-pose-lab', 'tracks.json'), 'utf8')) as Record<string, Entry>;
const ids = [...new Set(Object.keys(data).map((k) => k.split('-')[0]))];

/* 부위별 합격(검토 D8): 몸통 · 다리 7% · 위팔 10% · 아래팔 15%, 다시 비춤 2% */
const LIMIT = { trunk: 7, legs: 7, upperArm: 10, forearm: 15, reproj: 2 };

for (const id of ids) {
  const side = data[`${id}-side`];
  const back = data[`${id}-back`];
  if (!side || !back) continue;
  const hand = side.meta?.hand ?? 'R';
  const t0 = Date.now();
  const r = analyzePitch3d({
    side: side.track,
    back: back.track,
    hand,
    slowmoFps: side.meta?.slowmoFps ?? null,
    screenRecorded: side.meta?.screenRecorded ?? true,
  });
  const ms = Date.now() - t0;
  const head = `■ ${id.slice(0, 6)} (${hand === 'L' ? '좌투' : '우투'}) · ${ms}ms · 관절 장면 옆 ${side.track.frames.length} 뒤 ${back.track.frames.length}`;
  if (!r.ok) {
    console.log(`${head}\n  실패: ${r.code} — ${r.reason}\n  ${JSON.stringify(r.quality ?? {})}`);
    continue;
  }
  const q = r.quality;
  const pass = (v: number, lim: number) => (v <= lim ? 'OK' : '넘음');
  console.log(head);
  console.log(
    `  장면 밀도(초당) 옆 ${q.density.side} 뒤 ${q.density.back} · 덮임 ${q.coverage} · 시간 맞춤 ${q.syncCost} · 시간 다듬음 ${q.offsetFrames}장면` +
      ` · 뒤 거울 ${q.flips.backMirrored} · 좌우 고침 ${q.flips.side}/${q.flips.back}/${q.flips.repaired} · 손 바꿈 ${q.flips.handSwapped}`
  );
  console.log(
    `  카메라: 광축 사이 ${q.axisAngleDeg}° · 초점(긴 변 배수) 옆 ${q.focal.side} 뒤 ${q.focal.back} · 폭 ${q.focal.spread} · 믿음 ${q.calibration}` +
      ` · 골반 길 vs 뒤 카메라 ${q.travelVsBackDeg}°`
  );
  console.log(
    `  일관성: 다시 비춤 ${q.reprojPct}% (${pass(q.reprojPct, LIMIT.reproj)}) · 뼈 흔들림 몸통 ${q.boneCv.trunk}% (${pass(q.boneCv.trunk, LIMIT.trunk)})` +
      ` 다리 ${q.boneCv.legs}% (${pass(q.boneCv.legs, LIMIT.legs)}) 위팔 ${q.boneCv.upperArm}% (${pass(q.boneCv.upperArm, LIMIT.upperArm)})` +
      ` 아래팔 ${q.boneCv.forearm}% (${pass(q.boneCv.forearm, LIMIT.forearm)})`
  );
  console.log(`  경고: ${r.warnings.map((w) => WARNING_TEXT[w]).join(' / ') || '없음'}`);
  console.log(`  지표: ${r.metrics.map((m) => `${m.key} ${m.value}${m.unit === 'deg' ? '°' : m.unit === 'pct' ? '%' : 'ms'}±${m.pm}(${m.trust})`).join(' · ')}`);
}

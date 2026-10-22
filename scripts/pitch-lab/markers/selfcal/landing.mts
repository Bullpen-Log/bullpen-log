/**
 * 착지 맞춤 — '착지' 단추(events.footContact) 장면에 인형 앞발(뒤꿈치 · 발끝 낮은 쪽)이 디딘 높이보다 몇 cm 떠 있나(화면과 같은 길:
 * displayTrack → smoothForMannequin). 2026-10-22 김민: "착지 단추를 누르면 애니메이션과 싱크가 안 맞는다" — 고치기 전 정강민 8.3 · 김민 1.5cm.
 *
 *   node --import <저장소>/scripts/alias-register.mjs landing.mts <bench 폴더> <키 m> <투구 번호,…>   → 한 줄 JSON { median_cm, rows }
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayTrack } from '../../../../lib/pitch-3d/v2/display.ts';
import { smoothForMannequin } from '../../../../lib/pitch-3d/v2/mannequin-prep.ts';
import { V2J } from '../../../../lib/pitch-3d/v2/contract.ts';

const [dir, hArg, psArg] = process.argv.slice(2);
const h = Number(hArg);
const rows: [number, number][] = [];
for (const p of psArg.split(',').map(Number)) {
  const f = join(dir, `p${String(p).padStart(2, '0')}`, 'result.json');
  if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  if (!r.ok) continue;
  const S = smoothForMannequin(displayTrack(r, { ground: 'mound', heightM: h }).frames, r, h);
  const [he, to] = r.hand === 'L' ? [V2J.rHe, V2J.rTo] : [V2J.lHe, V2J.lTo];
  const sole = S.map((fr) => Math.min(fr[he][1], fr[to][1]));
  const ev = r.events;
  const fc = ev.footContact ?? ev.footPlant;
  const after = sole.slice(ev.footPlant, ev.release + 1).sort((a, b) => a - b);
  const rest = after[Math.floor(after.length / 2)];
  rows.push([p, Math.round((sole[fc] - rest) * 1000) / 10]);
}
const v = rows.map((r) => r[1]).sort((a, b) => a - b);
console.log(JSON.stringify({ median_cm: v.length ? v[Math.floor(v.length / 2)] : null, rows }));

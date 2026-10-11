/**
 * 데생 인형 예시 페이지 만들기 — 드라이브라인 투구 하나(obp-pitch.json)와 우리 투구 분석 샘플 하나를 한 HTML 로 묶는다.
 * 설명 · 결정은 docs/designs/pitch-3d-mannequin.md.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/pitch-lab/mannequin/build.mts --sample=4 --out=<파일.html>
 *
 * 샘플은 영상 버킷에서 읽기만 한다(DB · 저장소에 쓰지 않음). 샘플 번호는 실험실 화면과 같게 오래된 순 1부터.
 * 샘플에는 선수 이름이 들어 있어 만든 HTML 은 저장소 밖에 둔다(공개 저장소).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayTrack } from '@/lib/pitch-3d/v2/display';
import { V2_JOINTS } from '@/lib/pitch-3d/v2/contract';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const sampleNo = Number(arg('sample') ?? 4);
const out = arg('out');
if (!out) throw new Error('--out=<파일.html> 이 필요해요');

const bucket = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from('pitch-videos');
const root = `${arg('user') ?? '2803cf76-3996-4b80-936f-74e616a07c72'}/pitch-lab`;
const text = async (p: string) => {
  const { data, error } = await bucket.download(p);
  if (error || !data) throw new Error(`${p}: ${error?.message}`);
  return data.text();
};
const { data: dirs } = await bucket.list(root, { limit: 200 });
const samples = [];
for (const d of (dirs ?? []).filter((x) => x.id == null))
  samples.push({ id: d.name, meta: JSON.parse(await text(`${root}/${d.name}/meta.json`)) });
samples.sort((a, b) => (a.meta.createdAt ?? '').localeCompare(b.meta.createdAt ?? ''));
const pick = samples[sampleNo - 1];
if (!pick) throw new Error(`샘플 ${sampleNo} 이 없어요(모두 ${samples.length}개)`);
const job = JSON.parse(await text(`${root}/${pick.id}/job.json`));
const r = JSON.parse(await text(`${root}/${pick.id}/analysis-v2-${job.shownJobId}.json`));
const h = (pick.meta.heightCm ?? 180) / 100;
const ground = pick.meta.ground ?? 'mound';
const tr = displayTrack(r, { ground, heightM: h });
const names = V2_JOINTS.map((j) => j.name);
/* 미터 · [앞, 위, 오른쪽] — 페이지가 셋째 축을 뒤집는다(fromLab) */
const F: number[][][] = tr.frames.map((f) => f.map((p) => [p[0] * h, p[1] * h, p[2] * h]));
const n = F.length;
const J = (nm: string) => names.indexOf(nm);
const lead = r.hand === 'L' ? 'r' : 'l';
const glove = lead;
const throwing = lead === 'l' ? 'r' : 'l';

/* 1) 앞발 착지: 처음 땅에 닿은 장면(L0)부터 엔진이 발을 고정한 장면(Le)까지 매끈하게 잇는다 — 샘플 4는 그 사이 옆으로 29cm 튀었다 */
const an = J(`${lead}An`);
const fp = r.events.footPlant;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let Le = -1;
for (let i = fp; i < n - 5 && Le < 0; i++) {
  let still = true;
  for (let j = i; j < Math.min(n, i + 20); j++) if (dist(F[i][an], F[j][an]) >= 0.001) still = false;
  if (still) Le = i;
}
if (Le > 0) {
  const zLock = F[Le][an][1];
  let L0 = fp - 15;
  while (L0 < Le && F[L0][an][1] > zLock + 0.05) L0++;
  const ease = (u: number) => u * u * (3 - 2 * u);
  for (const nm of ['An', 'He', 'To', 'Kn']) {
    const j = J(`${lead}${nm}`);
    const a = F[L0][j].slice();
    const b = F[Le][j].slice();
    for (let i = L0 + 1; i < Le; i++) {
      const u = ease((i - L0) / (Le - L0));
      F[i][j] = a.map((v, c) => v + (b[c] - v) * u);
    }
  }
  console.log(`앞발 착지 잇기 ${L0} → ${Le}`);
}

/* 2) 관절마다 가우스로 고르게 — 글러브 팔은 세게(떨림이 던지는 손의 1.2~1.5배), 던지는 팔은 빠른 움직임이 무뎌지지 않게 약하게 */
const sigma = (nm: string) => {
  const hand = ['Wr', 'HandMid', 'HandIdx', 'HandPinky'];
  if (nm === `${glove}El`) return 2.5;
  if (hand.some((x) => nm === `${glove}${x}`)) return 3.5;
  if (nm === `${throwing}El` || hand.some((x) => nm === `${throwing}${x}`)) return 0.7;
  if (['Kn', 'An', 'He', 'To'].some((x) => nm === `${lead}${x}`) || ['nose', 'lEar', 'rEar'].includes(nm)) return 1.5;
  return 1;
};
const S = F.map((fr) => fr.map((p) => p.slice()));
names.forEach((nm, j) => {
  const s = sigma(nm);
  const R = Math.ceil(3 * s);
  for (let i = 0; i < n; i++) {
    const acc = [0, 0, 0];
    let ws = 0;
    for (let d = -R; d <= R; d++) {
      const k = i + d;
      if (k < 0 || k >= n) continue;
      const w = Math.exp(-(d * d) / (2 * s * s));
      ws += w;
      for (let c = 0; c < 3; c++) acc[c] += F[k][j][c] * w;
    }
    S[i][j] = acc.map((v) => Math.round((v / ws) * 10000) / 10000);
  }
});

const hand = r.hand === 'L' ? '왼손' : '오른손';
const S4 = {
  label: `우리 샘플 ${sampleNo}${pick.meta.memo ? ` · ${String(pick.meta.memo).split(' ').at(-1)}` : ''}`,
  info: [pick.meta.memo?.split(' ').slice(0, -1).join(' '), hand, `키 ${Math.round(h * 100)}cm`, ground === 'mound' ? '마운드' : '평지']
    .filter(Boolean)
    .join(' · '),
  names,
  hand: r.hand,
  ev: r.events,
  heightCm: Math.round(h * 100),
  ground,
  mound: tr.mound,
  frames: S,
};
const head = readFileSync(join(here, 'head.html'), 'utf8').replace(/샘플 4/g, `샘플 ${sampleNo}`);
const obp = readFileSync(join(here, 'obp-pitch.json'), 'utf8');
const page = readFileSync(join(here, 'page.js'), 'utf8');
writeFileSync(out, `${head}<script>\nconst OBP=${obp}, S4=${JSON.stringify(S4)};\n${page}</script>\n`);
console.log(`${out} — 샘플 ${sampleNo}(${pick.id.slice(0, 8)}, ${n}장면, ${r.hand})`);

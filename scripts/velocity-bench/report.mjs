/**
 * 구속 시험대 보고서 — run.mjs 결과 JSON 을 나눔 · 묶음 · 속도 띠로 묶어 표를 낸다. 목표(지도 3번)는 확인용(holdout) 기준으로 판정.
 *
 *   npm run velocity:bench:report -- <결과.json>                 표
 *   … -- <결과.json> --append                                     docs/velocity/redesign/bench-results.md 에 판 한 줄
 *   … -- --compare=<앞.json>,<뒤.json>                            공마다 바뀐 것 · 묶음별 MAE 전후
 *
 * 길마다 재는 것(차이 = 낸 값 − 스피드건):
 *   app  — 기록 = 앱 화면 규칙을 지난 공(shown), 차이는 화면 값
 *   true · true±5 — 잼 = 엔진이 값을 냄(믿음 무관), 차이는 엔진 값. 끝 판정(impact)별 치우침도 — 거리 밖 9% 가설 H1(DESIGN.md 5절)
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, argOf } from '../velocity-lab/cdp.mjs';

const GOAL = { found: 0.9, within3: 0.8, mae: 2.5 };
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '-' : v.toFixed(d));
const pct = (v) => (v == null || Number.isNaN(v) ? '-' : `${Math.round(v * 100)}%`);
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** 길 하나의 값 — 기록됐으면 km/h, 아니면 null */
function valueOf(r, mode) {
  const x = r[mode];
  if (!x) return undefined; /* 이 길을 안 잼(실제 거리 모름) */
  if (mode === 'app') return x.shown ?? null;
  return x.ok ? x.kmh : null;
}

/** 공 묶음의 숫자 — n 던짐 · 기록 수 · 차이 통계 · MAE 90% 구간(부트스트랩, 씨앗 고정) */
function stats(rows, mode) {
  const rs = rows.filter((r) => valueOf(r, mode) !== undefined);
  const rec = rs.filter((r) => valueOf(r, mode) != null);
  const errs = rec.filter((r) => r.gun != null).map((r) => valueOf(r, mode) - r.gun);
  const rel = rec.filter((r) => r.gun != null).map((r) => valueOf(r, mode) / r.gun - 1);
  const abs = errs.map(Math.abs);
  const mae = abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : NaN;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const boots = [];
  for (let k = 0; abs.length > 1 && k < 2000; k++) {
    let s = 0;
    for (let i = 0; i < abs.length; i++) s += abs[Math.floor(rnd() * abs.length)];
    boots.push(s / abs.length);
  }
  boots.sort((a, b) => a - b);
  return {
    n: rs.length,
    rec: rec.length,
    paired: errs.length,
    recRate: rs.length ? rec.length / rs.length : NaN,
    mae,
    ci: boots.length ? [boots[Math.floor(boots.length * 0.05)], boots[Math.floor(boots.length * 0.95)]] : null,
    p90: abs.length ? [...abs].sort((a, b) => a - b)[Math.max(0, Math.ceil(abs.length * 0.9) - 1)] : NaN,
    within3: abs.length ? abs.filter((e) => e <= 3).length / abs.length : NaN,
    bias: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : NaN,
    biasPct: median(rel),
  };
}

const line = (label, s) =>
  `${label.padEnd(16)} 공 ${String(s.n).padStart(3)} · 기록 ${String(s.rec).padStart(3)}(${pct(s.recRate).padStart(4)}) · MAE ${fmt(s.mae).padStart(5)}` +
  `${s.ci ? ` [${fmt(s.ci[0])}~${fmt(s.ci[1])}]` : ''} · 90% ${fmt(s.p90).padStart(5)} · ±3 안 ${pct(s.within3).padStart(4)} · 평균 ${s.bias >= 0 ? '+' : ''}${fmt(s.bias)} · 가운데 ${s.biasPct >= 0 ? '+' : ''}${fmt(s.biasPct * 100)}%`;

function report(res) {
  const { meta, rows } = res;
  console.log(`엔진 ${meta.version}(${meta.engine} · ${meta.commit}${meta.dirty ? ' · 고침 있음' : ''}) · ${meta.browser} · ${meta.at.slice(0, 16)} · ${meta.seconds}초`);
  const modes = meta.modes.filter((m) => rows.some((r) => r[m]));
  const bands = [
    ['~100', (g) => g < 100],
    ['100~115', (g) => g >= 100 && g < 115],
    ['115~130', (g) => g >= 115 && g < 130],
    ['130~', (g) => g >= 130],
  ];
  for (const mode of modes) {
    console.log(`\n── ${mode === 'app' ? 'app(앱 그대로 · 화면 규칙)' : `${mode}(실제 거리${mode === 'true' ? '' : ` ${mode.slice(4)}%`} 넣음)`}`);
    for (const split of ['holdout', 'tune', 'diag']) {
      const sr = rows.filter((r) => r.split === split);
      if (!sr.some((r) => r[mode])) continue;
      const s = stats(sr, mode);
      console.log(line(`[${split}]`, s));
      for (const g of [...new Set(sr.map((r) => r.group))]) {
        const gs = stats(sr.filter((r) => r.group === g), mode);
        if (gs.n) console.log(line(`  ${g}`, gs));
      }
      if (split === 'holdout') {
        for (const [b, f] of bands) {
          const bs = stats(sr.filter((r) => r.gun != null && f(r.gun)), mode);
          if (bs.n) console.log(line(`  건 ${b}`, bs));
        }
        const ok = s.recRate >= GOAL.found && s.within3 >= GOAL.within3 && s.mae < GOAL.mae;
        console.log(`  목표(기록 ${pct(GOAL.found)} · ±3 안 ${pct(GOAL.within3)} · MAE ${GOAL.mae} 밑): ${ok ? '통과' : '미달'}`);
      }
      if (mode !== 'app') {
        const sure = stats(sr.filter((r) => ['high', 'medium'].includes(r[mode]?.conf)), mode);
        if (sure.rec) console.log(line('  믿음 높음·보통', sure));
      }
      if (mode !== 'app')
        for (const imp of ['rebound', 'end']) {
          const is = stats(sr.filter((r) => r[mode]?.impact === imp), mode);
          if (is.rec) console.log(line(`  끝 ${imp}`, is));
        }
    }
  }
  /* 못 잰 까닭 — 확인용 */
  const codes = {};
  for (const r of rows.filter((r) => r.split === 'holdout' && r.app && !r.app.ok)) codes[r.app.code ?? r.app.error] = (codes[r.app.code ?? r.app.error] ?? 0) + 1;
  if (Object.keys(codes).length) console.log(`\n확인용 app 못 잰 까닭: ${Object.entries(codes).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}

function append(res) {
  const { meta, rows } = res;
  const h = rows.filter((r) => r.split === 'holdout');
  const a = stats(h, 'app');
  const t = stats(h, 'true');
  const md = join(REPO, 'docs/velocity/redesign/bench-results.md');
  const row = `| ${meta.at.slice(0, 10)} | ${meta.version} | ${meta.commit}${meta.dirty ? '*' : ''} | ${meta.browser.split('/')[0]} | ${a.n} | ${pct(a.recRate)} | ${fmt(a.mae)}${a.ci ? ` [${fmt(a.ci[0])}~${fmt(a.ci[1])}]` : ''} | ${pct(a.within3)} | ${pct(t.recRate)} | ${fmt(t.mae)} | ${t.biasPct >= 0 ? '+' : ''}${fmt(t.biasPct * 100)}% |\n`;
  appendFileSync(md, row);
  console.log('적음:', md);
}

function compare(pa, pb) {
  const [A, B] = [load(pa), load(pb)];
  console.log(`앞 ${A.meta.version}(${A.meta.commit}) → 뒤 ${B.meta.version}(${B.meta.commit})`);
  const modes = B.meta.modes.filter((m) => A.meta.modes.includes(m));
  const byId = new Map(A.rows.map((r) => [r.id, r]));
  for (const mode of modes) {
    const changed = [];
    for (const r of B.rows) {
      const p = byId.get(r.id);
      if (!p) continue;
      const [x, y] = [valueOf(p, mode), valueOf(r, mode)];
      if (x === undefined && y === undefined) continue;
      if ((x == null) !== (y == null) || (x != null && Math.abs(x - y) > 0.05))
        changed.push(`  ${r.id.padEnd(30)} 건 ${String(r.gun ?? '-').padStart(3)} | ${x == null ? '-' : fmt(x)} → ${y == null ? '-' : fmt(y)}`);
    }
    console.log(`\n── ${mode}: 바뀐 공 ${changed.length}`);
    if (changed.length) console.log(changed.join('\n'));
    for (const g of [...new Set(B.rows.map((r) => r.group))]) {
      const [sa, sb] = [stats(A.rows.filter((r) => r.group === g), mode), stats(B.rows.filter((r) => r.group === g), mode)];
      if (!sa.n && !sb.n) continue;
      const worse = sb.mae - sa.mae > 1;
      console.log(`  ${g.padEnd(8)} 기록 ${sa.rec} → ${sb.rec} · MAE ${fmt(sa.mae)} → ${fmt(sb.mae)}${worse ? '  ⚠ 1km/h 넘게 나빠짐' : ''}`);
    }
  }
}

const cmp = argOf('compare', '');
if (cmp) compare(...cmp.split(','));
else {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('쓰는 법: report.mjs <결과.json> [--append] | --compare=<앞>,<뒤>');
  const res = load(file);
  report(res);
  if (process.argv.includes('--append')) append(res);
}

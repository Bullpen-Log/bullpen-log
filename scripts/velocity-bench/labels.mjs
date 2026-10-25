/**
 * 사람이 찍은 공 라벨(docs/velocity/redesign/SPEC-labels.md) 읽기 — 공 하나에 JSON 하나(<폴더>/<공 id 를 파일 이름으로 바꾼 것>.json).
 * 시험대(run.mjs --labels)가 단계 B(검출 → 사람이 확인한 연결)에 쓴다: 중심을 공 길 안내(netHits)로 넘긴다 — 점수 1 · 지름 없음(d 0,
 * net-flight.ts 의 지름 없는 길). 단계 C(사람이 확인한 중심으로 궤적까지) · D(실측 공간)는 엔진 입구가 생기면(SPEC-labels.md 4절).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 공 id → 파일 이름(run.mjs --dump 와 같은 규칙) */
export const labelFileOf = (id) => `${id.replace(/[^\w.-]+/g, '_')}.json`;

/** 폴더의 라벨 전부 — Map(공 id → 라벨). 모양이 어긋난 파일은 건너뛰고 알린다 */
export function loadLabels(dir) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    let j;
    try {
      j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      console.error(`라벨을 못 읽어요: ${f}`);
      continue;
    }
    if (typeof j.id !== 'string' || !Array.isArray(j.centers) || j.schema !== 1) {
      console.error(`라벨 모양이 달라요(schema 1 · id · centers): ${f}`);
      continue;
    }
    out.set(j.id, j);
  }
  return out;
}

/** 라벨의 중심 → 안내(netHits 꼴 — 세운 화면 비율 · 지름 0 · 점수 1). 가린 구간(occluded)의 중심은 뺀다 */
export function labelHits(label) {
  const hidden = (t) => (label.occluded ?? []).some(([a, b]) => t >= a && t <= b);
  return label.centers
    .filter(
      ([t, x, y]) =>
        [t, x, y].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
        !hidden(t)
    )
    .map(([t, x, y]) => ({ t, x, y, d: 0, score: 1 }));
}

/**
 * 투구 드릴 분류 다시(2026-10-16 사용자: "요소별 드릴이 맞게 들어갔는지 심층 분석 · 고쳐줘").
 * 근거 · 결정은 docs/mechanics/drill-review-2026-10-16.md, 바꿀 표는 같은 이름의 .json.
 *
 * - focus: 주 요소가 원본(Paradigm P1~P5 · 트레드 · 드라이브라인 설명 · 영상 장면)과 다른 19묶음 — focusPoints(· stage · 설명)
 * - strength: 버티기 · 저항 · 물주머니 드릴을 새 분류 '근력 · 안정 드릴'로. '나중에 촬영'에 있는 것은 DB 분류 대신
 *   lib/shoot/later-drills.json 의 원래 분류를 바꾼다(찍어서 되돌릴 때 그 분류로 간다).
 * 묶음 = 화면의 동작 이름(lib/mechanics/drills.ts familyTitle — 앞 P1~P5 · 끝 (작은 공)/(큰 공)을 뗀 이름). 숨긴 줄도 같이 바꾼다.
 * 먼저 `npm run backup`.
 *
 *   node --env-file=.env scripts/mechanics-reclass-2026-10-16.mjs            # 확인만
 *   node --env-file=.env scripts/mechanics-reclass-2026-10-16.mjs --apply    # 바꾸기(바꾸기 전 값은 .before.json 에)
 *   node --env-file=.env scripts/mechanics-reclass-2026-10-16.mjs --restore  # 되돌리기
 *
 * 바꾼 뒤에는 lib/library-cache.ts 의 드릴 캐시 이름(library:guides:vN)이 올라간 커밋과 함께여야 화면에 든다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const PLAN = JSON.parse(readFileSync(new URL('./mechanics-reclass-2026-10-16.json', import.meta.url), 'utf8'));
const BEFORE = new URL('./mechanics-reclass-2026-10-16.before.json', import.meta.url);
const LATER_FILE = new URL('../lib/shoot/later-drills.json', import.meta.url);
const laterSaved = JSON.parse(readFileSync(LATER_FILE, 'utf8'));

const familyTitle = (title) =>
  title
    .replace(/\s*\((큰|작은) 공\)\s*$/, '')
    .replace(/^P\d+\s+/, '')
    .trim();

/*
 * 와이드 스트레치 스로우 — 원본은 P1(다리 들기) 드릴인데 2026-10-04 설명은 이름만 보고 '넓게 선 채 회전'으로 썼다. 유튜브 장면(영상의 25 · 50 · 75%)에
 * 다리를 들고 버티는 모습과 넓게 내딛어 던지는 모습이 보여 그대로 다시 쓴다. 첫 칸의 도구 문장 · 세기 칸은 그대로 둔다. 촬영 때 영상과 다시 맞춰 볼 것.
 */
function wideStretch(desc) {
  const parts = desc.split('\n\n');
  const [head, ...body] = parts[0].split('\n');
  const tool = body.join(' ').split('. ').slice(2).join('. ');
  const what = `세트 자세에서 다리를 들어 잠깐 버틴 뒤, 홈 쪽으로 넓게 내딛으며 던지는 동작입니다.${tool ? ` ${tool}` : ''}`;
  const how = [
    '■ 이렇게 하세요',
    '1. 투구판 위 세트 자세처럼 옆으로 섭니다.',
    '2. 다리를 들고, 가장 높이 든 자리에서 몸이 홈 쪽으로 흘러가기 시작하게 합니다.',
    '3. 평소보다 조금 넓게 내딛어 앞발을 딛습니다.',
    '4. 앞발이 닿으면 골반, 몸통 순서로 돌려 던집니다.',
  ].join('\n');
  const why = [
    '■ 왜 하나요',
    '다리를 드는 동안 몸이 홈 쪽으로 흘러가는 드리프트를 실제 던지기에 잇는 연습입니다. 다리를 들고 투구판 위에 멈춰 서면 앞으로 가는 힘을 처음부터 다시 만들어야 합니다.',
  ].join('\n');
  const rest = parts.filter((p) => p.startsWith('■ 세기'));
  return [`${head}\n${what}`, how, why, ...rest].join('\n\n');
}
const REWRITE = { wideStretch };

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const args = process.argv.slice(2);

if (args[0] === '--restore') {
  if (!existsSync(BEFORE)) {
    console.log('되돌릴 기록(.before.json)이 없다.');
  } else {
    const before = JSON.parse(readFileSync(BEFORE, 'utf8'));
    await prisma.$transaction(
      before.rows.map((r) =>
        prisma.mechanicsGuide.update({
          where: { id: r.id },
          data: { category: r.category, focusPoints: r.focusPoints, stage: r.stage, description: r.description },
        })
      )
    );
    for (const [id, category] of Object.entries(before.later)) if (laterSaved[id]) laterSaved[id].category = category;
    writeFileSync(LATER_FILE, JSON.stringify(laterSaved, null, 1) + '\n');
    console.log(`되돌림 ${before.rows.length}줄 · 나중에 촬영 기록 ${Object.keys(before.later).length}줄. 드릴 캐시 이름을 하나 올린다.`);
  }
} else {
  const rows = await prisma.mechanicsGuide.findMany({
    select: { id: true, title: true, category: true, focusPoints: true, stage: true, description: true, hiddenAt: true },
  });
  const focus = new Map(PLAN.focus.map((f) => [f.family, f]));
  const strength = new Set(PLAN.strength.families);
  const updates = [];
  const laterChanges = {};
  const hit = new Set();
  for (const r of rows) {
    const fam = familyTitle(r.title);
    const data = {};
    const f = focus.get(fam);
    if (f) {
      hit.add(fam);
      if (r.focusPoints.join() !== f.focusPoints.join()) data.focusPoints = f.focusPoints;
      if (f.stage && r.stage !== f.stage) data.stage = f.stage;
      if (f.rewrite) {
        const next = REWRITE[f.rewrite](r.description);
        if (next !== r.description) data.description = next;
      }
    }
    if (strength.has(fam)) {
      hit.add(fam);
      if (r.category === LATER) {
        if (laterSaved[r.id] && laterSaved[r.id].category !== PLAN.strength.category) laterChanges[r.id] = laterSaved[r.id].category;
      } else if (r.category !== PLAN.strength.category) data.category = PLAN.strength.category;
    }
    if (Object.keys(data).length) updates.push({ r, data });
  }
  const missing = [...focus.keys(), ...strength].filter((f) => !hit.has(f));
  console.log(`드릴 ${rows.length}줄 · 바꿀 줄 ${updates.length} · 나중에 촬영 기록 바꿀 줄 ${Object.keys(laterChanges).length}`);
  for (const { r, data } of updates)
    console.log(
      `  ${r.hiddenAt ? '[숨김] ' : ''}${r.title}: ` +
        Object.entries(data)
          .map(([k, v]) => (k === 'description' ? '설명 다시' : `${k} ${JSON.stringify(r[k])} → ${JSON.stringify(v)}`))
          .join(' · ')
    );
  for (const id of Object.keys(laterChanges)) console.log(`  [나중에 촬영] ${laterSaved[id].title}: 원래 분류 → ${PLAN.strength.category}`);
  if (missing.length) console.log(`  ! 표에 있는데 DB 에 없는 묶음: ${missing.join(' / ')}`);
  if (args[0] !== '--apply') {
    console.log('확인만 했다. 바꾸려면 --apply');
  } else if (missing.length) {
    console.log('위 문제가 있어 바꾸지 않았다.');
    process.exitCode = 1;
  } else if (existsSync(BEFORE)) {
    console.log('이미 바꾼 기록(.before.json)이 있다. 다시 바꾸려면 먼저 --restore.');
    process.exitCode = 1;
  } else {
    writeFileSync(
      BEFORE,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          rows: updates.map(({ r }) => ({ id: r.id, title: r.title, category: r.category, focusPoints: r.focusPoints, stage: r.stage, description: r.description })),
          later: laterChanges,
        },
        null,
        1
      ) + '\n'
    );
    await prisma.$transaction(updates.map(({ r, data }) => prisma.mechanicsGuide.update({ where: { id: r.id }, data })));
    for (const id of Object.keys(laterChanges)) laterSaved[id].category = PLAN.strength.category;
    writeFileSync(LATER_FILE, JSON.stringify(laterSaved, null, 1) + '\n');
    console.log(`바꿈 ${updates.length}줄 · 나중에 촬영 기록 ${Object.keys(laterChanges).length}줄. 되돌리기는 --restore.`);
  }
}
await prisma.$disconnect();

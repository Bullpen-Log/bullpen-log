/**
 * 운동 라이브러리 자료 점검 — DB 를 읽기만 하고 고칠 만한 것을 묶어 보인다(숨김 · 나중에 촬영 빼고).
 *
 *   node --env-file=.env scripts/shoot-trim/library-audit.mjs
 *
 * 묶음: 참고 영상만 있음 · 장비 목록 밖 · 설명 형식 · 세트 · 횟수/버티기 · 글과 칸이 어긋남(버티기 · 좌우) · 제목의 도구가 장비에 없음 ·
 * 강도 · 부위 · 계열 · 근육 · 같은 제목. 판단은 사람이 한다 — 번갈아 하는 운동의 좌우 따로처럼 기준이 아직 안 정해진 것도 걸린다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/* lib/exercise-meta.ts EXERCISE_EQUIPMENT 와 같게 둔다 */
const LIST = ['맨몸', '밴드', 'TRX', '철봉', '덤벨', '바벨', '원판', '케틀벨', '메디신볼', '플라이오볼', '짐볼', '워터볼', '워터백', '케이블', '벤치', '박스'];
const INTENSITY = ['매우 낮음', '낮음', '중간', '높음', '매우 높음'];
const TITLE_TOOLS = [['덤벨', '덤벨'], ['바벨', '바벨'], ['케틀벨', '케틀벨'], ['케이블', '케이블'], ['TRX', 'TRX'], ['메디신볼', '메디신볼'], ['밴드', '밴드'], ['튜빙', '밴드'], ['원판', '원판'], ['짐볼', '짐볼']];
const SIDE_WORDS = /(반대쪽(도|을|으로)|다리를 바꿉|손을 바꿉|양쪽 같은|좌우 같은)/;

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const all = await p.exerciseVideo.findMany({ where: { hiddenAt: null } });
await p.$disconnect();
const rows = all.filter((r) => r.category !== '나중에 촬영');
const out = {};
const add = (k, r, x = '') => (out[k] ??= []).push(`${r.title}${x ? ' · ' + x : ''}`);
for (const r of rows) {
  const t = r.description;
  if (r.source !== 'OWN' || !r.videoPath) add('직접 찍은 영상 없음(참고 영상)', r, r.category);
  for (const e of r.equipment) if (!LIST.includes(e)) add('장비 목록 밖', r, e);
  if (!r.equipment.length) add('장비 비어 있음', r);
  if (!/■ 어떤 운동인가/.test(t) || !/■ 이렇게 하세요/.test(t)) add('설명 형식 빠짐', r);
  if (r.sets == null) add('세트 없음', r);
  if (r.reps == null && r.holdSeconds == null) add('횟수 · 버티기 둘 다 없음', r);
  if (r.reps != null && r.holdSeconds != null) add('횟수 · 버티기 둘 다 있음', r);
  if (r.holdSeconds == null && /(\d+)\s*초(쯤|간|동안)?\s*(머|버티|유지)/.test(t)) add('글은 버티기인데 횟수로 적힘', r);
  if (!r.perSide && SIDE_WORDS.test(t)) add('글은 좌우 따로인데 좌우 따로 아님', r, t.match(SIDE_WORDS)[0]);
  for (const [w, e] of TITLE_TOOLS) if (r.title.includes(w) && !r.equipment.includes(e)) add('제목의 도구가 장비에 없음', r, `${w} / ${r.equipment}`);
  if (!INTENSITY.includes(r.intensity)) add('강도 값 이상', r, r.intensity);
  if (!r.bodyParts.length) add('부위 비어 있음', r);
  if (/스트렝스/.test(r.category) && !r.movementPattern) add('근력 운동인데 움직임 계열 없음', r, r.category);
  if (r.category === '암케어' && !r.targetMuscles.length) add('암케어인데 근육 없음', r);
}
const seen = {};
for (const r of rows) (seen[r.title] ??= []).push(r);
for (const [t, rs] of Object.entries(seen)) if (rs.length > 1) (out['같은 제목 여럿'] ??= []).push(`${t} ×${rs.length}`);
console.log(`보이는 운동 ${rows.length}개(숨김 · 나중에 촬영 뺌)`);
for (const k of Object.keys(out)) console.log(`\n[${k}] ${out[k].length}\n  ` + out[k].slice(0, 60).join('\n  '));

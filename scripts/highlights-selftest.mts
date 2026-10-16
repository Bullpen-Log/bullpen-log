/**
 * 홈 하이라이트 규칙(lib/report/highlights.ts) 셀프테스트 — npm run highlights:test
 */
import { buildHighlights, type HighlightInput } from '../lib/report/highlights.ts';
import { shiftDateKey } from '../lib/pitch-stats.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const TODAY = '2026-10-05';
const d = (offset: number) => shiftDateKey(TODAY, offset);

/** 아무 일 없는 사람 — 이번 주 이틀 던지고 하루 운동 */
function base(over: Partial<HighlightInput> = {}): HighlightInput {
  return {
    today: TODAY,
    load: { zone: 'optimal', ratio: 1.05 },
    pitchesByDay: { [d(-1)]: 40, [d(-4)]: 30 },
    lastLogDate: d(-1),
    velocityByDay: {},
    bestBefore: null,
    conditionByDay: { [TODAY]: 7, [d(-1)]: 6 },
    checkinDays: [TODAY, d(-1)],
    workoutDays: [d(-2)],
    ...over,
  };
}

const keys = (input: HighlightInput) =>
  buildHighlights(input)
    .map((h) => h.key)
    .join(',');

console.log('\n하이라이트');

{
  const out = buildHighlights(base());
  check(
    '달라진 게 없으면 한 장만 — 이번 주 숫자',
    out.length === 1 && out[0].key === 'steady' && out[0].text.includes('투구 70구'),
    out[0]?.text
  );
}

check(
  '기록이 하나도 없으면 아무것도 안 낸다(첫날 카드가 맡는다)',
  buildHighlights(
    base({
      pitchesByDay: {},
      lastLogDate: null,
      workoutDays: [],
      load: { zone: null, ratio: null },
    })
  ).length === 0
);

{
  const out = buildHighlights(base({ load: { zone: 'caution', ratio: 1.35 } }));
  const h = out[0];
  check(
    '부하 주의 구간 — 맨 앞 · 경고색 · 몇 % 큰지',
    h?.key === 'load' && h.warn && h.text.includes('35%') && h.chart?.kind === 'bars',
    h?.text
  );
  check(
    '부하 막대 넷 — 마지막 칸이 이번 주 합',
    h?.chart?.kind === 'bars' && h.chart.values.length === 4 && h.chart.values[3] === 70
  );
}

check(
  '위험 구간은 쉬거나 줄이라고',
  buildHighlights(base({ load: { zone: 'danger', ratio: 1.62 } }))[0].text.includes(
    '쉬거나 줄여요'
  )
);

{
  const out = buildHighlights(
    base({ conditionByDay: { [TODAY]: 3, [d(-1)]: 4, [d(-2)]: 8 } })
  );
  check(
    '컨디션 이틀째 낮음',
    out[0]?.key === 'condition' && out[0].text.includes('2일째'),
    out[0]?.text
  );
}

check(
  '오늘 컨디션이 괜찮으면 어제까지 낮았어도 말하지 않는다',
  !keys(base({ conditionByDay: { [TODAY]: 7, [d(-1)]: 3, [d(-2)]: 3 } })).includes(
    'condition'
  )
);

check(
  '오늘 체크인이 없으면 어제부터 센다',
  buildHighlights(
    base({ conditionByDay: { [d(-1)]: 2, [d(-2)]: 3, [d(-3)]: 4 } })
  )[0].text.includes('3일째')
);

{
  const out = buildHighlights(base({ claimedYesterdayNoLog: true }));
  check(
    '어제 등판이라 했는데 어제 기록이 없으면 — 어제 기록 창으로',
    out[0]?.key === 'gap' &&
      out[0].text.includes('어제 등판') &&
      out[0].href === `/pitch-log/${d(-1)}`,
    out[0]?.text
  );
}

/* 2026-10-16 베타 100명: 주 1회 경기만 던지는 사람이 안 던지는 날마다 '3일째 기록이 없어요'를 들었다 */
check(
  '기록이 며칠 비어도 그것만으로는 말하지 않는다',
  !keys(base({ lastLogDate: d(-5), pitchesByDay: { [d(-5)]: 30 } })).includes('gap') &&
    !keys(base({ lastLogDate: d(-12), pitchesByDay: { [d(-12)]: 60 } })).includes('gap')
);

{
  const out = buildHighlights(
    base({
      lastLogDate: d(-40),
      pitchesByDay: {},
      workoutDays: [],
      load: { zone: null, ratio: null },
    })
  );
  check('한 달 넘게 비었으면 오랜만이에요', out.length === 1 && out[0].key === 'away');
}

{
  const out = buildHighlights(
    base({ velocityByDay: { [d(-2)]: 128.4 }, bestBefore: 126 })
  );
  const h = out.find((x) => x.key === 'velocity');
  check(
    '구속 새 기록 — 값은 화면이 단위로 바꾼다',
    h != null &&
      h.text.includes('새 기록') &&
      h.text.includes('{speed}') &&
      h.speed === 128.4
  );
}

check(
  '처음 잰 구속',
  buildHighlights(base({ velocityByDay: { [TODAY]: 110 } })).some(
    (h) => h.key === 'velocity' && h.text.startsWith('첫 구속')
  )
);

{
  const out = buildHighlights(
    base({ velocityByDay: { [d(-1)]: 124, [d(-10)]: 121.5 }, bestBefore: 130 })
  );
  const h = out.find((x) => x.key === 'velocity');
  check('지난 3주보다 오름 — 차이 2.5', h != null && h.diff === 2.5, h?.text);
}

check(
  '구속이 그대로면 말하지 않는다',
  !keys(
    base({ velocityByDay: { [d(-1)]: 120, [d(-10)]: 121 }, bestBefore: 130 })
  ).includes('velocity')
);

{
  const out = buildHighlights(base({ workoutDays: [d(0), d(-2), d(-4), d(-9)] }));
  const h = out.find((x) => x.key === 'training');
  check(
    '운동 지난주보다 늘었음 — 이레 점',
    h != null &&
      h.text.includes('3번') &&
      h.text.includes('2번 더') &&
      h.chart?.kind === 'dots',
    h?.text
  );
}

check(
  '운동이 지난주와 같으면 말하지 않는다',
  !keys(base({ workoutDays: [d(0), d(-2), d(-8), d(-9)] })).includes('training')
);

{
  const days14 = Array.from({ length: 14 }, (_, i) => d(-i));
  check(
    '체크인 14일 연속(이레마다)',
    keys(base({ checkinDays: days14 })).includes('streak')
  );
  check(
    '13일 연속은 조용히',
    !keys(base({ checkinDays: days14.slice(0, 13) })).includes('streak')
  );
}

{
  const out = buildHighlights(
    base({
      load: { zone: 'caution', ratio: 1.4 },
      conditionByDay: { [TODAY]: 2, [d(-1)]: 3 },
      claimedYesterdayNoLog: true,
      velocityByDay: { [d(-1)]: 131 },
      bestBefore: 128,
      workoutDays: [d(0), d(-1), d(-3)],
    })
  );
  check(
    '많아야 셋 — 안전이 먼저',
    out.map((h) => h.key).join(',') === 'load,condition,gap',
    out.map((h) => h.key).join(',')
  );
}

check(
  '부하 낮음은 적다고만(늘리라고 안 함 · 경고색 아님 — 주 1회 투수는 경기 전날마다 낮다, 2026-10-16 베타 100명)',
  buildHighlights(base({ load: { zone: 'low', ratio: 0.6 } })).some(
    (h) => h.key === 'load' && !h.warn && h.text.includes('적어요') && !h.text.includes('늘')
  )
);
/* 판정은 팔 상태와 같은 loadSignalOf — 평소 양이 적으면 안 띄우고, 문진 추정 중의 위험은 주의 글 */
check(
  '평소 양이 적어 지수가 흔들리는 사람(복귀자 캐치볼 20구, 지수 3.6)은 부하 하이라이트 없음',
  !buildHighlights(base({ load: { zone: 'danger', ratio: 3.6, chronic: 200, acute: 500 } })).some((h) => h.key === 'load')
);
check(
  '문진 추정 중 위험(1.6)은 쉬라고 하지 않고 가볍게',
  buildHighlights(base({ load: { zone: 'danger', ratio: 1.6, chronic: 1200, acute: 1900, estimated: true } }))[0].text.includes('가볍게')
);

{
  /* 칸 나누기(2026-10-13) — 투구량은 분석 › 투구, 운동은 분석 › 트레이닝, '이번 주'는 홈에만 */
  const busy = base({ load: { zone: 'caution', ratio: 1.35 }, workoutDays: [d(0), d(-1), d(-2), d(-9)] });
  const at = (input: HighlightInput, part: 'home' | 'pitch' | 'training') => buildHighlights(input, part).map((h) => h.key).join(',');
  check(
    '칸 나누기: 투구 칸엔 투구량만 · 트레이닝 칸엔 운동만 · 홈엔 그 둘이 없고 다른 데서 달라진 게 있으면 \'이번 주\'도 안 뜸',
    at(busy, 'pitch') === 'load' && at(busy, 'training') === 'training' && at(busy, 'home') === '',
    `${at(busy, 'pitch')} | ${at(busy, 'training')} | ${at(busy, 'home')}`
  );
  check('칸 나누기: 아무 일 없으면 \'이번 주\'는 홈에만', at(base(), 'home') === 'steady' && at(base(), 'pitch') === '' && at(base(), 'training') === '');
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);

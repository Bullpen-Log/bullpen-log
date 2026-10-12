/**
 * 트레이닝 추천 기준선의 단계 목표(--gate) · 전후 비교(--compare) — scripts/training-baseline.mts 가 쓰는 순수 함수(2판 P5 도구 T0,
 * 2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 따로 두나. 기준선 도구는 시작하자마자 운영 DB 에서 운동 표를 읽어 자체 시험이 import 할 수 없다. 그런데 단계 목표와 전후
 * 비교는 '이 단계를 마쳤다'는 말의 근거라, 틀리면 다음 단계가 틀린 바닥 위에 선다. 그래서 DB 없이 도는 이 파일에 두고 자체 시험
 * ('[2판 P5] 도구')이 가짜 JSON 으로 잰다. 기준선 JSON 의 칸 이름을 여기서 읽으니 칸을 바꾸면 이 파일과 시험을 같이 고친다.
 *
 * 순수 파일이다 — DB · 파일 · 날짜 함수 · 난수 없음, import 없음. 같은 JSON 이면 늘 같은 답이다.
 */

export type BaselineJson = Record<string, unknown>;

/** 단계 — 목표는 그 단계가 끝날 때 맞아야 하고, 뒤 단계도 계속 지켜야 한다(앞 단계 목표는 울타리가 된다) */
export type GateStage = 'P4' | 'P5' | 'P6';
export const GATE_STAGES: readonly GateStage[] = ['P4', 'P5', 'P6'];

export function isGateStage(value: string): value is GateStage {
  return (GATE_STAGES as readonly string[]).includes(value);
}

/** JSON 안의 값 하나 — 길이 끊기면 undefined */
export function valueAt(j: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = j;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** 숫자 칸 — 숫자가 아니면(칸 없음 · null) null */
export function numAt(j: unknown, path: readonly (string | number)[]): number | null {
  const v = valueAt(j, path);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** n / d — 둘 다 숫자이고 d > 0 일 때만 */
function ratioOf(n: number | null, d: number | null): number | null {
  return n == null || d == null || d === 0 ? null : n / d;
}

/** 칸 여럿의 합 — 하나라도 없으면 null(없는 칸을 0 으로 읽으면 '0 이어야 한다' 목표가 거저 맞는다) */
function sumAt(
  j: unknown,
  paths: readonly (readonly (string | number)[])[]
): number | null {
  let total = 0;
  for (const p of paths) {
    const v = numAt(j, p);
    if (v == null) return null;
    total += v;
  }
  return total;
}

/** 등판 전 무거운 하체(⑭) — 체크인 있는 경기 전날 · 2~3일 전의 무거운 하체 운동 수 */
function heavyBeforeGame(j: unknown): number | null {
  const rows = valueAt(j, ['metrics', 'heavyLowerBeforeGame', 'byDay']);
  if (!Array.isArray(rows)) return null;
  let total = 0;
  let seen = 0;
  for (const row of rows) {
    const w = valueAt(row, ['window']);
    if (w !== 'd1' && w !== 'd2to3') continue;
    const v = numAt(row, ['checkin', 'heavy']);
    if (v == null) return null;
    total += v;
    seen++;
  }
  return seen === 2 ? total : null;
}

export type Gate = {
  /** 기준선 번호(①~㉒) */
  no: string;
  stage: GateStage;
  what: string;
  /** 목표 글 — '≥ 30%' · '0' · '100%' */
  target: string;
  /**
   * 막는 목표인가. false 면 표에만 보이고 --gate 의 exit 1 에는 안 든다 — 근거가 약해 숫자 맞추기가 될 수 있는 것(회복 날 비율의
   * 폭 · 일정 카테고리 노출)은 사람이 보고 판단하게 둔다.
   */
  blocking: boolean;
  /** 잴 값 — JSON 에 칸이 없으면 null(그 목표는 '못 잼' = 안 맞음) */
  actual: (j: BaselineJson) => number | null;
  ok: (v: number) => boolean;
  /** 표에 보일 꼴 */
  unit: 'ratio' | 'count';
};

/**
 * T0(2판 P5 전, 2026-10-12) 기준선의 '체크인 있는 날 중 회복 날' 비율 — ⑲ 회복 날 울타리의 기준점. 점수 · 양 조절이 회복 날을 몰래
 * 늘리거나 줄이면(검토 비판 3 의 14 · 23번) 이 폭 밖으로 나간다. 값은 T0 커밋의 --out JSON 에서 옮겼다(metrics.fence.recoveryShare).
 */
export const T0_RECOVERY_SHARE = 136 / 282;
/** 회복 날 울타리의 폭 — 검토 비판 3 의 '−5%p 안'(근거가 약해 막지 않는 목표) */
export const RECOVERY_SHARE_BAND = 0.05;

/**
 * 단계 목표 표. 근거(검토안 · 사용자 결정 · 비판)를 목표마다 한 줄씩 — 바꾸면 설계 문서 '가정' 줄에도 적는다.
 *   P4  이미 맞는 것(P4 끝 값)을 울타리로 둔다 — P5 · P6 의 점수 · 양 · 중재가 안전을 깨면 여기서 걸린다.
 *   P5  ⑰ 30% — 검토안 2판 '체크인을 바꿔도 목록이 30% 만 바뀐다'를 같은 테마 안으로 좁힌 것(같은 테마인데 상태가 달라도 같은
 *       목록이면 점수가 상태를 안 읽는다). ⑱ 100% — 나쁜 쪽으로 바꾼 상태가 운동을 늘리면 안 된다(조이는 쪽만). ⑲ 50% — 점수가
 *       같은 운동만 밀어 올려 라이브러리가 줄면 안 된다(검토안 55%).
 *   P6  ⑳ 프로그램 날은 프로그램 그대로(D6 — 매일 일정이 프로그램 밖에서 따로 짠 본운동 0) · ㉑ 하체 48시간 · ㉒ 놓친 상태 바뀜 0.
 */
export const GATES: readonly Gate[] = [
  {
    no: '⑩',
    stage: 'P4',
    what: "만 16세 미만 일정의 '매우 높음' 날(Y · D4)",
    target: '0',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'veryHigh', 'under15', 'days']),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '⑪',
    stage: 'P4',
    what: '세게 던진 다음 날 회복(D3)',
    target: '100%',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'afterHard', 'ratio']),
    ok: (v) => v === 1,
    unit: 'ratio',
  },
  {
    no: '⑬',
    stage: 'P4',
    what: "팔 피로 '심함' 변형의 무거운 상체 밀기 + 팔 플라이오",
    target: '0',
    blocking: true,
    actual: (j) =>
      sumAt(j, [
        ['metrics', 'armSevere', 'push'],
        ['metrics', 'armSevere', 'plyo'],
      ]),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '⑭',
    stage: 'P4',
    what: '체크인 있는 경기 전날 · 2~3일 전의 무거운 하체',
    target: '0',
    blocking: true,
    actual: heavyBeforeGame,
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '⑮',
    stage: 'P4',
    what: '어제 중간 부하 + 힘듦 급증 → 회복',
    target: '100%',
    blocking: true,
    actual: (j) =>
      ratioOf(
        numAt(j, ['metrics', 'dayKind', 'moderateSpike', 'spikeRecovery']),
        numAt(j, ['metrics', 'dayKind', 'moderateSpike', 'moderateDays'])
      ),
    ok: (v) => v === 1,
    unit: 'ratio',
  },
  {
    no: '⑮',
    stage: 'P4',
    what: '힘듦 급증만으로 테마가 바뀐 그 밖의 날',
    target: '0',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'dayKind', 'moderateSpike', 'otherChanged']),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '⑯',
    stage: 'P4',
    what: '등판 짐작(달력 · 같은 요일)으로 새로 회복이 된 날',
    target: '0',
    blocking: true,
    actual: (j) =>
      sumAt(j, [
        ['metrics', 'calendarGuess', 'newRecovery', 'calendar'],
        ['metrics', 'calendarGuess', 'newRecovery', 'estimate'],
      ]),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '⑰',
    stage: 'P5',
    what: '같은 테마 안에서 오늘 상태만 바꿈(뻐근 · 등판까지 남은 날 · 팔 피로 3) → 목록 바뀜',
    target: '≥ 30%',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'sameThemeState', 'pooled', 'ratio']),
    ok: (v) => v >= 0.3,
    unit: 'ratio',
  },
  {
    no: '⑱',
    stage: 'P5',
    what: '방향 검사 넷(뻐근 부위 무거운 운동 · 팔 피로 3 의 밀기 · 플라이오 · 나쁜 날 세트 · 근육통 세트가 늘지 않음)',
    target: '100%',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'direction', 'all', 'ratio']),
    ok: (v) => v === 1,
    unit: 'ratio',
  },
  {
    no: '⑲',
    stage: 'P5',
    what: '라이브러리 노출(보이는 운동 전체 중 한 번이라도 뽑힘)',
    target: '≥ 50%',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'fence', 'exposure', 'ratio']),
    ok: (v) => v >= 0.5,
    unit: 'ratio',
  },
  {
    no: '⑲',
    stage: 'P5',
    what: '노출 — 일정에 드는 카테고리만',
    target: '≥ 80%',
    blocking: false,
    actual: (j) => numAt(j, ['metrics', 'fence', 'exposure', 'schedulableRatio']),
    ok: (v) => v >= 0.8,
    unit: 'ratio',
  },
  {
    no: '⑲',
    stage: 'P5',
    what: `체크인 있는 날 중 회복 날 — T0 ${(T0_RECOVERY_SHARE * 100).toFixed(1)}% 에서 ±${RECOVERY_SHARE_BAND * 100}%p 안`,
    target: `${((T0_RECOVERY_SHARE - RECOVERY_SHARE_BAND) * 100).toFixed(1)}~${((T0_RECOVERY_SHARE + RECOVERY_SHARE_BAND) * 100).toFixed(1)}%`,
    blocking: false,
    actual: (j) => numAt(j, ['metrics', 'fence', 'recoveryShare', 'ratio']),
    ok: (v) => Math.abs(v - T0_RECOVERY_SHARE) <= RECOVERY_SHARE_BAND + 1e-9,
    unit: 'ratio',
  },
  {
    no: '⑳',
    stage: 'P6',
    what: '프로그램 하는 날(go) 매일 일정이 프로그램 밖에서 따로 짠 본운동이 든 날(D6 — 그날은 프로그램 그대로)',
    target: '0',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'programDay', 'dailyMainDays']),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '㉑',
    stage: 'P6',
    what: '무거운 하체가 이틀 이어진 짝(프로그램 · 매일 일정, 48시간)',
    target: '0',
    blocking: true,
    actual: (j) => numAt(j, ['metrics', 'lowerGap', 'violations']),
    ok: (v) => v === 0,
    unit: 'count',
  },
  {
    no: '㉒',
    stage: 'P6',
    what: '다시 만들면 달라지는데 알리지 않은 날(저녁 기록 · 체크인 고침)',
    target: '0',
    blocking: true,
    actual: (j) =>
      sumAt(j, [
        ['metrics', 'stateAlert', 'evening', 'miss'],
        ['metrics', 'stateAlert', 'edit', 'miss'],
      ]),
    ok: (v) => v === 0,
    unit: 'count',
  },
];

export type GateRow = {
  no: string;
  stage: GateStage;
  what: string;
  target: string;
  blocking: boolean;
  unit: Gate['unit'];
  actual: number | null;
  /** 못 쟀으면 null */
  pass: boolean | null;
  /** --gate 로 고른 단계까지인가(안 골랐으면 모두 true) */
  applies: boolean;
};

/**
 * 목표마다 지금 값 · 맞음. upTo 를 주면 그 단계까지만 applies — --gate=P5 면 P4 · P5 목표.
 */
export function gateResults(j: BaselineJson, upTo: GateStage | null = null): GateRow[] {
  const limit = upTo == null ? GATE_STAGES.length - 1 : GATE_STAGES.indexOf(upTo);
  return GATES.map((g) => {
    const actual = g.actual(j);
    return {
      no: g.no,
      stage: g.stage,
      what: g.what,
      target: g.target,
      blocking: g.blocking,
      unit: g.unit,
      actual,
      pass: actual == null ? null : g.ok(actual),
      applies: GATE_STAGES.indexOf(g.stage) <= limit,
    };
  });
}

/** --gate 가 막을 줄 — 그 단계까지의 막는 목표 중 맞지 않거나(false) 못 잰(null) 것 */
export function failedGates(rows: readonly GateRow[]): GateRow[] {
  return rows.filter((r) => r.applies && r.blocking && r.pass !== true);
}

/** 표에 보일 지금 값 */
export function gateValueText(row: Pick<GateRow, 'actual' | 'unit'>): string {
  if (row.actual == null) return '못 잼';
  return row.unit === 'ratio'
    ? `${(row.actual * 100).toFixed(1)}%`
    : String(row.actual);
}

/* ─────────────────────────── 전후 비교 ─────────────────────────── */

/**
 * 옛 칸 비교에서 빼는 맨 위 칸 — 돌릴 때마다 바뀌거나(meta), 새 변형 · 판 때문에 바뀌는 것이 당연하거나(version · buildCalls), 돌린
 * 옵션에 달린 것(gates — --gate 로 고른 단계에 따라 applies 가 다르다. 값은 metrics 에서 다시 셈하니 metrics 가 같으면 같다).
 */
export const COMPARE_IGNORED_TOP_KEYS: readonly string[] = [
  'meta',
  'version',
  'buildCalls',
  'gates',
];

/**
 * 옛 JSON 의 칸이 새 JSON 에 글자 그대로 있는가 — 새 칸(새 지표 · 날마다 붙인 칸)은 더해져도 같다고 본다. 배열은 길이 · 차례까지
 * 같아야 한다(선수 12명 · 날 28 은 그대로여야 한다). 다른 곳의 경로를 limit 개까지 돌려준다(count 는 전부).
 */
export function oldFieldsSame(
  before: unknown,
  after: unknown,
  limit = 20
): { same: boolean; count: number; paths: string[] } {
  const paths: string[] = [];
  let count = 0;
  const note = (path: string) => {
    count++;
    if (paths.length < limit) paths.push(path || '(맨 위)');
  };
  const walk = (a: unknown, b: unknown, path: string, top: boolean) => {
    if (a === null || typeof a !== 'object') {
      if (!Object.is(a, b)) note(path);
      return;
    }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || b.length !== a.length) {
        note(path);
        return;
      }
      a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`, false));
      return;
    }
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      note(path);
      return;
    }
    for (const key of Object.keys(a)) {
      if (top && COMPARE_IGNORED_TOP_KEYS.includes(key)) continue;
      walk(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        false
      );
    }
  };
  walk(before, after, '', true);
  return { same: count === 0, count, paths };
}

/** 'xx.x% (n/d)' — 칸이 없으면 '없음' */
function fracText(n: number | null, d: number | null): string {
  if (n == null || d == null) return '없음';
  return d === 0 ? `해당 없음 (${n}/0)` : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}
const countText = (v: number | null) => (v == null ? '없음' : String(v));
const fracAt = (j: unknown, base: readonly string[], n: string, d: string) =>
  fracText(numAt(j, [...base, n]), numAt(j, [...base, d]));

/** 전후 비교 표의 줄 — 번호마다 대표 값 하나(자세한 값은 '재는 것' 표) */
export const HEADLINES: readonly {
  no: string;
  what: string;
  text: (j: BaselineJson) => string;
}[] = [
  {
    no: '①',
    what: '씨앗만 바꿈 → 목록 바뀜',
    text: (j) => fracAt(j, ['metrics', 'seedChanged'], 'n', 'd'),
  },
  {
    no: '②',
    what: '체크인만 바꿈 → 목록 바뀜',
    text: (j) => fracAt(j, ['metrics', 'checkinOne'], 'n', 'd'),
  },
  {
    no: '③',
    what: '어제 투구수 ×2 → 테마 바뀜',
    text: (j) => fracAt(j, ['metrics', 'pitchChanged', 'double'], 'theme', 'd'),
  },
  {
    no: '④',
    what: '같은 설정 새 사용자 쌍 같은 목록',
    text: (j) => fracAt(j, ['metrics', 'pairSame'], 'n', 'd'),
  },
  {
    no: '⑤',
    what: '선발 경기 날 아침(답 있음) 근력',
    text: (j) =>
      fracAt(
        j,
        ['metrics', 'gameMorning', 'starters', 'answered'],
        'strength',
        'games'
      ),
  },
  {
    no: '⑥',
    what: '한쪽 연속 최대(본운동 있는 근력 날)',
    text: (j) => countText(numAt(j, ['metrics', 'sideRunMax'])),
  },
  {
    no: '⑧',
    what: '라이브러리 노출',
    text: (j) => fracAt(j, ['metrics', 'exposure'], 'n', 'd'),
  },
  {
    no: '⑨',
    what: '나이 15↔22 만 → 목록 다름',
    text: (j) => fracAt(j, ['metrics', 'age15vs22'], 'n', 'd'),
  },
  {
    no: '⑩',
    what: "만 16세 미만 '매우 높음' 날",
    text: (j) => countText(numAt(j, ['metrics', 'veryHigh', 'under15', 'days'])),
  },
  {
    no: '⑪',
    what: '세게 던진 다음 날 회복',
    text: (j) => fracAt(j, ['metrics', 'afterHard'], 'n', 'd'),
  },
  {
    no: '⑫',
    what: '답만(기록 없음) 경기 다음 날 근력',
    text: (j) => fracAt(j, ['metrics', 'afterGame'], 'droppedStrength', 'count'),
  },
  {
    no: '⑬',
    what: "팔 피로 '심함' 변형의 무거운 밀기 + 팔 플라이오",
    text: (j) =>
      countText(
        sumAt(j, [
          ['metrics', 'armSevere', 'push'],
          ['metrics', 'armSevere', 'plyo'],
        ])
      ),
  },
  {
    no: '⑭',
    what: '체크인 있는 경기 전날 · 2~3일 전 무거운 하체',
    text: (j) => countText(heavyBeforeGame(j)),
  },
  {
    no: '⑮',
    what: '어제 중간 부하 + 힘듦 급증 → 회복',
    text: (j) =>
      fracAt(
        j,
        ['metrics', 'dayKind', 'moderateSpike'],
        'spikeRecovery',
        'moderateDays'
      ),
  },
  {
    no: '⑯',
    what: '짐작으로 새로 회복이 된 날',
    text: (j) =>
      countText(
        sumAt(j, [
          ['metrics', 'calendarGuess', 'newRecovery', 'calendar'],
          ['metrics', 'calendarGuess', 'newRecovery', 'estimate'],
        ])
      ),
  },
  {
    no: '⑰',
    what: '같은 테마 안 상태만 바꿈 → 목록 바뀜',
    text: (j) => fracAt(j, ['metrics', 'sameThemeState', 'pooled'], 'n', 'd'),
  },
  {
    no: '⑱',
    what: '방향 검사 넷 통과',
    text: (j) => fracAt(j, ['metrics', 'direction', 'all'], 'pass', 'd'),
  },
  {
    no: '⑲',
    what: '라이브러리 노출(울타리)',
    text: (j) => fracAt(j, ['metrics', 'fence', 'exposure'], 'n', 'd'),
  },
  {
    no: '⑲',
    what: '체크인 있는 날 중 회복 날',
    text: (j) => fracAt(j, ['metrics', 'fence', 'recoveryShare'], 'n', 'd'),
  },
  {
    no: '⑲',
    what: '두 번 넘게 뺀 운동이 다시 뽑힌 날(바꾸기 선수)',
    text: (j) => fracAt(j, ['metrics', 'fence', 'swappedReturn'], 'n', 'd'),
  },
  {
    no: '⑳',
    what: '프로그램 하는 날 매일 일정 본운동 든 날',
    text: (j) => fracAt(j, ['metrics', 'programDay'], 'dailyMainDays', 'goDays'),
  },
  {
    no: '㉑',
    what: '무거운 하체 이틀 이어짐',
    text: (j) => countText(numAt(j, ['metrics', 'lowerGap', 'violations'])),
  },
  {
    no: '㉒',
    what: '저녁 기록 → 지문 바뀜 · 다시 만들면 다름 · 놓침',
    text: (j) =>
      ['raw', 'material', 'miss']
        .map((k) => countText(numAt(j, ['metrics', 'stateAlert', 'evening', k])))
        .join(' · '),
  },
  {
    no: '㉒',
    what: '체크인 고침 → 지문 바뀜 · 다시 만들면 다름 · 놓침',
    text: (j) =>
      ['raw', 'material', 'miss']
        .map((k) => countText(numAt(j, ['metrics', 'stateAlert', 'edit', k])))
        .join(' · '),
  },
];

/** 선수별 28일 테마 · 목록이 그대로인가 — 이름으로 짝짓는다(새 JSON 에만 있는 선수는 안 센다) */
export function rosterChanges(
  before: BaselineJson,
  after: BaselineJson
): { same: string[]; changed: string[] } {
  const players = (j: BaselineJson): unknown[] => {
    const list = valueAt(j, ['players']);
    return Array.isArray(list) ? list : [];
  };
  const daysKey = (p: unknown) => {
    const days = valueAt(p, ['days']);
    if (!Array.isArray(days)) return '';
    return JSON.stringify(
      days.map((d) => [
        valueAt(d, ['date']),
        valueAt(d, ['theme']),
        valueAt(d, ['ids']),
      ])
    );
  };
  const afterByName = new Map(
    players(after).map((p) => [String(valueAt(p, ['name'])), daysKey(p)])
  );
  const same: string[] = [];
  const changed: string[] = [];
  for (const p of players(before)) {
    const name = String(valueAt(p, ['name']));
    if (!afterByName.has(name)) continue;
    (afterByName.get(name) === daysKey(p) ? same : changed).push(name);
  }
  return { same, changed };
}

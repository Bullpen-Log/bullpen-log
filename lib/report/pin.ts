import { BEGINNER_LEVEL_NAME } from '@/lib/report/personalize';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';

/**
 * 큰 운동 고정 — 매일 일정의 근력 날에 같은 큰 운동을 되풀이해 무게를 올려 가게 한다(2026-11-23 김민, Fitbod 의 Focus Exercises 를 작게).
 *
 * 왜 두는가. 매일 일정은 여섯 세션 넘게 안 한 운동을 앞에 세워(theme.ts RETURN_SESSIONS) 같은 운동이 두어 주에 한 번꼴로 나온다.
 * 그런데 무게 올림(lib/workout/free-weight.ts)은 8일 안에 같은 무게로 두 번 채워야 걸린다 — 둘이 어긋나 무게가 거의 안 올랐다.
 * 그래서 근력 날의 본운동 첫 칸만 고정하고, 나머지는 지금처럼 돌린다. 단계 · 주기 처방은 만들지 않는다(근력 프로그램이 이미 한다) —
 * 고정만 하고 무게는 기존 올림 규칙에 맡긴다.
 *
 *   하체 날  하나 — 스쿼트와 런지를 4주(PIN_CYCLE_DAYS)마다 번갈아. 데드리프트는 고정하지 않는다(김민이 바벨 런지를 고름).
 *   상체 날  둘 — 밀기 하나 + 당기기 하나(밀기 · 당기기 1 대 1). 머리 위로 미는 것 · 풀업은 고정하지 않는다.
 *
 * 고정할 운동은 이름 차례표(PIN_NAMES)에서 가진 장비 · 경력으로 할 수 있는 첫 것이다. 그 운동이 오늘 안전 거르기에 빠졌거나(등판 창 ·
 * 통증 · 컨디션) 최근 사흘 안에 했거나 오늘 뺀 운동이면 그날은 고정하지 않는다 — 다른 운동으로 갈아 끼우지 않고 기다린다(진행은 그대로).
 * 만 16세 미만 · 경력 '입문'은 고정하지 않는다(무게를 쫓지 않는다).
 *
 * 4주 묶음은 달력으로 센다(모두 같은 날 바뀐다) — 사람마다 시작일을 저장하지 않아 DB 가 필요 없다.
 * ponytail: 달력 묶음이라 가입 직후 첫 묶음이 4주보다 짧을 수 있다. 사람마다 맞추려면 시작일 칸을 둔다.
 *
 * 순수 파일 — DB · 날짜 함수 · 난수 없음.
 */

export type PinSlot = 'squat' | 'lunge' | 'push' | 'pull';

/** 고정할 운동 — 칸마다 앞에서부터, 가진 장비로 할 수 있는 첫 것(이름이 바뀌면 자체 시험 '[큰 운동 고정]'이 잡는다) */
export const PIN_NAMES: Readonly<Record<PinSlot, readonly string[]>> = {
  squat: ['바벨 백 스쿼트', '핵 스쿼트', '레그 프레스', '고블렛 스쿼트'],
  lunge: ['바벨 런지', '불가리안 스플릿 스쿼트', '덤벨 리버스 런지', '덤벨 스플릿 스쿼트'],
  push: ['벤치 프레스', '덤벨 벤치 프레스', '밴드 저항 푸시업'],
  pull: ['바벨 로우', '체스트 서포티드 덤벨 로우', '싱글암 덤벨 로우', '시티드 케이블 로우'],
};

/** 하체 고정 운동을 바꾸는 간격 — 4주 */
export const PIN_CYCLE_DAYS = 28;
/* 묶음을 세는 기준일 — 2026-01-05(월) */
const PIN_EPOCH = Date.UTC(2026, 0, 5);

/** 'YYYY-MM-DD' 가 몇 번째 4주 묶음인가(기준일 앞은 음수) */
export function pinCycleOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - PIN_EPOCH) / 86_400_000 / PIN_CYCLE_DAYS);
}

/** 그날 테마가 고정하는 칸 — 하체는 묶음마다 스쿼트 ↔ 런지, 상체는 밀기 + 당기기 */
export function pinSlotsFor(theme: string, dateKey: string): PinSlot[] {
  if (theme === 'lower') return [pinCycleOf(dateKey) % 2 === 0 ? 'squat' : 'lunge'];
  if (theme === 'upper') return ['push', 'pull'];
  return [];
}

type Named = { id: string; title: string };

export type DayPins = {
  /** 고정한 운동 id — 본운동 후보의 맨 앞에 세울 차례 */
  ids: string[];
  /** '오늘 이렇게 짰어요'에 붙일 한 줄 */
  line: string;
};

/** 고정 운동을 알리는 한 줄(해요체 · 줄표 없음) */
export function pinLineOf(theme: string, titles: readonly string[]): string {
  return theme === 'lower'
    ? `고정 운동은 ${titles.join(' · ')}예요. 4주 동안 하체 날마다 하면서 무게를 올려요.`
    : `고정 운동은 ${titles.join(' · ')}예요. 상체 날마다 하면서 무게를 올려요.`;
}

/**
 * 오늘 고정할 운동. 없으면 null.
 *
 * usable 은 장비 · 경력으로 할 수 있는 운동(안전 거르기 전), pool 은 오늘 안전 거르기를 지난 후보. 칸의 운동은 usable 에서 정하고,
 * 그것이 pool 에 있을 때만 고정한다 — 오늘 몸 상태로 빠진 날 다른 운동을 대신 고정하지 않는다.
 */
export function pinsFor({
  theme,
  dateKey,
  usable,
  pool,
  skipIds,
  age,
  level,
}: {
  theme: string;
  dateKey: string;
  usable: readonly Named[];
  pool: readonly Named[];
  /** 최근 사흘에 한 운동 · 오늘 뺀 운동 — 고정하지 않는다 */
  skipIds: ReadonlySet<string>;
  age: number | null;
  level: string | null;
}): DayPins | null {
  if (age != null && age < YOUTH_AGE_THRESHOLD) return null;
  if (level === BEGINNER_LEVEL_NAME) return null;
  const inPool = new Set(pool.map((ex) => ex.id));
  const picked: Named[] = [];
  for (const slot of pinSlotsFor(theme, dateKey)) {
    const target = PIN_NAMES[slot]
      .map((title) => usable.find((ex) => ex.title === title))
      .find((ex) => ex != null);
    if (target && inPool.has(target.id) && !skipIds.has(target.id)) picked.push(target);
  }
  if (picked.length === 0) return null;
  return {
    ids: picked.map((ex) => ex.id),
    line: pinLineOf(
      theme,
      picked.map((ex) => ex.title)
    ),
  };
}

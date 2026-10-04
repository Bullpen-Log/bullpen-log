import type { AgeBand } from '@/lib/nutrition/age';
import type { GoalKey, MealEntryView } from '@/lib/nutrition/meta';
import {
  MEAL_PROTEIN_DONE_RATIO,
  MEAL_PROTEIN_RANGE,
} from '@/lib/nutrition/meal-protein';

/**
 * 던지는 날 영양 가이드 — 오늘이 어떤 날인지 보고 한 장의 안내를 만든다(순수 계산).
 *
 * 영양 탭 맨 위에 뜬다(오늘만). 저장하지 않고 볼 때마다 셈한다 — 읽는 것은 이미 있는 기록뿐이다.
 *
 *   체크인의 '던지는 일정'(오늘 등판 · 오늘 불펜 · 내일 등판 · 없음)과 '식욕' — 이 가이드 때문에 넣은 칸이다
 *   오늘의 투구 기록(경기 · 라이브 · 불펜) — 체크인을 안 한 날에도 던진 뒤에는 안내가 나온다
 *
 * 날의 종류(위가 이긴다):
 *   던진 뒤   오늘 투구 기록이 있다 → 회복식(단백질 + 탄수화물)
 *   던지는 날  체크인에 오늘 등판 · 불펜, 또는 어제 '내일 등판'이라 적었다 → 던지기 전 식사
 *   전날      체크인에 내일 등판 → 저녁 탄수화물을 넉넉히
 *   그 밖     아무것도 띄우지 않는다
 *
 * ■ 목표 숫자(탄수화물 g)는 바꾸지 않는다
 *
 * 투구는 마라톤처럼 몸의 탄수화물을 바닥내는 운동이 아니다 — '탄수화물을 쌓아 두기'(로딩)는 투수에게 맞지 않는다.
 * 던지는 날 쓴 칼로리는 이미 그날 목표에 더해지고 그 몫은 탄수화물로 간다(targets.ts). 그래서 여기서는 숫자를
 * 올리지 않고 '언제 · 무엇을'만 안내한다: 던지기 3~4시간 전 식사를 챙기고, 던진 뒤 회복식을 빠뜨리지 않기.
 *
 * ■ 숫자의 근거(스포츠영양 입장문들의 흔한 범위에서 낮은 쪽)
 *
 *   던지기 전 식사  탄수화물 체중 1kg 당 1.5g(등판) · 1g(불펜) — 권고는 1~4시간 전 1~4g/kg. 투수라 낮은 쪽.
 *   회복식 단백질   체중 1kg 당 0.3g, 20~40g 사이(어린이는 15~30g) — 한 끼에 근육이 쓰는 양이 그쯤이다.
 *   회복식 탄수화물  체중 1kg 당 1g 안팎.
 *
 * '던진 뒤 1~2시간 안'이라고 적되 시계로 재지 않는다 — 기록은 던지고 한참 뒤에 적기도 해서 던진 시각을 모른다.
 * 그날 투구 기록이 있으면 하루 내내 같은 안내를 보인다(하루 총량이 시각보다 중요하다는 것이 요즘 견해다).
 *
 * 글은 단정하지 않는다 — 처방이 아니라 참고다(GUIDE_DISCLAIMER 를 카드 밑에 적는다).
 */

export type ThrowGuideKind = 'eve' | 'today' | 'after';

/** 가이드가 읽는 그날의 신호 */
export type GuideSignals = {
  /** 오늘 체크인의 '던지는 일정'. 안 적었으면 null */
  planToday: string | null;
  /** 어제 체크인의 '던지는 일정' — '내일 등판'이면 오늘이 등판일이다 */
  planYesterday: string | null;
  /** 오늘 체크인의 식욕 1~5. 안 적었으면 null */
  appetite: number | null;
  /** 오늘의 투구 기록. loggedAt 은 기록을 남긴 시각(ISO) */
  pitches: { sessionType: string; pitchCount: number; loggedAt: string }[];
};

export type GuideBody = {
  /** 계산에 쓸 체중. 모르면 null — 짐작 값으로 g 을 말하지 않는다 */
  weightKg: number | null;
  ageBand: AgeBand;
  goal: GoalKey;
};

export type ThrowGuide = {
  kind: ThrowGuideKind;
  /** 카드 머리의 작은 이름표 — '오늘 등판' · '내일 등판' · '경기 85구 뒤' */
  badge: string;
  /** 짧게 — 휴대폰에서 이름표 · 제목 · 펴기 단추가 한 줄에 서야 한다 */
  title: string;
  /** 본문 — 무엇을 언제 */
  lines: string[];
  /** 덧붙이는 말 — 식욕 · 성장기 · 감량 */
  notes: string[];
  /** 체크인에 일정을 적으면 더 일찍 안내한다는 알림(던진 뒤에야 알게 된 날만) */
  hint: string | null;
  /** 던진 뒤: 회복식 단백질 목표(g). 체중을 모르면 null(글에는 '20~40g') */
  recoveryProtein: number | null;
  /** 던진 뒤: 이름표에 쓴 세션을 기록한 시각(ISO) — 그 뒤에 담은 음식을 회복식으로 센다 */
  thrownAt: string | null;
};

/** 카드 밑의 한 줄 — 처방이 아니라 참고다 */
export const GUIDE_DISCLAIMER =
  '참고용 안내예요. 몸 상태와 팀 · 지도자의 지침이 먼저예요.';

/**
 * 회복식을 띄울 만큼 던진 세션. 캐치볼은 뺀다 — 가볍게 주고받은 날까지 회복식을 말하면
 * 거의 매일 뜨는 카드가 되어 아무도 안 읽는다.
 */
const THROW_SESSIONS = ['경기', '라이브', '불펜'];

const PLAN_GAME = '오늘 등판';
const PLAN_BULLPEN = '오늘 불펜';
const PLAN_TOMORROW = '내일 등판';
const PLAN_NONE = '없음';

/** 던지기 전 식사의 탄수화물(체중 1kg 당 g) — 등판은 넉넉히, 불펜은 평소 한 끼쯤 */
export const PRE_GAME_CARB_PER_KG = 1.5;
export const PRE_BULLPEN_CARB_PER_KG = 1;
/**
 * 던지기 전 식사 탄수화물의 바닥(g) — 밥 한 공기쯤. 몸이 작은 선수(30kg 불펜 = 30g)에게 '30g 안팎 — 쌀밥
 * 1공기'처럼 g 과 밥 공기가 어긋나고, '든든히'라는 말과도 안 맞았다.
 */
const PRE_MEAL_MIN_CARBS = 70;
/** 회복식(체중 1kg 당 g) */
export const RECOVERY_PROTEIN_PER_KG = 0.3;
export const RECOVERY_CARB_PER_KG = 1;
/** 회복식 단백질의 아래 · 위 — 끼니별 단백질의 한 끼 범위와 같다(lib/nutrition/meal-protein.ts) */
const RECOVERY_PROTEIN_RANGE: Record<AgeBand, [number, number]> = MEAL_PROTEIN_RANGE;
/** 이 아래면 '입맛이 없는 날'(거의 없음 · 적음) */
const LOW_APPETITE = 2;
/** 쌀밥 한 공기(210g)의 탄수화물 — 기본 음식 목록(foods.ts 'rice')과 같은 값 */
const RICE_BOWL_CARBS = 66;
/** 담은 단백질이 목표의 이만큼이면 회복식을 챙긴 것으로 본다(딱 맞춰 먹는 사람은 없다) — 끼니별 단백질과 같은 기준 */
const RECOVERY_DONE_RATIO = MEAL_PROTEIN_DONE_RATIO;

/** 서비스 기준 시각(한국)은 UTC+9 — 끼니 칸이 '이미 지난 끼니'인지 볼 때만 쓴다(lib/pitch-stats.ts SERVICE_TIME_ZONE) */
const SERVICE_UTC_OFFSET_HOURS = 9;
/** 이 시각 뒤에 투구 기록을 남겼으면 아침 · 점심 칸은 던지기 전에 먹은 것이다 */
const BREAKFAST_OVER_HOUR = 11;
const LUNCH_OVER_HOUR = 16;

const round5 = (n: number) => Math.round(n / 5) * 5;
const round10 = (n: number) => Math.round(n / 10) * 10;

/** '1공기' · '1공기 반' · '2공기' — 탄수화물 g 을 밥 공기로(반 공기 단위, 적어도 한 공기) */
export function riceBowls(carbs: number) {
  const bowls = Math.max(1, Math.round((carbs / RICE_BOWL_CARBS) * 2) / 2);
  const whole = Math.floor(bowls);
  return `${whole}공기${bowls > whole ? ' 반' : ''}`;
}

/**
 * 오늘 회복식을 말할 만큼 던졌나 — 가장 많이 던진 세션과 그 세션을 기록한 시각.
 *
 * 시각도 같은 세션의 것을 쓴다. 오전 불펜 · 저녁 경기인 날 가장 이른 기록(불펜)을 기준으로 삼으면,
 * 이름표는 '경기 85구 뒤'인데 경기 전에 먹은 점심이 회복식으로 세어진다.
 */
function thrownToday(pitches: GuideSignals['pitches']) {
  const thrown = pitches.filter(
    (p) => THROW_SESSIONS.includes(p.sessionType) && p.pitchCount > 0
  );
  if (thrown.length === 0) return null;
  const main = thrown.reduce((a, b) => (b.pitchCount > a.pitchCount ? b : a));
  return { label: `${main.sessionType} ${main.pitchCount}구`, at: main.loggedAt };
}

/** 오늘이 등판일인가 — 오늘 그렇게 적었거나, 어제 '내일 등판'이라 적고 오늘은 안 적었다 */
const isGameDay = (s: GuideSignals) =>
  s.planToday === PLAN_GAME ||
  (s.planToday == null && s.planYesterday === PLAN_TOMORROW);

/**
 * 오늘은 어떤 날인가.
 *
 * 어제 '내일 등판'이라 적었으면 오늘 체크인을 안 했어도 등판일로 본다. 오늘 '없음'이나 다시 '내일 등판'
 * (비로 밀린 날)이라 적었으면 오늘 적은 쪽을 따른다 — 가까운 말이 맞다.
 */
export function throwDayKind(s: GuideSignals): ThrowGuideKind | null {
  if (thrownToday(s.pitches)) return 'after';
  if (s.planToday === PLAN_GAME || s.planToday === PLAN_BULLPEN) return 'today';
  if (s.planToday === PLAN_TOMORROW) return 'eve';
  if (s.planToday === PLAN_NONE) return null;
  if (s.planToday == null && s.planYesterday === PLAN_TOMORROW) return 'today';
  return null;
}

/** 어느 날에나 붙는 덧말 — 식욕이 없는 날, 감량 중 */
function commonNotes(s: GuideSignals, body: GuideBody) {
  const notes: string[] = [];
  if (s.appetite != null && s.appetite <= LOW_APPETITE) {
    notes.push(
      '입맛이 없는 날이에요. 바나나 · 우유 · 요구르트처럼 잘 넘어가는 것을 조금씩 자주 드세요.'
    );
  }
  if (body.goal === 'lose') {
    notes.push('감량 중이어도 던지는 날 앞뒤로는 끼니를 줄이지 않는 편이 좋아요.');
  }
  return notes;
}

/** 오늘의 가이드. 띄울 것이 없는 날은 null */
export function throwDayGuide(s: GuideSignals, body: GuideBody): ThrowGuide | null {
  const kind = throwDayKind(s);
  if (!kind) return null;
  const kg = body.weightKg != null && body.weightKg > 0 ? body.weightKg : null;
  const notes = commonNotes(s, body);
  const base = { kind, notes, hint: null, recoveryProtein: null, thrownAt: null };

  if (kind === 'eve') {
    return {
      ...base,
      badge: PLAN_TOMORROW,
      title: '저녁 탄수화물 넉넉히',
      lines: [
        '밥 · 면 · 감자처럼 익숙한 탄수화물을 평소보다 조금 넉넉히 드세요. 크게 늘리기보다 오늘 목표를 채우는 게 먼저예요.',
        '기름진 음식과 처음 먹는 음식, 늦은 야식은 피하는 편이 좋아요.',
      ],
    };
  }

  if (kind === 'today') {
    /* 어제 '내일 등판'으로 알게 된 날은 등판으로 본다 */
    const bullpen = s.planToday === PLAN_BULLPEN;
    const carbs = kg
      ? Math.max(
          PRE_MEAL_MIN_CARBS,
          round10(kg * (bullpen ? PRE_BULLPEN_CARB_PER_KG : PRE_GAME_CARB_PER_KG))
        )
      : null;
    return {
      ...base,
      badge: bullpen ? PLAN_BULLPEN : PLAN_GAME,
      title: '3~4시간 전에 든든히',
      lines: [
        carbs
          ? `식사는 던지기 3~4시간 전에 하세요. 탄수화물 ${carbs}g 안팎, 쌀밥 ${riceBowls(carbs)}쯤에 반찬을 곁들이면 돼요.`
          : '식사는 던지기 3~4시간 전에, 밥을 평소보다 조금 넉넉히 드세요.',
        '1시간 전에는 바나나나 식빵처럼 가벼운 것으로 드세요. 기름진 음식과 처음 먹는 음식은 피하는 편이 좋아요.',
        '던진 뒤에는 투구 기록을 남기면 회복식 안내로 바뀌어요.',
      ],
    };
  }

  const thrown = thrownToday(s.pitches);
  if (!thrown) return null;
  const [lo, hi] = RECOVERY_PROTEIN_RANGE[body.ageBand];
  const protein = kg
    ? Math.min(hi, Math.max(lo, round5(kg * RECOVERY_PROTEIN_PER_KG)))
    : null;
  const carbs = kg ? round10(kg * RECOVERY_CARB_PER_KG) : null;
  const lines = [
    protein && carbs
      ? `던진 뒤 1~2시간 안에 단백질 ${protein}g + 탄수화물 ${carbs}g 안팎을 드시면 좋아요.`
      : `던진 뒤 1~2시간 안에 단백질 ${lo}~${hi}g과 탄수화물(밥 한 공기쯤)을 드시면 좋아요.`,
    /*
     * 보기는 첫 줄의 단백질을 실제로 채우는 조합이어야 한다(기본 음식 목록의 값으로 — 어린이 목표 15g 에
     * 18 · 14 · 18g, 그 밖 20~25g 에 37 · 27 · 23g). 따라 먹었는데 '챙겼어요'가 안 뜨면 보기가 틀린 것이다.
     */
    body.ageBand === 'child'
      ? '예) 밥 1공기 + 삶은 달걀 2개 · 우유 2컵 + 바나나 · 삼각김밥 + 삶은 달걀 2개'
      : '예) 밥 1공기 + 닭가슴살 1팩 · 우유 2컵 + 삶은 달걀 2개 + 바나나 · 삼각김밥 2개 + 삶은 달걀 2개',
  ];
  /*
   * 등판일인데 아직 경기 기록이 없다 — 아침에 구속을 재거나 몸풀기 불펜만 적은 것일 수 있다.
   * 카드는 '던진 뒤'로 두되(구원 투수는 불펜 기록이 곧 그날의 투구다) 등판 전 식사를 한 줄로 남긴다.
   */
  if (
    isGameDay(s) &&
    !s.pitches.some((p) => p.sessionType === '경기' && p.pitchCount > 0)
  ) {
    lines.push(
      '아직 등판 전이라면 식사는 던지기 3~4시간 전에, 1시간 전에는 바나나처럼 가벼운 것으로 드세요.'
    );
  }
  if (s.planToday === PLAN_TOMORROW) {
    lines.push('내일 등판이 있으니 저녁까지 탄수화물을 넉넉히 챙겨 두세요.');
  }
  if (body.ageBand !== 'adult') {
    notes.unshift(
      '보충제 없이 우유 · 달걀 · 고기 · 밥처럼 평소 먹던 음식으로 대개 충분해요.'
    );
  }
  return {
    ...base,
    badge: `${thrown.label} 뒤`,
    title: '회복식 챙길 시간',
    lines,
    /* 일정을 안 적어 던진 뒤에야 알게 된 날 — 다음에는 전날부터 안내할 수 있다고 한 번 알린다 */
    hint:
      s.planToday == null && s.planYesterday !== PLAN_TOMORROW
        ? '상세 체크인에 ‘던지는 일정’을 적어 두면 전날 · 당일에도 안내해 드려요.'
        : null,
    recoveryProtein: protein,
    thrownAt: thrown.at,
  };
}

/**
 * 던진 뒤에 담은 음식의 단백질 — 회복식을 챙겼는지 기록에서 읽는다.
 *
 * 투구 기록을 남긴 시각 뒤에 담은 줄만 센다. 시각이 없는 줄(방금 담아 아직 저장 중)은 뒤에 담은 것이다.
 * 던지고 먹은 뒤에야 투구 기록을 남겼으면 못 세지만, 그때는 아무 말도 안 할 뿐 '안 먹었다'고 하지 않는다.
 *
 * 반대로 저녁에 하루치를 몰아 적는 사람은 투구 기록 뒤에 아침 · 점심을 담는다 — 그것까지 세면 던진 뒤에는
 * 아무것도 안 먹었는데 '챙겼어요'가 뜬다. 끼니 칸으로 분명히 앞선 것은 뺀다: 기록을 오전 11시 뒤에 남겼으면
 * 아침 칸, 오후 4시 뒤면 점심 칸(한국 시각). 저녁 · 간식 칸은 칸만으로 가를 수 없어 그대로 센다.
 */
export function recoveryEaten(entries: MealEntryView[], guide: ThrowGuide) {
  if (guide.kind !== 'after' || !guide.thrownAt) return null;
  const at = guide.thrownAt;
  const hour = (new Date(at).getUTCHours() + SERVICE_UTC_OFFSET_HOURS) % 24;
  const earlier = (e: MealEntryView) =>
    (e.meal === 'breakfast' && hour >= BREAKFAST_OVER_HOUR) ||
    (e.meal === 'lunch' && hour >= LUNCH_OVER_HOUR);
  const protein = entries
    .filter((e) => (!e.loggedAt || e.loggedAt >= at) && !earlier(e))
    .reduce((sum, e) => sum + (e.protein ?? 0) * e.amount, 0);
  const rounded = Math.round(protein);
  if (rounded <= 0) return null;
  return {
    protein: rounded,
    /* 화면에 보이는 값(반올림한 g)으로 견준다 — '20g / 25g'인데 아직이라고 하지 않게 */
    done:
      guide.recoveryProtein != null &&
      rounded >= guide.recoveryProtein * RECOVERY_DONE_RATIO,
  };
}

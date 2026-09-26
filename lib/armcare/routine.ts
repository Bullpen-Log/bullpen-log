import { intensityLevel, minutesForSets } from '@/lib/exercise-meta';
import type { ReportFacts } from '@/lib/report/facts';
import { pendingOuting, type PitchPlan } from '@/lib/report/plan';
import { withJosa } from '@/lib/korean';
import {
  ARMCARE_AREAS,
  ARMCARE_CATEGORY,
  areasOf,
  primaryArea,
  type ArmcareAreaKey,
} from '@/lib/armcare/anatomy';

/**
 * 오늘의 암케어 — 그날 몸 상태에 맞춘 루틴.
 *
 * 2026-09-25 사용자분과 정했다. 암케어는 운동 일정에서 빠져 트레이닝 안의 따로
 * 들어가는 화면이 됐고, 그 첫 기능이 이것이다. 투구 강도·팔 피로 같은 오늘
 * 상태를 보고 세 가지 중 하나를 낸다.
 *
 *   쉬기   통증이 있는 날 — 루틴 대신 진료 안내
 *   회복   던진 날·다음 날, 팔 피로가 높은 날, 부하가 높은 날 — 가볍게, 피가 돌 만큼
 *   강화   그 밖의 날(던진 지 이틀이 넘은 날) — 부위를 고르게, 제대로
 *
 * 투수 표준 프로그램(Thrower's Ten)과 투구 뒤 48~72시간 회복 원칙을 따랐다.
 * 체크만 한다 — 실시간 기록과 AI 설명은 넣지 않는다(사용자분과 정함).
 *
 * 이 파일은 DB 를 모른다. 읽는 쪽은 lib/armcare/today.ts, 저장하는 쪽은
 * app/actions/armcare.ts 다. 그래서 시험에서 그대로 돌려 볼 수 있다.
 */

export type ArmcareKind = 'recovery' | 'strength';

/** 루틴을 고르는 까닭 — 쉬는 날에는 루틴이 없다 */
export type ArmcareDecision =
  | { kind: 'rest'; reason: string }
  | {
      kind: ArmcareKind;
      /** 화면 맨 위의 한 줄 — '어제 85구 · 팔 피로 많이 → 회복 루틴' */
      reason: string;
    };

/**
 * 팔 피로(상세 체크인)가 이 값 이상이면 회복으로 간다 — '많이'(4)·'심함'(5).
 *
 * '보통'(3)은 넘긴다. 공을 던지는 사람의 팔은 대개 조금은 피곤하다. 그것까지
 * 회복으로 돌리면 강화 루틴을 할 날이 거의 없다.
 */
export const HIGH_ARM_FATIGUE = 4;

/** 팔 피로의 말 — lib/checkin.ts 의 DETAIL_SCALES 와 같은 보기 */
const ARM_FATIGUE_WORDS = ['없음', '조금', '보통', '많이', '심함'];

/** 이 컨디션 이하면 회복 (lib/report/theme.ts 의 LOW_CONDITION_THRESHOLD 와 같다) */
const LOW_CONDITION = 4;

/**
 * 오늘 어떤 루틴을 할지 정한다.
 *
 * 회복의 까닭이 여럿이면 앞의 둘만 적는다. 다섯을 늘어놓으면 무엇 때문인지 오히려
 * 안 읽힌다 — 던진 것이 가장 앞이다. 가장 흔하고 가장 분명한 까닭이라서다.
 */
export function decideArmcare({
  facts,
  plan,
  armFatigue,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  /** 오늘 상세 체크인의 팔 피로(1~5). 간편 체크인이면 null */
  armFatigue: number | null;
}): ArmcareDecision {
  /*
   * 통증은 고를 수 있는 것이 아니다. 운동 일정이 멈추는 것과 같은 조건이고
   * (plan.halted), 까닭도 같은 말을 쓴다 — 두 화면이 다른 말을 하면 안 된다.
   */
  if (plan.halted) {
    return {
      kind: 'rest',
      reason:
        plan.haltReason ??
        '통증 기록이 있어 오늘은 팔을 쉽니다. 통증이 이어지면 전문의 진료를 받아보세요.',
    };
  }

  const p = facts.patterns;
  const pitches = p.lastOutingPitches ?? 0;
  const signals: string[] = [];

  if (pitches > 0 && p.restDays === 0) signals.push(`오늘 ${pitches}구`);
  else if (pitches > 0 && p.restDays === 1) signals.push(`어제 ${pitches}구`);
  else {
    /*
     * 큰 등판 뒤 아직 쉬어야 하는 날 — 투구 계획이 '쉬세요'라고 하는 그 값이다.
     *
     * 까닭에는 쉬게 만든 그 등판을 적는다. 마지막 투구를 적었더니, 나흘 전 95구
     * 뒤 이틀 전에 캐치볼 10개를 한 날 '2일 전 10구 · 아직 쉬는 기간'이 됐다 — 쉬는
     * 까닭은 95구다.
     */
    const owed = pendingOuting(p);
    if (owed) signals.push(`${owed.elapsed}일 전 ${owed.pitches}구 · 아직 쉬는 기간`);
  }
  if (armFatigue != null && armFatigue >= HIGH_ARM_FATIGUE) {
    signals.push(`팔 피로 '${ARM_FATIGUE_WORDS[armFatigue - 1] ?? armFatigue}'`);
  }
  if (facts.load.zone === 'danger') signals.push('투구 부하 위험 구간');
  else if (facts.load.zone === 'caution') signals.push('투구 부하 주의 구간');
  const condition = facts.condition.today?.condition;
  if (condition != null && condition <= LOW_CONDITION) {
    signals.push(`컨디션 ${condition}/10`);
  }
  if (plan.recovering) signals.push('최근 통증 기록');
  if (facts.condition.today?.preferredWorkout === '회복') {
    signals.push('오늘은 회복을 고르심');
  }

  if (signals.length > 0) {
    return {
      kind: 'recovery',
      reason: `${signals.slice(0, 2).join(' · ')} → 회복 루틴`,
    };
  }
  return {
    kind: 'strength',
    reason:
      p.restDays == null
        ? '최근 투구 기록이 없습니다 → 강화 루틴'
        : `마지막 투구 ${p.restDays}일 전 → 강화 루틴`,
  };
}

/* --------------------------------- 루틴 짜기 --------------------------------- */

/** 루틴에 넣을 수 있는 운동 — 라이브러리 줄에서 이만큼만 본다 */
export type ArmcareCandidate = {
  id: string;
  category: string;
  intensity: string;
  equipment: string[];
  /** 키우는 근육, 크게 쓰는 차례로 (lib/armcare/anatomy.ts) */
  targetMuscles: string[];
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
};

export type ArmcareItem = {
  exerciseId: string;
  /** 어느 부위 자리로 들어왔나 — 화면이 부위별로 묶는다 */
  area: ArmcareAreaKey;
  /** 오늘 할 세트. 횟수·버티는 시간은 운동에 적힌 대로 한다. */
  sets: number;
};

/** 저장해 두는 하루치 루틴. DailyArmcare.plan 에 그대로 들어간다. */
export type ArmcareRoutine = {
  /** 모양이 바뀌면 올린다. 옛 기록은 못 읽는 것으로 보고 다시 만들게 한다. */
  version: 1;
  kind: ArmcareKind;
  reason: string;
  /** 무엇 때문에 무엇을 바꿨는지 — '어깨가 뻐근해 …' */
  notes: string[];
  items: ArmcareItem[];
  /** 대략 걸리는 시간(분) */
  estimatedMinutes: number;
};

/**
 * 부위를 채우는 차례 — 앞의 것이 먼저, 시간이 모자라면 뒤의 것이 빠진다.
 *
 * 강화는 여섯 부위를 하나씩 먼저 채운다: 어깨 후방(외회전) → 견갑 → 팔꿈치
 * 내측 → 어깨 전방(내회전) → 어깨 상부 → 팔꿈치 외측. 투수에게 가장 흔한 부상
 * 자리부터다 — 감속을 버티는 어깨 뒤쪽과, 인대 부담을 나눠 받는 팔꿈치 안쪽.
 * 이 여섯이 필수 자리(CORE_SLOTS)고, 시간이 남으면 견갑과 어깨 후방을 하나씩
 * 더한다.
 *
 * 회복은 가볍게 다섯 — 어깨 뒤·앞을 버티기로, 견갑 둘, 팔꿈치 안쪽 하나.
 *
 * 팔꿈치 후방(삼두근)·전방(이두근)은 루틴에 넣지 않는다. 푸시다운·컬 같은 팔
 * 근력 운동이라, 관리 루틴에 끼우면 가볍게 챙기려던 날의 결이 흐려진다. 강화
 * 루틴에만 번갈아 넣는 안도 여쭸는데, 부위별 보강에서만 보이게 두기로 했다
 * (2026-09-25 사용자분과 정함).
 */
const SLOTS: Record<ArmcareKind, readonly ArmcareAreaKey[]> = {
  strength: [
    'shoulder-back',
    'scapula',
    'elbow-inner',
    'shoulder-front',
    'shoulder-top',
    'elbow-outer',
    'scapula',
    'shoulder-back',
  ],
  recovery: ['shoulder-back', 'scapula', 'shoulder-front', 'scapula', 'elbow-inner'],
};

/**
 * 자리의 뜻에 맞는 주 근육 — 어깨 전방 자리는 외회전과 짝을 이루는 내회전(견갑하근) 자리다.
 *
 * 2026-09-26 어깨 앞의 전면 삼각근·대흉근을 근육 목록에 더하면서, 프론트 레이즈·크로스바디
 * 인처럼 그 둘이 주 근육인 운동도 '어깨 전방' 운동이 됐다. 그대로 두면 이 자리에 프론트
 * 레이즈가 들어와 그날 루틴에서 내회전이 빠진다. 그 운동들은 부위별 보강과 내 루틴에서
 * 그대로 쓴다.
 */
const SLOT_MUSCLES: Partial<Record<ArmcareAreaKey, readonly string[]>> = {
  'shoulder-front': ['견갑하근'],
};

/**
 * 앞에서 몇 자리가 필수인가 — 필수 자리는 시간을 조금 넘겨서라도 채운다.
 *
 * 처음에는 모든 자리를 같은 시간 한도로 봤다. 그랬더니 좌우를 번갈아 하는 운동
 * (하나에 4분)이 앞에 몇 개 오면 여섯째 '팔꿈치 외측'이 안 들어가고, 그 뒤의
 * 짧은 견갑 운동이 대신 들어갔다 — 부위를 고르게 담는 것이 이 루틴의 알맹이인데
 * 한 부위가 통째로 빠졌다. 뒤의 덤 자리는 한도 안에서만 넣는다.
 */
const CORE_SLOTS: Record<ArmcareKind, number> = { strength: 6, recovery: 5 };
/** 필수 자리가 넘겨도 되는 시간 */
const CORE_SLACK_MINUTES = 5;

/**
 * 루틴 시간(분)과 세트.
 *
 * 처음 설계는 강화 3세트였다. 그런데 암케어 운동은 거의 다 '2세트 × 10회(좌우
 * 각각) · 휴식 45초'라, 3세트로 하면 여섯 부위에 30분이 넘는다. 부위를 고르게
 * 담는 것이 이 루틴의 알맹이라 세트를 2로 두고(성장기 권장과도 같다) 20분에
 * 맞췄다.
 *
 * 회복은 1세트 — 피가 돌 만큼만. 다섯 개에 10분이 안 된다.
 */
const BUDGET_MINUTES: Record<ArmcareKind, number> = { strength: 20, recovery: 9 };
const SETS: Record<ArmcareKind, number> = { strength: 2, recovery: 1 };
/** 넘겨도 되는 시간 — 딱 맞아떨어지는 일이 거의 없다 */
const SLACK_MINUTES = 2;
/** 운동을 바꾸는 데 드는 시간. 밴드를 옮겨 거는 정도라 일정(3분)보다 짧다. */
const SWITCH_MINUTES = 0.5;

/** 회복날에 빼는 장비 — 무게를 싣는 것 (lib/report/theme.ts 의 isRecoveryLight 와 같다) */
const HEAVY_EQUIPMENT = ['덤벨', '바벨', '케틀벨', '원판', '케이블'];

/**
 * 루틴에 넣지 않는 운동 — 주 근육이 이 셋이면 컬·푸시다운 같은 팔 근력 운동이다.
 *
 * 완요골근을 주로 쓰는 운동은 해머컬 계열뿐이라 함께 뺀다. 빼지 않았더니 해머컬이
 * '팔꿈치 외측' 자리(완요골근의 부위)로 들어왔다 — 그 자리는 손목 젖히기·아래팔
 * 돌리기의 몫이다. 부위별 보강에서는 그대로 보인다.
 */
const ARM_STRENGTH_MUSCLES = ['이두근', '삼두근', '완요골근', '상완근'];

const SHOULDER_AREAS: readonly ArmcareAreaKey[] = [
  'shoulder-back',
  'shoulder-front',
  'shoulder-top',
];
const ELBOW_AREAS: readonly ArmcareAreaKey[] = ['elbow-inner', 'elbow-outer'];

/** armcareBlock 이 보는 오늘 체크인의 부위 상태 */
type TodayParts =
  { shoulder?: string; elbow?: string; wrist?: string } | null | undefined;

/**
 * 이 운동을 오늘 루틴에 넣으면 안 되는 까닭 — 넣어도 되면 null.
 *
 * 만들 때(buildArmcareRoutine)와, 만든 뒤에 체크인이 바뀌었는지 볼 때(트레이닝의
 * 암케어 화면) 같은 규칙을 쓴다. 따로 두면 언젠가 어긋난다 — 만들 때라면 뺐을
 * 운동이 몸 상태가 바뀐 뒤에도 말없이 남는다.
 *
 *   arm-strength  컬·푸시다운 같은 팔 근력 운동 (ARM_STRENGTH_MUSCLES)
 *   intensity     강화는 '중간'까지, 회복은 '낮음'까지
 *   heavy         회복날에 덤벨·케이블처럼 무게를 싣는 장비 — 90구를 던진 다음 날
 *                 팔꿈치에 덤벨을 드는 운동이 나오면 안 된다
 *   stiff         뻐근한 관절을 쓰는, '낮음'을 넘는 운동
 *
 * 뻐근함은 운동이 들어갈 자리가 아니라 운동이 쓰는 관절로 본다. 자리로 봤더니
 * 어깨가 뻐근한 날 견갑 자리에 머리 위 케틀벨 캐리('중간')가 들어왔고, 어깨를 함께
 * 쓰는 케틀벨 바텀업 캐리가 팔꿈치 자리로 들어왔다.
 */
export function armcareBlock(
  ex: ArmcareCandidate,
  kind: ArmcareKind,
  today: TodayParts
): 'not-armcare' | 'arm-strength' | 'intensity' | 'heavy' | 'stiff' | null {
  if (ex.category !== ARMCARE_CATEGORY) return 'not-armcare';
  if (ARM_STRENGTH_MUSCLES.includes(ex.targetMuscles[0] ?? '')) return 'arm-strength';
  /* 강화날에도 '높음'은 넣지 않는다 — 몸 상태가 아니라 맞춤 루틴이 정한 한도다 */
  if (kind !== 'recovery' && intensityLevel(ex.intensity) > intensityLevel('중간')) {
    return 'intensity';
  }
  return bodyStateBlock(ex, kind, today);
}

/**
 * 지금 몸 상태로 보면 무리인 까닭 — 괜찮으면 null.
 *
 * armcareBlock 에서 '몸 상태' 몫만 떼어 낸 것이다. 내 루틴(사용자가 직접 고른 운동)에
 * 표시를 달 때 쓴다(2026-09-26 검토). armcareBlock 을 그대로 쓰면 두 가지가 틀렸다 —
 *   · 팔 근력 운동(컬 등)은 'arm-strength'에서 먼저 끝나, 90구 다음 날 무거운 덤벨 컬에도
 *     표시가 안 붙었다.
 *   · 강화날의 '높음' 한도(맞춤 루틴이 정한 것)가 몸 상태처럼 읽혀, 과부하 내리기를 담아 둔
 *     사람에게 아무 일 없는 날에도 매일 '권하지 않는 운동'이 붙었다.
 *
 *   intensity  회복날에 '낮음'을 넘는 운동
 *   heavy      회복날에 덤벨·케이블처럼 무게를 싣는 장비
 *   stiff      뻐근한 관절을 쓰는, '낮음'을 넘는 운동
 */
export function bodyStateBlock(
  ex: Pick<ArmcareCandidate, 'intensity' | 'equipment' | 'targetMuscles'>,
  kind: ArmcareKind,
  today: TodayParts
): 'intensity' | 'heavy' | 'stiff' | null {
  const level = intensityLevel(ex.intensity);
  const light = intensityLevel('낮음');
  if (kind === 'recovery') {
    if (level > light) return 'intensity';
    if (ex.equipment.some((q) => HEAVY_EQUIPMENT.includes(q))) return 'heavy';
  }
  if (level > light) {
    const joints = areasOf(ex.targetMuscles).map((a) => a.joint);
    if (today?.shoulder === '뻐근' && joints.includes('어깨')) return 'stiff';
    if (
      (today?.elbow === '뻐근' || today?.wrist === '뻐근') &&
      joints.includes('팔꿈치')
    ) {
      return 'stiff';
    }
  }
  return null;
}

/** 운동 하나를 이 세트만큼 했을 때 걸리는 시간(분) */
export function armcareMinutes(ex: ArmcareCandidate, sets: number): number {
  return (minutesForSets(ex, sets) ?? 3 * sets) + SWITCH_MINUTES;
}

/** 같은 입력이면 같은 숫자 — 만든 루틴이 새로고침에 바뀌지 않게 (FNV-1a) */
function mix(id: string, seed: string): number {
  let h = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function buildArmcareRoutine({
  decision,
  candidates,
  facts,
  lastDone = new Map(),
  doneToday = new Set(),
  known,
  previous = null,
  seed,
}: {
  decision: Extract<ArmcareDecision, { kind: ArmcareKind }>;
  /** 장비·경력을 거른 암케어 운동 */
  candidates: ArmcareCandidate[];
  facts: ReportFacts;
  /** 운동마다 마지막으로 한 날(YYYY-MM-DD) — 오래 안 한 것부터 */
  lastDone?: Map<string, string>;
  /** 오늘 이미 체크한 것 — 다시 만들어도 목록에 남긴다 */
  doneToday?: Set<string>;
  /**
   * 오늘 체크한 것을 찾을 목록 — 장비·경력으로 거르기 전의 암케어 전체.
   *
   * 거른 목록(candidates)에서만 찾았더니, 만든 뒤 트레이닝 설정에서 덤벨을 빼고
   * 다시 만들면 아까 체크한 덤벨 운동이 루틴에서 사라져 체크를 풀 수도 없었다.
   * 안 주면 candidates 에서 찾는다.
   */
  known?: ArmcareCandidate[];
  /** 지금 저장된 루틴 — 근육이 안 적힌 운동은 여기 있던 자리를 이어받는다 */
  previous?: ArmcareRoutine | null;
  /** 순서를 섞는 씨앗. 보통은 날짜, 다시 만들 때는 지금 목록을 섞어 넣는다. */
  seed: string;
}): ArmcareRoutine {
  const kind = decision.kind;
  const notes: string[] = [];
  const today = facts.condition.today;
  const stiffShoulder = today?.shoulder === '뻐근';
  const stiffElbow = today?.elbow === '뻐근' || today?.wrist === '뻐근';

  const areaOf = (ex: ArmcareCandidate) => primaryArea(ex.targetMuscles)?.key ?? null;
  /* 넣어도 되는가 — 만든 뒤에 몸 상태가 바뀌었는지 볼 때도 같은 규칙(armcareBlock) */
  const allowed = (ex: ArmcareCandidate) => armcareBlock(ex, kind, today) == null;

  /*
   * 부위 안에서 무엇부터 볼지.
   *
   *   ① 버티기 먼저 — 어깨 부위만, 회복날과 어깨가 뻐근한 날에
   *   ② 오래 안 한 것부터 — 한 번도 안 한 것이 가장 앞, 날마다 다른 순서로 섞어서
   *
   * 버티기는 어깨에만 앞세운다. 팔꿈치까지 그렇게 했더니 회복날 팔꿈치 자리에
   * 철봉 매달리기(데드행)가 들어왔다 — 버티기이긴 하지만 가벼운 밴드 손목 굽히기가
   * 그 자리의 뜻에 맞다.
   *
   * 같은 날에는 늘 같은 순서다(씨앗이 날짜). 새로고침에 루틴이 바뀌면 안 된다.
   */
  const preferHold = (area: ArmcareAreaKey) =>
    SHOULDER_AREAS.includes(area) && (kind === 'recovery' || stiffShoulder);
  const order =
    (area: ArmcareAreaKey) => (a: ArmcareCandidate, b: ArmcareCandidate) => {
      if (preferHold(area)) {
        const holdA = a.holdSeconds != null ? 0 : 1;
        const holdB = b.holdSeconds != null ? 0 : 1;
        if (holdA !== holdB) return holdA - holdB;
      }
      const lastA = lastDone.get(a.id) ?? '';
      const lastB = lastDone.get(b.id) ?? '';
      if (lastA !== lastB) return lastA < lastB ? -1 : 1;
      return mix(a.id, seed) - mix(b.id, seed);
    };

  const sets = SETS[kind];
  const budget = BUDGET_MINUTES[kind];
  const items: ArmcareItem[] = [];
  const taken = new Set<string>();
  const usedMuscles = new Set<string>();
  let used = 0;
  let elbowCount = 0;
  const byId = new Map((known ?? candidates).map((ex) => [ex.id, ex]));
  const previousArea = new Map(
    (previous?.items ?? []).map((it) => [it.exerciseId, it.area])
  );

  const put = (ex: ArmcareCandidate, area: ArmcareAreaKey) => {
    items.push({ exerciseId: ex.id, area, sets });
    taken.add(ex.id);
    if (ex.targetMuscles[0]) usedMuscles.add(ex.targetMuscles[0]);
    used += armcareMinutes(ex, sets);
    if (ELBOW_AREAS.includes(area)) elbowCount++;
  };

  /*
   * 오늘 이미 체크한 것은 먼저 넣는다. 다시 만들었더니 방금 한 운동이 사라지면
   * 체크를 풀 수도 없고, 한 것을 또 하게 된다.
   */
  const slots = SLOTS[kind].map((area, i) => ({ area, core: i < CORE_SLOTS[kind] }));
  for (const id of doneToday) {
    const ex = byId.get(id);
    const area = ex ? (areaOf(ex) ?? previousArea.get(id) ?? null) : null;
    if (!ex || !area) continue;
    const at = slots.findIndex((s) => s.area === area);
    if (at >= 0) slots.splice(at, 1);
    put(ex, area);
  }

  /*
   * 부위가 빈 까닭을 가른다 — 가진 장비·경력에 그 부위 운동이 아예 없는가(noGear),
   * 있는데 오늘 규칙(회복날의 가벼운 것만·뻐근한 관절)에 걸렸는가(byRule). 둘을
   * 한 말로 적었더니, 덤벨을 가진 사람에게 회복날마다 '가진 장비로 할 수 있는
   * 운동이 없어'라고 했다.
   */
  const noGear = new Set<ArmcareAreaKey>();
  const byRule = new Set<ArmcareAreaKey>();
  for (const { area, core } of slots) {
    /* 팔꿈치가 뻐근하면 전완은 하나만 */
    if (stiffElbow && ELBOW_AREAS.includes(area) && elbowCount >= 1) continue;

    const slotMuscles = SLOT_MUSCLES[area];
    const inArea = candidates.filter(
      (ex) =>
        !taken.has(ex.id) &&
        areaOf(ex) === area &&
        (!slotMuscles || slotMuscles.includes(ex.targetMuscles[0] ?? ''))
    );
    const pool = inArea.filter(allowed).sort(order(area));
    if (pool.length === 0) {
      (inArea.length === 0 ? noGear : byRule).add(area);
      continue;
    }
    /*
     * 같은 근육이 겹치지 않게 한 바퀴 미룬다 — 견갑 둘이 둘 다 Y 레이즈 계열
     * (하부 승모근)이면 전거근이 빠진다. 겹치지 않는 것이 없으면 겹쳐도 넣는다.
     */
    const fresh = pool.filter((ex) => !usedMuscles.has(ex.targetMuscles[0] ?? ''));
    const cap = budget + (core ? CORE_SLACK_MINUTES : SLACK_MINUTES);
    const next = [...fresh, ...pool].find(
      (ex) => used + armcareMinutes(ex, sets) <= cap
    );
    if (next) put(next, area);
  }

  if (stiffShoulder) {
    notes.push(
      '어깨가 뻐근해서 어깨를 쓰는 운동은 가벼운 것과 버티기 위주로 골랐습니다.'
    );
  }
  if (stiffElbow) {
    notes.push('팔꿈치·손목이 뻐근해서 전완 운동은 가벼운 것 하나만 넣었습니다.');
  }
  /* 조사는 붙는 낱말에 맞춘다 — '어깨 상부은'이 실제로 나왔다(lib/korean) */
  const emptyLabels = (keys: Set<ArmcareAreaKey>) =>
    ARMCARE_AREAS.filter(
      (a) => keys.has(a.key) && !items.some((it) => it.area === a.key)
    ).map((a) => a.label);
  const gearGaps = emptyLabels(noGear);
  if (gearGaps.length > 0) {
    notes.push(
      `가진 장비로 할 수 있는 운동이 없어 ${withJosa(gearGaps.join('·'), '은/는')} 뺐습니다.`
    );
  }
  const ruleGaps = emptyLabels(byRule).filter((label) => !gearGaps.includes(label));
  if (ruleGaps.length > 0) {
    const list = withJosa(ruleGaps.join('·'), '은/는');
    notes.push(
      kind === 'recovery'
        ? `회복날에는 무게를 싣지 않는 가벼운 운동만 넣어서 ${list} 뺐습니다.`
        : `오늘 몸 상태에 맞는 가벼운 운동이 없어 ${list} 뺐습니다.`
    );
  }

  /*
   * 화면에는 부위 차례로 — 어깨에서 팔꿈치로. 부위별 보강과 같은 차례(ARMCARE_AREAS)
   * 라 부위마다 자리가 하나씩이다. 채우는 차례(SLOTS)로 늘어놓았더니 어깨 사이에
   * 팔꿈치가 끼었고, 팔꿈치 후방·전방이 같은 자리가 되어 제목이 두 번 나왔다.
   */
  const areaRank = (key: ArmcareAreaKey) =>
    ARMCARE_AREAS.findIndex((a) => a.key === key);
  items.sort((a, b) => areaRank(a.area) - areaRank(b.area));

  return {
    version: 1,
    kind,
    reason: decision.reason,
    notes,
    items,
    estimatedMinutes: Math.round(used),
  };
}

/**
 * 저장해 둔 루틴을 읽는다. 모양이 다르면 없는 것으로 본다 — 억지로 읽다 화면
 * 곳곳에서 값이 비어 터지는 것보다 다시 만들게 하는 편이 낫다.
 */
export function readArmcareRoutine(value: unknown): ArmcareRoutine | null {
  if (!value || typeof value !== 'object') return null;
  const routine = value as Partial<ArmcareRoutine>;
  if (routine.version !== 1 || !Array.isArray(routine.items)) return null;
  if (routine.kind !== 'recovery' && routine.kind !== 'strength') return null;
  return routine as ArmcareRoutine;
}

/**
 * 루틴 종류의 이름 — 화면(맞춤 루틴 · 따라하기)이 같은 말을 쓴다.
 *
 * 한 줄 설명(desc)도 있었는데 어느 화면에도 나오지 않아 뺐다(2026-09-26 검토). 왜 그
 * 루틴인지는 그날의 까닭(decision.reason)이 말한다.
 */
export const ARMCARE_KIND_TEXT: Record<ArmcareKind, { label: string }> = {
  recovery: { label: '회복 루틴' },
  strength: { label: '강화 루틴' },
};

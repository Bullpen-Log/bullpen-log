import { findArmcareArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { AREA_DETAILS } from '@/lib/armcare/details';
import {
  ARM_PAIN_ROUTINE_MIN_AGE,
  armPainSpotLabel,
  canDoPainRoutine,
} from '@/lib/checkin';

/**
 * 팔 통증 안내 시트의 글 — 순수 함수만(app/(app)/training/arm-pain-guide.tsx 가 그린다).
 *
 * 2026-10-03 팔 통증 안내(재활 1편). 체크인에서 어깨 · 팔꿈치 '통증'을 고른 날, 고른 자리마다
 *   ① 이럴 수 있어요(참고) — 그 부위에 흔한 부상(lib/armcare/anatomy.ts 의 injuries, 부위별 보강과 같은 글)
 *   ② 확인해 볼 증상 — lib/armcare/details.ts 의 signs
 * 를 모으고, 자리와 상관없이 늘
 *   ③ 이런 게 있으면 바로 진료(RED_FLAGS) — 체크 칸 없이 글로만(D4)
 *   ④ 오늘은(levelAdvice) — 정도 1이면 가벼운 통증 루틴, 그 밖은 쉬고 진료
 *   ⑤ 맺음 한 줄(DISCLAIMER)
 * 을 보인다.
 *
 * 진단하지 않는다 — '이럴 수 있어요'까지만 말하고, 맺음말이 늘 붙는다. 부상 글은 부위 설명과 같은 규칙이라
 * '막아 준다'고 약속하지 않는다(anatomy.ts). 병명별 단계 재활은 2편(이 파일 밖)이다.
 */

/** 이런 게 있으면 바로 진료 — 펼쳤을 때 보이는 다섯 줄 */
export const RED_FLAGS: readonly string[] = [
  '새끼손가락 · 약지 쪽이 저리거나 감각이 둔해요',
  '아픈 곳이 붓거나 멍이 들었어요',
  "던질 때 '뚝' 하는 소리나 느낌이 있었어요",
  '팔에 힘이 빠지거나 공을 쥐기 어려워요',
  '밤에 아파서 잠에서 깨요',
];

/** 빨간 상자의 접힌 한 줄 — 다섯을 줄여 늘 보이게 한다(펼치면 RED_FLAGS) */
export const RED_FLAGS_LINE = "저림 · 붓기나 멍 · '뚝' 소리 · 힘 빠짐 · 밤에 깨는 통증";

/** 맺음 한 줄 — 늘 붙는다 */
export const DISCLAIMER = '이 안내는 참고용이에요. 정확한 진단은 병원에서 받으세요.';

export type PainAdvice = {
  /** 통증 루틴을 해도 되는 날인가 — 암케어의 결정과 같은 함수(canDoPainRoutine) */
  routine: boolean;
  /** '오늘은' 칸의 글 */
  text: string;
};

/**
 * '오늘은' — 정도로 가르되, 루틴을 줄지는 암케어와 같은 함수(lib/checkin.ts 의 canDoPainRoutine)로 정한다.
 * 시트는 '가벼운 루틴을 해요'라는데 암케어 탭은 쉬라고 하는 날이 없게.
 *
 *   루틴 되는 날(정도 1 + 자리 + 만 15세 이상)  가벼운 루틴 — 아프면 바로 멈추기
 *   만 15세 미만                                 진료가 먼저(성장판)
 *   정도 3                                       미루지 말고 진료(더 강하게)
 *   정도 2                                       쉬고 진료
 *   정도 1인데 자리를 안 고름                    쉬고, 이어지면 진료
 *   정도를 안 고름                               모르면 쉬는 게 안전 — 이어지면 진료
 *
 * 루틴이 아닌 날의 글에는 모두 '진료'가 들어간다(자가 시험이 본다).
 */
export function levelAdvice(
  level: number | null,
  { spots = [], age = null }: { spots?: readonly string[]; age?: number | null } = {}
): PainAdvice {
  if (canDoPainRoutine({ spots, level, age })) {
    return {
      routine: true,
      text: '통증 없는 범위에서 가벼운 루틴을 해요. 하다가 아프면 바로 멈추세요.',
    };
  }
  if (age != null && age < ARM_PAIN_ROUTINE_MIN_AGE) {
    return {
      routine: false,
      text: '성장기에는 팔이 아프면 운동보다 진료가 먼저예요. 오늘은 팔 운동을 쉬고 진료를 받아보세요.',
    };
  }
  if (level === 3) {
    return {
      routine: false,
      text: '가만히 있어도 아프면 미루지 말고 진료를 받아보세요. 오늘은 팔 운동을 쉬어요.',
    };
  }
  if (level === 2) {
    return { routine: false, text: '오늘은 팔 운동을 쉬고 진료를 받아보세요.' };
  }
  if (level === 1) {
    return {
      routine: false,
      text: '아픈 곳을 고르지 않아 오늘은 팔 운동을 쉬어요. 통증이 이어지면 진료를 받아보세요.',
    };
  }
  return {
    routine: false,
    text: '얼마나 아픈지 모르면 쉬는 게 안전해요. 오늘은 팔 운동을 쉬고, 통증이 이어지면 진료를 받아보세요.',
  };
}

export type PainGuide = {
  key: ArmcareAreaKey;
  /** '팔꿈치 안쪽 통증' */
  title: string;
  /** 이 자리에 흔한 부상 — 참고용. 앞의 것이 더 흔하거나 더 크다 */
  injuries: readonly { name: string; desc: string }[];
  /** 확인해 볼 증상 */
  signs: readonly string[];
};

/** 아픈 자리 하나의 안내 — 부위 파일 둘(anatomy · details)에서 모은다 */
export function guideFor(spot: ArmcareAreaKey): PainGuide {
  const area = findArmcareArea(spot);
  return {
    key: spot,
    title: `${armPainSpotLabel(spot) ?? area?.label ?? spot} 통증`,
    injuries: area?.injuries ?? [],
    signs: AREA_DETAILS[spot]?.signs ?? [],
  };
}

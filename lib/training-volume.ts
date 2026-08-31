import { toDateKey } from '@/lib/pitch-stats';

/**
 * 부위별 주당 세트 수.
 *
 * 부하 지수가 "지금 많은가"를 말한다면, 이건 "무엇을 하고 무엇을 안 했나"를
 * 말한다. 지수 하나로는 하체만 잔뜩 하고 암케어를 통째로 건너뛴 주와, 골고루
 * 한 주가 똑같아 보인다.
 *
 * 세는 단위는 그냥 세트다 — 환산 세트가 아니다. 주당 세트 수는 근력 문헌이
 * 용량 변수로 쓰는 값이고(Schoenfeld 계열 메타분석), 사람이 바로 읽을 수 있다.
 * "이번 주 하체 18세트"는 설명이 필요 없다.
 *
 * 한 운동이 여러 부위에 걸리면 각 부위에 모두 센다. 데드리프트는 하체이면서
 * 등이다 — 코치가 볼륨을 점검할 때 하는 방식이 이렇다. 절반씩 쪼개면
 * "하체 0.75세트" 같은 읽을 수 없는 숫자가 나온다.
 */

/**
 * 부위 묶음.
 *
 * 라이브러리의 부위는 열셋인데 그대로 늘어놓으면 읽히지 않는다. 투수에게
 * 뜻이 있는 덩이로 묶는다 — 힘이 나오는 곳(하체), 전달하는 곳(코어),
 * 감속하고 잡아주는 곳(등·견갑), 가속하는 곳(가슴·어깨), 그리고 팔.
 */
export const VOLUME_GROUPS = [
  {
    key: 'lower',
    label: '하체',
    hint: '투구의 힘이 나오는 곳',
    parts: ['고관절', '햄스트링·둔근', '종아리·발목'],
  },
  {
    key: 'core',
    label: '코어',
    hint: '하체의 힘을 팔로 전달',
    parts: ['코어', '전신'],
  },
  {
    key: 'back',
    label: '등·견갑',
    hint: '팔을 감속시키고 어깨를 잡아준다',
    parts: ['등', '견갑', '이두'],
  },
  {
    key: 'push',
    label: '가슴·어깨',
    hint: '가속에 쓰이는 곳',
    parts: ['가슴', '어깨', '삼두'],
  },
  {
    key: 'arm',
    label: '팔·전완',
    /*
     * 여기에 "암케어가 들어간다"고 적으면 안 된다.
     *
     * 데드리프트에도 손목·전완이 들어 있어(그립), 하체만 한 주에도 이 줄이
     * 찬다. 암케어를 통째로 건너뛴 사람이 "팔 6세트"를 보고 했다고 착각한다.
     * 실제로 자가 시험이 그 상태를 잡았다. 암케어는 아래에서 따로 센다.
     */
    hint: '이두·삼두 운동과 무거운 것을 잡는 그립까지',
    parts: ['팔꿈치', '손목·전완'],
  },
] as const;

export type VolumeGroupKey = (typeof VOLUME_GROUPS)[number]['key'];

export type PartVolume = {
  key: VolumeGroupKey;
  label: string;
  hint: string;
  /** 최근 7일 세트 수 */
  sets: number;
  /** 그 직전 7일 세트 수 */
  previous: number;
};

export type VolumeSummary = {
  byPart: PartVolume[];
  /**
   * 암케어 세트 — 부위가 아니라 카테고리로 센다.
   *
   * 투수에게 이건 부위 이야기가 아니라 '했나 안 했나'의 문제다. 부위로 세면
   * 데드리프트 그립까지 섞여 들어와, 암케어를 건너뛴 주에도 숫자가 찬다.
   */
  armCare: { sets: number; previous: number };
};

/** 부위 묶음을 빨리 찾기 위한 표 */
export const GROUP_OF = new Map<string, VolumeGroupKey[]>();
for (const g of VOLUME_GROUPS) {
  for (const part of g.parts) {
    GROUP_OF.set(part, [...(GROUP_OF.get(part) ?? []), g.key]);
  }
}

export type VolumeRow = {
  date: Date;
  setsDone: number | null;
  exercise: { bodyParts: string[]; sets: number | null; category: string };
};

/** 암케어를 따로 세는 카테고리 이름 */
export const ARM_CARE_CATEGORY = '암케어';

/**
 * 최근 7일과 그 직전 7일의 부위별 세트 수.
 *
 * 세트를 안 적은 운동은 계획 세트로 센다 — 부하 계산과 같은 규칙이다.
 * 체크했다는 것은 했다는 뜻이고, 0으로 두면 실제로 한 운동이 사라진다.
 */
export function buildPartVolume(
  rows: VolumeRow[],
  today = new Date()
): VolumeSummary {
  const todayKey = toDateKey(today);
  const dayBefore = (n: number) =>
    toDateKey(new Date(today.getTime() - n * 86400000));
  const weekStart = dayBefore(6);
  const prevStart = dayBefore(13);
  const prevEnd = dayBefore(7);

  const now = new Map<VolumeGroupKey, number>();
  const before = new Map<VolumeGroupKey, number>();
  let armNow = 0;
  let armBefore = 0;

  for (const row of rows) {
    const key = toDateKey(row.date);
    const bucket =
      key >= weekStart && key <= todayKey
        ? now
        : key >= prevStart && key <= prevEnd
          ? before
          : null;
    if (!bucket) continue;

    const sets = row.setsDone ?? row.exercise.sets ?? 0;
    if (sets <= 0) continue;

    /*
     * 한 운동이 같은 묶음에 두 부위로 걸리는 경우가 있다(가슴+어깨+삼두는
     * 모두 '가슴·어깨'). 그때 세 번 세면 안 되므로 묶음을 먼저 추린다.
     */
    const groups = new Set<VolumeGroupKey>();
    for (const part of row.exercise.bodyParts) {
      for (const g of GROUP_OF.get(part) ?? []) groups.add(g);
    }
    for (const g of groups) bucket.set(g, (bucket.get(g) ?? 0) + sets);

    if (row.exercise.category === ARM_CARE_CATEGORY) {
      if (bucket === now) armNow += sets;
      else armBefore += sets;
    }
  }

  return {
    byPart: VOLUME_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      hint: g.hint,
      sets: now.get(g.key) ?? 0,
      previous: before.get(g.key) ?? 0,
    })),
    armCare: { sets: armNow, previous: armBefore },
  };
}

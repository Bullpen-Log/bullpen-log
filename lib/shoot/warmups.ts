/**
 * 야외 주차에서 찍을 워밍업 — **이름만**(2026-10-09 사용자: "워밍업은 이름만 넣어서 해줘").
 *
 * 라이브러리에는 '워밍업' 운동이 하나도 없고 고정 루틴 넷(전신 · 하체 · 상체 밀기 · 상체 당기기, WarmupRoutine)이 비어 있다.
 * 그 넷을 채울 동작을 루틴별로 여섯씩 골랐다. 라이브러리에 이미 있는 동작(월드 그레이티스트 스트레치 · 밴드 풀 어파트 ·
 * 페이스 풀 · 외회전 · 워킹 니 허그 · A-스킵 같은 동적 워밍업)은 1~5주차에서 찍으니 넣지 않았다.
 *
 * 촬영 계획에는 이 id 로 들어간다(ShootCheck.exerciseId 에 그대로). 영상을 올리면 그 이름의 '워밍업' 운동을 **숨긴 채**
 * 만들고 영상을 붙인다(app/actions/shoot.ts attachShootClip) — 설명 · 부위를 채워 보이게 하고 루틴에 넣는 것은 라이브러리
 * 관리 화면에서 한다. 이름을 바꾸면 이미 만든 운동과 이어지지 않으니 바꾸지 않는다(새 이름은 새 id 로 더한다).
 */

export type WarmupRoutineKind = 'COMMON' | 'LOWER' | 'UPPER_PUSH' | 'UPPER_PULL';

export const WARMUP_ROUTINE_LABEL: Record<WarmupRoutineKind, string> = {
  COMMON: '전신 워밍업',
  LOWER: '하체 워밍업',
  UPPER_PUSH: '상체 밀기 워밍업',
  UPPER_PULL: '상체 당기기 워밍업',
};

export type ShootWarmup = {
  /** 'warmup-common-01' — 촬영 계획 · 체크의 열쇠 */
  id: string;
  title: string;
  routine: WarmupRoutineKind;
  /** 모델에게 말할 시범 방법 */
  cue: string;
  equipment: string[];
  /** 걷거나 뛰며 이동한다(넓은 곳) */
  moving: boolean;
  /** 영상을 올릴 때 만드는 운동의 부위(lib/exercise-meta.ts BODY_PARTS) */
  bodyParts: string[];
};

const W = (
  routine: WarmupRoutineKind,
  n: number,
  title: string,
  cue: string,
  bodyParts: string[],
  opts: { equipment?: string[]; moving?: boolean } = {}
): ShootWarmup => ({
  id: `warmup-${routine.toLowerCase().replace('_', '-')}-${String(n).padStart(2, '0')}`,
  title,
  routine,
  cue,
  equipment: opts.equipment ?? ['맨몸'],
  moving: opts.moving ?? false,
  bodyParts,
});

export const SHOOT_WARMUPS: readonly ShootWarmup[] = [
  W('COMMON', 1, '잭 점프', '10초', ['코어'], {}),
  W('COMMON', 2, '하이 니', '10초 · 제자리', ['고관절'], {}),
  W('COMMON', 3, '버트 킥', '10초 · 제자리', ['햄스트링·둔근'], {}),
  W('COMMON', 4, '카리오카', '10m 오가기', ['고관절'], { moving: true }),
  W('COMMON', 5, '인치웜', '2~3회', ['햄스트링·둔근', '어깨'], {}),
  W('COMMON', 6, '스파이더맨 런지 + 손 뻗기', '2회 · 한쪽', ['고관절'], {}),
  W('LOWER', 1, '레그 스윙 앞뒤', '5회 · 한쪽', ['고관절'], {}),
  W('LOWER', 2, '레그 스윙 좌우', '5회 · 한쪽', ['고관절'], {}),
  W('LOWER', 3, '래터럴 런지', '3회 · 한쪽', ['고관절'], {}),
  W('LOWER', 4, '코사크 스쿼트', '3회 · 한쪽', ['고관절'], {}),
  W('LOWER', 5, '프랑켄슈타인 워크', '10m 걷기', ['햄스트링·둔근'], { moving: true }),
  W('LOWER', 6, '스탠딩 힙 서클', '안 · 밖 3회 · 한쪽', ['고관절'], {}),
  W('UPPER_PUSH', 1, '암 서클 앞뒤', '앞뒤 5회', ['어깨'], {}),
  W('UPPER_PUSH', 2, '스캡 푸시업', '5회', ['견갑'], {}),
  W('UPPER_PUSH', 3, '다운독 푸시업', '3회', ['어깨', '가슴'], {}),
  W('UPPER_PUSH', 4, '흉추 오픈북', '3회 · 한쪽', ['등'], {}),
  W('UPPER_PUSH', 5, '월 엔젤', '5회 · 벽에 기대어', ['견갑'], {}),
  W('UPPER_PUSH', 6, '크로스 바디 암 스윙', '5회', ['가슴', '어깨'], {}),
  W('UPPER_PULL', 1, '밴드 Y · T · W', '각 3회', ['견갑'], { equipment: ['밴드'] }),
  W('UPPER_PULL', 2, '밴드 패스스루', '5회', ['어깨'], { equipment: ['밴드'] }),
  W('UPPER_PULL', 3, '밴드 스캡 풀', '5회', ['견갑'], { equipment: ['밴드'] }),
  W('UPPER_PULL', 4, '밴드 노 머니', '5회', ['어깨'], { equipment: ['밴드'] }),
  W('UPPER_PULL', 5, '밴드 W 리트랙션', '5회', ['견갑', '등'], { equipment: ['밴드'] }),
  W('UPPER_PULL', 6, '프론 스노우 엔젤', '3회', ['견갑', '등'], {}),
];

/**
 * 영상을 올려 만드는 라이브러리 운동(ExerciseVideo)의 id — 미리 정해 둔 uuid. 이름이 아니라 이 id 로 잇는다(라이브러리에서 이름 ·
 * 카테고리를 고쳐도 끊기지 않게, 2026-10-09 검토). 바꾸지 않는다.
 */
const ROW_IDS: Record<string, string> = {
  'warmup-common-01': '73e64d42-d40f-438d-bbd7-034b10cb3c9a',
  'warmup-common-02': '4eb42b69-a230-44b3-ac06-66b9aae7d25f',
  'warmup-common-03': '322817c1-52ce-41a1-a392-4a31f1df1b83',
  'warmup-common-04': 'fde1663c-0ba2-4c3a-8307-c127c82e5f1e',
  'warmup-common-05': 'adca4350-7368-4d1f-97a5-26caae35c749',
  'warmup-common-06': '72f36830-07ff-4cbf-b3e6-39f1fb1758ba',
  'warmup-lower-01': '97cb28a9-79b1-44a3-a80d-934d643663a0',
  'warmup-lower-02': '92e76d49-d807-4f68-99e7-c6167dadb755',
  'warmup-lower-03': '4f1ef683-62bd-4b86-8b9f-7dedf9b81270',
  'warmup-lower-04': '02419b45-eb26-4cf8-a691-468c443f89cf',
  'warmup-lower-05': 'd51aa4fd-9880-45cc-9c2c-1d850098d81b',
  'warmup-lower-06': '3c550961-8a38-45c4-8b63-03e1b3e6504a',
  'warmup-upper-push-01': '11688c75-8edd-4431-b081-1c4e03d1f24e',
  'warmup-upper-push-02': '0a4929d9-e871-4284-b205-6707cf67ca42',
  'warmup-upper-push-03': 'd0d64b03-4802-43db-ba34-0ad9378888f1',
  'warmup-upper-push-04': 'db3a48fe-dd86-4815-af6a-85efaa84a21c',
  'warmup-upper-push-05': '92d17c71-2e8a-4fa4-bf2b-c0bde95e8cc3',
  'warmup-upper-push-06': '8e01b87a-c198-46d9-9b75-687cfd310ff0',
  'warmup-upper-pull-01': '47a4ee57-1b67-4ad0-b846-98a474ce40d8',
  'warmup-upper-pull-02': '0252ddd1-e25b-4f85-8d22-e490be36cf05',
  'warmup-upper-pull-03': 'afb8ea7d-6dbb-4f30-8f3f-8ac5b28f0f86',
  'warmup-upper-pull-04': 'ef791731-cfc1-4d4f-8c16-962436dc03cd',
  'warmup-upper-pull-05': 'ee3d52b3-6732-44d0-b9c3-55d4188481a4',
  'warmup-upper-pull-06': '1aeafad7-0eda-4eb6-90b7-72ddf2e636a5',
};

/** 그 워밍업으로 만들(만든) 라이브러리 운동 id */
export function warmupRowId(id: string): string | null {
  return ROW_IDS[id] ?? null;
}

const BY_ID = new Map(SHOOT_WARMUPS.map((w) => [w.id, w]));

export function warmupOf(id: string): ShootWarmup | null {
  return BY_ID.get(id) ?? null;
}

export const isWarmupId = (id: string) => id.startsWith('warmup-');

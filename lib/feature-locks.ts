/**
 * 탭 잠금 · 튜토리얼 — 처음 가입한 사람은 투구 기록 · 트레이닝 · 영양이 잠겨 있고, 그 탭에 처음 들어가면
 * 질문(첫 설정)을 먼저 한다. 설정을 마치면 열리고, 이어서 그 탭 사용법 튜토리얼이 한 번 뜬다.
 * (2026-10-09 사용자 결정, docs/designs/signup-and-tab-onboarding.md)
 *
 * 가입은 이름 · 이메일 · 생년월일 · 성별 · 키 · 몸무게 · 비밀번호 · 소속 · 약관만 받는다. 투구 · 트레이닝 · 영양 질문은
 * 각 탭이 맡는다 — 읽히는 곳이 그 탭이라서(던지는 손 · 평소 투구량은 부하 지수, 경력 · 장비는 운동 고르기, 영양 답은 영양 목표).
 *
 * 순수 함수만. 읽는 값은 lib/dal.ts getCurrentUser 가 매 요청 한 번에 가져온다(pitchSetupAt · trainingSetupAt ·
 * tutorialsDone · nutritionProfile.onboardedAt). 설정 · 튜토리얼을 적는 쪽은 app/actions/pitch-setup.ts ·
 * training-setup.ts · nutrition.ts(finishNutritionSetup) · onboarding-state.ts 이고, 적은 뒤 revalidatePath('/', 'layout')
 * 으로 막대의 흐림까지 걷는다.
 */

/** 잠글 수 있는 기능 — 홈 · 설정 · 내 정보 · 체크인 · 알림 · 라이브러리 · 자료실은 늘 열려 있다 */
export type FeatureKey = 'pitch' | 'training' | 'nutrition';

export const FEATURE_KEYS: readonly FeatureKey[] = ['pitch', 'training', 'nutrition'];

/** 기능마다 true 면 잠김(첫 설정 전) */
export type FeatureLocks = Record<FeatureKey, boolean>;

/** getCurrentUser 가 돌려주는 것 중 잠금 계산에 쓰는 칸 */
export type LockSource = {
  pitchSetupAt: Date | null;
  trainingSetupAt: Date | null;
  nutritionProfile: { onboardedAt: Date | null } | null;
  createdAt: Date;
};

/**
 * 영양 잠금이 생긴 때(이번 가입 개편이 나간 날, 한국 시각 2026-10-10 0시).
 *
 * 투구 · 트레이닝은 옛 계정을 마이그레이션이 열어 두었다(옛 가입의 답이 있으면 pitchSetupAt · trainingSetupAt 을 채움).
 * 영양은 '줄이 있나'로 보는데, 옛 계정 중에는 영양 목표를 한 번도 저장하지 않아 줄이 없는 사람이 있다 — 그 사람들은
 * 영양 탭을 이미 쓰고 있었다(배너가 '목표 정하기'를 권할 뿐 막지 않았다). 그래서 이 때보다 먼저 가입한 계정은 잠그지 않는다.
 */
export const NUTRITION_LOCK_SINCE = new Date('2026-10-09T15:00:00.000Z');

/**
 * 어느 탭이 잠겨 있나.
 *
 * 영양은 NutritionProfile 줄의 유무다 — 줄이 있으면 목표를 한 번은 정한 것이고, 옛 계정 중 onboardedAt 이 빈 사람에게는
 * 영양 탭이 '다시 정해 볼까요' 배너로 권한다(막지 않는다). 가입에서 줄을 안 만들므로 새 계정은 잠겨 있다.
 * 개편 전에 가입한 계정은 줄이 없어도 열어 둔다(NUTRITION_LOCK_SINCE).
 */
export function featureLocks(user: LockSource): FeatureLocks {
  return {
    pitch: user.pitchSetupAt == null,
    training: user.trainingSetupAt == null,
    nutrition: user.nutritionProfile == null && user.createdAt >= NUTRITION_LOCK_SINCE,
  };
}

/** 잠긴 탭으로 가면 보내는 첫 설정 화면 */
export const SETUP_PATH: Record<FeatureKey, string> = {
  pitch: '/videos/setup',
  training: '/training/setup',
  nutrition: '/nutrition/setup',
};

/** 첫 설정을 마치면 돌아가는 탭 */
export const FEATURE_HOME: Record<FeatureKey, string> = {
  pitch: '/videos',
  training: '/training',
  nutrition: '/nutrition',
};

/**
 * 주소가 어느 기능에 속하나 — 셸(막대 · 탭)과 목적지 페이지가 같은 표를 본다.
 * (session) 그룹(/workout · /armcare/play · /mechanics/play · /velocity)도 여기 속한다.
 */
export function featureOfPath(pathname: string): FeatureKey | null {
  const p = pathname.split('?')[0];
  if (
    p.startsWith('/videos') ||
    p.startsWith('/pitch-log') ||
    p.startsWith('/velocity')
  )
    return 'pitch';
  if (
    p.startsWith('/training') ||
    p.startsWith('/workout') ||
    p.startsWith('/armcare') ||
    p.startsWith('/mechanics')
  ) {
    return 'training';
  }
  if (p.startsWith('/nutrition')) return 'nutrition';
  return null;
}

/** 첫 설정 화면 자신은 잠금에 걸리지 않는다 */
export function isSetupPath(pathname: string): boolean {
  const p = pathname.split('?')[0];
  return Object.values(SETUP_PATH).some((s) => p === s || p.startsWith(s + '/'));
}

/* ───────────── 튜토리얼 ───────────── */

/**
 * 본 튜토리얼의 열쇠 — User.tutorialsDone 에 이 값만 들어간다.
 *   tour:web · tour:app  앱 기본 사용법(막대 · 메뉴 · 설정 · 체크인). 웹과 앱(아이폰 웹뷰)이 생김새가 달라 따로 본다.
 *   pitch · training · nutrition  그 탭의 첫 설정을 마친 직후 한 번 — 기능 사용법.
 */
export const TUTORIAL_KEYS = [
  'tour:web',
  'tour:app',
  'pitch',
  'training',
  'nutrition',
] as const;
export type TutorialKey = (typeof TUTORIAL_KEYS)[number];

export function isTutorialKey(v: unknown): v is TutorialKey {
  return typeof v === 'string' && (TUTORIAL_KEYS as readonly string[]).includes(v);
}

export function hasSeenTutorial(
  user: { tutorialsDone: string[] },
  key: TutorialKey
): boolean {
  return user.tutorialsDone.includes(key);
}

/** 앱(아이폰 웹뷰) 안이면 앱 투어, 아니면 웹 투어 */
export function tourKeyFor(isNative: boolean): TutorialKey {
  return isNative ? 'tour:app' : 'tour:web';
}

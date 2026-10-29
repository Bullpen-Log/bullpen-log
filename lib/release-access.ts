/**
 * 출시 단계 기능 정책(2026-10-29 금윤호 — 출시 전 베타는 '투구 3D 분석'만, 스윙 3D 제외). 설계 docs/designs/pitch-3d-beta-access-plan.md,
 * 목록 · 접근 표 · 켜기/되돌리기는 docs/designs/pitch-3d-beta-access-impl.md.
 *
 * 역할(lib/permissions.ts)과 따로 선 층이다. 역할 · 계정 종류는 바꾸지 않고, '지금 출시 단계에서 이 사람이 이 기능을 쓸 수 있나'만 판정한다.
 * - 베타 제한에서 빠지는 것은 대표관리자(role ADMIN) 하나뿐. 계정 종류 MASTER(팀 · 레슨장)는 예외가 아니다 — isMasterUser 를 쓰지 않는다.
 * - 준관리자(MANAGER)는 일반 사용자와 똑같다 — 관리 업무(구속 측정 관리 · ABS · 촬영 · 녹화)도 베타 동안 잠긴다(2026-10-29 금윤호:
 *   "대표 관리자를 제외한 일반과 준관리자의 체험계정은 3D 분석만"). 역할 · 권한 표는 그대로 — 정식 출시면 예전 권한으로 돌아간다.
 * - 첫 설정 잠금(lib/feature-locks.ts)과 다른 뜻이다. 첫 설정을 마쳐도 베타 잠금은 안 풀린다 — 판정 이유를 갈라 돌려준다.
 * - 목록에 없는 기능은 베타 동안 막는다(기본 거부).
 *
 * 순수 파일 — 웹 서버 · 화면 · 앱(native)이 같이 쓴다. 출시 단계 값은 서버만 정한다(lib/release-gate.ts — 서버 환경변수 RELEASE_STAGE).
 * 앱이 받는 것은 서버가 판정해 보낸 결과(loadAppMe 의 access)이고, 앱 · 화면의 잠금은 보기용이다. 진짜 막기는 서버가 한다.
 */
import { can, type Permission } from '@/lib/permissions';

export type ReleaseStage = 'restricted_beta' | 'released';

/**
 * 서버 환경변수 RELEASE_STAGE 가 비었을 때의 출시 단계(2026-10-30 금윤호). Vercel 변수가 들어가지 않아 두 번 연속 베타가 안 켜졌다 —
 * 이제 코드가 베타를 기본으로 하고, 정식 출시로 바꿀 때는 여기를 'released' 로 고쳐 올리거나 변수 RELEASE_STAGE=released 를 넣는다.
 */
export const RELEASE_STAGE_DEFAULT: ReleaseStage = 'restricted_beta';

/** 정책 판 — 허용 목록 · 경로 표를 바꾸면 올린다. 앱이 들고 있는 정책을 이 값으로 갈라 버린다(계정 · 판이 다르면 다시 묻는다) */
export const RELEASE_POLICY_VERSION = '2026-10-29.2';

/**
 * 기능(사용자가 쓰는 한 덩어리 일). 경로 · 서버 동작 · API 가 모두 이 이름으로 묶인다.
 * 'admin' 은 관리 업무 — 기능 대신 권한(Permission)으로 판정한다.
 */
export type Capability =
  /* 베타에 열린 것 */
  | 'home'
  | 'pitch3d'
  | 'account'
  | 'support'
  | 'appInfra'
  | 'legal'
  /* 베타에 잠긴 것 */
  | 'pitchLog'
  | 'velocity'
  | 'abs'
  | 'pitchReading'
  | 'hitting'
  | 'swing3d'
  | 'training'
  | 'armcare'
  | 'mechanics'
  | 'nutrition'
  | 'records'
  | 'analysis'
  | 'library'
  | 'myVideos'
  | 'checkin'
  | 'calendar'
  | 'notifications'
  | 'board'
  | 'dugout'
  | 'chat'
  | 'org'
  /* 관리 업무 — 권한 표로 */
  | 'admin'
  /* 어느 표에도 없는 것 — 늘 막는다(대표관리자 제외) */
  | 'unclassified';

/**
 * 베타 동안 일반 · 준관리자에게 열린 기능 — 투구 3D 분석과 홈 · 설정 · 내 정보(계정)만, 그리고 그것을 쓰는 데 꼭 필요한 바탕(앱 갱신 · 약관).
 * 고객센터(support)도 잠근다(2026-10-29 금윤호: "3D 분석을 제외한 모든 기능(설정 및 프로필, 홈 화면 제외)"). 문의는 설정의 메일로.
 */
export const BETA_ALLOWED: ReadonlySet<Capability> = new Set(['home', 'pitch3d', 'account', 'appInfra', 'legal']);

/** 사람 — 로그인하지 않았으면 null */
export type AccessSubject = { role: string | null | undefined } | null;

export type AccessReason = 'allowed' | 'locked_beta' | 'setup_required' | 'permission_denied';

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
  capability: Capability;
  /** 관리 업무 예외로 열렸나(준관리자의 구속 측정 등) — 화면이 '관리 업무' 표시를 할 때 */
  via?: 'owner' | 'released' | 'beta_allowed' | 'permission';
};

export type DecideOptions = {
  stage: ReleaseStage;
  /** capability 'admin' 일 때 필요한 권한. 없으면 대표관리자만 */
  perm?: Permission;
  /** 출시 뒤의 첫 설정 잠금(lib/feature-locks.ts) — 'setup_required' 를 가르기 위해서만. 베타 판정에는 안 쓴다 */
  setupLocked?: boolean;
};

/**
 * 판정 — 차례: 대표관리자 → 베타면 관리 업무도 잠금 → 관리 업무(권한) → 출시 뒤(첫 설정) → 베타 허용 목록 → 잠금.
 * 로그인하지 않은 사람(subject null)은 로그인 · 약관 · 앱 갱신만 판정 대상이고, 나머지는 각 기능의 로그인 검사가 맡는다
 * (공개 읽기 — 덕아웃 목록 · 글 — 는 2026-10-29 금윤호 결정으로 베타에도 열어 둔다. 로그인한 일반 · 준관리자에게는 잠긴다).
 */
export function decideAccess(subject: AccessSubject, capability: Capability, opts: DecideOptions): AccessDecision {
  const role = subject?.role ?? null;
  /* 베타 동안 관리 업무는 대표관리자만 — 준관리자의 기존 권한(구속 측정 관리 · ABS · 촬영 · 녹화)도 쓰지 않는다 */
  if (capability === 'admin' && opts.stage === 'restricted_beta' && role !== 'ADMIN') return { allowed: false, reason: 'locked_beta', capability };
  if (capability === 'admin') {
    const ok = opts.perm ? can(role, opts.perm) : role === 'ADMIN';
    return ok
      ? { allowed: true, reason: 'allowed', capability, via: 'permission' }
      : { allowed: false, reason: 'permission_denied', capability };
  }
  if (role === 'ADMIN') return { allowed: true, reason: 'allowed', capability, via: 'owner' };
  if (opts.stage === 'released') {
    if (capability === 'unclassified') return { allowed: true, reason: 'allowed', capability, via: 'released' };
    return opts.setupLocked
      ? { allowed: false, reason: 'setup_required', capability }
      : { allowed: true, reason: 'allowed', capability, via: 'released' };
  }
  if (BETA_ALLOWED.has(capability)) return { allowed: true, reason: 'allowed', capability, via: 'beta_allowed' };
  return { allowed: false, reason: 'locked_beta', capability };
}

/** 이 사람이 지금 베타 제한을 받나 — 대표관리자 · 정식 출시면 아니다 */
export function isBetaRestricted(subject: AccessSubject, stage: ReleaseStage): boolean {
  return stage === 'restricted_beta' && subject?.role !== 'ADMIN';
}

/* ───────────── 경로 → 기능 ───────────── */

/**
 * 웹 · 앱 경로의 기능. 가장 구체적인 규칙이 먼저 — '/videos/lab' 은 잠긴 부모 '/videos' 보다 앞에서 투구 3D 로 갈린다.
 * 접두는 세그먼트 경계로만 맞춘다('/lab' 이 '/labs' 를 잡지 않게). 쿼리로 모드가 바뀌는 곳(/velocity?mode=abs, /training?view=…)도 본다.
 * 웹 주소와 앱(expo-router) 주소를 같은 표에 둔다 — 앱 '/lab' 과 웹 '/videos/lab' 이 같은 기능이다.
 */
type PathRule = {
  prefix: string;
  exact?: boolean;
  cap: Capability;
  perm?: Permission;
  query?: (q: URLSearchParams) => Capability | null;
  /** 이 화면에서만 맞춘다(앱 화면이 웹 주소를 빌려 쓰는 곳) */
  surface?: 'web' | 'native';
};

const PATH_RULES: PathRule[] = [
  /* 투구 3D — 웹 · 앱 웹뷰(embed) · 앱 화면. 부모(/videos)보다 먼저 */
  { prefix: '/videos/lab', cap: 'pitch3d' },
  { prefix: '/embed/lab', cap: 'pitch3d' },
  { prefix: '/lab', cap: 'pitch3d' },

  /* 스윙 3D — 타격(/hitting)보다 먼저 */
  { prefix: '/hitting/lab', cap: 'swing3d' },
  { prefix: '/swing', cap: 'swing3d' },
  { prefix: '/hitting/read', cap: 'pitchReading' },
  { prefix: '/pitch-reading', cap: 'pitchReading' },
  { prefix: '/hitting', cap: 'hitting' },

  /* 관리 업무 — 화면마다 권한. 표에 없는 /admin 화면은 대표관리자만(perm 없음) */
  { prefix: '/admin', exact: true, cap: 'admin', perm: 'adminHome' },
  { prefix: '/admin/velocity/recordings', cap: 'admin', perm: 'recording' },
  { prefix: '/admin/velocity', cap: 'admin', perm: 'velocityAdmin' },
  { prefix: '/admin/shoot', cap: 'admin', perm: 'shoot' },
  { prefix: '/admin/dev3d', cap: 'admin', perm: 'dev3d' },
  { prefix: '/admin', cap: 'admin' },

  /*
   * 앱 투구 탭 첫 화면(도구 도크 — 3D 분석이 여기서 들어간다). 베타에도 열고 안의 구속 측정 · ABS · 투구 기록은 각자 잠근다(회색 + 자물쇠).
   * 앱의 베타 판(native/src/pitch/tab.tsx BetaPitchTab)은 투구 기록 조회를 하지 않는다. 웹 /videos(투구 기록을 읽는 화면)와 앱 기록(?view=log)은 잠김
   */
  { prefix: '/videos', exact: true, surface: 'native', cap: 'home', query: (q) => (q.get('view') ? 'pitchLog' : null) },

  /* 투구 기록 · 구속 · ABS */
  { prefix: '/videos', cap: 'pitchLog' },
  { prefix: '/pitch-log', cap: 'pitchLog' },
  { prefix: '/pitch', cap: 'pitchLog' },
  { prefix: '/velocity-engine', cap: 'velocity' },
  { prefix: '/velocity', cap: 'velocity', query: (q) => (q.get('mode') === 'abs' ? 'abs' : null) },
  { prefix: '/abs', cap: 'abs' },
  { prefix: '/embed/abs', cap: 'abs' },

  /* 트레이닝 · 암케어 · 메커니즘 */
  {
    prefix: '/training',
    cap: 'training',
    query: (q) => {
      const v = q.get('view');
      return v === 'armcare' ? 'armcare' : v === 'mechanics' ? 'mechanics' : null;
    },
  },
  { prefix: '/training-armcare', cap: 'armcare' },
  { prefix: '/training-mechanics', cap: 'mechanics' },
  { prefix: '/training-today', cap: 'training' },
  { prefix: '/workout', cap: 'training' },
  { prefix: '/workout-done', cap: 'training' },
  { prefix: '/warmup', cap: 'training' },
  { prefix: '/armcare', cap: 'armcare' },
  { prefix: '/embed/muscle', cap: 'armcare' },
  { prefix: '/rehab', cap: 'armcare' },
  { prefix: '/rehab-start', cap: 'armcare' },
  { prefix: '/rehab-test', cap: 'armcare' },
  { prefix: '/rehab-throw-log', cap: 'armcare' },
  { prefix: '/rehab-throw-open', cap: 'armcare' },
  { prefix: '/rehab-weekly', cap: 'armcare' },
  { prefix: '/mechanics', cap: 'mechanics' },

  { prefix: '/nutrition', cap: 'nutrition' },
  { prefix: '/coach', cap: 'analysis' },
  { prefix: '/analysis', cap: 'analysis' },
  { prefix: '/records', cap: 'records' },
  { prefix: '/sinker', cap: 'records' },
  { prefix: '/library', cap: 'library' },
  { prefix: '/board', cap: 'board' },
  { prefix: '/my-videos', cap: 'myVideos' },
  { prefix: '/checkin', cap: 'checkin' },
  { prefix: '/calendar', cap: 'calendar' },
  { prefix: '/notice', cap: 'notifications' },
  { prefix: '/notifications', cap: 'notifications' },

  /* 첫 설정 화면 — 그 기능의 일부(베타에는 잠김). 투구 3D 는 첫 설정 없이 쓴다 */
  { prefix: '/setup/pitch', cap: 'pitchLog' },
  { prefix: '/setup/training', cap: 'training' },
  { prefix: '/setup/nutrition', cap: 'nutrition' },

  /* 팀 · 레슨장 */
  { prefix: '/manage', cap: 'org' },
  { prefix: '/join', cap: 'org' },
  { prefix: '/org', cap: 'org' },
  { prefix: '/report', cap: 'org' },

  /* 덕아웃(로그인한 일반 · 준관리자에게는 잠김 — 비로그인 공개 읽기는 각 화면이 그대로) */
  { prefix: '/chat', cap: 'chat' },
  { prefix: '/market', cap: 'dugout' },
  { prefix: '/community', cap: 'dugout' },
  { prefix: '/meetup', cap: 'dugout' },
  { prefix: '/lessons', cap: 'dugout' },
  { prefix: '/venues', cap: 'dugout' },
  { prefix: '/gear', cap: 'dugout' },
  { prefix: '/me', cap: 'dugout' },
  { prefix: '/pay', cap: 'dugout' },
  { prefix: '/u', cap: 'dugout' },
  { prefix: '/search', cap: 'dugout' },
  { prefix: '/baseball', cap: 'dugout' },
  { prefix: '/embed/place', cap: 'admin' },

  /* 계정 · 고객센터 · 약관 · 바탕 */
  { prefix: '/today', cap: 'home' },
  { prefix: '/login', cap: 'account' },
  { prefix: '/signup', cap: 'account' },
  { prefix: '/account', cap: 'account' },
  { prefix: '/profile', cap: 'account' },
  { prefix: '/settings', cap: 'account' },
  { prefix: '/link', cap: 'account' },
  { prefix: '/support', cap: 'support' },
  { prefix: '/terms', cap: 'legal' },
  { prefix: '/privacy', cap: 'legal' },
  { prefix: '/phone', cap: 'legal' },
  { prefix: '/intro', cap: 'legal' },
  { prefix: '/dashboard', cap: 'home' },
  /* 앱 더보기(메뉴 판) — 판 자신은 열고, 안의 항목은 각자 판정한다 */
  { prefix: '/more', cap: 'appInfra' },
  /* 앱 화면 '/'(껍데기) — 앱에서는 베타 홈이 그려진다 */
];

const matchesPrefix = (path: string, rule: PathRule) =>
  rule.exact ? path === rule.prefix : path === rule.prefix || path.startsWith(`${rule.prefix}/`);

export type PathAccess = { capability: Capability; perm?: Permission };

/**
 * 주소(웹 · 앱) → 기능. `surface` 'native' 의 '/' 는 앱 껍데기(베타 홈), 'web' 의 '/' 는 덕아웃 첫 화면.
 * '?dugout=1' 은 덕아웃(웹 '/'), 표에 없는 주소는 'unclassified'.
 */
export function capabilityOfPath(href: string, surface: 'web' | 'native' = 'web'): PathAccess {
  const q = href.indexOf('?');
  const path = (q >= 0 ? href.slice(0, q) : href).replace(/\/+$/, '') || '/';
  const search = new URLSearchParams(q >= 0 ? href.slice(q + 1) : '');
  if (path === '/') return { capability: surface === 'native' && search.get('dugout') !== '1' ? 'home' : 'dugout' };
  for (const rule of PATH_RULES) {
    if (rule.surface && rule.surface !== surface) continue;
    if (!matchesPrefix(path, rule)) continue;
    const byQuery = rule.query?.(search) ?? null;
    return { capability: byQuery ?? rule.cap, ...(rule.perm ? { perm: rule.perm } : {}) };
  }
  return { capability: 'unclassified' };
}

/** 주소를 이 사람이 지금 열 수 있나 */
export function decidePath(subject: AccessSubject, href: string, opts: Omit<DecideOptions, 'perm'> & { surface?: 'web' | 'native' }): AccessDecision {
  const p = capabilityOfPath(href, opts.surface);
  return decideAccess(subject, p.capability, { stage: opts.stage, perm: p.perm, setupLocked: opts.setupLocked });
}

/* ───────────── 앱 · 화면이 받는 요약 ───────────── */

/**
 * 앱 시작 정보(app.loadAppMe)에 싣는 판정 결과 — 앱은 이것을 그리기용으로만 쓴다(권한이 아니다).
 * restricted: 베타 제한 화면을 그린다. allowed: 열린 기능. adminPerms: 관리 업무 진입에 보일 도구(베타 제한이면 비어 있다 — 정식 출시면 기존 권한 표 그대로).
 */
export type ReleaseAccess = {
  stage: ReleaseStage;
  policyVersion: string;
  restricted: boolean;
  allowed: Capability[];
  adminPerms: Permission[];
};

const ALL_CAPS: Capability[] = [
  'home', 'pitch3d', 'account', 'support', 'appInfra', 'legal', 'pitchLog', 'velocity', 'abs', 'pitchReading', 'hitting', 'swing3d',
  'training', 'armcare', 'mechanics', 'nutrition', 'records', 'analysis', 'library', 'myVideos', 'checkin', 'calendar', 'notifications',
  'board', 'dugout', 'chat', 'org',
];
const ALL_PERMS: Permission[] = ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs', 'dev3d'];

export function releaseAccessOf(subject: AccessSubject, stage: ReleaseStage): ReleaseAccess {
  return {
    stage,
    policyVersion: RELEASE_POLICY_VERSION,
    restricted: isBetaRestricted(subject, stage),
    allowed: ALL_CAPS.filter((c) => decideAccess(subject, c, { stage }).allowed),
    adminPerms: isBetaRestricted(subject, stage) ? [] : ALL_PERMS.filter((p) => can(subject?.role ?? null, p)),
  };
}

/**
 * 앱이 받은 요약으로 주소를 판정한다(그리기용). 요약이 없으면(아직 모름 · 꺼진 망에 저장도 없음) 막힌 쪽으로 — 잠깐이라도 다 열지 않는다.
 * 관리 화면은 요약의 adminPerms 로, 나머지는 allowed 목록으로.
 */
export function accessAllowsPath(access: ReleaseAccess | null, href: string, surface: 'web' | 'native' = 'native'): boolean {
  const p = capabilityOfPath(href, surface);
  if (!access) return p.capability === 'home' || p.capability === 'account' || p.capability === 'legal' || p.capability === 'appInfra';
  if (!access.restricted) return true;
  if (p.capability === 'admin') return p.perm ? access.adminPerms.includes(p.perm) : false;
  return access.allowed.includes(p.capability);
}

/** 잠긴 기능을 눌렀을 때의 안내 — 화면 · 앱이 같은 글(2026-10-29 금윤호: "누르면 준비중인 기능입니다 이렇게 뜨면서") */
export const BETA_LOCK_TITLE = '준비 중인 기능입니다.';
/** 베타 홈 · 서버 오류 글에 붙는 둘째 줄 */
export const BETA_LOCK_BODY = '지금은 투구 3D 분석만 체험할 수 있어요.';
/** 서버가 막을 때의 기계용 코드 */
export const FEATURE_LOCKED_BETA = 'FEATURE_LOCKED_BETA';

import {
  MAX_AGE,
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_AGE,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  ageFromBirthDate,
  parseBirthDate,
  type Sex,
} from '@/lib/profile';
import { ORG_NAME_MAX, ORG_NAME_MIN, normalizeInviteCode, orgNameOk, type OrgKind } from '@/lib/org/rules';

/**
 * 가입 화면의 답 · 차례 · 화면별 검사 — 웹 가입 폼(app/login/auth-form.tsx)과 앱 가입 화면(native/src/app/signup.tsx)이 같이 쓴다.
 * 서버(app/actions/auth.ts signup · lib/profile.ts)와 같은 선을 먼저 봐서 네 화면을 다 지나 마지막에야 막히지 않게 한다.
 */
export type SignupAnswers = {
  /**
   * 계정 종류(2026-10-20 팀 · 레슨장 마스터) — 웹 가입의 첫 화면에서 고른다. 앱 가입(native/src/app/signup.tsx)은 아직 선수만이라
   * null 그대로 보내고, 서버는 accountType 칸이 없으면 선수로 만든다.
   */
  kind: SignupKind | null;
  nickname: string;
  email: string;
  /** 'YYYY-MM-DD' */
  birthDate: string;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  password: string;
  passwordConfirm: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  /** 레슨장 · 팀 가입만 — 조직 이름 · 지역 · 메모(레슨장: 코치 수 · 소개, 팀: 연령대 · 리그) */
  orgName: string;
  orgRegion: string;
  orgNote: string;
  /** 이미 있는 레슨장 · 팀에 코치로 들어가는 초대 코드(스태프 코드) — 적으면 조직을 새로 만들지 않는다(5단계) */
  staffCode: string;
};

/** 가입 종류 — 선수(지금의 불펜로그) · 레슨장 · 팀(마스터 화면 /manage, 선수 기능 없음) */
export type SignupKind = 'player' | 'lesson' | 'team';

export const SIGNUP_KIND_OPTIONS: { value: SignupKind; label: string; hint: string }[] =
  [
    { value: 'player', label: '선수', hint: '내 투구 · 훈련 · 영양을 기록해요.' },
    { value: 'lesson', label: '레슨장', hint: '회원을 관리하고 성장을 보여 줘요.' },
    { value: 'team', label: '팀', hint: '선수단 · 훈련 일정 · 투수 관리.' },
  ];

export function isMasterKind(kind: SignupKind | null): kind is 'lesson' | 'team' {
  return kind === 'lesson' || kind === 'team';
}

/** 가입 종류 → 조직 종류(prisma OrgKind). 선수면 null */
export function orgKindOf(kind: SignupKind | null): OrgKind | null {
  return kind === 'lesson' ? 'LESSON' : kind === 'team' ? 'TEAM' : null;
}

export const EMPTY_SIGNUP: SignupAnswers = {
  kind: null,
  nickname: '',
  email: '',
  birthDate: '',
  sex: null,
  heightCm: null,
  weightKg: null,
  password: '',
  passwordConfirm: '',
  agreeTerms: false,
  agreePrivacy: false,
  orgName: '',
  orgRegion: '',
  orgNote: '',
  staffCode: '',
};

export type SignupStep = 'name' | 'birth' | 'body' | 'terms';

/**
 * 화면 차례 — 답에 따라 생기고 빠지는 화면이 없어 늘 넷이다(소속은 2026-10-10 에 뺐다 — 계산에 안 쓴다).
 * 비밀번호는 2026-10-12 에 첫 화면으로 옮겼다(사용자: "이름, 이메일, 비밀번호까지 한 번에").
 */
export const SIGNUP_STEPS: SignupStep[] = ['name', 'birth', 'body', 'terms'];

/** 칸이 있는 화면 — 서버가 어느 칸을 막았는지(AuthState.field) 알려 주면 그 화면으로 돌아간다 */
const FIELD_STEP: Record<string, SignupStep> = {
  nickname: 'name',
  email: 'name',
  birthDate: 'birth',
  sex: 'birth',
  heightCm: 'body',
  weightKg: 'body',
  password: 'name',
  passwordConfirm: 'name',
  agreeTerms: 'terms',
  agreePrivacy: 'terms',
};

export function stepOfField(field: string): SignupStep {
  return FIELD_STEP[field] ?? 'terms';
}

/*
 * ── 웹 가입(app/login/auth-form.tsx)의 차례 — 종류 화면이 앞에 하나 더, 레슨장 · 팀은 선수 칸 대신 조직 화면 ──
 * SignupStep · SIGNUP_STEPS · stepOfField · checkSignupStep 은 그대로 둔다 — 앱 가입(native/src/app/signup.tsx)이 그 넷으로
 * 제 화면을 그린다(TITLES: Record<SignupStep, …>). 웹은 아래 넓은 꼴을 쓴다.
 */
export type WebSignupStep = SignupStep | 'kind' | 'org';

export function signupStepsOf(a: SignupAnswers): WebSignupStep[] {
  if (isMasterKind(a.kind)) return ['kind', 'name', 'org', 'terms'];
  return ['kind', ...SIGNUP_STEPS];
}

const WEB_FIELD_STEP: Record<string, WebSignupStep> = {
  kind: 'kind',
  accountType: 'kind',
  orgKind: 'kind',
  orgName: 'org',
  orgRegion: 'org',
  orgNote: 'org',
  staffCode: 'org',
};

export function webStepOfField(field: string): WebSignupStep {
  return WEB_FIELD_STEP[field] ?? stepOfField(field);
}

/** 웹 가입의 화면 검사 — 종류 · 조직 화면은 여기서, 나머지는 checkSignupStep 그대로 */
export function checkWebSignupStep(
  key: WebSignupStep,
  a: SignupAnswers,
  today: string
): { error: string; field: string } | null {
  switch (key) {
    case 'kind':
      if (!a.kind) return { error: '어떻게 쓸지 골라 주세요.', field: 'kind' };
      return null;
    case 'org': {
      /* 코치로 합류 — 코드가 있으면 조직 이름은 안 받는다. 코드 모양이 틀리면 거기서 막는다 */
      const staff = a.staffCode.trim();
      if (staff) {
        if (!normalizeInviteCode(staff)) return { error: '초대 코드는 여섯 글자예요.', field: 'staffCode' };
        return null;
      }
      const name = a.orgName.trim();
      if (!name) return { error: '이름을 적어 주세요.', field: 'orgName' };
      if (!orgNameOk(name))
        return {
          error: `이름은 ${ORG_NAME_MIN}~${ORG_NAME_MAX}자로 적어 주세요.`,
          field: 'orgName',
        };
      return null;
    }
    default:
      return checkSignupStep(key, a, today);
  }
}

/** 키 · 몸무게가 범위 안인가 — 서버(lib/profile.ts)와 같은 선. 몸무게 칸은 키가 이 선을 넘어야 펴진다 */
export function heightOk(h: number | null): h is number {
  return h !== null && Number.isInteger(h) && h >= MIN_HEIGHT_CM && h <= MAX_HEIGHT_CM;
}
export function weightOk(kg: number | null): kg is number {
  return kg !== null && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 한 화면을 넘어가도 되는가 — 서버(app/actions/auth.ts · lib/profile.ts · lib/baseline.ts)와 같은 기준을 먼저 본다.
 * 두 칸 화면은 두 칸 모두 맞아야 넘어간다. today 는 'YYYY-MM-DD'(생년월일이 앞날이면 막는다).
 */
export function checkSignupStep(
  key: SignupStep,
  a: SignupAnswers,
  today: string
): { error: string; field: string } | null {
  switch (key) {
    case 'name': {
      const nickname = a.nickname.trim();
      if (!nickname) return { error: '뭐라고 부를지 적어 주세요.', field: 'nickname' };
      if (nickname.length < 2)
        return { error: '이름은 2자 이상이어야 해요.', field: 'nickname' };
      const email = a.email.trim();
      if (!email) return { error: '이메일을 적어 주세요.', field: 'email' };
      if (!EMAIL_RE.test(email))
        return { error: '올바른 이메일 형식이 아니에요.', field: 'email' };
      if (a.password.length < 8)
        return { error: '비밀번호는 8자 이상이어야 해요.', field: 'password' };
      if (!a.passwordConfirm)
        return { error: '비밀번호를 한 번 더 적어 주세요.', field: 'passwordConfirm' };
      if (a.password !== a.passwordConfirm)
        return { error: '비밀번호가 일치하지 않아요.', field: 'passwordConfirm' };
      return null;
    }
    case 'birth': {
      if (!a.birthDate) return { error: '생년월일을 골라 주세요.', field: 'birthDate' };
      const parsed = parseBirthDate(a.birthDate);
      if (!parsed)
        return { error: '생년월일을 올바르게 골라 주세요.', field: 'birthDate' };
      const age = ageFromBirthDate(parsed);
      if (a.birthDate > today || age < MIN_AGE || age > MAX_AGE) {
        return { error: '생년월일을 다시 확인해 주세요.', field: 'birthDate' };
      }
      if (!a.sex) return { error: '성별을 골라 주세요.', field: 'sex' };
      return null;
    }
    case 'body':
      if (a.heightCm === null) return { error: '키를 적어 주세요.', field: 'heightCm' };
      if (!heightOk(a.heightCm)) {
        return {
          error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이로 적어 주세요.`,
          field: 'heightCm',
        };
      }
      if (a.weightKg === null)
        return { error: '몸무게를 적어 주세요.', field: 'weightKg' };
      if (!weightOk(a.weightKg)) {
        return {
          error: `몸무게는 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 적어 주세요.`,
          field: 'weightKg',
        };
      }
      return null;
    case 'terms':
      if (!a.agreeTerms)
        return { error: '이용약관에 동의해 주세요.', field: 'agreeTerms' };
      if (!a.agreePrivacy)
        return { error: '개인정보 처리방침에 동의해 주세요.', field: 'agreePrivacy' };
      return null;
  }
}

/** 서버로 보내는 칸 — 웹 가입 폼의 칸 이름과 같다(앱이 rpcForm('auth.signup') 으로 보낸다). 동의는 켰을 때만 'on' */
export function signupFields(a: SignupAnswers): Record<string, string | null> {
  return {
    nickname: a.nickname.trim(),
    email: a.email.trim(),
    birthDate: a.birthDate,
    sex: a.sex ?? '',
    heightCm: a.heightCm == null ? '' : String(a.heightCm),
    weightKg: a.weightKg == null ? '' : String(a.weightKg),
    password: a.password,
    passwordConfirm: a.passwordConfirm,
    agreeTerms: a.agreeTerms ? 'on' : null,
    agreePrivacy: a.agreePrivacy ? 'on' : null,
    /* 레슨장 · 팀 — 서버(app/actions/auth.ts)가 accountType 이 'MASTER' 면 조직을 함께 만든다. 선수는 이 칸들이 없다 */
    ...(isMasterKind(a.kind)
      ? {
          accountType: 'MASTER',
          orgKind: orgKindOf(a.kind) ?? '',
          orgName: a.orgName.trim(),
          orgRegion: a.orgRegion.trim(),
          orgNote: a.orgNote.trim(),
          staffCode: a.staffCode.trim(),
        }
      : {}),
  };
}

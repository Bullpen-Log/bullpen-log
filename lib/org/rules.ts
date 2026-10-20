/**
 * 팀 · 레슨장(조직)의 순수 규칙 — 서버 · 화면 · 시험(scripts/org-selftest.mts)이 같이 쓴다. DB · 쿠키는 여기 없다(lib/org/access.ts).
 *
 * 2026-10-20 1단계(docs/designs/team-lesson-build-prompt.md): 조직 종류 둘 · 공유 동의 기본값 · 초대 코드.
 * 결정(금윤호 2026-10-20): 영상은 레슨장 · 팀 모두 기본 켬, 영양 · 체중은 끔.
 */

export type OrgKind = 'LESSON' | 'TEAM';

export const ORG_KIND_LABEL: Record<OrgKind, string> = { LESSON: '레슨장', TEAM: '팀' };

/** 종류마다 다른 말 — 레슨장은 회원 · 레슨, 팀은 선수 · 훈련 */
export const ORG_WORDS: Record<
  OrgKind,
  { member: string; members: string; session: string }
> = {
  LESSON: { member: '회원', members: '회원', session: '레슨' },
  TEAM: { member: '선수', members: '선수단', session: '훈련' },
};

export function isOrgKind(v: unknown): v is OrgKind {
  return v === 'LESSON' || v === 'TEAM';
}

/** 조직 이름 · 지역 · 메모(연령대 · 리그 / 코치 수)의 길이 */
export const ORG_NAME_MIN = 2;
export const ORG_NAME_MAX = 40;
export const ORG_REGION_MAX = 40;
export const ORG_NOTE_MAX = 80;

export function orgNameOk(name: string): boolean {
  const n = name.trim();
  return n.length >= ORG_NAME_MIN && n.length <= ORG_NAME_MAX;
}

/* ── 공유 동의 — 선수(회원)가 조직에 보여 줄 범위 ── */

export const CONSENT_SCOPES = [
  { key: 'pitch', label: '투구 기록 · 구속', hint: '투구수 · 부하 지수 · 구속 측정' },
  { key: 'training', label: '트레이닝', hint: '오늘 운동 · 운동 기록 · 재활' },
  { key: 'checkin', label: '체크인', hint: '컨디션 · 통증 · 잠' },
  { key: 'video', label: '영상', hint: '투구 영상 · 구속 측정 클립' },
  { key: 'nutrition', label: '영양', hint: '먹은 것 · 목표' },
  { key: 'weight', label: '체중', hint: '체중 기록' },
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number]['key'];
export type Consent = Record<ConsentScope, boolean>;

/** 참여 화면에 미리 켜 두는 값 — 레슨장 · 팀 같다(영상도 켬, 2026-10-20 결정 3). 종류마다 달라지면 OrgKind 를 받게 바꾼다 */
export function consentDefaults(): Consent {
  return {
    pitch: true,
    training: true,
    checkin: true,
    video: true,
    nutrition: false,
    weight: false,
  };
}

/** 폼의 체크박스(켰을 때만 'on')에서 동의를 읽는다 — 없는 칸은 끔 */
export function consentFromForm(get: (name: string) => unknown): Consent {
  const out = {} as Consent;
  for (const s of CONSENT_SCOPES) out[s.key] = get(`scope-${s.key}`) === 'on';
  return out;
}

/** 모두 켠 동의 — 코치가 대신 만든 자리(아직 가입 안 한 회원)는 그 조직에 다 보인다 */
export function consentAll(): Consent {
  return {
    pitch: true,
    training: true,
    checkin: true,
    video: true,
    nutrition: true,
    weight: true,
  };
}

/* ── 초대 코드 — 읽기 헷갈리는 0 · O · 1 · I 는 뺀 여섯 글자 ── */

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_LEN = 6;
/** 코드의 기한(일) — 지나면 새로 만든다 */
export const INVITE_DAYS = 14;

export function makeInviteCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < INVITE_LEN; i++)
    out +=
      INVITE_ALPHABET[
        Math.min(
          INVITE_ALPHABET.length - 1,
          Math.floor(rand() * INVITE_ALPHABET.length)
        )
      ];
  return out;
}

/** 사람이 친 코드 — 소문자 · 띄어쓰기 · 줄표는 받아 주고, 모양이 아니면 null */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== INVITE_LEN) return null;
  for (const ch of s) if (!INVITE_ALPHABET.includes(ch)) return null;
  return s;
}

/** 초대 코드가 아직 쓸 수 있나 — 기한 안이고, 한 번만 쓰는 코드(스태프)는 안 쓴 것 */
export function inviteUsable(
  invite: { role: 'MASTER' | 'STAFF' | 'PLAYER'; expiresAt: Date; usedAt: Date | null },
  now: Date
): boolean {
  if (invite.expiresAt.getTime() <= now.getTime()) return false;
  /* 선수(회원) 코드는 여럿이 같이 쓴다(카톡 단톡에 올리는 것) — 기한까지 몇 번이든 */
  if (invite.role === 'PLAYER') return true;
  return invite.usedAt == null;
}

/** 조직 안 태그(포지션 · 학년 · 묶음) — 쉼표로 적은 글을 정리한다 */
export const TAG_MAX = 12;
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(/[,·\n]/)) {
    const s = t.trim().slice(0, 20);
    if (s && !seen.has(s)) seen.add(s);
    if (seen.size >= TAG_MAX) break;
  }
  return [...seen];
}

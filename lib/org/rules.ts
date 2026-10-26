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

/** 모두 끈 동의 — 계정이 이어졌지만 아직 공유 범위를 안 고른 회원(동의 대기). 예약 확정으로 연결된 회원이 여기서 시작한다(2026-10-25 0단계 계약 2-1) */
export function consentNone(): Consent {
  return {
    pitch: false,
    training: false,
    checkin: false,
    video: false,
    nutrition: false,
    weight: false,
  };
}

/**
 * 구성원의 공유 동의. 동의 줄이 없을 때 — 코치가 대신 만든 자리(계정 없음)는 모두 보이고, 계정이 이어진 회원은 아무것도 안 보인다
 * (동의 대기 — 예약 확정은 회원 연결만 하고 공유는 선수가 싱커에서 고른다, 2026-10-25 0단계 계약 2-1). lib/org/access.ts 가 다시 내보낸다.
 */
export function memberScope(consent: Consent | null | undefined, hasUser: boolean): Consent {
  return consent ?? (hasUser ? consentNone() : consentAll());
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

/** 초대 코드가 아직 쓸 수 있나 — 기한 안이고, 한 번만 쓰는 코드(스태프 · 가입 전 자리 코드)는 안 쓴 것 */
export function inviteUsable(
  invite: { role: 'MASTER' | 'STAFF' | 'PLAYER'; expiresAt: Date; usedAt: Date | null; memberId?: string | null },
  now: Date
): boolean {
  if (invite.expiresAt.getTime() <= now.getTime()) return false;
  /* 선수(회원) 코드는 여럿이 같이 쓴다(카톡 단톡에 올리는 것) — 기한까지 몇 번이든. 가입 전 자리(memberId)의 코드는 그 한 사람만 */
  if (invite.role === 'PLAYER' && !invite.memberId) return true;
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

/* ── 팔 상태 → 코치 말(2단계 투수 부하판) — 판정은 lib/report/arm-status.ts 그대로, 여기는 말만 ── */

export const ARM_WORD: Record<'safe' | 'caution' | 'danger', string> = {
  safe: '던져도 돼요',
  caution: '가볍게',
  danger: '쉬어야 해요',
};

/* ── 조직 일정 종류(5단계 팀 달력 · 4단계 레슨 시간표) ── */

export const EVENT_KINDS = [
  { key: 'training', label: '훈련' },
  { key: 'game', label: '경기' },
  { key: 'rest', label: '휴식' },
  { key: 'lesson', label: '레슨' },
  { key: 'other', label: '기타' },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]['key'];
export function isEventKind(v: unknown): v is EventKind {
  return EVENT_KINDS.some((k) => k.key === v);
}
export const EVENT_KIND_LABEL: Record<EventKind, string> = Object.fromEntries(
  EVENT_KINDS.map((k) => [k.key, k.label])
) as Record<EventKind, string>;
export const EVENT_TITLE_MAX = 40;
export const EVENT_MEMO_MAX = 300;
/** 'HH:MM' — 비면 하루 종일 */
export function timeOk(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
export function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/* ── 레슨 노트 · 수강권(4단계) ── */

export const NOTE_MAX = 2000;
export const HOMEWORK_MAX = 500;
/** 수강권이 이만큼 남으면 홈이 알린다 */
export const PASS_ALERT_LEFT = 3;
export const PASS_TOTAL_MAX = 200;

export function passLeft(p: { total: number; used: number }): number {
  return Math.max(0, p.total - p.used);
}
/** 아직 쓸 수 있는 수강권인가 — 남은 회가 있고 기한(그날 포함)이 안 지남 */
export function passUsable(
  p: { total: number; used: number; expiresAt: Date | null },
  todayKey: string
): boolean {
  if (passLeft(p) <= 0) return false;
  return p.expiresAt == null || p.expiresAt.toISOString().slice(0, 10) >= todayKey;
}

/* ── 보호자 리포트(4단계) — 토큰 주소 + 네 자리 코드, 30일 ── */

export const GUARDIAN_DAYS = 30;
export function makeGuardianCode(rand: () => number = Math.random): string {
  return String(Math.min(9999, Math.floor(rand() * 10000))).padStart(4, '0');
}
export function isGuardianCode(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}$/.test(v);
}
/** 리포트 토큰 — uuid 에서 줄표를 뺀 32자(app/actions/org-notes.ts createGuardianLink) */
export const REPORT_TOKEN_RE = /^[0-9a-f]{32}$/;

/* ── 공지(5단계) ── */
export const NOTICE_TITLE_MAX = 60;
export const NOTICE_BODY_MAX = 3000;

/**
 * 실제 시각 — 초대 코드 · 보호자 링크의 기한은 앱 시계(시험 계정의 날짜)가 아니라 실제 시각으로 센다. 화면을 그리는 도중에 Date.now 를
 * 직접 부르지 않도록 함수로 감싼다(app/login/page.tsx 의 todayKey 와 같은 까닭, lint react-hooks/purity).
 */
export function realNow(): Date {
  return new Date();
}

/**
 * 같은 요청을 다시 보낸 것으로 보는 시간(계약 9-6 ①-7) — 신호가 끊겨 답을 못 받고 다시 누르면 같은 메뉴 · 숙제 · 말이 두 줄 생겼다.
 * 이 안에 같은 사람이 같은 내용을 같은 자리에 보냈으면 새로 만들지 않는다(일지의 2분 막기와 같은 값).
 */
export const ORG_DUPLICATE_MS = 2 * 60 * 1000;

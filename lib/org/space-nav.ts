/**
 * 공간 · 역할별 내비게이션(2026-10-26 S단계, docs/designs/sinker-team-lesson-contract.md 8절) — 순수 규칙만. 앱 껍데기(native/src/app/index.tsx) ·
 * 조직 공간 화면(native/src/org/space.tsx) · 서버 알림 주소(app/actions/app-*.ts)가 같이 쓴다.
 *
 * - 공간 = 'me'(내 싱커) · '<orgId>:c'(코치 쪽 — 마스터 계정만) · '<orgId>:p'(선수/회원). 바꾸기는 서버에 아무것도 안 쓴다.
 * - 탭은 고른 공간의 종류(팀 · 레슨장) + 서버가 인정한 역할로 정한다. 만든 기능만 탭으로(성장은 4단계).
 * - 고른 공간은 권한이 아니다 — 동작마다 서버가 coachOrg · myMember 로 다시 본다.
 */

export type OrgKindName = 'TEAM' | 'LESSON';
export type SpaceSide = 'c' | 'p';
/** 'me' 내 싱커 · 'none' 마스터인데 조직 없음 · '<orgId>:c|p' 조직 공간 */
export type SpaceKey = string;
export const ME = 'me';
export const NO_ORG = 'none';

/** 조직 권한이 없을 때 서버가 돌려주는 주소 — 앱 껍데기가 가로채 공간을 다시 확인한다(옛 앱 · PC 는 웹 페이지가 받는다) */
export const ORG_LOST = '/org/lost';
/** 조직 알림 · 딥링크 주소 */
export const ORG_OPEN = '/org/open';

export const spaceKeyOf = (s: { orgId: string; role: string }): SpaceKey => `${s.orgId}:${s.role === 'PLAYER' ? 'p' : 'c'}`;
export function parseSpaceKey(key: string): { orgId: string; side: SpaceSide } | null {
  const m = /^([\w-]{1,64}):([cp])$/.exec(key);
  return m ? { orgId: m[1], side: m[2] as SpaceSide } : null;
}

export type SpaceTab = { key: string; label: string; icon: string };

const MORE: SpaceTab = { key: 'more', label: '더보기', icon: 'menu' };

/** S단계 실제 탭(계약 8-3 '단계별 실제 탭') — 성장 탭은 4단계에 붙는다 */
export function spaceTabs(kind: OrgKindName, side: SpaceSide): SpaceTab[] {
  if (kind === 'TEAM')
    return side === 'c'
      ? [
          { key: 'today', label: '오늘', icon: 'home' },
          { key: 'schedule', label: '일정', icon: 'schedule' },
          { key: 'training', label: '훈련', icon: 'dumbbell' },
          { key: 'roster', label: '선수단', icon: 'people' },
          MORE,
        ]
      : [
          { key: 'today', label: '오늘', icon: 'home' },
          { key: 'schedule', label: '일정', icon: 'schedule' },
          { key: 'mytraining', label: '내 훈련', icon: 'dumbbell' },
          MORE,
        ];
  return side === 'c'
    ? [
        { key: 'today', label: '오늘', icon: 'home' },
        { key: 'roster', label: '회원', icon: 'people' },
        { key: 'notes', label: '레슨일지', icon: 'book' },
        { key: 'inbox', label: '받은 것', icon: 'chat' },
        MORE,
      ]
    : [
        { key: 'today', label: '홈', icon: 'home' },
        { key: 'notes', label: '레슨일지', icon: 'book' },
        { key: 'homework', label: '숙제', icon: 'homework' },
        MORE,
      ];
}

/** 고르개 한 줄 — '○○ 야구팀 · 선수' */
export function spaceLabel(s: { name: string; kind: OrgKindName; role: string }): string {
  const role = s.role === 'PLAYER' ? (s.kind === 'TEAM' ? '선수' : '회원') : s.role === 'MASTER' ? '대표' : '코치';
  return `${s.name} · ${role}`;
}

/**
 * 저장된 공간을 서버 목록으로 확인(켤 때 · 다시 로그인 · 앞으로 올 때 · 권한 없음 뒤).
 * 선수 계정: 목록에 없으면 내 싱커(lost = 잃은 공간이 조직이었음). 마스터 계정: 내 싱커로 대신 보내지 않고 첫 관리 조직, 없으면 NO_ORG.
 */
export function resolveSpace(
  saved: string | null,
  hasSinker: boolean,
  spaces: readonly { orgId: string; role: string; left?: boolean }[]
): { key: SpaceKey; lost: boolean } {
  const keys = spaces.filter((s) => !s.left).map(spaceKeyOf);
  if (saved && keys.includes(saved)) return { key: saved, lost: false };
  const wasOrg = !!saved && parseSpaceKey(saved) != null;
  if (hasSinker) return { key: ME, lost: wasOrg };
  if (saved === ME || saved === NO_ORG) return { key: keys[0] ?? NO_ORG, lost: false };
  return { key: keys[0] ?? NO_ORG, lost: wasOrg };
}

/* ── 알림 · 딥링크 ── */

/** 알림이 가리키는 곳 — 탭은 공간 종류 · 역할에 따라 고른다(targetTab) */
export const OPEN_TARGETS = ['today', 'schedule', 'notes', 'homework', 'inbox', 'share'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

export const orgOpenHref = (orgId: string, side: SpaceSide, target: OpenTarget) => `${ORG_OPEN}?org=${orgId}&as=${side}&to=${target}`;

export function parseOrgOpen(href: string): { orgId: string; side: SpaceSide; target: OpenTarget } | null {
  const [path, q] = href.split('?');
  if (path !== ORG_OPEN) return null;
  const sp = new URLSearchParams(q ?? '');
  const orgId = sp.get('org') ?? '';
  const side = sp.get('as');
  const target = sp.get('to') ?? 'today';
  if (!/^[\w-]{1,64}$/.test(orgId) || (side !== 'c' && side !== 'p')) return null;
  return { orgId, side, target: (OPEN_TARGETS as readonly string[]).includes(target) ? (target as OpenTarget) : 'today' };
}

/** 알림 대상 → 그 공간의 탭 키('share' 는 탭이 아니라 보여 줄 기록 화면 — null) */
export function targetTab(kind: OrgKindName, side: SpaceSide, target: OpenTarget): string | null {
  if (target === 'share') return null;
  const tabs = spaceTabs(kind, side).map((t) => t.key);
  const want: Record<OpenTarget, string[]> = {
    today: ['today'],
    schedule: ['schedule', 'today'],
    notes: ['notes', 'today'],
    homework: ['homework', 'mytraining', 'today'],
    inbox: ['inbox', 'today'],
    share: [],
  };
  return want[target].find((k) => tabs.includes(k)) ?? 'today';
}

/* ── 조직 일에서 연 개인 운동의 돌아올 곳 ── */

/** `from=org:<spaceKey>:<tab>` — 운동을 마치면 그 공간의 그 탭으로 */
export const orgReturnParam = (key: SpaceKey, tab: string) => `org:${key}:${tab}`;
export function parseOrgReturn(v: string | null | undefined): { key: SpaceKey; tab: string } | null {
  const m = /^org:([\w-]{1,64}:[cp]):([a-z]{1,16})$/.exec(v ?? '');
  return m ? { key: m[1], tab: m[2] } : null;
}

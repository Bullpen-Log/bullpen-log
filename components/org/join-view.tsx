import { KeyRound, Users } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
} from '@/components/ui';
import { joinOrg } from '@/app/actions/org-join';
import { ORG_CAPABILITY_LABEL, roleCapabilities } from '@/lib/org/capabilities';
import { invitePreview, type JoinPreview } from '@/lib/org/join-preview';
import { JOIN_ERROR_TEXT, type JoinError } from '@/lib/org/join';
import {
  CONSENT_SCOPES,
  ORG_KIND_LABEL,
  consentDefaults,
  normalizeInviteCode,
  realNow,
} from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

export type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * 팀 · 레슨장 참여 본문(2026-11-01 팀 · 레슨 통합 2단계 — 가입은 덕아웃이 주인) — 덕아웃 `/teams/join`(app/(dugout)/teams/join)과 싱커 옛 주소 `/join`(app/(app)/join,
 * 옛 링크 · 앱 호환)이 같은 본문을 그린다. 코치가 준 초대 코드(?code=XXXXXX)로 조직을 보고, 어떤 자격인지에 따라(lib/org/join-preview.ts, 2차 검토 G01):
 *   - 선수(회원) 코드 → 무엇을 보여 줄지 고르고 참여(공유 범위 기본값 lib/org/rules.ts consentDefaults)
 *   - 코치(STAFF) 코드 → 조직 · 코치 업무를 보고 수락(기록 공유 동의가 아니다 — 체크박스 없음). 수락하면 덕아웃 '관리'(/manage)로, 싱커 앱은 공간 목록을 새로 받는다
 *   - 이미 있음 · 다른 자격으로 있음(role_conflict) · 남이 쓴 코드 · 기한 지남 · 마스터 계정의 선수 코드는 각각 그 까닭을 보인다
 * base 는 폼 · 되돌아올 주소(JOIN_BASES 가운데 하나). 최종 판정은 서버 동작(joinOrg → lib/org/join.ts 트랜잭션)이 다시 한다.
 */
export const JOIN_BASES = ['/join', '/teams/join'] as const;
export type JoinBase = (typeof JOIN_BASES)[number];
export const isJoinBase = (v: unknown): v is JoinBase => JOIN_BASES.includes(v as JoinBase);

const ROLE_WORD: Record<'PLAYER' | 'STAFF' | 'MASTER', string> = { PLAYER: '선수 · 회원', STAFF: '코치', MASTER: '대표' };
/** 코치 수락 화면에 적는 업무 — 역할 기본 묶음(lib/org/capabilities.ts) */
export const STAFF_DUTIES = roleCapabilities('STAFF').map((c) => ORG_CAPABILITY_LABEL[c]);

export async function JoinView({ user, sp, base }: { user: { id: string; accountType: 'PLAYER' | 'MASTER' | 'MEMBER' }; sp: SP; base: JoinBase }) {
  const code = normalizeInviteCode(one(sp.code));
  const error = one(sp.error);
  const joinedId = one(sp.joined);
  const joinedAs = one(sp.as);

  const [memberships, invite] = await Promise.all([
    prisma.orgMember.findMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'LEFT'] } },
      orderBy: { joinedAt: 'desc' },
      select: {
        id: true,
        role: true,
        status: true,
        org: {
          select: {
            id: true,
            name: true,
            kind: true,
            /* 조직 공지(5단계) — 고정 먼저, 셋까지 */
            notices: {
              orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
              take: 3,
              select: {
                id: true,
                title: true,
                body: true,
                pinned: true,
                createdAt: true,
              },
            },
          },
        },
        consent: {
          select: {
            pitch: true,
            training: true,
            checkin: true,
            video: true,
            nutrition: true,
            weight: true,
          },
        },
      },
    }),
    code
      ? prisma.orgInvite.findUnique({
          where: { code },
          select: {
            role: true,
            memberId: true,
            expiresAt: true,
            usedAt: true,
            usedById: true,
            org: { select: { id: true, name: true, kind: true, region: true } },
          },
        })
      : null,
  ]);
  const active = memberships.filter((m) => m.status === 'ACTIVE');
  const mine = invite ? (memberships.find((m) => m.org.id === invite.org.id) ?? null) : null;
  const preview: JoinPreview | null = code ? invitePreview({ invite, mine, user, now: realNow() }) : null;
  const joined = joinedId ? active.find((m) => m.org.id === joinedId) : null;
  const canAccept = preview?.state === 'player' || preview?.state === 'staff';

  const codeError = error
    ? (JOIN_ERROR_TEXT[error as JoinError] ?? JOIN_ERROR_TEXT.expired)
    : preview && !canAccept && preview.state !== 'already'
      ? previewText(preview)
      : null;

  return (
    <div className="stack-page">
      {joined && (
        <Card className="border-sky/40 bg-sky/5">
          {joined.role === 'PLAYER' ? (
            <>
              <p className="text-sm font-bold text-ink">{joined.org.name}에 참여했어요.</p>
              <p className="mt-1 text-xs text-muted">
                공유 범위를 바꾸는 것은 다음 판에서 열려요. 지금은 코치가 아래 범위만 봐요.
              </p>
              <p className="mt-2 text-xs text-ink">{consentSummary(joined.consent)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-ink">
                {joined.org.name}에 {joinedAs === 'already' ? '이미 코치로 있어요.' : '코치로 들어갔어요.'}
              </p>
              <p className="mt-1 text-xs text-muted">
                명단 · 일정 · 훈련 기록은 덕아웃 관리 화면에서 봐요. 싱커 앱을 다시 열면 이 조직의 코치 공간이 공간 고르개에 생겨요. 내 개인 운동(내 싱커)은 그대로예요.
              </p>
              <ButtonLink href="/manage" size="sm" className="mt-3">
                관리로 가기
              </ButtonLink>
            </>
          )}
        </Card>
      )}

      {/* 선수(회원) 코드 — 조직 · 공유 범위 · 참여 */}
      {invite && preview?.state === 'player' && (
        <Card>
          <OrgLine org={invite.org} />
          {preview.rejoin && (
            <p className="mt-2 text-xs text-muted">
              전에 있던 조직이에요. 선수로 다시 들어가요{mine?.role !== 'PLAYER' ? ' — 예전 코치 권한은 돌아오지 않아요' : ''}.
            </p>
          )}
          <SafeForm action={joinOrg} className="mt-4 space-y-4">
            <input type="hidden" name="code" value={code ?? ''} />
            <input type="hidden" name="back" value={base} />
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted">
                코치에게 보여 줄 것 — 나중에 바꿀 수 있어요
              </legend>
              {CONSENT_SCOPES.map((s) => (
                <label
                  key={s.key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    name={`scope-${s.key}`}
                    defaultChecked={consentDefaults()[s.key]}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-sky"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {s.label}
                    </span>
                    <span className="block text-xs text-muted">{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" className="w-full" size="lg">
              참여하기
            </Button>
          </SafeForm>
        </Card>
      )}

      {/* 코치(STAFF) 코드 — 조직 · 맡을 업무 · 수락. 기록 공유 동의가 아니다 */}
      {invite && preview?.state === 'staff' && (
        <Card>
          <OrgLine org={invite.org} />
          <p className="mt-3 text-sm font-semibold text-ink">
            {invite.org.name}의 코치로 들어가요{preview.rejoin ? '(다시 임명)' : ''}.
          </p>
          <p className="mt-1 text-xs text-muted">감독(대표)이 만든 코치 코드예요. 수락하면 이 조직에서 아래 일을 맡아요.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="코치 업무">
            {STAFF_DUTIES.map((d) => (
              <li key={d}>
                <Badge className="text-sky-strong">{d}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            내 개인 운동 · 기록(내 싱커)은 그대로고, 이 수락은 내 기록을 공유하는 동의가 아니에요. 선수로도 뛰려면 선수 계정을 따로 써요.
          </p>
          <SafeForm action={joinOrg} className="mt-4">
            <input type="hidden" name="code" value={code ?? ''} />
            <input type="hidden" name="back" value={base} />
            <Button type="submit" className="w-full" size="lg">
              코치로 들어가기
            </Button>
          </SafeForm>
        </Card>
      )}

      {invite && preview?.state === 'already' && !joined && (
        <Card>
          <p className="text-sm font-semibold text-ink">
            {invite.org.name}에 이미 {ROLE_WORD[preview.role]}(으)로 있어요.
          </p>
          {preview.role !== 'PLAYER' && (
            <ButtonLink href="/manage" size="sm" variant="secondary" className="mt-3">
              관리로 가기
            </ButtonLink>
          )}
        </Card>
      )}

      {invite && preview?.state === 'role_conflict' && (
        <Card>
          <OrgLine org={invite.org} />
          <p className="mt-3 text-sm font-semibold text-ink">
            이 조직에 이미 {ROLE_WORD[preview.role]}(으)로 있어요.
          </p>
          <p className="mt-1 text-xs text-muted">
            {invite.role === 'STAFF'
              ? '선수 줄 하나로는 코치 일을 더할 수 없어요. 감독에게 명단에서 뺀 뒤 새 코치 코드를 받거나, 코치용 계정으로 들어가 주세요.'
              : '활동 중인 코치 · 대표는 이 코드로 선수가 될 수 없어요. 선수로도 뛰려면 선수 계정을 따로 써요.'}
          </p>
        </Card>
      )}

      {/* 코드 적기 — 받을 수 있는 코드를 보고 있을 때는 숨긴다 */}
      {!canAccept && (
        <Card>
          <form method="get" action={base} className="space-y-3">
            <Field
              label="초대 코드"
              hint="코치가 준 여섯 글자 — 소문자 · 띄어쓰기는 괜찮아요"
            >
              <Input
                name="code"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={8}
                defaultValue={one(sp.code)}
                placeholder="ABC234"
                className="font-mono text-lg tracking-[0.2em] uppercase"
              />
            </Field>
            {codeError && <FormError>{codeError}</FormError>}
            <Button type="submit" variant="secondary" className="w-full">
              코드 확인
            </Button>
          </form>
        </Card>
      )}

      {/* 참여한 곳 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">참여한 팀 · 레슨장</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="아직 참여한 곳이 없어요"
            description="코치나 감독에게 초대 코드를 받아 위에 적어 주세요."
          />
        ) : (
          <Card className="divide-y divide-line p-0">
            {active.map((m) => (
              <div key={m.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="text-sky-strong">
                    {ORG_KIND_LABEL[m.org.kind]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {m.org.name}
                      {m.role !== 'PLAYER' && <span className="ml-2 text-xs font-normal text-muted">{ROLE_WORD[m.role]}</span>}
                    </p>
                    <p className="text-xs text-muted">{m.role === 'PLAYER' ? consentSummary(m.consent) : '관리는 덕아웃 관리 화면에서'}</p>
                  </div>
                  <KeyRound className="h-4 w-4 text-muted/50" />
                </div>
                {m.org.notices.length > 0 && (
                  <ul className="space-y-1.5">
                    {m.org.notices.map((n) => (
                      <li key={n.id} className="rounded-xl bg-surface-2/70 px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                          {n.pinned && <Badge className="text-sky-strong">고정</Badge>}
                          <span className="min-w-0 flex-1 truncate">{n.title}</span>
                          <span className="font-normal text-muted">
                            {new Intl.DateTimeFormat('ko-KR', {
                              month: 'numeric',
                              day: 'numeric',
                            }).format(n.createdAt)}
                          </span>
                        </p>
                        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted">
                          {n.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function OrgLine({ org }: { org: { name: string; kind: 'LESSON' | 'TEAM'; region: string | null } }) {
  return (
    <div className="flex items-center gap-2">
      <Badge className="text-sky-strong">{ORG_KIND_LABEL[org.kind]}</Badge>
      <p className="text-base font-bold text-ink">{org.name}</p>
      {org.region && <span className="text-xs text-muted">{org.region}</span>}
    </div>
  );
}

/** 받을 수 없는 코드의 까닭 — 서버 동작의 답 글과 같은 표 */
export function previewText(p: JoinPreview): string | null {
  switch (p.state) {
    case 'expired':
      return JOIN_ERROR_TEXT.expired;
    case 'used':
      return JOIN_ERROR_TEXT.used;
    case 'master':
      return JOIN_ERROR_TEXT.master;
    case 'role_conflict':
      return JOIN_ERROR_TEXT.role_conflict;
    default:
      return null;
  }
}

function consentSummary(
  c: Record<(typeof CONSENT_SCOPES)[number]['key'], boolean> | null
): string {
  if (!c) return '공유 범위 미정';
  const on = CONSENT_SCOPES.filter((s) => c[s.key]).map((s) => s.label.split(' · ')[0]);
  return on.length ? `공유: ${on.join(' · ')}` : '공유하는 기록 없음';
}

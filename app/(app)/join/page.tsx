import { KeyRound, Users } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
  PageHeading,
} from '@/components/ui';
import { joinOrg } from '@/app/actions/org-join';
import { requireUser } from '@/lib/dal';
import {
  CONSENT_SCOPES,
  ORG_KIND_LABEL,
  consentDefaults,
  inviteUsable,
  normalizeInviteCode,
  realNow,
} from '@/lib/org/rules';
import { prisma } from '@/lib/prisma';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * 팀 · 레슨장 참여(선수 화면) — 코치가 준 초대 코드(/join?code=XXXXXX)로 들어와 조직을 보고, 무엇을 보여 줄지 고른 뒤 참여한다.
 * 공유 범위의 기본값은 lib/org/rules.ts consentDefaults(투구 · 트레이닝 · 체크인 · 영상 켬, 영양 · 체중 끔). 바꾸는 것은 다음 단계.
 * 마스터 계정은 여기 못 온다 — (app) 틀이 /master 로 보낸다.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const code = normalizeInviteCode(one(sp.code));
  const error = one(sp.error);
  const joinedId = one(sp.joined);

  const [memberships, invite] = await Promise.all([
    prisma.orgMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      select: {
        id: true,
        role: true,
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
            expiresAt: true,
            usedAt: true,
            org: { select: { id: true, name: true, kind: true, region: true } },
          },
        })
      : null,
  ]);
  const usable =
    !!invite && inviteUsable(invite, realNow()) && invite.role === 'PLAYER';
  const already = !!invite && memberships.some((m) => m.org.id === invite.org.id);
  const joined = joinedId ? memberships.find((m) => m.org.id === joinedId) : null;

  const codeError =
    error === 'code'
      ? '코드는 여섯 글자예요. 다시 확인해 주세요.'
      : error === 'staff'
        ? '스태프용 초대 코드예요. 선수 계정으로는 참여할 수 없어요.'
        : error === 'expired' || (code && !usable && !already)
          ? '코드가 맞지 않거나 기한이 지났어요. 코치에게 새 코드를 받아 주세요.'
          : null;

  return (
    <div className="stack-page">
      <PageHeading
        title="팀 · 레슨장 참여"
        description="코치가 준 초대 코드로 참여해요. 내가 고른 범위의 기록만 코치에게 보여요."
      />

      {joined && (
        <Card className="border-sky/40 bg-sky/5">
          <p className="text-sm font-bold text-ink">{joined.org.name}에 참여했어요.</p>
          <p className="mt-1 text-xs text-muted">
            공유 범위를 바꾸는 것은 다음 판에서 열려요. 지금은 코치가 아래 범위만 봐요.
          </p>
          <p className="mt-2 text-xs text-ink">{consentSummary(joined.consent)}</p>
        </Card>
      )}

      {/* 코드가 맞으면 — 조직 · 공유 범위 · 참여 */}
      {invite && usable && !already && (
        <Card>
          <div className="flex items-center gap-2">
            <Badge className="text-sky-strong">{ORG_KIND_LABEL[invite.org.kind]}</Badge>
            <p className="text-base font-bold text-ink">{invite.org.name}</p>
            {invite.org.region && (
              <span className="text-xs text-muted">{invite.org.region}</span>
            )}
          </div>
          <SafeForm action={joinOrg} className="mt-4 space-y-4">
            <input type="hidden" name="code" value={code ?? ''} />
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

      {invite && already && !joined && (
        <Card>
          <p className="text-sm font-semibold text-ink">
            {invite.org.name}에는 이미 참여하고 있어요.
          </p>
        </Card>
      )}

      {/* 코드 적기 — 맞는 코드를 보고 있을 때는 숨긴다 */}
      {!(invite && usable && !already) && (
        <Card>
          <form method="get" action="/join" className="space-y-3">
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
        {memberships.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="아직 참여한 곳이 없어요"
            description="코치나 감독에게 초대 코드를 받아 위에 적어 주세요."
          />
        ) : (
          <Card className="divide-y divide-line p-0">
            {memberships.map((m) => (
              <div key={m.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="text-sky-strong">
                    {ORG_KIND_LABEL[m.org.kind]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {m.org.name}
                    </p>
                    <p className="text-xs text-muted">{consentSummary(m.consent)}</p>
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

function consentSummary(
  c: Record<(typeof CONSENT_SCOPES)[number]['key'], boolean> | null
): string {
  if (!c) return '공유 범위 미정';
  const on = CONSENT_SCOPES.filter((s) => c[s.key]).map((s) => s.label.split(' · ')[0]);
  return on.length ? `공유: ${on.join(' · ')}` : '공유하는 기록 없음';
}

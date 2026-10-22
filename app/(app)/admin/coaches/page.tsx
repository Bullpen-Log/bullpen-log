import type { Metadata } from 'next';
import Link from 'next/link';
import { RoundLesson } from '@/components/round-icon';
import { Badge, Button, Card, EmptyState, PageHeading } from '@/components/ui';
import { BackLink } from '@/components/back-link';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { ConfirmButton } from '@/components/master/confirm-button';
import { SafeForm } from '@/components/safe-form';
import { adminSetCoachPublic } from '@/app/actions/lessons';
import { createDummyCoaches, deleteAllDummyCoaches, deleteDummyCoach } from '@/app/actions/admin-coaches';
import { requireAdmin } from '@/lib/dal';
import { loadAllCoaches } from '@/lib/market/lesson-load';
import { specialtyLabel } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';

export const metadata: Metadata = { title: '코치 관리' };

/**
 * 관리자 코치 관리(2026-10-22 금윤호: "관리자가 등록된 코치를 관리하고 편집 · 더미 코치도 넣어볼 수 있게") — 등록된 레슨장(코치) 모두,
 * 공개 스위치 · 편집(/admin/coaches/[id]) · 미리보기(/lessons/[id]) · 더미 넣기 · 지우기. 대표관리자만.
 */
export default async function AdminCoachesPage() {
  await requireAdmin();
  const coaches = await loadAllCoaches();
  const dummies = coaches.filter((c) => c.dummy).length;
  const pub = coaches.filter((c) => c.publicProfile).length;
  return (
    <div className="stack-page">
      <BackLink href="/admin">관리자</BackLink>
      <PageHeading
        title="코치 관리"
        description={`레슨장 ${coaches.length}개 · 공개 ${pub} · 더미 ${dummies}`}
      />

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">더미 코치</h2>
          <p className="mt-1 text-xs text-muted">
            화면을 채워 보려고 넣는 가짜 코치예요. 관리자 계정이 주인이고 끝난 예약 · 후기가 같이 생겨 별점 · 확정 속도가 보여요. 덕아웃 레슨 목록에 바로 떠요(관리자에게만 ‘더미’ 표시).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SafeForm action={createDummyCoaches} doneToast="더미 코치를 넣었어요." className="flex items-center gap-2">
            <select name="count" defaultValue="3" className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink">
              {[1, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}명
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              더미 코치 넣기
            </Button>
          </SafeForm>
          {dummies > 0 && (
            <ConfirmButton action={deleteAllDummyCoaches} fields={{}} message={`더미 코치 ${dummies}명을 모두 지울까요? 딸린 예약 · 후기도 같이 지워져요.`} doneToast="더미 코치를 모두 지웠어요." variant="danger">
              더미 모두 지우기
            </ConfirmButton>
          )}
        </div>
      </Card>

      {coaches.length === 0 ? (
        <EmptyState icon={<RoundLesson />} title="등록된 레슨장이 없어요" description="레슨장으로 가입하거나 위에서 더미 코치를 넣어 보세요." />
      ) : (
        <Card className="divide-y divide-line p-0">
          {coaches.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <CoachAvatar name={c.coach} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink">{c.coach} 코치</span>
                  <span className="truncate text-xs text-muted">{c.name}</span>
                  <Stars rating={c.rating} reviews={c.reviews} />
                  {c.dummy && <Badge className="text-warn">더미</Badge>}
                  {!c.publicProfile && <Badge>비공개</Badge>}
                  {c.requests > 0 && <Badge className="text-sky-strong">요청 {c.requests}</Badge>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[c.region, c.specialties.map(specialtyLabel).join(' · '), c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : null, `주인 ${c.ownerNickname}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <SafeForm action={adminSetCoachPublic} doneToast={c.publicProfile ? '비공개로 바꿨어요.' : '공개했어요.'}>
                  <input type="hidden" name="orgId" value={c.id} />
                  {!c.publicProfile && <input type="hidden" name="publicProfile" value="on" />}
                  <Button type="submit" size="sm" variant="secondary">
                    {c.publicProfile ? '비공개로' : '공개하기'}
                  </Button>
                </SafeForm>
                <Link href={`/admin/coaches/${c.id}`} className="inline-flex min-h-10 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink hover:text-sky desk:rounded-xl">
                  편집
                </Link>
                <Link href={`/lessons/${c.id}`} className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-sky">
                  보기
                </Link>
                {c.dummy && (
                  <ConfirmButton action={deleteDummyCoach} fields={{ orgId: c.id }} message={`${c.coach} 코치(더미)를 지울까요?`} doneToast="지웠어요." variant="danger">
                    지우기
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

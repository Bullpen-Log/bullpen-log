import Link from 'next/link';
import { Card, ButtonLink } from '@/components/ui';
import { Lock } from '@/components/icon';
import { listLabSamples } from '@/lib/pitch-lab';
import { BETA_LOCK_BODY } from '@/lib/release-access';

/**
 * 출시 전 베타 홈(웹, 2026-10-29) — 일반 · 준관리자에게 /today 대신. 지금 열린 것은 투구 3D 분석 하나라 그것만 크게, 잠긴 기능은 작게 한 묶음.
 * 예전 홈의 통계 · 트레이닝 계획 · 영양 · 커뮤니티는 읽지 않는다(그 판은 틀이 그리지 않는다, app/(app)/layout.tsx).
 * 앱(아이폰)은 같은 내용을 앱 화면(native/src/home/beta-home.tsx)으로 그린다 — 앱 안 웹뷰의 이 화면은 그 밑에 가려진다.
 */
const LOCKED_SUMMARY = ['투구 기록', '트레이닝', '기록', '덕아웃'];

const STATUS_TEXT = { queued: '분석 대기 중', running: '분석 중', done: '결과 보기', failed: '분석 실패' } as const;

export async function BetaHome({ user }: { user: { id: string; role: string } }) {
  const all = await listLabSamples({ id: user.id, role: user.role as 'USER' | 'MANAGER' | 'ADMIN' });
  /* 내 것만(관리자 샘플 · 마커 제외) — 앱 '내 리포트'(loadAppLabList 'mine')와 같은 거름 */
  const mine = all
    .filter((s) => s.ownerId === user.id && s.meta?.kind !== 'marker')
    .sort((a, b) => (b.v2.job?.requestedAt ?? b.id).localeCompare(a.v2.job?.requestedAt ?? a.id));
  const running = mine.find((s) => s.v2.job?.status === 'queued' || s.v2.job?.status === 'running');
  const recent = mine.slice(0, 3);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-(--stack-block,1.25rem)">
      <div className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-sky/10 px-3 py-1 text-footnote font-semibold text-sky">베타 체험</span>
        <h1 className="page-title text-ink">홈</h1>
        <p className="text-sm text-muted">지금은 투구 3D 분석을 체험할 수 있어요.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">투구 3D 분석</h2>
        <p className="text-sm text-muted">옆 · 뒤에서 동시에 찍은 영상 두 개로 투구 동작을 3D 로 살펴봐요.</p>
        {running ? (
          <div className="rounded-xl bg-ink/5 p-3 text-sm text-ink" role="status">
            <p className="font-semibold">{STATUS_TEXT[running.v2.job!.status]}</p>
            <p className="text-muted">분석이 끝날 때까지 새 분석을 걸지 않아도 돼요.</p>
            <Link href={`/videos/lab/${running.id}`} className="mt-2 inline-flex min-h-10 items-center font-semibold text-sky">
              진행 상황 보기 ›
            </Link>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/videos/lab" variant={running ? 'secondary' : 'primary'}>
            새 분석 시작
          </ButtonLink>
          <ButtonLink href="/videos/lab/guide" variant="secondary">
            촬영 방법
          </ButtonLink>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">내 분석</h2>
          <Link href="/videos/lab" className="inline-flex min-h-10 items-center text-sm font-semibold text-sky">
            전체 보기 ›
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">아직 분석한 투구가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((s) => {
              const st = s.v2.job?.status;
              return (
                <li key={s.id}>
                  <Link href={`/videos/lab/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate text-ink">{s.meta?.memo || (s.v2.job?.requestedAt ?? '').slice(0, 10) || '투구'}</span>
                    <span className="shrink-0 text-muted">{st ? STATUS_TEXT[st] : '분석 전'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <section aria-labelledby="beta-locked" className="flex flex-col gap-2 px-1">
        <h2 id="beta-locked" className="text-footnote font-semibold text-muted">
          준비 중인 기능
        </h2>
        <ul className="flex flex-wrap gap-2">
          {LOCKED_SUMMARY.map((label) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-footnote text-muted">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              {label}
              <span className="sr-only">, 준비 중</span>
              <span aria-hidden> · 준비 중</span>
            </li>
          ))}
        </ul>
        <p className="text-footnote text-muted">{BETA_LOCK_BODY}</p>
      </section>
    </div>
  );
}

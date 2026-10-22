import { headers } from 'next/headers';
import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { can } from '@/lib/permissions';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, ButtonLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { ChevronRight } from '@/components/icon';
import { RoundBatter } from '@/components/round-icon';
import { loadAppSwingList } from '@/app/actions/swing-lab';
import { SWING_REPORT_SOON, swingFrontBase } from '@/lib/swing-lab-meta';
import { SwingRows } from './swing-rows';

/**
 * 3D 스윙 분석(타자, 베타) — 타격 탭의 '3D 스윙 분석' 칸으로 들어온다. 투구 3D 동작 분석(/videos/lab)과 같은 모양:
 * 위는 '스윙 진단 리포트'(모델을 만들기 전이라 [리포트 받기]는 준비 중 · GPU 안 부름), 아래는 내 스윙.
 * 모델링용 샘플은 3D 개발 관리자(/admin/dev3d)가 모은다(2026-10-21 금윤호). 새 아이폰 앱(판 11~)은 앱 화면(native/src/app/swing/index.tsx)으로.
 */
export default async function SwingLabPage() {
  const user = await requireUser();
  if (expoLevel((await headers()).get('user-agent')) >= 11) return <OpenNative path="/swing" cover={false} />;
  const list = await loadAppSwingList('mine');
  if (!list.ok) return null;
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/hitting">타격</BackLink>
        <PageHeading kicker="베타" title="3D 스윙 분석" description="스윙 한 번을 정면과 포수 뒤에서 함께 찍으면 3D 로 보고 고칠 점을 드려요." />
      </div>
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-tint text-sky-strong">
            <RoundBatter aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">
              스윙 진단 리포트 <span className="ml-1 rounded-md bg-sky-tint px-1.5 py-0.5 text-xs text-sky-strong">베타</span>
            </p>
            <p className="text-xs break-keep text-muted">스윙 한 번을 찍어 올리면 고칠 점과 드릴 처방을 드려요.</p>
          </div>
        </div>
        <button type="button" disabled className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-line text-base font-bold text-muted">
          리포트 받기
        </button>
        <p className="text-center text-sm text-muted">{SWING_REPORT_SOON}</p>
        <Link href={`/hitting/lab/guide?hand=${list.hand}`} className="block text-center text-sm font-semibold text-sky">
          어떻게 찍나요 ›
        </Link>
      </Card>
      {can(user.role, 'dev3d') && (
        <Link href="/admin/dev3d" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-(--block-pad) text-sm font-semibold text-ink">
          <span className="flex-1">3D 개발 관리자 · 샘플 올리기</span>
          <ChevronRight aria-hidden className="h-4 w-4 text-muted" />
        </Link>
      )}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-muted">내 스윙</h2>
        {list.samples.length === 0 ? (
          <EmptyState
            icon={<RoundBatter />}
            title="아직 올린 스윙이 없어요"
            description={`같은 스윙을 정면(${swingFrontBase(list.hand)} 쪽)과 포수 뒤에서 동시에 찍어 두세요. 리포트가 열리면 바로 올릴 수 있어요.`}
            action={
              <ButtonLink href={`/hitting/lab/guide?hand=${list.hand}`} variant="secondary">
                촬영 안내 보기
              </ButtonLink>
            }
          />
        ) : (
          <SwingRows samples={list.samples} />
        )}
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { PrismaClient } from '@prisma/client';
import { ChevronRight, Film } from '@/components/icon';
import { BackLink, EmptyState, PageHeading } from '@/components/ui';
import { requirePermission } from '@/lib/dal';
import { checkIntakeReadiness, isMissingTableError, loadIntakeList, parseIntakeFilters, type IntakeListFilters, type IntakeListResult, type IntakeListRow } from '@/lib/intake/admin';
import {
  PUBLICATION_STATUS_TEXT,
  SUBMISSION_STATUS_TEXT,
  UNTOUCHED_TEXT,
  VIEW_PROGRESS_TEXT,
  devLinkText,
  readinessLines,
  retentionCellText,
  retentionLineText,
  seoulDateText,
  textOf,
  type ViewProgress,
} from '@/lib/intake/admin-labels';
import { prisma } from '@/lib/prisma';
import { CreateInvitation } from './create-invitation';
import { IntakeFilters } from './intake-filters';
import { AnalysisChip, StatusChip, publicationTone, submissionTone, type ChipTone } from './status-chip';

export const metadata: Metadata = { title: '외부 영상 접수' };

/**
 * 외부 영상 접수함(2026-11-06) — 초대 링크로 받은 옆 · 뒤 투구 원본. 대표관리자가 함께 보는 한 곳이고, 원본을 관리자 폴더로 복사하지 않는다.
 * 3D 개발 관리자의 타자 샘플 · 실험실의 투구 샘플과는 저장소도 표도 따로다. 표 · 규칙은 lib/intake/admin.ts, 쓰기는 app/actions/intake-admin.ts.
 */
export default async function IntakeAdminPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await requirePermission('intake');
  const filters = parseIntakeFilters(await searchParams);
  /* 준비 확인 — 표 · 칸이 없거나 운영에 정식 주소가 없으면 초대 만들기를 끈다. 서버 동작도 같은 판단으로 다시 막는다 */
  const readiness = await checkIntakeReadiness(prisma as unknown as PrismaClient);
  const blocked = readinessLines(readiness);
  const devNote = readiness.ready ? devLinkText(readiness) : null;
  const list = await loadList(user, filters);

  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/admin">관리자</BackLink>
        <PageHeading
          kicker="대표관리자"
          title="외부 영상 접수"
          description="초대 링크로 받은 옆 · 뒤 투구 원본이에요. 실험실 투구 샘플이나 타자 샘플과 따로 쌓이고, 대표관리자가 함께 봐요."
          action={<CreateInvitation ready={readiness.ready} blockedText={blocked[0] ?? null} devNote={devNote} />}
        />
      </div>
      {blocked.length > 0 && (
        <div id="intake-readiness" role="status" className="space-y-1 rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          <p className="font-semibold">아직 초대를 만들 수 없어요</p>
          {blocked.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {devNote && <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">{devNote}</p>}
      {list === 'not_ready' ? (
        <EmptyState icon={<Film />} title="접수 표가 아직 준비되지 않았어요" description="데이터베이스에 외부 접수 마이그레이션을 적용하면 이 화면을 쓸 수 있어요." />
      ) : (
        <>
          <IntakeFilters key={filters.q ?? ''} filters={filters} admins={list.admins} me={user.id} />
          <p className="text-sm text-muted" aria-live="polite">
            {list.total}건 · 안 읽음 {list.unreadCount}건
          </p>
          {list.rows.length === 0 ? (
            <EmptyState icon={<Film />} title="맞는 접수가 없어요" description="거름을 지우거나 초대를 새로 만들어 보세요." />
          ) : (
            <>
              <DeskTable rows={list.rows} />
              <PhoneList rows={list.rows} />
              <Pager filters={filters} list={list} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 마이그레이션을 적용하기 전이면 표가 없다(P2021 · 날 SQL 은 P2010) — 화면 전체가 오류로 넘어가지 않게. 판단은 lib/intake/admin.ts isMissingTableError 하나 */
async function loadList(user: { id: string; role: string }, filters: IntakeListFilters): Promise<IntakeListResult | 'not_ready'> {
  try {
    return await loadIntakeList(prisma as unknown as PrismaClient, user, filters);
  } catch (e) {
    if (isMissingTableError(e)) return 'not_ready';
    throw e;
  }
}

const hrefOfRow = (id: string) => `/admin/intake/${id}`;

const titleOf = (r: IntakeListRow) => r.athleteName ?? r.invitationNote ?? '이름 미입력';

const progressTone = (p: ViewProgress): ChipTone => (p === 'verified' ? 'ok' : p === 'rejected' ? 'danger' : p === 'empty' || p === 'deleting' || p === 'deleted' ? 'neutral' : 'info');

function Views({ row }: { row: IntakeListRow }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <StatusChip tone={progressTone(row.side)}>옆 {VIEW_PROGRESS_TEXT[row.side]}</StatusChip>
      <StatusChip tone={progressTone(row.rear)}>뒤 {VIEW_PROGRESS_TEXT[row.rear]}</StatusChip>
    </span>
  );
}

function Unread({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-strong">
      <span aria-hidden className="h-2 w-2 rounded-full bg-sky" />
      안 읽음
    </span>
  );
}

function InvitationNote({ row }: { row: IntakeListRow }) {
  if (row.invitationStatus === 'revoked') return <StatusChip tone="danger">초대 폐기</StatusChip>;
  if (row.status === 'draft' && row.uploadExpired) return <StatusChip tone="warn">기간 끝남</StatusChip>;
  /* 링크를 못 받았을 수 있다 — 상세에서 새 링크를 만들거나 폐기한다 */
  if (row.untouched) return <StatusChip tone="neutral">{UNTOUCHED_TEXT}</StatusChip>;
  return null;
}

/* PC — 한눈에 견주는 표 */
function DeskTable({ rows }: { rows: IntakeListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface desk:block">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {['이름', '접수일', '옆 · 뒤', '검증', '분석', '공개', '담당', '삭제 예정일'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-56 px-3 py-2.5">
                <Link href={hrefOfRow(r.id)} prefetch={false} className="block min-w-0 font-semibold text-ink hover:text-sky">
                  <span className="block truncate">{titleOf(r)}</span>
                </Link>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {r.receiptCode && <span className="font-mono">{r.receiptCode}</span>}
                  <Unread on={r.unread} />
                  <InvitationNote row={r} />
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted">{seoulDateText(r.receivedAt)}</td>
              <td className="px-3 py-2.5">
                <Views row={r} />
              </td>
              <td className="px-3 py-2.5">
                <StatusChip tone={submissionTone(r.status)}>{textOf(SUBMISSION_STATUS_TEXT, r.status)}</StatusChip>
              </td>
              <td className="px-3 py-2.5">
                <AnalysisChip status={r.analysisStatus} block={r.analysisBlock} />
              </td>
              <td className="px-3 py-2.5">
                <StatusChip tone={publicationTone(r.publicationStatus)}>{textOf(PUBLICATION_STATUS_TEXT, r.publicationStatus)}</StatusChip>
              </td>
              <td className="max-w-32 truncate px-3 py-2.5 text-muted">{r.assigneeName ?? '없음'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted">{retentionCellText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 휴대폰 — 한 줄이 아니라 카드로 */
function PhoneList({ rows }: { rows: IntakeListRow[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface desk:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={hrefOfRow(r.id)} prefetch={false} className="flex items-center gap-3 p-(--block-pad)">
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{titleOf(r)}</span>
                <Unread on={r.unread} />
              </span>
              <span className="block text-xs text-muted">
                {seoulDateText(r.receivedAt)}
                {r.assigneeName ? ` · 담당 ${r.assigneeName}` : ''}
              </span>
              {(r.originalPurgeAt || r.originalsPurgedAt || r.originalsPurging) && <span className="block text-xs text-muted">{retentionLineText(r)}</span>}
              <span className="flex flex-wrap gap-1">
                <Views row={r} />
                <StatusChip tone={submissionTone(r.status)}>{textOf(SUBMISSION_STATUS_TEXT, r.status)}</StatusChip>
                <AnalysisChip status={r.analysisStatus} block={r.analysisBlock} />
                <StatusChip tone={publicationTone(r.publicationStatus)}>{textOf(PUBLICATION_STATUS_TEXT, r.publicationStatus)}</StatusChip>
                <InvitationNote row={r} />
              </span>
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function pageHref(f: IntakeListFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const k of ['status', 'analysis', 'publication', 'invitation', 'assignee'] as const) {
    const v = f[k];
    if (v) p.set(k, v);
  }
  if (f.unread) p.set('unread', '1');
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `/admin/intake?${s}` : '/admin/intake';
}

function Pager({ filters, list }: { filters: IntakeListFilters; list: IntakeListResult }) {
  if (list.pageCount <= 1) return null;
  const step = 'inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink hover:border-sky';
  return (
    <nav aria-label="쪽 넘기기" className="flex items-center justify-between gap-3">
      {list.page > 1 ? (
        <Link href={pageHref(filters, list.page - 1)} data-nav="none" className={step}>
          이전
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        {list.page} / {list.pageCount}쪽
      </span>
      {list.page < list.pageCount ? (
        <Link href={pageHref(filters, list.page + 1)} data-nav="none" className={step}>
          다음
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

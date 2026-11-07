import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { BackLink, Card, PageHeading } from '@/components/ui';
import { requirePermission } from '@/lib/dal';
import { loadIntakeDetail, type IntakeAssetDetail, type IntakeDetail } from '@/lib/intake/admin';
import {
  AGE_BAND_TEXT,
  ASSET_STATUS_TEXT,
  AUDIT_ACTION_TEXT,
  CONSENT_KIND_TEXT,
  FAILURE_CODE_TEXT,
  HAND_TEXT,
  INVITATION_STATUS_TEXT,
  PUBLICATION_STATUS_TEXT,
  REVISION_STATUS_TEXT,
  SUBMISSION_STATUS_TEXT,
  VIEW_TEXT,
  seoulDateText,
  seoulTimeText,
  textOf,
} from '@/lib/intake/admin-labels';
import { analysisReadiness, listRuns, type AnalysisReadiness } from '@/lib/intake/analysis';
import { SUBMITTER_RELATION_TEXT, isSubmitterRelation } from '@/lib/intake/consent';
import { isIntakeError } from '@/lib/intake/errors';
import { formatBytes } from '@/lib/intake/limits';
import { isIntakeId } from '@/lib/intake/paths';
import { prisma } from '@/lib/prisma';
import { AnalysisChip, StatusChip, publicationTone, submissionTone } from '../status-chip';
import { AnalysisPanel, AssetCard, AssignBox, NotesPanel, PairDownload, ReadMarker, RevokeButton, type RunRow } from './detail-client';
import { AccessCodeLockBox, CorrectionPanel, JobIssuesPanel, UploadWindowBox, WithdrawConsentButton, WithdrawModelConsentButton } from './detail-manage';
import {
  accessCodeText,
  correctionSectionVisible,
  extendDayChoices,
  modelWithdrawalRecordable,
  pairDownloadable,
  pairOriginalWarning,
  cancelCorrectionDetail,
  deletingViewsOf,
  emptyVideosText,
  goneViewsOf,
  retentionFactRows,
  retentionText,
  revokeRetentionText,
  withdrawConsentRetentionText,
  withdrawnBannerLead,
  withdrawnRetentionText,
  splitOlderAssets,
  uploadWindowExtendable,
  viewsToResend,
  withdrawalRecordable,
} from './detail-rules';

export const metadata: Metadata = { title: '접수 상세' };

/**
 * 접수 하나(2026-11-06) — 보낸 영상의 사실 · 원본 내려받기 · 담당 · 메모 · 고침 요청 · 철회 기록 · 멈춘 일감 · 분석 · 공개 · 감사 기록.
 * 서명 주소는 화면을 그릴 때 만들지 않는다 — 누른 순간 서버 동작이 5분짜리를 준다. 저장 경로는 화면으로 내보내지 않는다.
 */
export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('intake');
  const { id } = await params;
  if (!isIntakeId(id)) notFound();
  const d = await loadDetail(user, id);
  if (!d) notFound();
  const analysis = await loadAnalysis(id);
  const current = d.assets.filter((a) => a.current);
  const older = splitOlderAssets(d.assets);
  const extendChoices = extendDayChoices(d.invitation.uploadExpiresAt);
  const hasRunPreview = analysis !== 'unavailable' && analysis.runs.some((r) => r.hasPreviews);
  const title = d.athleteName ?? d.invitation.note ?? '이름 미입력';
  const withdrawn = d.status === 'withdrawn';
  const now = new Date();
  const retention = d.retention ? retentionText(d.retention, now) : null;

  return (
    <div className="stack-page">
      <ReadMarker submissionId={d.id} unread={d.unread} />
      <div className="space-y-2">
        <BackLink href="/admin/intake">외부 영상 접수</BackLink>
        <PageHeading kicker={d.receiptCode ?? '접수 번호 없음'} title={title} />
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone={submissionTone(d.status)}>{textOf(SUBMISSION_STATUS_TEXT, d.status)}</StatusChip>
          <AnalysisChip status={d.analysisStatus} block={d.analysisBlock} />
          <StatusChip tone={publicationTone(d.publicationStatus)}>{textOf(PUBLICATION_STATUS_TEXT, d.publicationStatus)}</StatusChip>
          {d.invitation.status === 'revoked' && <StatusChip tone="danger">초대 폐기됨</StatusChip>}
          {d.invitation.accessCodeNeedsReset && <StatusChip tone="warn">결과 보기 잠김</StatusChip>}
        </div>
      </div>

      {withdrawn && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          {withdrawnBannerLead(d)}
          {withdrawnRetentionText(d.retention, now)}
        </p>
      )}

      <div className="grid gap-(--block-pad) lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="stack-page min-w-0">
          {d.jobIssues.length > 0 && (
            <Section title="멈춘 일감">
              <JobIssuesPanel submissionId={d.id} issues={d.jobIssues} locked={withdrawn} />
            </Section>
          )}

          <Section title="영상" action={pairDownloadable(d) ? <PairDownload submissionId={d.id} warning={pairOriginalWarning(d)} /> : null}>
            {current.length === 0 ? (
              <p className="text-sm text-muted">{emptyVideosText(d.assets)}</p>
            ) : (
              <div className="grid gap-(--block-pad) md:grid-cols-2">
                {current.map((a) => (
                  <AssetCard key={a.id} submissionId={d.id} asset={a} locked={withdrawn} hasRunPreview={hasRunPreview} />
                ))}
              </div>
            )}
            {older.frozen.length + older.loose.length > 0 && <OlderAssets submissionId={d.id} frozen={older.frozen} loose={older.loose} locked={withdrawn} hasRunPreview={hasRunPreview} />}
          </Section>

          <Section title="분석 · 공개">
            {analysis === 'unavailable' ? (
              <p className="text-sm text-muted">저장소에 연결하지 못해 분석 정보를 읽지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>
            ) : (
              <AnalysisPanel submissionId={d.id} analysisStatus={d.analysisStatus} readiness={analysis.readiness} runs={analysis.runs} hand={d.throwingHand} withdrawn={withdrawn} activePublicationId={d.activePublicationId} />
            )}
            <Publications d={d} />
          </Section>

          {correctionSectionVisible(d) && (
            <Section title="고침 요청">
              <CorrectionPanel
                submissionId={d.id}
                version={d.version}
                requested={d.status === 'correction_requested'}
                correction={d.correction}
                requestedAt={d.correctionRequestedAt}
                uploadExpired={d.invitation.uploadExpired}
                editable={d.invitation.status === 'active'}
                extendChoices={extendChoices}
                suggestViews={viewsToResend(d.assets)}
                goneViews={goneViewsOf(d.assets)}
                deletingViews={deletingViewsOf(d.assets)}
                cancelDetail={cancelCorrectionDetail(d.retention, now)}
              />
            </Section>
          )}

          <Section title="기록">
            <Audit d={d} />
          </Section>
        </div>

        <aside className="stack-page min-w-0">
          <Section title="담당">
            <AssignBox submissionId={d.id} assigneeId={d.assigneeId} admins={d.admins} me={user.id} />
          </Section>
          <Section title="접수 정보">
            <Facts
              rows={[
                ['선수', d.athleteName ?? '-'],
                ['나이 확인', textOf(AGE_BAND_TEXT, d.athleteAgeBand, '-')],
                ['던지는 손', textOf(HAND_TEXT, d.throwingHand, '-')],
                ['보내는 분', submitterOf(d)],
                ['같은 투구 확인', d.samePitchConfirmed ? '확인함' : '아직'],
                ['접수일', seoulTimeText(d.receivedAt)],
                ['마지막 완료', seoulTimeText(d.lastFinalizedAt)],
                ...retentionFactRows(d.retention, d.filesPurgedAt, now),
              ]}
            />
            {retention?.note && <p className="text-xs text-warn">{retention.note}</p>}
          </Section>
          <Section title="초대">
            <Facts
              rows={[
                ['상태', textOf(INVITATION_STATUS_TEXT, d.invitation.status)],
                ['메모', d.invitation.note ?? '-'],
                ['만든 분', d.invitation.createdBy ?? '-'],
                ['올리기 끝', `${seoulDateText(d.invitation.uploadExpiresAt)}${d.invitation.uploadExpired ? ' (끝남)' : ''}`],
                ['결과 보기 끝', d.invitation.resultExpiresAt ? seoulDateText(d.invitation.resultExpiresAt) : '만료 없음'],
                ['접근 코드', accessCodeText(d.invitation)],
                ['파일 한도', `${formatBytes(d.invitation.limits.maxFileBytes)} · 합계 ${formatBytes(d.invitation.limits.maxTotalBytes)}`],
                ...(d.invitation.revokedAt ? ([['폐기', `${seoulTimeText(d.invitation.revokedAt)} · ${d.invitation.revokedBy ?? '-'}`]] as [string, string][]) : []),
              ]}
            />
            {d.invitation.accessCodeNeedsReset && <AccessCodeLockBox submissionId={d.id} failures={d.invitation.accessCodeFailures} />}
            {uploadWindowExtendable(d) && <UploadWindowBox submissionId={d.id} expired={d.invitation.uploadExpired} choices={extendChoices} />}
            {d.invitation.status === 'active' && <RevokeButton submissionId={d.id} retentionLine={revokeRetentionText(d.retention, { status: d.status, now })} />}
          </Section>
          <Section title="동의">
            <Consents d={d} />
            {withdrawalRecordable(d) && <WithdrawConsentButton submissionId={d.id} retentionLine={withdrawConsentRetentionText(d.retention, now)} />}
            {modelWithdrawalRecordable(d) && <WithdrawModelConsentButton submissionId={d.id} />}
          </Section>
          <Section title="내부 메모">
            <NotesPanel submissionId={d.id} notes={d.notes} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

async function loadDetail(user: { id: string; role: string }, id: string): Promise<IntakeDetail | null> {
  try {
    return await loadIntakeDetail(prisma as unknown as PrismaClient, user, id);
  } catch (e) {
    if (isIntakeError(e) && e.code === 'submission_not_found') return null;
    throw e;
  }
}

/** 저장소 경로(previewPaths)는 여기서 뺀다 — 화면에는 '있다'만 간다 */
async function loadAnalysis(id: string): Promise<{ readiness: AnalysisReadiness; runs: RunRow[] } | 'unavailable'> {
  try {
    const [readiness, runs] = await Promise.all([analysisReadiness(id), listRuns(id)]);
    return {
      readiness,
      runs: runs.map(({ previewPaths, ...r }) => ({
        id: r.id,
        revisionNumber: r.revisionNumber,
        isCurrentRevision: r.isCurrentRevision,
        engineKey: r.engineKey,
        status: r.status,
        requestedAt: r.requestedAt,
        finishedAt: r.finishedAt,
        failureText: r.failure?.text ?? null,
        failureDetail: r.failure?.detail ?? null,
        videoFault: r.failure?.videoFault ?? false,
        hasResult: r.hasResult,
        frames: r.frames,
        published: r.published,
        hasPreviews: previewPaths != null,
        timingDropped: r.timingDropped,
        startUnknown: r.startUnknown,
      })),
    };
  } catch (e) {
    if (isIntakeError(e) && e.code === 'storage_unavailable') return 'unavailable';
    throw e;
  }
}

const submitterOf = (d: IntakeDetail) => {
  const relation = isSubmitterRelation(d.submitterRelation) ? SUBMITTER_RELATION_TEXT[d.submitterRelation] : d.submitterRelation;
  return d.submitterName ? `${d.submitterName}(${relation})` : relation;
};

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {action}
      </div>
      <div className="stack-block">{children}</div>
    </Card>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 고침으로 밀려난 영상 — 판에 얼린 원본은 공개 결과의 근거일 수 있어 미리보기 · 내려받기로 대조할 수 있어야 한다 */
function OlderAssets({
  submissionId,
  frozen,
  loose,
  locked,
  hasRunPreview,
}: {
  submissionId: string;
  frozen: IntakeAssetDetail[];
  loose: IntakeAssetDetail[];
  locked: boolean;
  hasRunPreview: boolean;
}) {
  return (
    <details className="rounded-xl border border-line px-4 py-3">
      <summary className="cursor-pointer text-sm text-ink">이전에 고른 영상 {frozen.length + loose.length}개</summary>
      {frozen.length > 0 && (
        <div className="mt-3 grid gap-(--block-pad) md:grid-cols-2">
          {frozen.map((a) => (
            <AssetCard key={a.id} submissionId={submissionId} asset={a} locked={locked} hasRunPreview={hasRunPreview} />
          ))}
        </div>
      )}
      {loose.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {loose.map((a) => (
            <li key={a.id} className="break-words">
              {VIEW_TEXT[a.view]} · {a.fileName} · {textOf(ASSET_STATUS_TEXT, a.status)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Publications({ d }: { d: IntakeDetail }) {
  if (d.publications.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">공개 기록</h3>
      <ul className="space-y-2 text-sm">
        {d.publications.map((p) => (
          <li key={p.id} className="rounded-xl border border-line px-3 py-2">
            <p className="text-ink">
              {p.number}번째 공개 · {p.active ? '공개 중' : '내림'} · {seoulTimeText(p.publishedAt)} · {p.publishedBy}
            </p>
            {p.explanation && <p className="mt-1 whitespace-pre-wrap text-muted">{p.explanation}</p>}
            {p.unpublishedAt && (
              <p className="mt-1 text-xs text-muted">
                {seoulTimeText(p.unpublishedAt)} · {p.unpublishedBy ?? '-'} 내림
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Consents({ d }: { d: IntakeDetail }) {
  if (d.consents.length === 0) return <p className="text-sm text-muted">아직 남긴 동의가 없어요.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink">
        필수 동의 {d.consentRequiredOk ? '있음' : '없음'} · 모델 개발 이용 {d.modelUseAllowed ? '동의' : '미동의'}
      </p>
      <ul className="space-y-1.5 text-xs text-muted">
        {d.consents.map((c) => (
          <li key={c.id} className="break-words">
            {textOf(CONSENT_KIND_TEXT, c.kind)} · {c.granted ? '동의' : '거부'}
            {c.proxy ? ' · 대리' : ''} · {seoulTimeText(c.agreedAt)}
            {c.withdrawnAt ? ` · ${seoulTimeText(c.withdrawnAt)} 철회` : ''}
          </li>
        ))}
      </ul>
      {d.consentsHidden > 0 && <p className="text-xs text-muted">더 있음: 오래된 동의 기록 {d.consentsHidden}건은 줄여서 안 보여요. 지금 판단에 쓰는 기록은 다 보여요.</p>}
    </div>
  );
}

const detailText = (action: string, detail: Record<string, unknown> | null) => {
  if (!detail) return null;
  const view = typeof detail.view === 'string' && (detail.view === 'side' || detail.view === 'rear') ? `${VIEW_TEXT[detail.view]} 영상` : null;
  const failure = typeof detail.failureCode === 'string' ? textOf(FAILURE_CODE_TEXT, detail.failureCode) : null;
  /* 철회를 누가 어떻게 알렸는지는 이 기록이 하나뿐인 근거다 */
  const note = (action === 'consent.withdrawn_by_admin' || action === 'consent.model_withdrawn_by_admin') && typeof detail.note === 'string' ? detail.note : null;
  const until = action === 'upload_window.extended' && typeof detail.to === 'string' ? `${seoulDateText(detail.to)}까지` : null;
  return [view, failure, note, until].filter(Boolean).join(' · ') || null;
};

function Audit({ d }: { d: IntakeDetail }) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-ink">감사 기록 {d.audit.length}건</summary>
      <ol className="mt-3 space-y-2 text-sm">
        {d.audit.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
            <span className="min-w-0 text-ink">
              {textOf(AUDIT_ACTION_TEXT, a.action)}
              {detailText(a.action, a.detail) ? <span className="text-muted"> · {detailText(a.action, a.detail)}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {a.actor} · {seoulTimeText(a.createdAt)}
            </span>
          </li>
        ))}
      </ol>
      {d.revisions.length > 0 && (
        <div className="mt-4 space-y-1 text-sm">
          <h3 className="font-semibold text-ink">얼린 판</h3>
          {d.revisions.map((r) => (
            <p key={r.id} className="text-muted">
              {r.number}판 · {textOf(REVISION_STATUS_TEXT, r.status)}
              {r.failureCode ? ` · ${textOf(FAILURE_CODE_TEXT, r.failureCode)}` : ''} · {seoulTimeText(r.finalizedAt)}
              {r.current ? ' · 지금 판' : ''}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}

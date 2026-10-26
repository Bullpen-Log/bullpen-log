import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, Card, Field, Input, PageHeading, Textarea } from '@/components/ui';
import { saveCandidateCheck, setCandidateApproval, setCandidateCoords } from '@/app/actions/admin-candidates';
import type { loadCandidate } from '@/lib/market/candidate-load';
import {
  BUSINESS_STATUS,
  COLLECTION_STATUS,
  CONSENT_STATUS,
  CONTACT_STATUS,
  COORDS_ACCURACY,
  COORDS_SOURCE,
  HARDBALL_NOTICE,
  LESSON_NOTICE,
  MAP_STATUS,
  NOTICE_SCOPE,
  OPERATION_NOTICE,
  ORIGIN_GROUP,
  RENTAL_NOTICE,
  SOURCE_KIND,
  type StatusMap,
  canApprove,
  labelOf,
  reviewFlags,
} from '@/lib/market/candidates';

/* 통합 자료(2026-10-26) 한 후보에서 화면에 쓰는 부분 — 원문 소개 · 사진 · 후기 · 가격표는 자료에도 없고 여기서도 안 그린다 */
type Evidence = {
  status?: string;
  summary?: string;
  scope?: string;
  sourceKinds?: string[];
  sourceUrls?: string[];
  publishedDate?: string | null;
  checkedDate?: string | null;
  currentProvisionVerified?: boolean;
};
type Collected = {
  placeIds?: string[];
  placeUrl?: string;
  infoUrl?: string;
  sourceNames?: string[];
  sourceAddresses?: string[];
  sourceCandidateIds?: string[];
  reportedAliases?: string[];
  relatedPriorRecords?: { array?: string; id?: string; name?: string; address?: string }[];
  coordinateEvidence?: { accuracy?: string; notes?: string } | null;
  operationsReview?: {
    checkedAt?: string;
    observedName?: string;
    observedAddress?: string;
    operation?: {
      evidenceStatus?: string;
      summary?: string;
      listingHours?: string | null;
      hoursBadgeAtVisit?: string | null;
      latestVisiblePlaceNewsDate?: string | null;
      bookingProductsVisible?: boolean;
      actualOperationVerified?: boolean;
      sourceUrls?: string[];
    };
    lesson?: Evidence;
    hardball?: Evidence;
    rental?: Evidence;
    notes?: string[];
    contactQuestions?: string[];
    sources?: { kind?: string; url?: string; checkedAt?: string }[];
  };
};

const COORDS_MSG: Record<string, string> = {
  ok: '좌표를 저장했어요.',
  bad: '좌표를 읽지 못했어요. 한국 안의 위도 · 경도를 숫자로 넣어 주세요.',
  nokey: '주소로 찾기는 카카오 REST 열쇠(KAKAO_REST_API_KEY)가 있어야 해요. 손으로 넣어 주세요.',
  notfound: '주소로 좌표를 찾지 못했어요. 손으로 넣어 주세요.',
};

const dateText = (d: Date | null) => (d ? d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : null);
const safeUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');
const shortUrl = (u: string) => u.replace(/^https:\/\/(www\.|m\.|pcmap\.)?/, '').slice(0, 48);

/** 수집 후보 하나의 화면 몸통(2026-10-26, 대표관리자만) — 공개 근거(직접 확인 전)와 업체에 확인한 정보를 나눠 보이고, 연락 · 동의 · 승인 · 좌표를 고친다 */
export function CandidateDetail({
  c,
  mergedInto,
  mergedFrom,
  coords,
  embedded = false,
  inApp = false,
}: NonNullable<Awaited<ReturnType<typeof loadCandidate>>> & {
  coords?: string;
  /** 연습장 지도 위 팝업 안(app/(dugout)/@modal) — '‹ 수집 후보' 목록 길을 안 그린다(창을 닫으면 지도로) */
  embedded?: boolean;
  /** 덕아웃 앱의 후보 창(app/embed/place/[id]) — 좌표를 저장해도 그 화면에 머문다(setCandidateCoords 의 embed) */
  inApp?: boolean;
}) {
  const k = (c.collected ?? {}) as Collected;
  const ops = k.operationsReview;
  const op = ops?.operation;
  const flags = reviewFlags(c);
  const history = Array.isArray(c.collectedHistory) ? c.collectedHistory.length : 0;
  const select = (name: string, map: Record<string, string>, value: string) => (
    <select name={name} defaultValue={value} className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink">
      {Object.entries(map).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
  const tri = (name: string, value: boolean | null) => (
    <select name={name} defaultValue={value == null ? '' : value ? 'yes' : 'no'} className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink">
      <option value="">아직 모름</option>
      <option value="yes">한다(업체 확인)</option>
      <option value="no">안 한다(업체 확인)</option>
    </select>
  );

  return (
    <div className="stack-page">
      {!embedded && (
        <Link href="/manage/places" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> 수집 후보
        </Link>
      )}
      {/* 팝업은 창 제목이 이름이라 설명 줄만 */}
      {embedded ? (
        <p className="text-sm text-muted">{[c.typeHint, c.region, labelOf(ORIGIN_GROUP, c.originGroup)].filter((x) => x && x !== '—').join(' · ')}</p>
      ) : (
        <PageHeading title={c.name} description={[c.typeHint, c.region, labelOf(ORIGIN_GROUP, c.originGroup)].filter((x) => x && x !== '—').join(' · ')} />
      )}

      {(flags.length > 0 || mergedFrom.length > 0) && (
        <Card className="space-y-2 border-warn/40">
          {flags.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <Badge key={f} className="text-warn">
                  {f}
                </Badge>
              ))}
            </p>
          )}
          {mergedInto && (
            <p className="text-sm text-ink">
              통합 자료가 같은 장소(같은 지도 장소 id · 주소)로 묶은 이전 기록이에요. 지우지 않고{' '}
              <Link href={`/manage/places/${encodeURIComponent(mergedInto.id)}`} className="font-semibold text-sky">
                {mergedInto.name}
              </Link>
              (대표 기록)에 이어 두었어요. 연락 · 동의는 대표 기록에서 관리해요.
            </p>
          )}
          {mergedFrom.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted">이 장소로 통합된 이전 기록 — 지우지 않았고 연락 · 동의 기록을 옮기지 않았어요.</p>
              {mergedFrom.map((s) => (
                <p key={s.id}>
                  <Link href={`/manage/places/${encodeURIComponent(s.id)}`} className="text-sm font-semibold text-sky">
                    {s.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted">{s.id}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-block lg:grid-cols-2">
        <div className="stack-block">
          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">공개 근거 · 직접 확인 필요</h2>
              <p className="mt-1 text-xs text-muted">
                네이버 플레이스 공개 화면을 본 근거예요{ops?.checkedAt ? `(${ops.checkedAt.slice(0, 10)})` : ''}. 업체 연락 · 현장 확인은 안 했어요 — 현재 영업 · 서비스 확정이 아니에요.
              </p>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="지도 주소">{c.address ?? c.roadAddress ?? '—'}</Row>
              <Row label="영업 근거">
                {labelOf(OPERATION_NOTICE, c.operationNotice)}
                {op?.actualOperationVerified ? '' : ' · 직접 확인 전'}
                {op?.summary && <span className="block text-xs text-muted">{op.summary}</span>}
              </Row>
              {op?.latestVisiblePlaceNewsDate && <Row label="최근 소식">{op.latestVisiblePlaceNewsDate}(참고 신호 — 영업 확인 아님)</Row>}
              {op?.hoursBadgeAtVisit && <Row label="볼 때 표시">{op.hoursBadgeAtVisit}(시간표 상태 — 폐업 · 영업 판정 아님)</Row>}
              {op?.listingHours && <Row label="게시 시간표">{op.listingHours}</Row>}
              {op?.bookingProductsVisible && <Row label="예약 상품">게시돼 있음(잔여 시간 · 실제 접수 확인 아님)</Row>}
            </dl>
            <EvidenceBlock title="레슨" map={LESSON_NOTICE} e={ops?.lesson} fallback={c.lessonNotice} />
            <EvidenceBlock title="경식구" map={HARDBALL_NOTICE} e={ops?.hardball} fallback={c.hardballNotice} />
            <EvidenceBlock title="대관" map={RENTAL_NOTICE} e={ops?.rental} fallback={c.rentalNotice} />
            {ops?.notes?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                {ops.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
            {ops?.sources?.some((s) => safeUrl(s.url)) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted">출처</p>
                <ul className="space-y-0.5">
                  {ops.sources
                    .filter((s) => safeUrl(s.url))
                    .map((s, i) => (
                      <li key={i} className="text-xs">
                        <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-sky">
                          {labelOf(SOURCE_KIND, s.kind)} ↗
                        </a>
                        <span className="ml-2 text-muted">{s.checkedAt?.slice(0, 10)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Card>

          {ops?.contactQuestions?.length ? (
            <Card className="space-y-2">
              <h2 className="text-sm font-bold text-ink">업체에 물어볼 것</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                {ops.contactQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </Card>
          ) : null}

          <Card className="space-y-2">
            <h2 className="text-sm font-bold text-ink">이력</h2>
            <dl className="space-y-2 text-sm">
              <Row label="후보 id">{c.id}</Row>
              {k.sourceCandidateIds?.length ? <Row label="이전 id">{k.sourceCandidateIds.join(', ')}</Row> : null}
              {k.placeIds?.length ? <Row label="지도 장소 id">{k.placeIds.join(', ')}</Row> : null}
              {k.sourceNames?.length ? <Row label="처음 상호">{k.sourceNames.join(' · ')}</Row> : null}
              {k.sourceAddresses?.length ? <Row label="처음 주소">{`${k.sourceAddresses.join(' · ')} (처음 수집 표기 — 지금 주소 아님)`}</Row> : null}
              {k.reportedAliases?.length ? <Row label="다른 이름">{k.reportedAliases.join(' · ')}</Row> : null}
              {c.mapStatus && <Row label="주소 검토">{labelOf(MAP_STATUS, c.mapStatus)}</Row>}
              {k.relatedPriorRecords?.length ? (
                <Row label="과거 참고">
                  {k.relatedPriorRecords.map((r) => [r.name, r.address].filter(Boolean).join(' · ')).join(' / ')}
                  <span className="block text-xs text-muted">보류 · 퇴역 자료와 비교한 참고예요. 자동으로 되살리거나 합치지 않았어요.</span>
                </Row>
              ) : null}
              <Row label="자료">{[`기준 ${dateText(c.collectedAt)}`, history ? `이전 자료 ${history}개 보존` : null].filter(Boolean).join(' · ')}</Row>
            </dl>
            {(safeUrl(k.placeUrl) || safeUrl(k.infoUrl)) && (
              <p className="flex flex-wrap gap-3">
                {safeUrl(k.placeUrl) && (
                  <a href={k.placeUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky">
                    지도 장소 ↗
                  </a>
                )}
                {safeUrl(k.infoUrl) && (
                  <a href={k.infoUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky">
                    지도 정보 ↗
                  </a>
                )}
              </p>
            )}
          </Card>
        </div>

        <div className="stack-block">
          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">업체 확인 정보</h2>
              <p className="mt-1 text-xs text-muted">업체에 직접 확인한 것만 적어요. 공개 안내 · 사진 · 지도만으로 바꾸지 않아요.</p>
            </div>
            <SafeForm action={saveCandidateCheck} doneToast="저장했어요." className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="정보 확인">{select('collectionStatus', COLLECTION_STATUS, c.collectionStatus)}</Field>
                <Field label="영업">{select('businessStatus', BUSINESS_STATUS, c.businessStatus)}</Field>
                <Field label="연락">{select('contactStatus', CONTACT_STATUS, c.contactStatus)}</Field>
                <Field label="동의">{select('consentStatus', CONSENT_STATUS, c.consentStatus)}</Field>
                <Field label="레슨">{tri('offersLessons', c.offersLessons)}</Field>
                <Field label="대관">{tri('offersRental', c.offersRental)}</Field>
                <Field label="경식구">{tri('offersHardball', c.offersHardball)}</Field>
                <Field label="전화">
                  <Input name="phone" inputMode="tel" maxLength={40} defaultValue={c.phone ?? ''} placeholder="업체에게 받은 번호" />
                </Field>
              </div>
              <Field label="동의 범위" hint="무엇을 공개해도 되는지(소개 · 사진 · 연락처 · 예약 등), 누가 언제 동의했는지.">
                <Textarea name="consentScope" rows={2} maxLength={1000} defaultValue={c.consentScope ?? ''} />
              </Field>
              <Field label="연락 · 답변 기록" hint="연락한 날 · 사람 · 업체 답변. 비밀번호 · 계좌 같은 건 적지 않아요.">
                <Textarea name="adminNote" rows={4} maxLength={4000} defaultValue={c.adminNote ?? ''} />
              </Field>
              <p className="text-xs text-muted">
                {[c.verifiedAt && `정보 확인 ${dateText(c.verifiedAt)}`, c.lastContactedAt && `마지막 연락 ${dateText(c.lastContactedAt)}`].filter(Boolean).join(' · ') ||
                  '아직 확인 · 연락 기록이 없어요.'}
              </p>
              <Button type="submit" size="sm">
                저장
              </Button>
            </SafeForm>
          </Card>

          <Card className="space-y-2">
            <h2 className="text-sm font-bold text-ink">업체 소개 공개 승인</h2>
            {c.approvedAt ? (
              <>
                <p className="text-sm text-ink">{dateText(c.approvedAt)}에 승인했어요. 공개 레슨장 · 연습장으로 옮기는 기능은 아직 없어 사용자에게는 안 보여요.</p>
                <SafeForm action={setCandidateApproval} doneToast="승인을 거뒀어요.">
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    승인 거두기
                  </Button>
                </SafeForm>
              </>
            ) : canApprove(c) && !c.mergedIntoId ? (
              <SafeForm action={setCandidateApproval} doneToast="승인했어요.">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="approve" value="on" />
                <Button type="submit" size="sm">
                  승인하기
                </Button>
              </SafeForm>
            ) : (
              <p className="text-xs text-muted">업체 동의(동의함)와 정보 확인(정보 확인함)을 저장한 뒤에 승인할 수 있어요.</p>
            )}
            <p className="text-xs text-muted">예약 접수는 이 승인과 따로예요 — 정식 연습장 · 레슨장으로 옮긴 뒤 그쪽에서 켜요.</p>
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">지도 좌표</h2>
              <p className="mt-1 text-xs text-muted">
                {c.lat != null && c.lng != null
                  ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} · ${
                      c.coordsEdited
                        ? `${labelOf(COORDS_SOURCE, c.coordsSource)}${c.coordsSetAt ? ` ${dateText(c.coordsSetAt)}` : ''}`
                        : labelOf(COORDS_ACCURACY, k.coordinateEvidence?.accuracy ?? 'BUILDING_ONLY')
                    }`
                  : '위치 확인 필요 — 좌표가 없어 지도에 점이 안 보여요.'}
              </p>
            </div>
            {coords && COORDS_MSG[coords] && (
              <p role="status" className={`text-xs ${coords === 'ok' ? 'text-ink' : 'text-danger'}`}>
                {COORDS_MSG[coords]}
              </p>
            )}
            <SafeForm action={setCandidateCoords} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="mode" value="manual" />
              {inApp && <input type="hidden" name="embed" value="1" />}
              <label className="min-w-0 flex-1 space-y-1">
                <span className="block text-xs text-muted">위도</span>
                <Input name="lat" inputMode="decimal" defaultValue={c.lat ?? ''} placeholder="37.5665" />
              </label>
              <label className="min-w-0 flex-1 space-y-1">
                <span className="block text-xs text-muted">경도</span>
                <Input name="lng" inputMode="decimal" defaultValue={c.lng ?? ''} placeholder="126.9780" />
              </label>
              <Button type="submit" size="sm" variant="secondary">
                좌표 저장
              </Button>
            </SafeForm>
            <SafeForm action={setCandidateCoords}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="mode" value="geocode" />
              {inApp && <input type="hidden" name="embed" value="1" />}
              <Button type="submit" size="sm" variant="secondary">
                지도 주소로 좌표 찾기
              </Button>
            </SafeForm>
            <p className="text-xs text-muted">정한 방법 · 날짜가 함께 남아요. 위치 근거(현장 · 업체 확인)는 연락 · 답변 기록에 적어 주세요.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** 레슨 · 경식구 · 대관 하나의 공개 근거 — 근거 수준 · 적용 범위 · 출처 · 날짜. 적용 범위 밖(다른 반 · 구역 · 지점)으로 넓히지 않는다 */
function EvidenceBlock({ title, map, e, fallback }: { title: string; map: StatusMap; e?: Evidence; fallback: string | null }) {
  const status = e?.status ?? fallback;
  return (
    <div className="space-y-1 rounded-xl bg-surface-2 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold text-ink">{title}</span>
        <Badge>{labelOf(map, status)}</Badge>
        {e?.scope && e.scope !== 'UNCONFIRMED' && labelOf(NOTICE_SCOPE, e.scope) !== labelOf(map, status) && <Badge>{labelOf(NOTICE_SCOPE, e.scope)}</Badge>}
        {!e?.currentProvisionVerified && <span className="text-xs text-muted">직접 확인 필요</span>}
      </p>
      {e?.summary && <p className="text-xs text-ink">{e.summary}</p>}
      <p className="text-xs text-muted">
        {[
          e?.sourceKinds?.length ? `근거: ${e.sourceKinds.map((x) => labelOf(SOURCE_KIND, x)).join(' · ')}` : null,
          e?.publishedDate ? `게시 ${e.publishedDate}` : null,
          e?.checkedDate ? `확인 ${e.checkedDate}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {e?.sourceUrls?.some(safeUrl) && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5">
          {e.sourceUrls.filter(safeUrl).map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky">
              {shortUrl(u)} ↗
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

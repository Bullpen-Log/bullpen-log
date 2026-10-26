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
  MAP_STATUS,
  NOTICE_LEVEL,
  canApprove,
  labelOf,
  reviewFlags,
} from '@/lib/market/candidates';

/* 수집 자료 한 줄에서 화면에 쓰는 부분만(lib/market/candidates.ts readCandidateFile 이 통째로 보존) */
type Collected = {
  lotAddress?: string | null;
  addressDetail?: string | null;
  source?: string;
  sourceAsOf?: string;
  sourceStoreIds?: string[];
  externalPlaceId?: string | null;
  naverSearchUrl?: string | null;
  kakaoSearchUrl?: string | null;
  qualityFlags?: string[];
  classificationEvidence?: string | null;
  mapReview?: { observedName?: string; placeUrl?: string | null; infoUrl?: string | null; notes?: string[]; addressDifference?: string | null };
  battingReview?: { mode?: string; reason?: string } | null;
};

const COORDS_MSG: Record<string, string> = {
  ok: '좌표를 저장했어요.',
  bad: '좌표를 읽지 못했어요. 한국 안의 위도 · 경도를 숫자로 넣어 주세요.',
  nokey: '주소로 찾기는 카카오 REST 열쇠(KAKAO_REST_API_KEY)가 있어야 해요. 손으로 넣어 주세요.',
  notfound: '주소로 좌표를 찾지 못했어요. 손으로 넣어 주세요.',
};

const dateText = (d: Date | null) => (d ? d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : null);

/** 수집 후보 하나의 화면 몸통(2026-10-26, 대표관리자만) — 수집 정보(공개 안내 · 확정 아님)와 업체에 확인한 정보를 나눠 보이고, 연락 · 동의 · 승인 · 좌표를 고친다 */
export function CandidateDetail({ c, siblings, coords }: NonNullable<Awaited<ReturnType<typeof loadCandidate>>> & { coords?: string }) {
  const k = (c.collected ?? {}) as Collected;
  const map = k.mapReview ?? {};
  const flags = reviewFlags(c);
  const links = [
    ['지도 장소', map.placeUrl],
    ['지도 소개', map.infoUrl],
    ['네이버 검색', k.naverSearchUrl],
    ['카카오 검색', k.kakaoSearchUrl],
  ].filter((l): l is [string, string] => typeof l[1] === 'string' && l[1].startsWith('https://'));
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
      <Link href="/manage/places" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ChevronLeft className="h-3.5 w-3.5" /> 수집 후보
      </Link>
      <PageHeading title={c.name} description={[c.typeHint, c.region, c.district].filter(Boolean).join(' · ')} />

      {flags.length > 0 && (
        <Card className="space-y-2 border-warn/40">
          <p className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <Badge key={f} className="text-warn">
                {f}
              </Badge>
            ))}
          </p>
          {siblings.length > 0 && (
            <>
              <p className="text-xs text-muted">같은 지도 장소이거나 중복이 의심되는 기록이에요. 자동으로 합치지 않았어요 — 연락하기 전에 같은 곳인지 확인해 주세요.</p>
              <ul className="space-y-1">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/manage/places/${encodeURIComponent(s.id)}`} className="text-sm font-semibold text-sky">
                      {s.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted">{s.roadAddress}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <div className="grid gap-block lg:grid-cols-2">
        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">수집 정보</h2>
            <p className="mt-1 text-xs text-muted">공공자료 · 지도에서 모은 근거예요. 현재 영업 · 서비스 · 업체 동의를 확인한 값이 아니에요.</p>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="도로명 주소">{[c.roadAddress, k.addressDetail].filter(Boolean).join(' ') || '—'}</Row>
            {k.lotAddress && <Row label="지번 주소">{k.lotAddress}</Row>}
            <Row label="지도 대조">
              {labelOf(MAP_STATUS, c.mapStatus)}
              {map.observedName && map.observedName !== c.name ? ` (지도 상호 ‘${map.observedName}’)` : ''}
            </Row>
            {map.addressDifference && <Row label="주소 차이">{map.addressDifference}</Row>}
            <Row label="레슨 공개 안내">{labelOf(NOTICE_LEVEL, c.lessonNotice)}</Row>
            <Row label="대관 공개 안내">{labelOf(NOTICE_LEVEL, c.rentalNotice)}</Row>
            <Row label="경식구 공개 안내">{labelOf(NOTICE_LEVEL, c.hardballNotice)}</Row>
            {k.battingReview?.mode && <Row label="배팅 검토">{`${k.battingReview.mode} — ${k.battingReview.reason ?? ''}`}</Row>}
            {k.classificationEvidence && <Row label="분류 근거">{k.classificationEvidence}</Row>}
            <Row label="출처">{[k.source, k.sourceAsOf && `기준 ${k.sourceAsOf}`, `수집 ${dateText(c.collectedAt)}`].filter(Boolean).join(' · ')}</Row>
            <Row label="원본 번호">{[...(k.sourceStoreIds ?? []), k.externalPlaceId && `지도 ${k.externalPlaceId}`].filter(Boolean).join(', ') || '—'}</Row>
          </dl>
          {(map.notes?.length || k.qualityFlags?.length) ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {[...(map.notes ?? []), ...(k.qualityFlags ?? [])].map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {links.length > 0 && (
            <p className="flex flex-wrap gap-3">
              {links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky">
                  {label} ↗
                </a>
              ))}
            </p>
          )}
        </Card>

        <div className="stack-block">
          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">업체 확인 정보</h2>
              <p className="mt-1 text-xs text-muted">업체에 직접 확인한 것만 적어요. 공개 안내 · 사진 · 지도 일치만으로 바꾸지 않아요.</p>
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
              </div>
              <Field label="메모" hint="연락한 사람 · 날짜 · 들은 내용. 비밀번호 · 계좌 같은 건 적지 않아요.">
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
            <h2 className="text-sm font-bold text-ink">관리자 승인</h2>
            {c.approvedAt ? (
              <>
                <p className="text-sm text-ink">{dateText(c.approvedAt)}에 승인했어요. 공개 레슨장 · 연습장으로 옮기는 기능은 아직 없어요.</p>
                <SafeForm action={setCandidateApproval} doneToast="승인을 거뒀어요.">
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    승인 거두기
                  </Button>
                </SafeForm>
              </>
            ) : canApprove(c) ? (
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
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">지도 좌표</h2>
              <p className="mt-1 text-xs text-muted">
                {c.lat != null && c.lng != null
                  ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}${c.coordsEdited ? ' · 관리자가 고침' : ' · 공공자료 건물 위치'}`
                  : '좌표가 없어 지도에 점이 안 보여요.'}
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
              <Button type="submit" size="sm" variant="secondary">
                주소로 좌표 찾기
              </Button>
            </SafeForm>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

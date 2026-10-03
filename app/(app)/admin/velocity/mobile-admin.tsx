'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Film,
  Play,
} from 'lucide-react';
import { ClipPlayer } from '@/components/velocity/clip-player';
import { BackLink, ButtonLink } from '@/components/ui';
import { pitchTypeLabel } from '@/lib/velocity-meta';
import type {
  AdminDay,
  AdminOverview,
  AdminPitchRow,
  AdminSessionRow,
} from '@/lib/velocity-admin-load';
import { explorerHref, type ExplorerPath } from './explorer-path';
import { MobileUploadButton } from './mobile-upload';
import { signed } from './format';

/**
 * 휴대폰 구속 측정 관리자 — 올리기 위주의 간단한 화면(2026-10-03 사용자: "모바일 구속 측정 관리자는 업로드 최적화 인터페이스로
 * 간략하게, 과거에 저장된 영상도 볼 수는 있어야"). PC 화면(탐색기 · 종합 분석)은 desk 에서만 보이고, 휴대폰에서는 이것만 보인다
 * (overview-view.tsx 가 CSS 로 가른다).
 *
 *   첫 화면 — [영상 올리기] 큰 단추(mobile-upload.tsx) · 엔진 개발용 녹화 · 구속 측정 시작 · 숫자 셋 · 날짜별 지난 영상
 *   날짜 화면(?area=orig&at=날짜, 탐색기와 같은 주소) — 그날 공 목록, 누르면 영상(일반 · 광각)이 펼쳐진다
 *
 * 자세한 분석 · 보정 · 다시 재기는 PC 에서.
 */
export function MobileVelocityAdmin({
  data,
  path,
  day,
  recordings,
}: {
  data: AdminOverview;
  path: ExplorerPath;
  day: AdminDay | null;
  recordings: number;
}) {
  if (path.level === 'day' && day) return <MobileDay day={day} />;
  const { totals, overall } = data;
  const days = data.days.slice(0, 40);
  return (
    <div className="stack-block">
      <MobileUploadButton />
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink
          href="/admin/velocity/recordings"
          variant="secondary"
          className="h-12 w-full px-3 text-sm"
        >
          <Clapperboard aria-hidden className="h-4 w-4" />
          녹화{recordings > 0 ? ` ${recordings}` : ''}
        </ButtonLink>
        <ButtonLink
          href="/velocity/measure"
          variant="secondary"
          className="h-12 w-full px-3 text-sm"
        >
          <Camera aria-hidden className="h-4 w-4" />
          측정 시작
        </ButtonLink>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="공" value={String(totals.pitches)} />
        <Tile label="스피드건 짝" value={String(totals.pairs)} />
        <Tile
          label="편향"
          value={overall.biasKmh == null ? '—' : signed(overall.biasKmh)}
          unit={overall.biasKmh == null ? undefined : 'km/h'}
        />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">지난 영상</h2>
        {days.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-8 text-center text-sm text-muted">
            아직 올린 공이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {days.map((d, i) => (
              <li
                key={d.date}
                style={{ '--row': i } as CSSProperties}
                className="motion-safe:animate-row-in"
              >
                <Link
                  href={explorerHref({
                    level: 'day',
                    area: 'orig',
                    year: d.date.slice(0, 4),
                    month: d.date.slice(0, 7),
                    date: d.date,
                  })}
                  className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-ink/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink tabular-nums">
                      {d.date}
                    </span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      공 {d.pitches} · 영상 {d.clips}
                      {d.pairs > 0 && ` · 짝 ${d.pairs}`}
                      {d.maxKmh != null && ` · 최고 ${d.maxKmh.toFixed(1)}`}
                    </span>
                  </span>
                  {d.clips > 0 && (
                    <Film aria-hidden className="h-4 w-4 shrink-0 text-sky" />
                  )}
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          카메라 값 다시 재기 · 보정 · 종합 분석은 PC 의 구속 측정 관리자에서 해요.
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-numeric mt-0.5 text-xl font-semibold text-ink tabular-nums">
        {value}
        {unit && (
          <span className="ml-0.5 font-sans text-xs font-normal text-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

/** 그날 공 — 최근부터. 누르면 영상이 펼쳐진다(영상은 그때 받는다 — 휴대폰 데이터 아끼기) */
function MobileDay({ day }: { day: AdminDay }) {
  const rows: { s: AdminSessionRow; p: AdminPitchRow }[] = day.sessions
    .flatMap((s) => s.pitches.map((p) => ({ s, p })))
    .sort((a, b) => b.p.createdAt.localeCompare(a.p.createdAt));
  const [open, setOpen] = useState<string | null>(null);
  const st = day.stat;
  return (
    <div className="stack-block">
      <div className="space-y-1">
        <BackLink href="/admin/velocity">구속 측정 관리자</BackLink>
        <h2 className="text-heading text-2xl text-ink tabular-nums">{day.date}</h2>
        <p className="text-sm text-muted tabular-nums">
          공 {st.pitches} · 영상 {st.clips}
          {st.pairs > 0 && ` · 짝 ${st.pairs}`}
          {st.biasKmh != null && ` · 편향 ${signed(st.biasKmh)}`}
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map(({ s, p }, i) => {
          const isOpen = open === p.id;
          const diff =
            !p.manual && p.gunKmh != null
              ? (p.releaseKmh ?? p.rawKmh) - p.gunKmh
              : null;
          const cameraPos =
            s.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher';
          return (
            <li
              key={p.id}
              style={{ '--row': i } as CSSProperties}
              className="overflow-hidden rounded-2xl bg-surface motion-safe:animate-row-in"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : p.id)}
                aria-expanded={isOpen}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-ink/5"
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    p.clipUrl ? 'bg-sky/10 text-sky' : 'bg-ink/5 text-muted'
                  }`}
                >
                  {p.clipUrl ? (
                    <Play aria-hidden className="h-4 w-4" />
                  ) : (
                    <Film aria-hidden className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink tabular-nums">
                    {p.manual ? (
                      <>건 {(p.gunKmh ?? p.rawKmh).toFixed(1)} km/h</>
                    ) : (
                      <>
                        {p.kmh.toFixed(1)} km/h
                        {p.gunKmh != null && (
                          <span className="font-normal text-muted">
                            {' '}
                            · 건 {p.gunKmh.toFixed(1)}
                          </span>
                        )}
                      </>
                    )}
                    {diff != null && (
                      <span
                        className={`ml-1 text-xs font-medium ${Math.abs(diff) > 5 ? 'text-danger' : 'text-ok'}`}
                      >
                        {signed(diff)}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {s.nickname}
                    {p.pitchType && ` · ${pitchTypeLabel(p.pitchType)}`}
                    {p.manual && ' · 수기'}
                    {s.source === 'file' ? ' · 영상 파일' : ' · 카메라'}
                    {p.wideClipUrl && ' · 광각'}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="space-y-2 px-3 pb-3 motion-safe:animate-fade-in">
                  {p.clipUrl ? (
                    <ClipPlayer
                      src={p.clipUrl}
                      eventSec={p.clipEventSec}
                      zoneRect={p.analysis?.zoneRect}
                      zone={p.zone}
                      cameraPos={cameraPos}
                      showZone={false}
                      autoPlay
                      maxHeight="60dvh"
                      className="rounded-xl bg-black"
                    />
                  ) : (
                    <p className="rounded-xl bg-ink/5 px-3 py-6 text-center text-sm text-muted">
                      이 공에는 영상이 없어요.
                    </p>
                  )}
                  {p.wideClipUrl && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted">광각</p>
                      <ClipPlayer
                        src={p.wideClipUrl}
                        eventSec={p.wideClipEventSec}
                        zoneRect={null}
                        zone={p.zone}
                        cameraPos={cameraPos}
                        showZone={false}
                        maxHeight="45dvh"
                        className="rounded-xl bg-black"
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

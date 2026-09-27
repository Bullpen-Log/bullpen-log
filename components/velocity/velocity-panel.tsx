'use client';

import Link from 'next/link';
import { Camera, ChevronRight } from 'lucide-react';
import type { CalFit } from '@/lib/velocity-calibration';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  sessionSetupText,
  summarize,
  zoneLabel,
  type VelocitySessionView,
} from '@/lib/velocity-meta';
import { setupSummary } from '@/lib/velocity-setup';
import { formatSpeed, speedLabel, toSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { VelocityWordmark } from './velocity-logo';
import { VelocitySettingsButton, useStoredSetup } from './velocity-settings';
import { ZoneGrid } from './pitch-editor';

/**
 * 투구 기록 탭의 [구속 측정] 보기 — 불펜 벨로시티.
 *
 * 로고, 측정 시작(/velocity/measure), 설정, 오늘 카메라로 잰 것과 오늘 투구 기록의 간단한 숫자,
 * 마지막 세션의 공들. 앱 안이거나 관리자일 때만 이 보기가 있다(app/(app)/videos/page.tsx).
 */
export type TodayLogSummary = {
  entries: number;
  pitches: number;
  maxVelocity: number | null;
  rested: boolean;
};

export function VelocityPanel({
  today,
  sessions,
  todayLog,
  calibration,
  webTest,
}: {
  today: string;
  sessions: VelocitySessionView[];
  todayLog: TodayLogSummary;
  calibration: CalFit;
  /** 관리자가 웹에서 보는 중 — 실제 측정은 앱에서라고 적는다 */
  webTest: boolean;
}) {
  const unit = useSpeedUnit();
  const stored = useStoredSetup();
  const pitches = sessions.flatMap((s) => s.pitches);
  const stats = summarize(pitches);
  const lastSession = sessions[sessions.length - 1] ?? null;
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;
  const [, m, d] = today.split('-').map(Number);

  return (
    /*
     * 폰 느낌 — PC(desk)에서도 390px 폰 틀 안에 세로로 쌓아 보인다(사용자 요청: 관리자가 PC 에서
     * 확인할 때도 모바일처럼). ui-chrome 은 PC 의 작아진 크기 기준을 쓰지 않고 폰 크기 그대로.
     */
    <div className="ui-chrome space-y-4 desk:mx-auto desk:w-[24.375rem] desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:bg-page desk:p-4 desk:shadow-2xl">
      {/* 로고 · 시작 · 설정 */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <VelocityWordmark />
          <VelocitySettingsButton
            calibration={calibration}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-ink transition-colors hover:border-sky hover:text-sky [&>svg]:h-4.5 [&>svg]:w-4.5"
          />
        </div>
        <p className="px-5 pt-3 text-sm leading-relaxed text-muted">
          폰 카메라로 재는 구속. 릴리스 포인트를 표적에 대고 던지면 구속 · 릴리스 포인트
          · 코스를 남겨요.
        </p>
        <div className="px-5 pb-5 pt-4">
          <Link
            href="/velocity/measure"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-strong"
          >
            <Camera aria-hidden className="h-5 w-5" />
            측정 시작
          </Link>
          <p className="mt-2 text-center text-xs text-muted">
            {stored
              ? `지난 설정: ${setupSummary(stored)} — 시작하면 그대로 쓸지 물어요`
              : '처음이면 무엇을 어디서 잴지부터 물어요'}
          </p>
          {webTest && (
            <p className="mt-1 text-center text-xs leading-snug text-warn">
              웹 시험 모드(관리자) — 실제 측정은 앱의 고속 촬영으로. 일반 계정에는 이
              보기가 없어요.
            </p>
          )}
        </div>
      </section>

      <div className="space-y-4">
        {/* 오늘 */}
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-bold text-ink">
              오늘 · {m}월 {d}일
            </p>
            <Link
              href={`/pitch-log/${today}`}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky"
            >
              자세히
              <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
          {stats ? (
            <dl className="grid grid-cols-4 divide-x divide-line">
              <Stat label="최고" value={speedNum(stats.max)} unit={speedLabel(unit)} />
              <Stat label="평균" value={speedNum(stats.avg)} unit={speedLabel(unit)} />
              <Stat label="잰 공" value={stats.n} unit="구" />
              <Stat
                label="스트라이크"
                value={stats.strikeRate == null ? '—' : stats.strikeRate}
                unit={stats.strikeRate == null ? '' : '%'}
              />
            </dl>
          ) : (
            <p className="px-4 py-5 text-center text-sm text-muted">
              오늘 카메라로 잰 공이 아직 없어요.
            </p>
          )}
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            {todayLog.rested
              ? '오늘은 쉬는 날로 남겼어요.'
              : todayLog.entries > 0
                ? `오늘 투구 기록 ${todayLog.entries}건 · 총 ${todayLog.pitches}구${
                    todayLog.maxVelocity != null
                      ? ` · 최고 ${formatSpeed(todayLog.maxVelocity, unit)}`
                      : ''
                  }`
                : '오늘 투구 기록이 아직 없어요. 재고 저장하면 여기에 쌓여요.'}
            {stats?.spreadCm != null && ` · 릴리스 흩어짐 ${stats.spreadCm}cm`}
          </p>
        </section>

        {/* 마지막 세션 */}
        {lastSession && lastSession.pitches.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
              마지막 세션 · {sessionSetupText(lastSession)} ·{' '}
              {lastSession.pitches.length}구
              {sessions.length > 1 && ` (오늘 ${sessions.length}세션)`}
            </p>
            <ul className="divide-y divide-line">
              {lastSession.pitches.slice(-6).map((p) => (
                <li key={p.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="w-5 text-xs text-muted tabular-nums">{p.seq}</span>
                  <span className="text-display w-14 text-xl leading-none tabular-nums text-ink">
                    {speedNum(p.kmh)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {pitchTypeLabel(p.pitchType) ?? (
                        <span className="text-muted">구종 —</span>
                      )}
                      {p.result === 'strike' && (
                        <span className="ml-1.5 text-ok">S</span>
                      )}
                      {p.result === 'ball' && (
                        <span className="ml-1.5 text-warn">B</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {zoneLabel(p.zone) ?? '코스 —'} · {CONFIDENCE_TEXT[p.confidence]}
                    </span>
                  </span>
                  <ZoneGrid value={p.zone} size="sm" />
                </li>
              ))}
            </ul>
            <Link
              href={`/pitch-log/${today}`}
              className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-sky"
            >
              공마다 고치기 · 지우기는 그날 화면에서
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="px-2 py-3 text-center">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-display mt-0.5 text-2xl leading-none tabular-nums text-ink">
        {value}
        {unit && <span className="ml-0.5 font-sans text-xs text-muted">{unit}</span>}
      </dd>
    </div>
  );
}

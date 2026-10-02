'use client';

import { useMemo } from 'react';
import { Loader2, Play, Target, Trash2 } from 'lucide-react';
import { speedLabel, toSpeed, type SpeedUnit } from '@/lib/units';
import { PITCH_TYPES, pitchTypeLabel, summarize, zoneLabel } from '@/lib/velocity-meta';
import { Panel, SectionLabel, StatRow } from './kit';
import { ZoneGrid } from './pitch-editor';
import { PrimaryButton } from './setup-steps';
import { SpinAxisGraphic } from './spin-axis';
import type { SessionPitch, ThrowingHand } from './session-types';

/**
 * 세션 요약 — 가운데 아래 '세션 종료'를 누르면 카메라 대신 폰 틀 안을 채운다.
 *
 * 설정 단계 화면들과 같은 밝은 톤(bg-page)이다. 측정 중 정보 판은 카메라 위에 얹혀 어둡지만,
 * 여기는 카메라가 없으니 앱의 다른 화면과 같은 얼굴로 돌아온다. 위에서부터 숫자 → 구종별 →
 * 흐름 → 릴리스 → 공 목록 순서로, 맨 밑에는 '계속 재기 · 저장' 두 단추가 붙어 있다.
 *
 * 값은 km/h 로 오고 단위 바꾸기는 여기서 한다(부르는 쪽은 unit 만 넘긴다). 저장 · 이어 재기 ·
 * 영상 · 편집은 부르는 쪽(velocity-screen.tsx)이 시트를 열거나 상태를 바꾼다 — 이 화면은 그리기만.
 */
export function SessionSummary({
  pitches,
  unit,
  hand,
  date,
  setupText,
  calibrationText,
  onSave,
  onContinue,
  onPlayClip,
  onEditPitch,
  onDeletePitch,
  saving = false,
}: {
  /** 이미 seq 차례 */
  pitches: SessionPitch[];
  unit: SpeedUnit;
  hand: ThrowingHand;
  /** YYYY-MM-DD */
  date: string;
  /** '투구 · 투수 뒤 · 네트 있음' */
  setupText: string;
  /** '보정 y = 1.02x + 0.4' 같은 것. 없으면 '보정 없음'으로 보인다 */
  calibrationText: string | null;
  /** '세션 저장하기' — 부르는 쪽이 저장 시트를 연다 */
  onSave: () => void;
  /** '구속 측정하기' — 같은 세션을 이어 잰다 */
  onContinue: () => void;
  onPlayClip: (id: number) => void;
  onEditPitch: (id: number) => void;
  /** 있으면 줄마다 지우기 단추가 붙는다 */
  onDeletePitch?: (id: number) => void;
  saving?: boolean;
}) {
  const unitText = speedLabel(unit);
  /* km/h → 보는 단위, 소수 1자리. 측정 화면 · 그날 화면의 speedNum 과 같은 셈 */
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;

  const stats = useMemo(() => summarize(pitches), [pitches]);
  const byType = useMemo(() => groupByType(pitches), [pitches]);
  const empty = pitches.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page text-ink motion-safe:animate-fade-in">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4 short:pt-3">
        {/* (1) 머리 */}
        <header>
          <h2 className="text-heading text-2xl leading-tight">세션 요약</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {formatDate(date)} · {setupText} · {pitches.length}구
          </p>
          <p className="mt-0.5 text-xs text-muted">{calibrationText ?? '보정 없음'}</p>
        </header>

        {empty ? (
          <EmptyState />
        ) : (
          stats && (
            <div className="mt-5 space-y-5 short:mt-4">
              {/* (2) 숫자 줄 */}
              <Panel>
                <StatRow
                  items={[
                    { label: '최고', value: speedNum(stats.max), unit: unitText },
                    { label: '평균', value: speedNum(stats.avg), unit: unitText },
                    { label: '공', value: stats.n, unit: '구' },
                    {
                      label: '스트라이크',
                      value: stats.strikeRate == null ? '—' : stats.strikeRate,
                      unit: stats.strikeRate == null ? undefined : '%',
                    },
                  ]}
                />
              </Panel>

              {/* (3) 구종별 */}
              <section>
                <SectionLabel
                  action={
                    <span className="text-xs text-muted">공 수 · 평균 · 최고</span>
                  }
                >
                  구종별
                </SectionLabel>
                <Panel>
                  <ul className="divide-y divide-line">
                    {byType.map((g) => (
                      <li
                        key={g.key ?? 'none'}
                        className="flex min-h-14 items-center gap-3 px-4 py-2"
                      >
                        <SpinAxisGraphic
                          pitchType={g.key}
                          hand={hand}
                          size={40}
                          tone="light"
                          showLabel={false}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {pitchTypeLabel(g.key) ?? (
                              <span className="text-muted">구종 —</span>
                            )}
                          </span>
                          <span className="block text-xs text-muted">{g.n}구</span>
                        </span>
                        <span className="text-right">
                          <span className="text-display block text-xl leading-none tabular-nums">
                            {speedNum(g.avg)}
                            <span className="ml-0.5 font-sans text-xs text-muted">
                              {unitText}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs tabular-nums text-muted">
                            최고 {speedNum(g.max)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </section>

              {/* (4) 구속 흐름 */}
              <section>
                <SectionLabel
                  action={
                    <span className="text-xs text-muted">1구 → {pitches.length}구</span>
                  }
                >
                  구속 흐름
                </SectionLabel>
                <Panel className="px-4 pb-3 pt-4">
                  <SpeedBars
                    pitches={pitches}
                    max={stats.max}
                    label={`구속 흐름 — ${pitches.length}구, 최고 ${speedNum(stats.max)} ${unitText}, 평균 ${speedNum(stats.avg)} ${unitText}`}
                  />
                  <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
                    <span>{speedNum(pitches[0].kmh)}</span>
                    <span>{speedNum(pitches[pitches.length - 1].kmh)}</span>
                  </div>
                </Panel>
              </section>

              {/* (5) 릴리스 포인트 — 두 공 넘게 잡혔을 때만(summarize 가 spreadCm 을 준다) */}
              {stats.spreadCm != null && (
                <section>
                  <SectionLabel>릴리스 포인트</SectionLabel>
                  <Panel className="flex items-center gap-4 px-4 py-3">
                    <ReleaseScatter pitches={pitches} spreadCm={stats.spreadCm} />
                    <div className="min-w-0 flex-1">
                      <p className="text-display text-2xl leading-none tabular-nums">
                        {stats.spreadCm}
                        <span className="ml-0.5 font-sans text-xs text-muted">cm</span>
                      </p>
                      <p className="mt-1 text-sm font-semibold">릴리스 흩어짐</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        표적 십자 기준, 공마다 놓는 자리. 모일수록 같은 팔 위치에서 던진
                        거예요.
                      </p>
                    </div>
                  </Panel>
                </section>
              )}

              {/* (6) 공 목록 */}
              <section>
                <SectionLabel
                  action={
                    <span className="text-xs text-muted">
                      누르면 구종 · 코스를 고쳐요
                    </span>
                  }
                >
                  공 목록
                </SectionLabel>
                <Panel>
                  <ul className="divide-y divide-line">
                    {pitches.map((p) => (
                      <li
                        key={p.id}
                        className="flex min-h-14 items-center gap-2 pl-4 pr-2"
                      >
                        <button
                          type="button"
                          onClick={() => onEditPitch(p.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left transition-opacity active:opacity-60"
                        >
                          <span className="w-5 text-xs tabular-nums text-muted">
                            {p.seq}
                          </span>
                          <span className="text-display w-16 text-2xl leading-none tabular-nums text-ink">
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
                              {zoneLabel(p.zone) ?? '코스 —'}
                              {p.releaseKmh != null &&
                                ` · 릴리스 ${speedNum(p.releaseKmh)}`}
                              {p.gunKmh != null && ` · 건 ${speedNum(p.gunKmh)}`}
                              {p.source === 'file' && ' · 파일'}
                            </span>
                          </span>
                          {/* onChange 없이 두면 span 으로 그려져 button 안에 둬도 된다(pitch-editor.tsx) */}
                          <ZoneGrid value={p.zone} size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPlayClip(p.id)}
                          disabled={!p.clip}
                          aria-label={p.clip ? '영상 보기' : '영상 없음'}
                          title={p.clip ? '영상 보기' : '영상 없음'}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-sky-tint hover:text-sky disabled:opacity-40 disabled:hover:bg-surface-2 disabled:hover:text-ink"
                        >
                          <Play aria-hidden className="h-4 w-4 fill-current" />
                        </button>
                        {onDeletePitch && (
                          <button
                            type="button"
                            onClick={() => onDeletePitch(p.id)}
                            aria-label={`${p.seq}번째 공 지우기`}
                            title="이 공 지우기"
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                          >
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Panel>
              </section>
            </div>
          )
        )}
      </div>

      {/* (7) 맨 밑 고정 단추 — 설정 단계(StepShell)의 발과 같은 모양 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {empty ? (
          <PrimaryButton onClick={onContinue}>구속 측정하기</PrimaryButton>
        ) : (
          <>
            <PrimaryButton tone="quiet" onClick={onContinue} disabled={saving}>
              구속 측정하기
            </PrimaryButton>
            <PrimaryButton onClick={onSave} disabled={saving}>
              {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              세션 저장하기
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── 조각 ───────────────────────── */

/** 잰 공이 없을 때 — 단추는 아래 발에 하나만 남는다 */
function EmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Target aria-hidden className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">잰 공이 없어요</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        아래 &lsquo;구속 측정하기&rsquo;로 돌아가 던지면 여기에 쌓여요.
      </p>
    </div>
  );
}

/**
 * 구속 흐름 — 공 차례대로 막대. 최고를 100% 로 두고, 최고 공만 진하게.
 * 구종별로 색을 나누지 않는다 — 여기서 볼 것은 '뒤로 갈수록 떨어지나'이지 구종이 아니다.
 */
function SpeedBars({
  pitches,
  max,
  label,
}: {
  pitches: SessionPitch[];
  max: number;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="flex h-20 items-end gap-px">
      {pitches.map((p) => {
        const pct = max > 0 ? Math.max(4, (p.kmh / max) * 100) : 4;
        const top = p.kmh === max;
        return (
          <span
            key={p.id}
            style={{ height: `${pct}%` }}
            className={`min-w-0.5 flex-1 rounded-t-sm transition-[height] ${
              top ? 'bg-sky' : 'bg-sky/35'
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * 릴리스 포인트 흩뿌림 — 120×120, 가운데 십자가 표적(수평 · 표적 단계에서 맞춘 자리).
 * dx 는 오른쪽이 양수, dy 는 위가 양수(화면 y 는 아래가 양수라 뒤집는다). 가장 먼 점이 칸에
 * 들어오게 배율을 잡되, 다 붙어 있을 때 점이 터지지 않게 10cm 밑으로는 안 키운다.
 */
function ReleaseScatter({
  pitches,
  spreadCm,
}: {
  pitches: SessionPitch[];
  spreadCm: number;
}) {
  const points = pitches.filter(
    (p): p is SessionPitch & { releaseDxCm: number; releaseDyCm: number } =>
      p.releaseDxCm != null && p.releaseDyCm != null
  );
  const reach = Math.max(
    10,
    ...points.map((p) => Math.max(Math.abs(p.releaseDxCm), Math.abs(p.releaseDyCm)))
  );
  const C = 60;
  const R = 50;
  const k = R / reach;
  return (
    <svg
      viewBox="0 0 120 120"
      width={120}
      height={120}
      role="img"
      aria-label={`릴리스 포인트 — ${points.length}구, 흩어짐 ${spreadCm}cm`}
      className="shrink-0"
    >
      <circle
        cx={C}
        cy={C}
        r={R}
        className="fill-surface-2 stroke-line"
        strokeWidth={1}
      />
      <line
        x1={C}
        y1={C - R}
        x2={C}
        y2={C + R}
        className="stroke-line-strong"
        strokeWidth={1}
      />
      <line
        x1={C - R}
        y1={C}
        x2={C + R}
        y2={C}
        className="stroke-line-strong"
        strokeWidth={1}
      />
      <circle
        cx={C}
        cy={C}
        r={R / 2}
        className="fill-none stroke-line-strong"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      {points.map((p, i) => (
        <circle
          key={p.id}
          cx={C + p.releaseDxCm * k}
          cy={C - p.releaseDyCm * k}
          r={i === points.length - 1 ? 4.5 : 3.5}
          className={i === points.length - 1 ? 'fill-sky' : 'fill-sky/60'}
        />
      ))}
    </svg>
  );
}

/* ───────────────────────── 셈 ───────────────────────── */

/** 구종별 공 수 · 평균 · 최고. PITCH_TYPES 차례로, 구종 없는 공은 맨 뒤 */
function groupByType(pitches: SessionPitch[]) {
  const map = new Map<string | null, number[]>();
  for (const p of pitches) {
    const key = pitchTypeLabel(p.pitchType) ? p.pitchType : null;
    const arr = map.get(key);
    if (arr) arr.push(p.kmh);
    else map.set(key, [p.kmh]);
  }
  const order: (string | null)[] = [...PITCH_TYPES.map((t) => t.key as string), null];
  return order
    .filter((key) => map.has(key))
    .map((key) => {
      const kmhs = map.get(key) as number[];
      return {
        key,
        n: kmhs.length,
        avg: kmhs.reduce((s, v) => s + v, 0) / kmhs.length,
        max: Math.max(...kmhs),
      };
    });
}

/** 'YYYY-MM-DD' → '9월 28일 (일)'. new Date('YYYY-MM-DD') 는 UTC 자정이라 시간대에 따라 하루 어긋나 직접 쪼갠다 */
function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const day = ['일', '월', '화', '수', '목', '금', '토'][
    new Date(y, m - 1, d).getDay()
  ];
  return `${m}월 ${d}일 (${day})`;
}

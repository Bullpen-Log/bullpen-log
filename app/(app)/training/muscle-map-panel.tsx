'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import {
  ARMCARE_AREAS,
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  muscleInfo,
  type ArmcareAreaKey,
} from '@/lib/armcare/anatomy';
import { MUSCLE_MODEL, careLevel } from '@/lib/armcare/muscle-map';
import { MuscleMap3D, type MapSelection, type MapStatus } from './muscle-map-3d';
import { AddToRoutine } from './add-to-routine';
import type { ArmcareExerciseView } from './armcare-media';

/** 내 기록 색칠에서 부위 단추의 모양 */
const CARE_CHIP = {
  low: 'border-warn-line bg-warn-bg text-warn',
  mid: 'border-line bg-surface text-ink',
  good: 'border-line bg-surface text-ink',
} as const;

/**
 * 부위별 보강 맨 위의 3D 근육 지도 — 캔버스와 부위 단추, 고른 것의 설명.
 *
 * 2026-09-26 시험판을 사용자분이 보고 앱에 넣었다. 부위를 고르면 역할·근육·흔한 부상,
 * 근육까지 고르면 하는 일·붙는 곳·이루는 근육·키우는 운동이 캔버스 바로 밑에 나온다.
 * 캔버스와 설명을 붙여 두는 것은, 아래 목록까지 내려가면 3D 가 화면 밖으로 나가 무엇이
 * 켜졌는지 안 보이기 때문이다. 부위의 운동을 다 보려면 아래 목록을 연다(onShowArea).
 *
 * 3D 를 못 그리는 기기에서는 캔버스 자리만 접는다 — 부위 단추와 설명은 그대로 쓴다.
 */
export function MuscleMapPanel({
  side: accountSide,
  bothHands,
  counts,
  exercises,
  initial,
  onShowArea,
}: {
  /** 던지는 팔 — 계정의 던지는 손에서 */
  side: 'right' | 'left';
  /** 양투 — 좌우를 고를 수 있게 한다 */
  bothHands: boolean;
  /** 부위별 최근 2주 암케어 체크 수 */
  counts: Record<ArmcareAreaKey, number>;
  exercises: ArmcareExerciseView[];
  /** 루틴의 '근육 위치'로 들어오면 그 근육이 켜진 채로 시작한다 */
  initial: MapSelection;
  /** 이 부위의 운동을 아래 목록에서 모두 보기 */
  onShowArea: (area: ArmcareAreaKey) => void;
}) {
  const [selection, setSelection] = useState<MapSelection>(initial);
  const [log, setLog] = useState(false);
  const [side, setSide] = useState(accountSide);
  const [status, setStatus] = useState<MapStatus>('loading');

  const area = findArmcareArea(selection.area);
  const pick = (next: MapSelection) => setSelection(next);

  return (
    <section className="space-y-3" aria-label="3D 근육 지도">
      {status !== 'unavailable' && (
        <div className="h-[min(52vh,460px)] min-h-[320px] overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface to-surface-2">
          <MuscleMap3D
            side={side}
            selection={selection}
            counts={log ? counts : null}
            onPick={pick}
            onStatus={setStatus}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-xl border border-line bg-surface p-0.5"
          role="group"
          aria-label="보기"
        >
          {(
            [
              [false, '부위 보기'],
              [true, '내 기록 색칠'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={log === value}
              onClick={() => setLog(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                log === value ? 'bg-sky text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {bothHands && (
          <div
            className="inline-flex rounded-xl border border-line bg-surface p-0.5"
            role="group"
            aria-label="던지는 팔"
          >
            {(
              [
                ['right', '오른팔'],
                ['left', '왼팔'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={side === value}
                onClick={() => setSide(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  side === value ? 'bg-sky text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="부위 고르기">
        {ARMCARE_AREAS.map((a) => {
          const on = selection.area === a.key;
          const level = careLevel(counts[a.key] ?? 0);
          return (
            <button
              key={a.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                pick(
                  on
                    ? { area: null, muscle: null, part: null }
                    : { area: a.key, muscle: null, part: null }
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on
                  ? 'border-sky bg-sky-tint text-sky-strong'
                  : log
                    ? CARE_CHIP[level]
                    : 'border-line bg-surface text-ink hover:border-sky'
              }`}
            >
              {a.label}
              {log && level === 'low' && ' · 챙길 곳'}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 rounded-2xl border border-line bg-surface px-4 py-4">
        {!area ? (
          <>
            <p className="text-[15px] font-bold text-ink">던지는 팔의 암케어 근육</p>
            <p className="text-[13px] leading-relaxed break-keep text-muted">
              {log
                ? '최근 2주 동안 암케어로 체크한 운동을 부위마다 셌습니다. 노란 곳이 적게 챙긴 부위입니다(0~1번).'
                : `붉은색이 암케어로 키우는 근육 ${ARMCARE_MUSCLES.length}개입니다. 근육을 누르거나 위의 부위를 고르면 그 부위만 또렷하게 남고, 한 번 더 누르면 그 근육을 자세히 봅니다.`}
            </p>
            {log && (
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <Legend color="bg-[#f59e0b]">0~1번 · 챙길 곳</Legend>
                <Legend color="bg-[#8fd3c4]">2~4번</Legend>
                <Legend color="bg-[#2f9e8f]">5번 이상</Legend>
              </p>
            )}
          </>
        ) : selection.muscle ? (
          <MuscleDetail
            areaLabel={area.label}
            muscle={selection.muscle}
            part={selection.part}
            exercises={exercises}
            onBack={() => pick({ area: area.key, muscle: null, part: null })}
            onShowArea={() => onShowArea(area.key)}
          />
        ) : (
          <>
            <p className="text-[15px] font-bold text-ink">{area.label}</p>
            <p className="text-[13px] leading-relaxed break-keep text-muted">
              {area.role}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ARMCARE_MUSCLES.filter((m) => m.area === area.key).map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => pick({ area: area.key, muscle: m.name, part: null })}
                  className="rounded-full bg-sky-tint px-2.5 py-1 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white"
                >
                  {m.name} ›
                </button>
              ))}
            </div>
            <p className="text-xs break-keep text-muted">
              흔한 부상: {area.injuries.map((i) => i.name).join(' · ')}
            </p>
            {log && (
              <p
                className={`text-xs font-semibold ${
                  careLevel(counts[area.key] ?? 0) === 'low'
                    ? 'text-warn'
                    : 'text-sky-strong'
                }`}
              >
                최근 2주 {counts[area.key] ?? 0}번 챙김
                {careLevel(counts[area.key] ?? 0) === 'low' &&
                  ' — 이번 주에 먼저 챙겨 보세요'}
              </p>
            )}
            <ShowAreaButton label={area.label} onClick={() => onShowArea(area.key)} />
          </>
        )}
      </div>

      <p className="px-1 text-[11px] leading-relaxed break-keep text-muted">
        3D 모델: Z-Anatomy · BodyParts3D (Fit Mit With 판) —{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          CC BY-SA 4.0
        </a>
        . 상체만 남겨 줄이고 색을 입혔습니다(
        <a
          href="/models/ATTRIBUTION.txt"
          target="_blank"
          className="underline underline-offset-2"
        >
          출처와 바꾼 점
        </a>
        ).
      </p>
    </section>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {children}
    </span>
  );
}

function ShowAreaButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-strong underline underline-offset-2"
    >
      {label} 운동 모두 보기
      <ArrowDown aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}

function MuscleDetail({
  areaLabel,
  muscle,
  part,
  exercises,
  onBack,
  onShowArea,
}: {
  areaLabel: string;
  muscle: string;
  part: string | null;
  exercises: ArmcareExerciseView[];
  onBack: () => void;
  onShowArea: () => void;
}) {
  const info = muscleInfo(muscle);
  const parts = MUSCLE_MODEL[muscle]?.parts ?? {};
  const partNames = [...new Set(Object.values(parts))];
  const here = part ? parts[part] : null;
  const primary = exercises.filter((ex) => ex.targetMuscles[0] === muscle);
  const other = exercises.filter(
    (ex) => ex.targetMuscles[0] !== muscle && ex.targetMuscles.includes(muscle)
  );
  const shown = primary.slice(0, 5);

  return (
    <>
      <p className="flex flex-wrap items-center gap-1.5 text-[15px]">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-semibold text-sky-strong underline underline-offset-2"
        >
          {areaLabel}
        </button>
        <span className="text-muted">›</span>
        <b className="text-ink">{muscle}</b>
      </p>
      {info && (
        <p className="text-[13px] font-semibold break-keep text-ink">{info.does}</p>
      )}
      <dl className="grid grid-cols-[5.5em_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-relaxed">
        {info && (
          <>
            <dt className="font-semibold text-sky-strong">붙는 곳</dt>
            <dd className="break-keep text-muted">{info.at}</dd>
          </>
        )}
        {partNames.length > 1 && (
          <>
            <dt className="font-semibold text-sky-strong">이루는 근육</dt>
            <dd className="break-keep text-muted">
              {partNames.map((p, i) => (
                <span key={p}>
                  {i > 0 && ' · '}
                  {p === here ? (
                    <b className="rounded bg-sky-tint px-1 text-ink">{p}</b>
                  ) : (
                    p
                  )}
                </span>
              ))}
            </dd>
          </>
        )}
        <dt className="font-semibold text-sky-strong">예방에 도움</dt>
        <dd className="break-keep text-muted">
          {info?.helps ?? '— 근거가 분명한 부상이 없어 적지 않습니다'}
        </dd>
      </dl>
      <div className="space-y-1.5 border-t border-line pt-2.5">
        <p className="text-xs font-semibold text-muted">
          이 근육을 주로 키우는 운동 {primary.length}개
          {other.length > 0 && ` · 함께 쓰는 운동 ${other.length}개`}
        </p>
        {shown.length > 0 ? (
          <ul className="space-y-1.5">
            {shown.map((ex) => (
              <li
                key={ex.id}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="min-w-0 break-keep text-ink">
                  {ex.title}
                  {ex.prescription && (
                    <span className="block text-[11px] text-muted">
                      {ex.prescription}
                    </span>
                  )}
                </span>
                <AddToRoutine exerciseId={ex.id} title={ex.title} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">
            주로 키우는 운동은 아직 없습니다 — 함께 쓰는 운동으로 챙겨 주세요.
          </p>
        )}
        <ShowAreaButton label={areaLabel} onClick={onShowArea} />
      </div>
    </>
  );
}

/** 루틴의 '근육 위치'로 넘어온 근육 → 처음 고른 것 */
export function selectionFor(muscle: string | null | undefined): MapSelection {
  const area = muscle ? areaOfMuscle(muscle)?.key : undefined;
  return area && muscle
    ? { area, muscle, part: null }
    : { area: null, muscle: null, part: null };
}

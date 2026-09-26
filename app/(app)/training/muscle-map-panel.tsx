'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown, ChevronRight } from 'lucide-react';
import {
  ARMCARE_AREAS,
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  muscleInfo,
  type ArmcareAreaKey,
} from '@/lib/armcare/anatomy';
import { careLevel } from '@/lib/armcare/muscle-map';
import { MuscleMap3D, type MapSelection, type MapStatus } from './muscle-map-3d';
import { AddToRoutine } from './add-to-routine';
import { INFO_PILL, InfoButton } from './armcare-info';
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
 * 2026-09-26 시험판을 사용자분이 보고 앱에 넣었다. 부위를 고르면 근육·흔한 부상,
 * 근육까지 고르면 하는 일 한 줄과 키우는 운동 사진이 캔버스 바로 밑에 나온다. 자세한
 * 설명(던질 때·왜 중요한가·붙는 곳 등)은 '자세히 보기' 창으로 연다(armcare-info.tsx).
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
              <span
                aria-hidden
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: a.color }}
              />
              {a.label}
              {log && level === 'low' && ' · 챙길 곳'}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 rounded-2xl border border-line bg-surface px-4 py-4">
        {!area ? (
          <>
            <p className="text-[13px] break-keep text-muted">
              {log
                ? '최근 2주에 챙긴 횟수예요 — 노란 곳이 적게 챙긴 부위.'
                : `암케어 근육 ${ARMCARE_MUSCLES.length}개 · 누르면 부위, 한 번 더 누르면 근육`}
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
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: area.color }}
              />
              <b className="min-w-0 flex-1 text-[15px] text-ink">{area.label}</b>
              <InfoButton
                target={{ kind: 'area', key: area.key }}
                className={INFO_PILL}
              >
                자세히 보기
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </InfoButton>
            </div>
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
            <div className="flex flex-wrap gap-1.5">
              {area.injuries.map((i) => (
                <span
                  key={i.name}
                  className="rounded-full border border-warn-line bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn"
                >
                  {i.name}
                </span>
              ))}
            </div>
            {log && (
              <p
                className={`text-xs font-semibold ${
                  careLevel(counts[area.key] ?? 0) === 'low'
                    ? 'text-warn'
                    : 'text-sky-strong'
                }`}
              >
                최근 2주 {counts[area.key] ?? 0}번 챙김
              </p>
            )}
            <ShowAreaButton label={area.label} onClick={() => onShowArea(area.key)} />
          </>
        )}
      </div>

      <p className="px-1 text-[11px] text-muted">
        3D: Z-Anatomy · BodyParts3D ·{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          CC BY-SA 4.0
        </a>{' '}
        ·{' '}
        <a
          href="/models/ATTRIBUTION.txt"
          target="_blank"
          className="underline underline-offset-2"
        >
          출처
        </a>
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
  /* 주로 키우는 운동 먼저, 함께 쓰는 운동 뒤에 — 사진 줄로 */
  const primary = exercises.filter((ex) => ex.targetMuscles[0] === muscle);
  const other = exercises.filter(
    (ex) => ex.targetMuscles[0] !== muscle && ex.targetMuscles.includes(muscle)
  );
  const shown = [...primary, ...other].slice(0, 8);

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
      {/*
        한 줄(하는 일) 옆에 '자세히 보기' — 누르면 어떤 근육인지·던질 때·왜 중요한가·키우는
        법·붙는 곳이 창으로 뜬다(armcare-info.tsx). 2026-09-26 사용자분: "극하근을 누르면
        '팔을 바깥으로 돌림, 감속'이라고만 나오는데, 누르면 자세히 볼 수 있게".
      */}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 pt-1 text-[13px] font-semibold break-keep text-ink">
          {info?.does}
        </p>
        <InfoButton
          target={{ kind: 'muscle', name: muscle, part }}
          className={INFO_PILL}
        >
          자세히 보기
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        </InfoButton>
      </div>

      {/* 운동은 글 목록이 아니라 사진 줄로 — 무엇을 하는 운동인지 사진이 더 빨리 보인다 */}
      {shown.length > 0 ? (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {shown.map((ex) => (
            <li key={ex.id} className="w-28 shrink-0 snap-start space-y-1">
              {ex.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ex.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full rounded-lg object-cover ring-1 ring-line"
                />
              ) : (
                <span className="block aspect-video w-full rounded-lg bg-surface-2 ring-1 ring-line" />
              )}
              <span className="line-clamp-2 block text-xs leading-snug font-semibold break-keep text-ink">
                {ex.title}
              </span>
              <AddToRoutine exerciseId={ex.id} title={ex.title} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">이 근육을 쓰는 운동이 아직 없어요.</p>
      )}

      <ShowAreaButton label={areaLabel} onClick={onShowArea} />
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

'use client';

import { useState } from 'react';
import { ArrowDown, ChevronRight } from 'lucide-react';
import {
  ARMCARE_AREAS,
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  muscleInfo,
  type ArmcareAreaKey,
} from '@/lib/armcare/anatomy';
import { ModelCredit } from '@/components/model-credit';
import { Segmented } from '@/components/segmented';
import { MuscleMap3D, type MapSelection, type MapStatus } from './muscle-map-3d';
import { AddToRoutine } from './add-to-routine';
import { INFO_PILL, InfoButton } from './armcare-info';
import type { ArmcareExerciseView } from './armcare-media';

const SIDE_OPTIONS = [
  { value: 'right', label: '오른팔' },
  { value: 'left', label: '왼팔' },
] as const;

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
 *
 * 최근 2주에 부위마다 몇 번 챙겼는지 칠해 보는 '내 기록 색칠'도 있었는데, 2026-09-26
 * 사용자분이 없앴다(이름이 어색하고, 맞춤 루틴에 일부러 안 넣는 팔꿈치 후방·전방이 늘
 * '챙길 곳'으로 떴다).
 */
export function MuscleMapPanel({
  side,
  onSide,
  bothHands,
  exercises,
  initial,
  onShowArea,
}: {
  /**
   * 볼 팔 — 처음은 계정의 던지는 손. 부모(armcare-guide.tsx)가 쥔다: 양투가 왼팔로 바꾸면
   * 아래 부위 카드와 '자세히 보기' 창의 3D 도 왼팔로 연다.
   */
  side: 'right' | 'left';
  onSide: (side: 'right' | 'left') => void;
  /** 양투 — 좌우를 고를 수 있게 한다 */
  bothHands: boolean;
  exercises: ArmcareExerciseView[];
  /** 루틴의 '근육 위치'로 들어오면 그 근육이 켜진 채로 시작한다 */
  initial: MapSelection;
  /** 이 부위의 운동을 아래 목록에서 모두 보기 */
  onShowArea: (area: ArmcareAreaKey) => void;
}) {
  const [selection, setSelection] = useState<MapSelection>(initial);
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
            onPick={pick}
            onStatus={setStatus}
          />
        </div>
      )}

      {bothHands && (
        <div className="flex">
          <Segmented
            label="던지는 팔"
            value={side}
            onChange={onSide}
            options={SIDE_OPTIONS}
            layout="flow"
            tone="raised"
            itemClassName="px-3 py-1.5"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="부위 고르기">
        {ARMCARE_AREAS.map((a) => {
          const on = selection.area === a.key;
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
                  : 'border-line bg-surface text-ink hover:border-sky'
              }`}
            >
              <span
                aria-hidden
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: a.color }}
              />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 rounded-2xl border border-line bg-surface px-4 py-4">
        {!area ? (
          <p className="text-[13px] break-keep text-muted">
            암케어 근육 {ARMCARE_MUSCLES.length}개 · 누르면 부위, 한 번 더 누르면 근육
          </p>
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
            <ShowAreaButton label={area.label} onClick={() => onShowArea(area.key)} />
          </>
        )}
      </div>

      <ModelCredit className="px-1" />
    </section>
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

/** 근육 칸의 사진 줄에 놓는 운동 수 — 더 있으면 끝에 '+N'(부위 운동 모두 보기로) */
const PHOTO_MAX = 8;

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
  const all = [...primary, ...other];
  const shown = all.slice(0, PHOTO_MAX);
  const more = all.length - shown.length;

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

      {/*
        운동은 글 목록이 아니라 사진 줄로 — 무엇을 하는 운동인지 사진이 더 빨리 보인다.
        몇 개인지, 어느 것이 함께 쓰는 운동인지도 적는다. 예전에는 여덟 개에서 말없이
        잘려, 스무 개가 넘는 근육도 여덟 개뿐인 줄 알았다(2026-09-26 검토).
      */}
      {shown.length > 0 && (
        <p className="text-xs text-muted">
          {[
            primary.length > 0 && `주로 키우는 운동 ${primary.length}개`,
            other.length > 0 && `함께 쓰는 운동 ${other.length}개`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
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
              {/* 섞여 있을 때만 — 전부 함께 쓰는 운동이면 위 줄이 이미 말한다 */}
              {primary.length > 0 && ex.targetMuscles[0] !== muscle && (
                <span className="block text-[10px] font-medium text-muted">
                  함께 쓰는 운동
                </span>
              )}
              <AddToRoutine exerciseId={ex.id} title={ex.title} />
            </li>
          ))}
          {more > 0 && (
            <li className="w-20 shrink-0 snap-start">
              <button
                type="button"
                onClick={onShowArea}
                aria-label={`${areaLabel} 운동 모두 보기 — ${more}개 더`}
                className="grid aspect-video w-full place-items-center rounded-lg bg-surface-2 text-sm font-bold text-sky-strong ring-1 ring-line transition-colors hover:bg-sky-tint"
              >
                +{more}
              </button>
            </li>
          )}
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

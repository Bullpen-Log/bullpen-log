'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { ExerciseBadges } from '@/components/meta-badges';
import {
  ARMCARE_AREAS,
  ARMCARE_MUSCLES,
  areaOfMuscle,
  type ArmcareArea,
  type ArmcareAreaKey,
  type ArmcareJoint,
} from '@/lib/armcare/anatomy';
import { MuscleChips } from '@/components/muscle-chips';
import { ExerciseMedia, type ArmcareExerciseView } from './armcare-media';
import { AddToRoutine, MyRoutinesProvider, type RoutineChoice } from './add-to-routine';
import { MuscleMapPanel, selectionFor, type MapCoverage } from './muscle-map-panel';
import type { ArmPainLine } from '@/lib/armcare/coverage-load';
import { ArmcareInfoProvider, INFO_PILL, InfoButton } from './armcare-info';

/**
 * 부위별 보강 — 부위 → 흔한 부상 → 키울 근육 → 운동.
 *
 * 사용자분의 말 그대로다: "팔꿈치면 부상 부위가 정말 다양하잖아. 내측, 외측,
 * 어깨도 전방, 후방 … 보강운동별로 이거는 무슨 근육을 강화시켜서 어떤 부상을
 * 예방하는지 간편하게 접근할 수 있게."
 *
 * 부위를 누르면 그 자리에서 펼친다. 한 번에 하나만 — 다 펼쳐 두면 목록이 끝없이
 * 길어져 어디를 보고 있었는지 잃는다. 주소를 바꾸지 않는 것은 부위를 오가는 일이
 * 잦아서다. 누를 때마다 서버를 다녀오면 그만큼 느리다.
 *
 * 한 운동이 여러 부위에 나온다(외회전 90도는 어깨 후방과 견갑). 그 부위를 주로
 * 키우는 운동을 앞에, 함께 쓰는 운동을 뒤에 둔다.
 *
 * 맨 위에는 3D 근육 지도가 선다(2026-09-26, muscle-map-panel.tsx). 지도에서 고른
 * 부위의 운동을 모두 보려고 하면 아래의 그 부위 카드를 열고 그 자리로 내려간다.
 *
 * 화면에는 이름·칩만 두고, 부위와 근육의 자세한 설명은 '자세히 보기' 창에 둔다
 * (armcare-info.tsx — 2026-09-26 사용자분: 겉은 단순하게, 누르면 자세히).
 */
export function ArmcareGuide({
  exercises,
  routines,
  map,
  coverage = null,
}: {
  /**
   * 내 팔 지도(2026-10-04) — 최근 2주 기록의 진하기 · 비어 있는 부위. 주면 3D 가 처음에 내 기록으로 칠해지고, 맨 위에
   * '2주째 비어 있어요'와 그 부위로 짠 10분 루틴(/armcare/play/focus) 단추가 선다(lib/armcare/coverage.ts).
   */
  coverage?:
    | (MapCoverage & {
        gaps: ArmcareAreaKey[];
        /** 여덟 부위를 모두 했나 — 칭찬은 이때만(아픈 곳을 빼서 권할 곳이 없어진 날과 가른다) */
        allCovered: boolean;
        dateKey: string;
        pain?: PainLine | null;
      })
    | null;
  exercises: ArmcareExerciseView[];
  /** 내 루틴 — 운동마다 '담기'로 넣을 곳 (add-to-routine.tsx) */
  routines: RoutineChoice[];
  /** 3D 근육 지도에 넘기는 것 */
  map: {
    side: 'right' | 'left';
    bothHands: boolean;
    /** 루틴의 '근육 위치'로 들어왔으면 그 근육 */
    focusMuscle: string | null;
  };
}) {
  const [open, setOpen] = useState<string | null>(null);
  /*
   * 볼 팔 — 양투는 3D 지도에서 바꿀 수 있다. 여기서 쥐어 '자세히 보기' 창(부위 카드에서
   * 연 것까지)도 같은 팔로 연다. 예전에는 지도에서만 바뀌고 창은 늘 오른팔이었다.
   *
   * 쥐는 것은 양투가 고른 팔뿐이고, 볼 팔은 그리는 때마다 계정 값(map.side)에서 셈한다.
   * 처음 값을 상태로 들고 있었더니, 이 화면을 연 채 내 정보에서 던지는 손을 바꾸면 3D 와
   * 창이 옛 팔로 남았다 — 좌투로 바꾸면 팔 고르기 칸도 사라져 되돌릴 수 없었다(2026-09-27 검토).
   */
  const [picked, setPicked] = useState<'right' | 'left' | null>(null);
  const side = map.bothHands ? (picked ?? map.side) : map.side;

  /* 지도에서 '이 부위 운동 모두 보기' — 그 카드를 열고 그 자리로 내려간다 */
  const showArea = (key: ArmcareAreaKey) => {
    setOpen(key);
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(`area-${key}`)
        ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
  };
  const untagged = exercises.filter((ex) => ex.targetMuscles.length === 0).length;

  const joints: ArmcareJoint[] = ['어깨', '팔꿈치'];

  return (
    <MyRoutinesProvider routines={routines}>
      <ArmcareInfoProvider side={side}>
        <div className="space-y-6">
          <p className="text-sm break-keep text-muted">
            근육을 누르거나 부위를 펼쳐 보세요.
          </p>

          {coverage?.pain && <PainNote pain={coverage.pain} onArea={showArea} />}
          {coverage && <GapCard coverage={coverage} />}

          <MuscleMapPanel
            side={side}
            onSide={setPicked}
            bothHands={map.bothHands}
            exercises={exercises}
            initial={selectionFor(map.focusMuscle)}
            onShowArea={showArea}
            coverage={coverage}
          />

          {joints.map((joint) => (
            <section key={joint} className="space-y-2.5">
              <h2 className="px-1 text-heading text-lg text-ink">{joint}</h2>
              <ul className="space-y-2.5">
                {ARMCARE_AREAS.filter((a) => a.joint === joint).map((area) => (
                  <AreaCard
                    key={area.key}
                    area={area}
                    exercises={exercisesFor(area, exercises)}
                    open={open === area.key}
                    onToggle={() => setOpen(open === area.key ? null : area.key)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <p className="px-1 text-xs break-keep text-muted">
            운동이 부상을 막아 준다는 보장은 없어요 — 아프면 쉬고 진료를 받으세요.
          </p>

          {untagged > 0 && (
            <p className="px-1 text-xs leading-relaxed text-muted">
              근육을 아직 적지 않은 암케어 운동 {untagged}개는 여기 나오지 않아요.
            </p>
          )}
        </div>
      </ArmcareInfoProvider>
    </MyRoutinesProvider>
  );
}

/** 오늘 · 어제 체크인의 팔 통증 — 자리 · 정도(lib/armcare/coverage-load.ts) */
type PainLine = ArmPainLine;

/**
 * 체크인에 남긴 팔 통증 — 누르면 그 부위 카드로(2026-10-04 '체크인과 잇기'). 정도 2 이상이면 보강보다 진료가 먼저라고
 * 함께 말한다(팔 통증 안내와 같은 기준 — 정도 2 · 3 은 진료 권유).
 */
function PainNote({ pain, onArea }: { pain: PainLine; onArea: (key: ArmcareAreaKey) => void }) {
  return (
    <div className="space-y-2 rounded-2xl border border-warn-line bg-warn-bg px-(--block-pad) py-3">
      <p className="flex items-start gap-1.5 text-sm font-semibold break-keep text-warn">
        <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {pain.when} 체크인: {pain.spots.map((s) => s.label).join(' · ')}
          {pain.levelLabel ? ` · ${pain.levelLabel}` : ''}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {pain.spots.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onArea(s.key)}
            className="inline-flex min-h-9 items-center gap-0.5 rounded-full bg-surface px-3 text-xs font-semibold text-warn"
          >
            {s.label} 보기
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      {pain.level != null && pain.level >= 2 && (
        <p className="text-xs leading-relaxed break-keep text-warn">
          평소에도 아프면 보강보다 진료가 먼저예요. 아픈 곳은 빈 곳 보강에서 뺐어요.
        </p>
      )}
    </div>
  );
}

/**
 * 2주째 비어 있는 부위 — 그 부위로 짠 10분 루틴으로 곧장. 던질 때 감속을 맡는 곳(어깨 후방 · 팔꿈치 내측)부터 권한다.
 * 기록이 하나도 없으면 '어디부터'로 그 둘을 권한다. 모두 챙겼으면 한 줄로 칭찬만.
 */
function GapCard({
  coverage,
}: {
  coverage: MapCoverage & { gaps: ArmcareAreaKey[]; allCovered: boolean; dateKey: string };
}) {
  const labels = coverage.gaps.map(
    (key) => ARMCARE_AREAS.find((a) => a.key === key)?.label ?? key
  );
  if (coverage.gaps.length === 0) {
    if (!coverage.allCovered) return null;
    return (
      <p className="flex items-center gap-1.5 rounded-2xl bg-surface px-(--block-pad) py-3 text-sm font-semibold break-keep text-app-armcare">
        <Check aria-hidden className="h-4 w-4 shrink-0" />
        최근 2주 동안 여덟 부위를 모두 챙겼어요
      </p>
    );
  }
  const decel = coverage.gaps.some((k) => k === 'shoulder-back' || k === 'elbow-inner');
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
      <div className="space-y-1">
        <p className="text-base font-bold break-keep text-ink">
          {coverage.total === 0 ? '최근 2주 암케어 기록이 없어요' : '2주째 비어 있어요'}
        </p>
        <p className="text-sm break-keep text-muted">
          {labels.join(' · ')}
          {decel ? ' — 던질 때 팔을 멈춰 주는 곳이에요' : ''}
          {coverage.total === 0 ? '. 여기부터 시작해 보세요.' : ''}
        </p>
      </div>
      <Link
        href={`/armcare/play/focus?areas=${coverage.gaps.join(',')}&d=${coverage.dateKey}`}
        className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full bg-app-armcare text-base font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
      >
        <Play aria-hidden className="h-4 w-4" fill="currentColor" />
        {coverage.gaps.length === 1 ? '이곳으로' : `이 ${coverage.gaps.length}곳으로`} 10분 루틴
      </Link>
    </div>
  );
}

/** 그 부위에 드는 운동 — 주로 키우는 것 먼저, 함께 쓰는 것 뒤에 */
function exercisesFor(area: ArmcareArea, exercises: ArmcareExerciseView[]) {
  const primary: ArmcareExerciseView[] = [];
  const secondary: ArmcareExerciseView[] = [];
  for (const ex of exercises) {
    const areas = ex.targetMuscles.map((m) => areaOfMuscle(m)?.key);
    if (areas[0] === area.key) primary.push(ex);
    else if (areas.includes(area.key)) secondary.push(ex);
  }
  return { primary, secondary };
}

function AreaCard({
  area,
  exercises,
  open,
  onToggle,
}: {
  area: ArmcareArea;
  exercises: { primary: ArmcareExerciseView[]; secondary: ArmcareExerciseView[] };
  open: boolean;
  onToggle: () => void;
}) {
  const names = ARMCARE_MUSCLES.filter((m) => m.area === area.key).map((m) => m.name);
  const count = exercises.primary.length + exercises.secondary.length;

  return (
    <li
      id={`area-${area.key}`}
      className={`scroll-mt-20 overflow-hidden rounded-2xl border transition-colors ${
        open ? 'border-sky-soft bg-surface' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-2"
      >
        {/* 제목 밑 설명 한 줄(던질 때 하는 일)은 뺐다 — 2026-09-26 사용자분 */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
            {area.label}
          </span>
          <span className="text-xs text-muted">운동 {count}개</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {/*
            부상과 근육은 이름만 칩으로 — 설명은 '자세히 보기' 창에 둔다. 펼치자마자 글이
            몇 문단씩 나오면 읽지 않고 닫는다(2026-09-26 사용자분). 근육 칩을 누르면 그
            근육을 자세히 본다.
          */}
          <div className="flex flex-wrap gap-1.5">
            {area.injuries.map((injury) => (
              <span
                key={injury.name}
                className="rounded-full border border-warn-line bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn"
              >
                {injury.name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {names.map((name) => (
              <InfoButton
                key={name}
                target={{ kind: 'muscle', name }}
                className="rounded-full bg-sky-tint px-2.5 py-1 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white"
              >
                {name} ›
              </InfoButton>
            ))}
          </div>
          <InfoButton target={{ kind: 'area', key: area.key }} className={INFO_PILL}>
            {area.label} 자세히 보기
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </InfoButton>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted">운동</h3>
            {count === 0 ? (
              <p className="text-[13px] text-muted">
                이 부위를 키우는 운동이 아직 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...exercises.primary, ...exercises.secondary].map((ex) => (
                  <GuideExercise
                    key={ex.id}
                    exercise={ex}
                    highlight={names}
                    secondary={exercises.secondary.includes(ex)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** 운동 한 줄 — 담기 · 키우는 근육 · 자세·영상(방식이 붙은 운동은 방식 설명도) */
function GuideExercise({
  exercise: ex,
  highlight,
  secondary = false,
}: {
  exercise: ArmcareExerciseView;
  /** 진하게 칠할 근육. 안 주면 맨 앞(주 근육)만 */
  highlight?: string[];
  /** 이 부위를 주로 키우는 운동이 아니라 함께 쓰는 운동인가 */
  secondary?: boolean;
}) {
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold break-keep text-ink">{ex.title}</span>
            {secondary && (
              <span className="text-[10px] font-medium text-muted">함께 쓰는 운동</span>
            )}
            <AddToRoutine exerciseId={ex.id} title={ex.title} />
          </span>
          {ex.prescription && (
            <span className="block text-xs font-semibold text-muted">
              {ex.prescription}
            </span>
          )}
          {/* 근육 칩을 누르면 그 근육의 3D 그림과 설명 창 */}
          <MuscleChips muscles={ex.targetMuscles} highlight={highlight} max={2} />
          <ExerciseBadges
            bodyParts={[]}
            intensity={ex.intensity}
            difficulty={ex.difficulty}
            equipment={ex.equipment}
          />
        </span>
        {ex.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ex.thumbUrl}
            alt=""
            className="h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-line"
          />
        )}
      </div>
      <ExerciseMedia exercise={ex} />
    </li>
  );
}

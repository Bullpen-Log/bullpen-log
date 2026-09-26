'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
import { MuscleMapPanel, selectionFor } from './muscle-map-panel';
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
}: {
  exercises: ArmcareExerciseView[];
  /** 내 루틴 — 운동마다 '담기'로 넣을 곳 (add-to-routine.tsx) */
  routines: RoutineChoice[];
  /** 3D 근육 지도에 넘기는 것 */
  map: {
    side: 'right' | 'left';
    bothHands: boolean;
    counts: Record<ArmcareAreaKey, number>;
    /** 루틴의 '근육 위치'로 들어왔으면 그 근육 */
    focusMuscle: string | null;
  };
}) {
  const [open, setOpen] = useState<string | null>(null);

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
      <ArmcareInfoProvider>
        <div className="space-y-6">
          <p className="text-sm break-keep text-muted">
            근육을 누르거나 부위를 펼쳐 보세요.
          </p>

          <MuscleMapPanel
            side={map.side}
            bothHands={map.bothHands}
            counts={map.counts}
            exercises={exercises}
            initial={selectionFor(map.focusMuscle)}
            onShowArea={showArea}
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
              근육을 아직 적지 않은 암케어 운동 {untagged}개는 여기 나오지 않습니다.
            </p>
          )}
        </div>
      </ArmcareInfoProvider>
    </MyRoutinesProvider>
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
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: area.color }}
            />
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
                이 부위를 키우는 운동이 아직 없습니다.
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

/** 운동 한 줄 — 훈련 방식 화면(armcare-methods.tsx)도 같은 모양으로 늘어놓는다 */
export function GuideExercise({
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
            {ex.isReference && (
              <span className="text-[10px] font-medium text-muted">참고 영상</span>
            )}
            <AddToRoutine exerciseId={ex.id} title={ex.title} />
          </span>
          {ex.prescription && (
            <span className="block text-xs font-semibold text-muted">
              {ex.prescription}
            </span>
          )}
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

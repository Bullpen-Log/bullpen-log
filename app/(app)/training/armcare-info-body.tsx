'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import {
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  helpsLine,
  muscleInfo,
  type ArmcareAreaKey,
  type ArmcareMuscle,
} from '@/lib/armcare/anatomy';
import { AREA_DETAILS, MUSCLE_DETAILS } from '@/lib/armcare/details';
import { MUSCLE_MODEL } from '@/lib/armcare/muscle-map';
import type { InfoTarget } from '@/components/armcare-info-context';
import { ModelCredit } from '@/components/model-credit';
import { Segmented } from '@/components/segmented';
import { MuscleMap3D, type MapSelection, type MapStatus } from './muscle-map-3d';

/**
 * '자세히 보기' 창의 본문 — 맨 위 3D 그림과 부위·근육의 긴 설명.
 *
 * 창을 처음 열 때 받아 온다(armcare-info.tsx 의 dynamic). 설명 글(lib/armcare/details.ts)과
 * 3D 부품이 제법 커서, 창을 열지 않는 대부분의 방문에는 싣지 않는다.
 */
export function ArmcareInfoBody({
  view,
  side,
  onChange,
}: {
  view: InfoTarget;
  /** 3D 에서 켤 팔 */
  side: 'right' | 'left';
  /** 창 안에서 다른 부위·근육으로 옮겨 간다 */
  onChange: (next: InfoTarget) => void;
}) {
  /* 운동의 근육 칸에서 고른 근육 — 없으면 운동의 근육 모두 */
  const current = view.kind === 'exercise' ? (view.current ?? null) : null;
  const shown: InfoTarget =
    view.kind === 'exercise' && current
      ? { kind: 'muscle', name: current.name, part: current.part }
      : view;

  const pick = (next: MapSelection) => {
    if (view.kind === 'exercise') {
      /* 운동의 근육을 누르면 그 근육 칸으로, 밖을 누르면 한 칸 물러나 모두로 */
      const hit = next.muscle && view.muscles.includes(next.muscle) ? next.muscle : null;
      onChange({ ...view, current: hit ? { name: hit, part: next.part } : null });
    } else if (next.muscle) {
      onChange({ kind: 'muscle', name: next.muscle, part: next.part });
    } else if (next.area) {
      onChange({ kind: 'area', key: next.area });
    }
  };

  /*
   * 자리를 못박아 둔다(칸 · 3D · 본문). 3D 는 부위 ↔ 근육 ↔ 운동으로 바뀌어도 그대로 두고
   * 켜진 것만 바꾼다 — 다시 만들지 않게.
   */
  return (
    <>
      {view.kind === 'exercise' ? (
        <ExerciseTabs
          muscles={view.muscles}
          value={current?.name ?? 'all'}
          onChange={(v) =>
            onChange({ ...view, current: v === 'all' ? null : { name: v, part: null } })
          }
        />
      ) : null}
      <InfoGraphic
        area={
          shown.kind === 'area'
            ? shown.key
            : shown.kind === 'muscle'
              ? (areaOfMuscle(shown.name)?.key ?? null)
              : null
        }
        muscle={shown.kind === 'muscle' ? shown.name : null}
        part={shown.kind === 'muscle' ? (shown.part ?? null) : null}
        muscles={shown.kind === 'exercise' ? shown.muscles : null}
        side={side}
        onPick={pick}
      />
      {shown.kind === 'area' ? (
        <AreaInfo
          key={`area-${shown.key}`}
          areaKey={shown.key}
          onMuscle={(name) => onChange({ kind: 'muscle', name })}
        />
      ) : shown.kind === 'muscle' ? (
        <MuscleInfo
          key={`muscle-${shown.name}`}
          name={shown.name}
          part={shown.part ?? null}
          onArea={(key) => onChange({ kind: 'area', key })}
        />
      ) : (
        <ExerciseMuscles
          key={`exercise-${shown.title}`}
          muscles={shown.muscles}
          onMuscle={(name) => onChange({ ...shown, current: { name, part: null } })}
        />
      )}
    </>
  );
}

/** 운동의 근육 칸 — '모두'와 근육마다 */
function ExerciseTabs({
  muscles,
  value,
  onChange,
}: {
  muscles: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(
    () => [
      { value: 'all', label: '모두' },
      ...muscles.map((m) => ({ value: m, label: m })),
    ],
    [muscles]
  );
  return (
    <Segmented
      label="근육 고르기"
      value={value}
      onChange={onChange}
      options={options}
      layout="flow"
      className="mb-3"
      itemClassName="px-3 py-1"
    />
  );
}

/**
 * 창 맨 위의 3D 그림 — 고른 근육(부위)만 켠다. 운동의 근육을 모두 볼 때는 그 근육들을
 * 한꺼번에 켠다. 그림 속 근육을 누르면 그 근육으로 창이 바뀐다. 3D 를 못 그리는
 * 기기에서는 자리만 접는다.
 *
 * 모델 출처를 바로 밑에 적는다 — 3D 가 보이는 곳마다 밝히는 조건의 공개 모델이다
 * (components/model-credit.tsx).
 */
function InfoGraphic({
  area,
  muscle,
  part,
  muscles,
  side,
  onPick,
}: {
  area: ArmcareAreaKey | null;
  muscle: string | null;
  part: string | null;
  muscles: readonly string[] | null;
  side: 'right' | 'left';
  onPick: (next: MapSelection) => void;
}) {
  const [status, setStatus] = useState<MapStatus>('loading');
  /* 그릴 때마다 새 목록이 생기지 않게 글자로 들고 있다가 되돌린다 */
  const many = muscles?.join('|') ?? '';
  const selection = useMemo<MapSelection>(
    () => ({ area, muscle, part, muscles: many ? many.split('|') : undefined }),
    [area, muscle, part, many]
  );
  if (status === 'unavailable') return null;
  return (
    <div className="mb-5 space-y-1.5">
      <div className="h-[min(36vh,280px)] min-h-[220px] overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface to-surface-2">
        <MuscleMap3D
          side={side}
          selection={selection}
          onPick={onPick}
          onStatus={setStatus}
        />
      </div>
      <ModelCredit className="px-1" />
    </div>
  );
}

/*
 * 창 안에서 부위 ↔ 근육으로 바꾸면 맨 위부터 보이게 — 굴러가는 곳은 창의 본문 칸이다.
 *
 * 바로 위 칸이 굴러가는 칸이라고 보지 않고 위로 올라가며 찾는다. 창이 본문을 한 겹 더
 * 감싸게 바뀌면서(components/modal.tsx, 창 높이를 부드럽게 바꾸려고) 바로 위 칸은 더 이상
 * 굴러가지 않는다.
 */
function useScrollTop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let el = ref.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
      el = el.parentElement;
    }
    el?.scrollTo({ top: 0 });
  }, []);
  return ref;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-bold text-sky-strong">{title}</h3>
      {children}
    </section>
  );
}

function Disclaimer() {
  return (
    <p className="border-t border-line pt-3 text-xs text-muted">
      운동이 부상을 막아 준다는 보장은 없어요. 통증이 이어지면 쉬고 진료를 받으세요.
    </p>
  );
}

/** 근육 목록 — 이름과 하는 일 한 줄, 누르면 그 근육을 자세히 */
function MuscleList({
  muscles,
  onMuscle,
}: {
  muscles: readonly string[];
  onMuscle: (name: string) => void;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {muscles.map((name) => (
        <li key={name}>
          <button
            type="button"
            onClick={() => onMuscle(name)}
            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] font-semibold text-ink">{name}</b>
              <span className="block text-xs text-muted">{muscleInfo(name)?.does}</span>
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 운동이 쓰는 근육 모두 — 루틴의 '근육 위치'. 위 3D 에 한꺼번에 켜 두고, 크게 쓰는
 * 차례로 늘어놓는다. 누르면(또는 창 위 칸이나 3D 에서 고르면) 그 근육을 자세히 본다.
 */
function ExerciseMuscles({
  muscles,
  onMuscle,
}: {
  muscles: readonly string[];
  onMuscle: (name: string) => void;
}) {
  const ref = useScrollTop();
  const line = helpsLine([...muscles]);
  return (
    <div ref={ref} className="space-y-4 text-[14px] leading-relaxed break-keep text-ink/85">
      <MuscleList muscles={muscles} onMuscle={onMuscle} />
      {line && <p className="text-xs text-muted">{line}</p>}
      <Disclaimer />
    </div>
  );
}

function AreaInfo({
  areaKey,
  onMuscle,
}: {
  areaKey: ArmcareAreaKey;
  onMuscle: (name: string) => void;
}) {
  const ref = useScrollTop();
  const area = findArmcareArea(areaKey);
  if (!area) return null;
  const d = AREA_DETAILS[area.key];
  const muscles = ARMCARE_MUSCLES.filter((m) => m.area === area.key);

  return (
    <div
      ref={ref}
      className="space-y-5 text-[14px] leading-relaxed break-keep text-ink/85"
    >
      <Section title="던질 때 하는 일">
        <p>{d.role}</p>
      </Section>
      <Section title="왜 챙겨야 하나요">
        <p>{d.why}</p>
      </Section>
      <Section title="흔한 부상">
        <ul className="space-y-2">
          {area.injuries.map((injury) => (
            <li key={injury.name}>
              <b className="font-semibold text-warn">{injury.name}</b>
              <p className="text-[13px] text-ink/75">{injury.desc}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="이 부위의 근육">
        <MuscleList muscles={muscles.map((m) => m.name)} onMuscle={onMuscle} />
      </Section>
      {area.notes.length > 0 && (
        <Section title="알아 두기">
          <ul className="space-y-2">
            {area.notes.map((note) => (
              <li key={note} className="flex gap-1.5">
                <Lightbulb
                  aria-hidden
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-sky-strong"
                />
                {note}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="이런 신호가 있으면 더 챙기세요">
        <ul className="list-disc space-y-1 pl-5 marker:text-muted">
          {d.signs.map((sign) => (
            <li key={sign}>{sign}</li>
          ))}
        </ul>
      </Section>
      <Section title="이렇게 키워요">
        <p>{d.train}</p>
      </Section>
      <Disclaimer />
    </div>
  );
}

function MuscleInfo({
  name,
  part,
  onArea,
}: {
  name: string;
  part: string | null;
  onArea: (key: ArmcareAreaKey) => void;
}) {
  const ref = useScrollTop();
  const info = muscleInfo(name);
  const area = areaOfMuscle(name);
  const d = MUSCLE_DETAILS[name as ArmcareMuscle];
  if (!info || !area || !d) return null;
  const parts = MUSCLE_MODEL[name]?.parts ?? {};
  const partNames = [...new Set(Object.values(parts))];
  const here = part ? parts[part] : null;

  return (
    <div
      ref={ref}
      className="space-y-5 text-[14px] leading-relaxed break-keep text-ink/85"
    >
      <button
        type="button"
        onClick={() => onArea(area.key)}
        className="-mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-sky-strong"
      >
        <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
        {area.label} 자세히
      </button>
      <Section title="어떤 근육인가요">
        <p>{d.what}</p>
      </Section>
      <Section title="던질 때">
        <p>{d.pitching}</p>
      </Section>
      <Section title="왜 중요한가요">
        <p>{d.why}</p>
      </Section>
      <Section title="이렇게 키워요">
        <p>{d.train}</p>
      </Section>
      <dl className="grid grid-cols-[5.5em_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px]">
        <dt className="font-semibold text-sky-strong">붙는 곳</dt>
        <dd className="text-ink/80">{info.at}</dd>
        {partNames.length > 1 && (
          <>
            <dt className="font-semibold text-sky-strong">이루는 근육</dt>
            <dd className="text-ink/80">
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
        {info.helps && (
          <>
            <dt className="font-semibold text-sky-strong">예방에 도움</dt>
            <dd className="text-ink/80">{info.helps}</dd>
          </>
        )}
      </dl>
      <Disclaimer />
    </div>
  );
}

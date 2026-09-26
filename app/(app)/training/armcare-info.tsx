'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { Modal } from '@/components/modal';
import {
  ARMCARE_MUSCLES,
  areaOfMuscle,
  findArmcareArea,
  muscleInfo,
  type ArmcareAreaKey,
  type ArmcareMuscle,
} from '@/lib/armcare/anatomy';
import { AREA_DETAILS, MUSCLE_DETAILS } from '@/lib/armcare/details';
import { MUSCLE_MODEL } from '@/lib/armcare/muscle-map';
import { MuscleMap3D, type MapSelection, type MapStatus } from './muscle-map-3d';

/** 무엇을 자세히 볼까 — 부위 하나, 또는 근육 하나(3D 에서 누른 조각이 있으면 그것도) */
export type InfoTarget =
  | { kind: 'area'; key: ArmcareAreaKey }
  | { kind: 'muscle'; name: string; part?: string | null };

type Show = (target: InfoTarget, e?: MouseEvent<HTMLElement>) => void;

const InfoContext = createContext<Show | null>(null);

/**
 * 부위·근육 '자세히 보기' 창 — 부위별 보강(3D 아래 칸과 부위 카드)이 함께 쓴다.
 *
 * 2026-09-26 사용자분: "기본적인 인터페이스는 단순하지만 클릭을 했을 경우에는 자세한
 * 정보들을 확인할 수 있는 느낌". 화면에는 이름·칩·한 줄만 두고, 기능·던질 때 하는
 * 일·왜 중요한가·흔한 부상·키우는 법은 이 창에 모은다(글은 lib/armcare/details.ts).
 *
 * 창은 하나만 둔다. 부위 창의 근육을 누르면 같은 창이 그 근육으로 바뀌고, 근육 창의
 * '‹ 부위'로 돌아온다 — 창 위에 창을 겹치지 않는다.
 *
 * 창 맨 위에는 3D 그림이 선다 — 그 근육(부위)만 하늘색으로 켜진다. 운동마다 붙은 근육
 * 칩을 누르면 이 창이 뜬다(components/muscle-chips.tsx 의 onPick). 2026-09-26 사용자분:
 * "불펜로그의 가장 큰 장점은 간편함 — 운동마다 근육이 글로만 적혀 있는데, 누르면 그
 * 부위의 그래픽이 보이게". 그래서 부위별 보강 화면으로 옮겨 가지 않고 그 자리에서 뜬다.
 * 3D 는 창이 떠 있는 동안만 만든다 — 닫으면 치운다(muscle-map-3d.tsx 의 release).
 */
export function ArmcareInfoProvider({
  side = 'right',
  children,
}: {
  /** 던지는 팔 — 3D 에서 켤 팔. 양투는 오른팔로 연다 */
  side?: 'right' | 'left';
  children: ReactNode;
}) {
  const [view, setView] = useState<InfoTarget | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback<Show>((target, e) => {
    /* 누른 단추 자리에서 창이 날아오게(components/modal.tsx 의 origin) */
    const r = e?.currentTarget.getBoundingClientRect();
    setOrigin(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    setView(target);
  }, []);

  const head = view ? headingOf(view) : { title: '', description: undefined };

  return (
    <InfoContext.Provider value={show}>
      {children}
      <Modal
        open={view != null}
        onClose={() => setView(null)}
        title={head.title}
        description={head.description}
        origin={origin}
      >
        {/* 3D 는 부위 ↔ 근육으로 바뀌어도 그대로 두고 켜진 것만 바꾼다 — 다시 만들지 않게 */}
        {view && (
          <InfoGraphic
            view={view}
            side={side}
            onPick={(next) => {
              if (next.muscle) {
                setView({ kind: 'muscle', name: next.muscle, part: next.part });
              } else if (next.area) {
                setView({ kind: 'area', key: next.area });
              }
            }}
          />
        )}
        {view?.kind === 'area' && (
          <AreaInfo
            key={`area-${view.key}`}
            areaKey={view.key}
            onMuscle={(name) => setView({ kind: 'muscle', name })}
          />
        )}
        {view?.kind === 'muscle' && (
          <MuscleInfo
            key={`muscle-${view.name}`}
            name={view.name}
            part={view.part ?? null}
            onArea={(key) => setView({ kind: 'area', key })}
          />
        )}
      </Modal>
    </InfoContext.Provider>
  );
}

/**
 * 자세히 보기 창을 여는 함수 — ArmcareInfoProvider 밖이면 null.
 *
 * 근육 칩이 쓴다: 창이 있는 화면(암케어)에서만 칩을 누를 수 있게 하고, 없는
 * 화면(라이브러리)에서는 글자 칩으로 둔다.
 */
export function useArmcareInfo() {
  return useContext(InfoContext);
}

/** 누르면 자세히 보기 창을 여는 단추 — ArmcareInfoProvider 안에서만 쓴다 */
export function InfoButton({
  target,
  className,
  children,
}: {
  target: InfoTarget;
  className?: string;
  children: ReactNode;
}) {
  const show = useContext(InfoContext);
  if (!show) throw new Error('InfoButton 은 ArmcareInfoProvider 안에서 쓴다');
  return (
    <button type="button" onClick={(e) => show(target, e)} className={className}>
      {children}
    </button>
  );
}

/** '자세히 보기 ›' — 부위·근육 어디서나 같은 모양으로 */
export const INFO_PILL =
  'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-sky-soft bg-sky-tint px-3 py-1.5 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white';

function headingOf(view: InfoTarget): { title: string; description?: string } {
  if (view.kind === 'area') {
    const area = findArmcareArea(view.key);
    const n = ARMCARE_MUSCLES.filter((m) => m.area === view.key).length;
    return {
      title: area?.label ?? '',
      description: area ? `${area.joint} · 근육 ${n}개` : undefined,
    };
  }
  const area = areaOfMuscle(view.name);
  const info = muscleInfo(view.name);
  return {
    title: view.name,
    description: area && info ? `${area.label} · ${info.does}` : undefined,
  };
}

/**
 * 창 맨 위의 3D 그림 — 고른 근육(부위)만 켠다. 그림 속 다른 근육을 누르면 그 근육으로
 * 창이 바뀐다. 3D 를 못 그리는 기기에서는 자리만 접는다.
 */
function InfoGraphic({
  view,
  side,
  onPick,
}: {
  view: InfoTarget;
  side: 'right' | 'left';
  onPick: (next: MapSelection) => void;
}) {
  const [status, setStatus] = useState<MapStatus>('loading');
  const area = view.kind === 'area' ? view.key : (areaOfMuscle(view.name)?.key ?? null);
  const muscle = view.kind === 'muscle' ? view.name : null;
  const part = view.kind === 'muscle' ? (view.part ?? null) : null;
  const selection = useMemo<MapSelection>(
    () => ({ area, muscle, part }),
    [area, muscle, part]
  );
  if (status === 'unavailable') return null;
  return (
    <div className="mb-5 h-[min(36vh,280px)] min-h-[220px] overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface to-surface-2">
      <MuscleMap3D
        side={side}
        selection={selection}
        counts={null}
        onPick={onPick}
        onStatus={setStatus}
      />
    </div>
  );
}

/* 창 안에서 부위 ↔ 근육으로 바꾸면 맨 위부터 보이게 — 굴러가는 곳은 창의 본문이다 */
function useScrollTop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.parentElement?.scrollTo({ top: 0 });
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
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {muscles.map((m) => (
            <li key={m.name}>
              <button
                type="button"
                onClick={() => onMuscle(m.name)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px] font-semibold text-ink">{m.name}</b>
                  <span className="block text-xs text-muted">{m.does}</span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
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

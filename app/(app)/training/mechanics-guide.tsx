'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Target } from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { startMechanicsProgram } from '@/app/actions/mechanics';
import { josa } from '@/lib/korean';
import { DRILL_STAGES } from '@/lib/exercise-meta';
import {
  MECHANICS_ELEMENTS,
  MECHANICS_OVERVIEW,
  MECHANICS_SYMPTOMS,
  mechanicsElement,
  sideText,
  type MechanicsElement,
} from '@/lib/mechanics/elements';
import { MechanicsDrill, type MechanicsDrillView } from './mechanics-drill';

/** 자세히 보기 창에 띄울 것 — 투구 한눈에, 또는 요소 하나 */
type InfoTarget = { kind: 'overview' } | { kind: 'element'; name: string };

/** '자세히 보기 ›' — 암케어(armcare-info.tsx INFO_PILL)와 같은 모양 */
const INFO_PILL =
  'inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-full border border-sky-soft bg-sky-tint px-3.5 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white desk:min-h-8';

/**
 * 요소별 드릴 — 투구 차례 → 증상 → 요소 카드(설명 · 단계별 드릴)(2026-10-04).
 *
 * 사용자분 요청 그대로: "자기가 향상시키고 싶은 부분을 간편하게 찾아서 영상을 볼 수 있게". 암케어 부위별 보강
 * (armcare-guide.tsx)과 같은 모양이다 — 카드는 한 번에 하나만 펼치고, 긴 글은 '자세히 보기' 창에 둔다
 * (겉은 단순하게, 누르면 자세히).
 *
 * 맨 위 여섯 칸은 투구가 흘러가는 차례다. 요소 이름이 낯선 사람은 증상 칩으로 들어온다.
 */
export function MechanicsGuide({
  drills,
  hand,
  isAdmin,
  focus,
  program,
}: {
  drills: MechanicsDrillView[];
  /** 던지는 손 — 글의 1루 · 3루, 왼쪽 · 오른쪽을 맞춘다 */
  hand: string | null;
  isAdmin: boolean;
  /** 처음에 열어 둘 요소(주소의 ?el=) */
  focus: string | null;
  /** 내 메커닉 프로그램 — 없으면 null. 요소 카드에서 그 요소를 강조로 정한다(2026-10-04 검토) */
  program: { focus: string | null } | null;
}) {
  const [open, setOpen] = useState<string | null>(
    () => MECHANICS_ELEMENTS.find((e) => e.key === focus)?.name ?? null
  );
  /** 증상 칩으로 열었으면 그 증상 — 열린 카드 위에 '함께 볼 요소'를 적는다 */
  const [via, setVia] = useState<(typeof MECHANICS_SYMPTOMS)[number] | null>(null);
  const modal = useModalState<InfoTarget>();

  const openElement = (name: string, symptom: (typeof MECHANICS_SYMPTOMS)[number] | null) => {
    setOpen(name);
    setVia(symptom);
    const key = mechanicsElement(name)?.key;
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(`element-${key}`)
        ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-heading text-lg text-ink">투구의 흐름</h2>
          <button
            type="button"
            onClick={(e) => modal.show({ kind: 'overview' }, e)}
            className={INFO_PILL}
          >
            왜 순서가 중요한가요
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
        <ElementChain onPick={(name) => openElement(name, null)} current={open} />
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-sm font-semibold text-muted">이런 고민이 있나요?</h2>
        <div className="flex flex-wrap gap-1.5">
          {MECHANICS_SYMPTOMS.map((s) => (
            <button
              key={s.text}
              type="button"
              onClick={() => openElement(s.main, s)}
              className="min-h-10 rounded-full bg-surface px-3.5 text-xs font-semibold break-keep text-ink transition-colors hover:bg-sky-tint hover:text-sky-strong desk:min-h-8"
            >
              {s.text}
            </button>
          ))}
        </div>
      </section>

      <ul className="space-y-2.5">
        {MECHANICS_ELEMENTS.map((el) => (
          <ElementCard
            key={el.key}
            element={el}
            hand={hand}
            drills={drillsFor(el.name, drills)}
            open={open === el.name}
            via={open === el.name ? via : null}
            onToggle={() => {
              setOpen(open === el.name ? null : el.name);
              setVia(null);
            }}
            onInfo={(e) => modal.show({ kind: 'element', name: el.name }, e)}
            onElement={(name) => openElement(name, null)}
            isAdmin={isAdmin}
            program={program}
          />
        ))}
      </ul>

      <Modal
        open={modal.open}
        onClose={modal.close}
        title={
          modal.content?.kind === 'element' ? modal.content.name : '투구의 흐름'
        }
        description={
          modal.content?.kind === 'element'
            ? mechanicsElement(modal.content.name)?.line
            : '여섯 구간이 차례로 힘을 넘겨요'
        }
        origin={modal.origin}
      >
        {modal.content?.kind === 'element' ? (
          <ElementDetail name={modal.content.name} hand={hand} />
        ) : modal.content ? (
          <OverviewDetail />
        ) : null}
      </Modal>
    </div>
  );
}

/** 여섯 요소를 투구 차례대로 — 누르면 그 카드로 */
function ElementChain({
  onPick,
  current,
}: {
  onPick: (name: string) => void;
  current: string | null;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 desk:grid-cols-6">
      {MECHANICS_ELEMENTS.map((el) => (
        <li key={el.key}>
          <button
            type="button"
            onClick={() => onPick(el.name)}
            aria-current={current === el.name ? 'true' : undefined}
            className={`flex min-h-12 w-full items-center gap-2 rounded-2xl px-3 text-left transition-colors ${
              current === el.name ? 'bg-sky text-white' : 'bg-surface text-ink hover:bg-sky-tint'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                current === el.name ? 'bg-white/25 text-white' : 'bg-sky-tint text-sky-strong'
              }`}
            >
              {el.order}
            </span>
            <span className="text-sm font-bold break-keep">{el.name}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** 그 요소의 드릴 — 단계마다, 주 요소인 드릴 먼저 · 함께 쓰는 드릴 뒤에 */
function drillsFor(name: string, drills: MechanicsDrillView[]) {
  return DRILL_STAGES.map((stage) => {
    const inStage = drills.filter((d) => d.stage === stage.name && d.focusPoints.includes(name));
    return {
      stage,
      primary: inStage.filter((d) => d.focusPoints[0] === name),
      secondary: inStage.filter((d) => d.focusPoints[0] !== name),
    };
  });
}

function ElementCard({
  element: el,
  hand,
  drills,
  open,
  via,
  onToggle,
  onInfo,
  onElement,
  isAdmin,
  program,
}: {
  element: MechanicsElement;
  hand: string | null;
  drills: ReturnType<typeof drillsFor>;
  open: boolean;
  via: (typeof MECHANICS_SYMPTOMS)[number] | null;
  onToggle: () => void;
  onInfo: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onElement: (name: string) => void;
  isAdmin: boolean;
  program: { focus: string | null } | null;
}) {
  const count = drills.reduce((n, s) => n + s.primary.length + s.secondary.length, 0);

  return (
    <li
      id={`element-${el.key}`}
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
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-tint text-xs font-bold text-sky-strong">
          {el.order}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-bold text-ink">{el.name}</span>
            <span className="text-xs text-muted">드릴 {count}개</span>
          </span>
          <span className="mt-0.5 block text-xs break-keep text-muted">{el.line}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {via && via.also.length > 0 && (
            <p className="rounded-xl bg-sky-tint/60 px-3.5 py-2.5 text-xs leading-relaxed break-keep text-ink/85">
              ‘{via.text}’라면 {el.name}부터 보고, 함께{' '}
              {via.also.map((name, i) => (
                <span key={name}>
                  {i > 0 && ' · '}
                  <button
                    type="button"
                    onClick={() => onElement(name)}
                    className="font-semibold text-sky-strong"
                  >
                    {name}
                  </button>
                </span>
              ))}
              도 보세요.
            </p>
          )}

          {/* 증상은 이름만 칩으로 — 설명은 '자세히 보기' 창에(겉은 단순하게) */}
          <div className="flex flex-wrap gap-1.5">
            {el.faults.slice(0, 3).map((f) => (
              <span
                key={f}
                className="rounded-full border border-warn-line bg-warn-bg px-2.5 py-0.5 text-xs font-semibold break-keep text-warn"
              >
                {shortFault(sideText(f, hand))}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onInfo} className={INFO_PILL}>
              {el.name} 자세히 보기
              <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </button>
            <FocusAction name={el.name} program={program} />
          </div>

          {drills.map(({ stage, primary, secondary }) =>
            primary.length + secondary.length === 0 ? null : (
              <div key={stage.name} className="space-y-2">
                <h3 className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-bold text-ink">{stage.name}</span>
                  <span className="text-xs break-keep text-muted">{stage.desc}</span>
                </h3>
                <ul className="space-y-2">
                  {primary.map((d) => (
                    <MechanicsDrill key={d.title} drill={d} secondary={false} isAdmin={isAdmin} />
                  ))}
                  {secondary.map((d) => (
                    <MechanicsDrill key={d.title} drill={d} secondary isAdmin={isAdmin} />
                  ))}
                </ul>
              </div>
            )
          )}
          {count === 0 && (
            <p className="text-sm text-muted">이 요소를 키우는 드릴이 아직 없어요.</p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * 이 요소를 프로그램의 강조로 — 증상 칩 · 요소 카드로 고칠 곳을 찾은 사람이 그대로 프로그램에 잇는다(2026-10-04 검토).
 * 프로그램이 없으면 그 요소를 강조로 시작하고 프로그램 칸으로 간다. 이미 강조 중이면 표시만.
 */
function FocusAction({
  name,
  program,
}: {
  name: string;
  program: { focus: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* 누른 뒤 서버가 다시 그리기 전에도 바로 바뀌어 보이게 */
  const [chosen, setChosen] = useState<string | null>(null);
  const current = chosen ?? program?.focus ?? null;

  if (program && current === name) {
    return (
      <span className="inline-flex min-h-10 items-center gap-1 px-1 text-xs font-semibold text-sky-strong desk:min-h-8">
        <Check aria-hidden className="h-3.5 w-3.5" />
        프로그램에서 강조 중
        {chosen && (
          <Link href="/training?view=mechanics" className="ml-1 text-muted underline-offset-2 hover:underline">
            보기
          </Link>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await orOffline(startMechanicsProgram(name), { error: OFFLINE_MESSAGE });
            if ('error' in res) {
              setError(res.error);
              return;
            }
            if (!program) {
              router.push('/training?view=mechanics');
              return;
            }
            setChosen(name);
          })
        }
        className="inline-flex min-h-10 items-center gap-1 rounded-full bg-surface-2 px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-sky-tint hover:text-sky-strong disabled:opacity-60 desk:min-h-8"
      >
        <Target aria-hidden className="h-3.5 w-3.5" />
        {pending
          ? '정하는 중…'
          : program
            ? '프로그램에서 강조'
            : `${name}${josa(name, '으로/로')} 프로그램 시작`}
      </button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </>
  );
}

/** 칩에는 첫 문장만 — '몸이 일찍 열려요. 앞발이 …' 의 첫 마침표 앞, 마침표 없이 */
function shortFault(text: string) {
  return text.split('. ')[0].replace(/\.$/, '');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

const PROSE = 'text-sm leading-relaxed break-keep text-ink/85';

/** 요소 하나 자세히 — 무엇 · 왜 · 잘될 때 · 증상 · 확인하기 · 느낌 신호 */
function ElementDetail({ name, hand }: { name: string; hand: string | null }) {
  const el = mechanicsElement(name);
  if (!el) return null;
  const t = (s: string) => sideText(s, hand);
  return (
    <div className="space-y-5">
      <Section title="무엇인가요">
        <p className={PROSE}>{t(el.what)}</p>
      </Section>
      <Section title="왜 중요한가요">
        <p className={PROSE}>{t(el.why)}</p>
      </Section>
      <Section title="잘될 때 모습">
        <ul className={`list-disc space-y-1 pl-5 ${PROSE}`}>
          {el.good.map((g) => (
            <li key={g}>{t(g)}</li>
          ))}
        </ul>
      </Section>
      <Section title="이런 증상이 있으면">
        <ul className={`list-disc space-y-1 pl-5 ${PROSE}`}>
          {el.faults.map((f) => (
            <li key={f}>{t(f)}</li>
          ))}
        </ul>
      </Section>
      <Section title="스스로 확인하기">
        <p className={PROSE}>{t(el.check)}</p>
      </Section>
      <Section title="느낌 신호">
        <ul className="space-y-1.5">
          {el.cues.map((c) => (
            <li
              key={c}
              className="rounded-xl bg-sky-tint/60 px-3.5 py-2 text-sm font-semibold break-keep text-sky-strong"
            >
              “{c}”
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** 투구 한눈에 — 힘이 넘어가는 차례 · 왜 순서가 중요한가 · 쓰는 법 */
export function OverviewDetail() {
  return (
    <div className="space-y-5">
      <p className={PROSE}>{MECHANICS_OVERVIEW.lead}</p>
      <ol className="space-y-1.5">
        {MECHANICS_ELEMENTS.map((el) => (
          <li key={el.key} className="flex gap-2.5 text-sm break-keep">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-tint text-xs font-bold text-sky-strong">
              {el.order}
            </span>
            <span>
              <span className="font-bold text-ink">{el.name}</span>{' '}
              <span className="text-muted">{el.line}</span>
            </span>
          </li>
        ))}
      </ol>
      <Section title="왜 순서가 중요한가요">
        <p className={PROSE}>{MECHANICS_OVERVIEW.whyOrder}</p>
      </Section>
      <Section title="이렇게 쓰세요">
        <ol className={`list-decimal space-y-1 pl-5 ${PROSE}`}>
          {MECHANICS_OVERVIEW.howTo.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

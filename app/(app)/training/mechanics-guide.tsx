'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { Card } from '@/components/ui';
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
}: {
  drills: MechanicsDrillView[];
  /** 던지는 손 — 글의 1루 · 3루, 왼쪽 · 오른쪽을 맞춘다 */
  hand: string | null;
  isAdmin: boolean;
  /** 처음에 열어 둘 요소(주소의 ?el=) */
  focus: string | null;
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
          <h2 className="text-heading text-lg text-ink">투구 한눈에</h2>
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
          />
        ))}
      </ul>

      <Modal
        open={modal.open}
        onClose={modal.close}
        title={
          modal.content?.kind === 'element' ? modal.content.name : '투구 한눈에'
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
              ‘{via.text}’ — {el.name}부터 보고, 함께{' '}
              {via.also.map((name, i) => (
                <span key={name}>
                  {i > 0 && ' · '}
                  <button
                    type="button"
                    onClick={() => onElement(name)}
                    className="font-semibold text-sky-strong underline underline-offset-2"
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
          <button type="button" onClick={onInfo} className={INFO_PILL}>
            {el.name} 자세히 보기
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>

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

/** 칩에는 첫 문장만 — '몸이 일찍 열려요 — 앞발이 …' 의 줄표 앞, 마침표 없이 */
function shortFault(text: string) {
  return text.split(' — ')[0].replace(/\.$/, '');
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
function OverviewDetail() {
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

/**
 * 프로그램 칸 — 아직 과정이 없어 투구 한눈에와 요소별 드릴로 가는 길만 둔다(2026-10-04).
 * 다음 작업에서 쉬운 단계부터 올라가는 과정이 이 자리에 선다.
 */
export function MechanicsProgramIntro() {
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <h2 className="text-heading text-lg text-ink">투구 한눈에</h2>
        <OverviewDetail />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-base font-bold text-ink">단계별 프로그램을 준비하고 있어요</h2>
        <p className="text-sm leading-relaxed break-keep text-muted">
          기초부터 한 단계씩 올라가는 과정이 곧 여기에 생겨요. 그동안은 요소별 드릴에서 고치고 싶은
          요소의 기초 드릴부터 해 보세요.
        </p>
        <Link
          href="/training?view=mechanics&tab=elements"
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-sky px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
        >
          요소별 드릴 보기
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}

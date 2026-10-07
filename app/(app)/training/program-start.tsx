'use client';

import { useState, useTransition } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { previewPinned, programChoices, startProgram } from '@/app/actions/program';
import {
  GOAL_LABELS,
  PLUS_RESERVE,
  REQUIRED_EQUIPMENT,
  TM_LOOKBACK_DAYS,
  VARIANT_LABELS,
  type PerWeek,
  type ProgramChoice,
  type ProgramGoal,
  type VariantKey,
} from '@/lib/program/program';

/**
 * 근력 · 파워 프로그램 입구 한 줄 + 고르기 · 시작 시트(설계 §13-12 · 18).
 *
 * 시트는 한 쪽에 하나씩: ⓪ 목표 · 프로그램 고르기 → 그 프로그램 소개 → ① 시즌 ② 경력(비었을 때만) ③ 장비(비었을 때만)
 * ④ 고정 운동 ⑤ 주 몇 번 + 요약 + [시작]. 막히면 그 쪽에 까닭 한 줄 + 할 일 하나.
 * 프로필(경력 · 장비 · 생년월일)은 [시작] 때만 저장한다(app/actions/program.ts).
 */

type Season = 'off' | 'pre' | 'in' | 'rehab';

const SEASONS: { value: Season; label: string }[] = [
  { value: 'off', label: '비시즌' },
  { value: 'pre', label: '시즌 전' },
  { value: 'in', label: '시즌 중' },
  { value: 'rehab', label: '재활' },
];

const GOALS: { value: ProgramGoal; label: string }[] = (
  ['base', 'strength', 'power'] as const
).map((g) => ({ value: g, label: GOAL_LABELS[g] }));

export type ProgramStartProps = {
  /** 고를 수 있는 프로그램(lib/program/program.ts 의 programChoiceList) */
  programs: ProgramChoice[];
  /** 생년월일이 없는가(가입 때 받지만 옛 계정에는 없을 수 있다) */
  needBirth: boolean;
  /** 경력 — 비었으면 시트에서 묻는다 */
  level: string | null;
  levels: { name: string; desc: string }[];
  /** 가진 장비 — 비었으면 시트에서 묻는다(§13-21, 빈 채로 시작) */
  owned: string[];
  equipment: string[];
  /** 영양 시즌으로 미리 채운 값 */
  season: Season | null;
  /** 프로필로 이미 아는 막힘(만 17세 이하 · 입문) */
  blocked: { reason: string; action: string } | null;
};

export function ProgramStart({ props }: { props: ProgramStartProps }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface px-(--block-pad) text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">
            근력 · 파워 프로그램
          </span>
          <span className="block text-xs text-muted">
            {props.programs.length}개 중에 골라요 · 모두 {props.programs[0]?.weeks.length ?? 4}주
          </span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <StartSheet open={open} onClose={() => setOpen(false)} props={props} />
    </>
  );
}

type Step = 'list' | 'intro' | 'season' | 'level' | 'equipment' | 'birth' | 'pins' | 'summary';

function StartSheet({
  open,
  onClose,
  props,
}: {
  open: boolean;
  onClose: () => void;
  props: ProgramStartProps;
}) {
  const steps: Step[] = [
    'season',
    ...(props.needBirth ? (['birth'] as const) : []),
    ...(props.level == null ? (['level'] as const) : []),
    ...(props.owned.length === 0 ? (['equipment'] as const) : []),
    'pins',
    'summary',
  ];
  const [step, setStep] = useState<Step>('list');
  const [goal, setGoal] = useState<ProgramGoal>('strength');
  const [choice, setChoice] = useState<ProgramChoice | null>(null);
  const [weeksOpen, setWeeksOpen] = useState(false);
  const [season, setSeason] = useState<Season>(props.season ?? 'off');
  const [perWeekPick, setPerWeekPick] = useState<PerWeek | null>(null);
  const [birth, setBirth] = useState('');
  const [level, setLevel] = useState<string | null>(props.level);
  const [owned, setOwned] = useState<string[]>([]);
  const [pins, setPins] = useState<
    { variant: VariantKey; id: string | null; title: string | null }[] | null
  >(null);
  const [changing, setChanging] = useState<VariantKey | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const at = steps.indexOf(step);
  const go = (s: Step) => {
    setError(undefined);
    setStep(s);
  };
  const next = () => {
    const s = steps[at + 1];
    if (s === 'pins') loadPins();
    if (s) go(s);
  };
  const back = () => (at <= 0 ? go('intro') : go(steps[at - 1]));

  /* 시즌 직전이면 주 2번(되는 프로그램만), 아니면 주 3번 — 고르면 그대로 */
  const perWeek: PerWeek = choice
    ? (perWeekPick ??
      (season === 'pre' && choice.perWeek.includes(2)
        ? 2
        : choice.perWeek.includes(3)
          ? 3
          : 2))
    : 3;

  const equipmentForCall = props.owned.length === 0 ? owned : null;
  const levelForCall = props.level == null ? level : null;

  const pick = (c: ProgramChoice) => {
    setChoice(c);
    setPins(null);
    setPerWeekPick(null);
    setWeeksOpen(false);
    go('intro');
  };

  const loadPins = () =>
    start(async () => {
      if (!choice) return;
      setPins(null);
      const r = await orOffline(
        previewPinned({
          programId: choice.id,
          ownedEquipment: equipmentForCall,
          trainingLevel: levelForCall,
        }),
        null
      );
      if (!r) setError(OFFLINE_MESSAGE);
      else setPins(r.pinned);
    });

  const openChoices = (v: VariantKey) =>
    start(async () => {
      setChanging(v);
      setChoices(null);
      const r = await orOffline(
        programChoices({
          variant: v,
          ownedEquipment: equipmentForCall,
          trainingLevel: levelForCall,
        }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in r) setError(r.error);
      else setChoices(r.choices);
    });

  const submit = () =>
    start(async () => {
      if (!choice) return;
      setError(undefined);
      const r = await orOffline(
        startProgram({
          programId: choice.id,
          perWeek,
          season: season === 'pre' ? 'pre' : 'off',
          birthDate: props.needBirth ? birth : null,
          trainingLevel: levelForCall,
          ownedEquipment: equipmentForCall,
          pinned: Object.fromEntries(
            (pins ?? []).filter((x) => x.id).map((x) => [x.variant, x.id as string])
          ),
        }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in r) setError(r.error);
      else onClose();
    });

  const seasonBlocked =
    season === 'in'
      ? {
          reason: '시즌 중 유지 프로그램은 곧 열려요.',
          action: '지금은 자동 맞춤으로 가볍게 이어 가요.',
        }
      : season === 'rehab'
        ? {
            reason: '재활 중에는 재활을 먼저 해요.',
            action: '암케어의 재활 카드에서 이어 가요.',
          }
        : null;
  const missing = REQUIRED_EQUIPMENT.filter((e) => !owned.includes(e));
  const levelBlocked = level === '입문';

  const canNext =
    step === 'season'
      ? !seasonBlocked
      : step === 'birth'
        ? /^\d{4}-\d{2}-\d{2}$/.test(birth)
        : step === 'level'
          ? level != null && !levelBlocked
          : step === 'equipment'
            ? missing.length === 0
            : step === 'pins'
              ? pins != null && changing == null
              : true;

  const shown = props.programs.filter((p) => p.goal === goal);

  return (
    <Modal
      open={open}
      onClose={() => {
        setStep('list');
        onClose();
      }}
      title={
        step === 'list' || !choice
          ? '프로그램 고르기'
          : changing
            ? `${VARIANT_LABELS[changing]} 바꾸기`
            : choice.name
      }
    >
      <div className="space-y-4">
        {step !== 'list' && step !== 'intro' && (
          <div className="flex gap-1" aria-label={`${at + 1} / ${steps.length}`}>
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full ${i <= at ? 'bg-sky' : 'bg-ink/10'}`}
              />
            ))}
          </div>
        )}

        {step === 'list' && (
          <div className="space-y-3">
            <Segmented
              label="목표"
              role="tablist"
              value={goal}
              onChange={setGoal}
              options={GOALS}
            />
            <ul className="divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted break-keep">
                        {p.summary}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              시즌 중 유지 · 성장기 프로그램은 곧 열려요.
            </p>
          </div>
        )}

        {step === 'intro' && choice && (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-ink break-keep">{choice.summary}</p>
              <p className="text-xs text-muted">
                {choice.weeks.length}주 · 주{' '}
                {choice.perWeek.length > 1
                  ? `${Math.min(...choice.perWeek)}~${Math.max(...choice.perWeek)}`
                  : choice.perWeek[0]}
                번 · {choice.origin}
              </p>
            </div>
            <div className="-mx-1 rounded-xl bg-ink/4">
              <DisclosureButton
                open={weeksOpen}
                onClick={() => setWeeksOpen((v) => !v)}
                label="자세히 보기"
              />
              {weeksOpen && (
                <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed break-keep">
                  <ul className="space-y-1 text-muted">
                    {choice.detail.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <ul className="space-y-1 text-ink">
                    {choice.weeks.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REQUIRED_EQUIPMENT.map((e) => (
                <span
                  key={e}
                  className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-ink"
                >
                  {e}
                </span>
              ))}
            </div>
            {props.blocked ? (
              <div className="space-y-1 rounded-xl bg-ink/5 p-3 text-sm">
                <p className="text-ink">{props.blocked.reason}</p>
                <p className="text-muted">{props.blocked.action}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => go('season')}
                className="min-h-12 w-full rounded-2xl bg-sky text-base font-bold text-white"
              >
                이걸로 할래요
              </button>
            )}
            <button
              type="button"
              onClick={() => go('list')}
              className="min-h-11 w-full text-sm font-semibold text-sky-strong"
            >
              다른 프로그램 보기
            </button>
          </div>
        )}

        {step === 'season' && (
          <div className="space-y-3">
            <p className="text-base font-semibold text-ink">지금 시즌은 언제예요?</p>
            <Segmented
              label="시즌"
              value={season}
              onChange={setSeason}
              options={SEASONS}
            />
            {seasonBlocked && <Blocked {...seasonBlocked} />}
          </div>
        )}

        {step === 'birth' && (
          <div className="space-y-3">
            <p className="text-base font-semibold text-ink">생년월일을 알려 주세요</p>
            <input
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-ink"
            />
            <p className="text-xs text-muted">만 18세부터 할 수 있어요.</p>
          </div>
        )}

        {step === 'level' && (
          <div className="space-y-2">
            <p className="text-base font-semibold text-ink">
              웨이트 경력은 얼마나 돼요?
            </p>
            <div role="radiogroup" aria-label="경력" className="space-y-1.5">
              {props.levels.map((l) => (
                <button
                  key={l.name}
                  type="button"
                  role="radio"
                  aria-checked={level === l.name}
                  onClick={() => setLevel(l.name)}
                  className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left ${level === l.name ? 'border-sky bg-sky/8' : 'border-line'}`}
                >
                  <span className="text-[15px] text-ink">{l.name}</span>
                  <span className="text-xs text-muted">{l.desc}</span>
                </button>
              ))}
            </div>
            {levelBlocked && (
              <Blocked
                reason="웨이트를 6개월 넘게 한 사람에게 맞춘 프로그램이에요."
                action="직접 고르기로 기본 동작을 먼저 익혀요."
              />
            )}
          </div>
        )}

        {step === 'equipment' && (
          <div className="space-y-3">
            <p className="text-base font-semibold text-ink">가진 장비를 골라 주세요</p>
            <p className="text-xs text-muted">
              바벨 · 덤벨 · 메디신볼은 꼭 있어야 해요.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...REQUIRED_EQUIPMENT,
                ...props.equipment.filter((e) => !REQUIRED_EQUIPMENT.includes(e)),
              ].map((e) => {
                const on = owned.includes(e);
                const required = REQUIRED_EQUIPMENT.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setOwned((list) =>
                        on ? list.filter((x) => x !== e) : [...list, e]
                      )
                    }
                    className={`min-h-10 rounded-full border px-3 text-sm ${on ? 'border-sky bg-sky text-white' : required ? 'border-ink/40 font-semibold text-ink' : 'border-line text-ink'}`}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            {missing.length > 0 && owned.length > 0 && (
              <p className="text-sm text-muted">{missing.join(', ')}도 있어야 해요.</p>
            )}
          </div>
        )}

        {step === 'pins' && (
          <div className="space-y-2">
            <p className="text-base font-semibold text-ink">
              {changing
                ? '바꿀 운동을 골라요'
                : `이 ${pins?.length ?? ''}가지로 해요`}
            </p>
            {changing ? (
              choices == null ? (
                <p className="text-sm text-muted">불러오는 중…</p>
              ) : choices.length === 0 ? (
                <p className="text-sm text-muted">바꿀 수 있는 운동이 없어요.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {choices.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPins((list) =>
                            (list ?? []).map((x) =>
                              x.variant === changing
                                ? { ...x, id: c.id, title: c.title }
                                : x
                            )
                          );
                          setChanging(null);
                        }}
                        className="flex min-h-12 w-full items-center text-left text-[15px] text-ink"
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : pins == null ? (
              <p className="text-sm text-muted">{pending ? '고르는 중…' : ''}</p>
            ) : (
              <ul className="divide-y divide-line">
                {pins.map((x) => (
                  <li
                    key={x.variant}
                    className="flex min-h-12 items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted">
                        {VARIANT_LABELS[x.variant]}
                      </span>
                      <span className="block truncate text-[15px] text-ink">
                        {x.title ?? '할 수 있는 운동이 없어요'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openChoices(x.variant)}
                      className="min-h-11 shrink-0 px-1 text-sm font-semibold text-sky-strong"
                    >
                      바꾸기
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'summary' && choice && (
          <div className="space-y-3 text-sm text-ink">
            <p className="text-base font-semibold">준비됐어요</p>
            {choice.perWeek.length > 1 && (
              <Segmented
                label="주당 횟수"
                value={String(perWeek)}
                onChange={(v) => setPerWeekPick(v === '2' ? 2 : 3)}
                options={choice.perWeek.map((n) => ({
                  value: String(n),
                  label: `주 ${n}번`,
                }))}
              />
            )}
            <p>
              {perWeek * choice.weeks.length}회 · {choice.weeks.length}주. 오늘부터 할 수 있어요.
            </p>
            <p className="text-muted break-keep">
              {choice.usesPct
                ? `기준 무게는 시작 전 ${TM_LOOKBACK_DAYS / 7}주 기록으로 정해요. 기록이 없으면 첫날 ${PLUS_RESERVE}개 남는 무게로 정해요.`
                : '기록이 없으면 처음엔 몇 개 남는 무게로 맞추고, 그 뒤부터 추천해요.'}
            </p>
          </div>
        )}

        {error && <ErrorLine>{error}</ErrorLine>}

        {step !== 'list' && step !== 'intro' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (changing ? setChanging(null) : back())}
              className="min-h-12 flex-1 rounded-2xl bg-ink/6 text-base font-medium text-ink"
            >
              뒤로
            </button>
            <button
              type="button"
              disabled={!canNext || pending}
              onClick={step === 'summary' ? submit : next}
              className="min-h-12 flex-[2] rounded-2xl bg-sky text-base font-bold text-white disabled:opacity-40"
            >
              {step === 'summary' ? (pending ? '시작하는 중…' : '시작') : '다음'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Blocked({ reason, action }: { reason: string; action: string }) {
  return (
    <div className="space-y-1 rounded-xl bg-ink/5 p-3 text-sm">
      <p className="text-ink">{reason}</p>
      <p className="text-muted">{action}</p>
    </div>
  );
}

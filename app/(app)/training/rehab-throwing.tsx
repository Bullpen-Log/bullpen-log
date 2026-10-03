'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  HALF_EFFORT_NOTE,
  THROWING_PAIN_RULES,
  THROWING_STEPS,
  judgeThrowingOpen,
  throwingFrequency,
  type RehabConditionKey,
  type RehabSeverity,
  type SidePair,
} from '@/lib/armcare/rehab';
import { openThrowingProgram } from '@/app/actions/rehab';
import { RehabChips, PAIN_OPTIONS } from './rehab-chips';
import { Ask, JudgedBox, NumberField, num } from './rehab-sheets';

/** 4단계 카드가 투구 복귀표에 쓰는 것 — 서버(armcare-section.tsx)가 rehabStatus 로 만든다 */
export type RehabThrowingView = {
  /** 공 운동을 통증 없이 한 날(painFreeBallDays) · 필요한 날(정도의 4단계 기간) */
  painFreeBallDays: number;
  needed: number;
  /** 투구 복귀표를 연 날 — 아직이면 null */
  openedOn: string | null;
  /** 플라이오볼이 있나 — 없으면 볼 드롭 · 벽 던지기 시험은 건너뛴다 */
  hasPlyo: boolean;
  severity: RehabSeverity;
  condition: RehabConditionKey | null;
  /** 시작하고 지난 날 — 병명 바닥(UCL 6주 등)을 본다 */
  daysSinceStart: number;
};

/** 투구 복귀표 열기 시험에 적는 것 */
export type ThrowingDraft = {
  push: [string, string];
  drop: [string, string];
  wall: [string, string];
  pain: number | null;
};

export const emptyThrowingDraft = (): ThrowingDraft => ({
  push: ['', ''],
  drop: ['', ''],
  wall: ['', ''],
  pain: null,
});

const pairOf = ([a, b]: [string, string]): SidePair | null => {
  const injured = num(a);
  const other = num(b);
  return injured == null || other == null ? null : { injured, other };
};

/** 판정 · 저장할 만큼 적었나 */
export function throwingFilled(d: ThrowingDraft, hasPlyo: boolean): boolean {
  return (
    pairOf(d.push) != null &&
    d.pain != null &&
    (!hasPlyo || (pairOf(d.drop) != null && pairOf(d.wall) != null))
  );
}

/** 적은 것 → 서버에 보낼 값(플라이오볼이 없으면 볼 드롭 · 벽 던지기는 null) */
export function throwingInput(d: ThrowingDraft, hasPlyo: boolean) {
  return {
    push: pairOf(d.push)!,
    drop: hasPlyo ? pairOf(d.drop) : null,
    wall: hasPlyo ? pairOf(d.wall) : null,
    pain: d.pain ?? 0,
  };
}

/** 지금 적은 것으로 연다면 — 화면에서 미리 판정한다(서버가 다시 본다) */
export function judgeThrowingDraft(
  view: RehabThrowingView,
  d: ThrowingDraft,
  normalPct: number,
  confidence: number
) {
  return judgeThrowingOpen({
    severity: view.severity,
    painFreeBallDays: view.painFreeBallDays,
    daysSinceStart: view.daysSinceStart,
    condition: view.condition,
    hasPlyo: view.hasPlyo,
    ...throwingInput(d, view.hasPlyo),
    normalPct,
    confidence,
  });
}

/**
 * 투구 복귀표 열기 시험 칸(가이드라인 9절 마지막 줄) — 4단계 카드의 열기 시트와 4단계 매주 확인의 ⑤가 같이 쓴다.
 * 앉아서 한 팔 메디신볼 밀기(≥ 100%) · (플라이오볼이 있으면) 프론 볼 드롭 30초(≥ 110%) · 한 팔 90/90 벽 던지기 30초
 * (≥ 115%) · 시험 중 통증.
 */
export function ThrowingTestFields({
  hasPlyo,
  draft,
  onChange,
}: {
  hasPlyo: boolean;
  draft: ThrowingDraft;
  onChange: (next: ThrowingDraft) => void;
}) {
  const setPair = (key: 'push' | 'drop' | 'wall', side: 0 | 1) => (value: string) => {
    const pair: [string, string] = [...draft[key]];
    pair[side] = value;
    onChange({ ...draft, [key]: pair });
  };
  return (
    <>
      <Ask title="앉아서 한 팔 메디신볼 밀기 (cm)">
        <p className="text-xs text-muted">
          벽에 등을 대고 앉아 2kg 메디신볼을 한 팔로 밀어 던져요. 세 번 던진 거리의
          평균을 적어요. 반대쪽만큼 나가면 통과예요.
        </p>
        <SidePairFields
          value={draft.push}
          onInjured={setPair('push', 0)}
          onOther={setPair('push', 1)}
          decimal
        />
      </Ask>
      {hasPlyo ? (
        <>
          <Ask title="프론 볼 드롭 30초 (횟수)">
            <p className="text-xs text-muted">
              엎드려 팔을 90/90 으로 들고, 30초 동안 플라이오볼을 놓았다 잡기를
              되풀이해요. 반대쪽의 110% 이상이면 통과예요.
            </p>
            <SidePairFields
              value={draft.drop}
              onInjured={setPair('drop', 0)}
              onOther={setPair('drop', 1)}
            />
          </Ask>
          <Ask title="한 팔 90/90 벽 던지기 30초 (횟수)">
            <p className="text-xs text-muted">
              팔을 90/90 으로 들고 30초 동안 벽에 플라이오볼을 던지고 받아요. 반대쪽의
              115% 이상이면 통과예요.
            </p>
            <SidePairFields
              value={draft.wall}
              onInjured={setPair('wall', 0)}
              onOther={setPair('wall', 1)}
            />
          </Ask>
        </>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
          플라이오볼이 없어 볼 드롭 · 벽 던지기 시험은 건너뛰고 밀기로 봐요.
        </p>
      )}
      <Ask title="시험 중 가장 아팠던 정도 (0~10)">
        <RehabChips
          label="시험 중 통증"
          options={PAIN_OPTIONS}
          value={draft.pain}
          onChange={(v) => onChange({ ...draft, pain: v })}
        />
      </Ask>
    </>
  );
}

function SidePairFields({
  value,
  onInjured,
  onOther,
  decimal = false,
}: {
  value: [string, string];
  onInjured: (v: string) => void;
  onOther: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="다친 쪽"
        value={value[0]}
        onChange={onInjured}
        decimal={decimal}
      />
      <NumberField
        label="반대쪽"
        value={value[1]}
        onChange={onOther}
        decimal={decimal}
      />
    </div>
  );
}

/**
 * [투구 복귀표 열기] 시트의 안 — 정상 대비 % · 자신감은 지난 7일 안의 매주 확인 것을 쓴다(그 확인이 없으면 카드가 매주 확인을
 * 먼저 연다). 통과하면 서버가 그 확인 줄에 남기고(openThrowingProgram) 카드에 투구 복귀표가 펼쳐진다.
 */
export function ThrowingOpenFlow({
  view,
  recent,
  onDone,
}: {
  view: RehabThrowingView;
  recent: { normalPct: number; confidence: number };
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(emptyThrowingDraft);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();
  const [fails, setFails] = useState<string[]>([]);

  const filled = throwingFilled(draft, view.hasPlyo);
  const judged = filled
    ? judgeThrowingDraft(view, draft, recent.normalPct, recent.confidence)
    : null;

  const submit = () => {
    setError(undefined);
    setFails([]);
    startPending(async () => {
      const res = await orOffline(
        openThrowingProgram(throwingInput(draft, view.hasPlyo)),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) {
        setError(res.error);
        setFails('fails' in res ? (res.fails ?? []) : []);
      } else onDone();
    });
  };

  return (
    <div className="space-y-5 text-sm leading-relaxed break-keep">
      <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink/85">
        이번 주 확인 — 다치기 전의{' '}
        <b className="text-numeric font-semibold">{recent.normalPct}%</b> · 던질 자신감{' '}
        <b className="text-numeric font-semibold">{recent.confidence}</b>
        <span className="block text-xs text-muted">
          90% 이상 · 자신감 7 이상이어야 열려요. 공 운동을 통증 없이{' '}
          {Math.min(view.painFreeBallDays, view.needed)}/{view.needed}일 했어요.
        </span>
      </p>

      <ThrowingTestFields hasPlyo={view.hasPlyo} draft={draft} onChange={setDraft} />

      {judged && <JudgedBox pass={judged.pass} fails={judged.fails} />}
      {error && (
        <ErrorLine>
          {error}
          {fails.length > 0 && ` ${fails.join(' · ')}`}
        </ErrorLine>
      )}
      <p className="text-xs text-muted">가능하면 진료 때 투구 복귀를 물어보세요.</p>
      <Button
        type="button"
        onClick={submit}
        disabled={!filled || !judged?.pass || pending}
        className="w-full"
      >
        {pending ? '여는 중…' : '투구 복귀표 열기'}
      </Button>
    </div>
  );
}

/**
 * 투구 복귀표(가이드라인 11절) — 여섯 칸 · 정도별 빈도 · 던지기 통증 규칙(Axe) · 절반 힘 한 줄. 기록은 남기지 않는다(표만).
 */
export function ThrowingProgram({ severity }: { severity: RehabSeverity }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed break-keep">
      <ol className="divide-y divide-line overflow-hidden rounded-xl bg-surface-2">
        {THROWING_STEPS.map((s, i) => (
          <li key={s.distance} className="flex items-baseline gap-3 px-3.5 py-2.5">
            <span className="text-numeric w-4 shrink-0 text-xs text-muted">
              {i + 1}
            </span>
            <span className="w-12 shrink-0 font-semibold text-ink">{s.distance}</span>
            <span className="min-w-0 flex-1 text-ink/85">{s.plan}</span>
          </li>
        ))}
      </ol>
      <p className="font-semibold text-sky-strong">{throwingFrequency(severity)}</p>
      <section className="space-y-1.5">
        <h5 className="text-xs font-bold text-muted">던질 때 아프면</h5>
        <ul className="space-y-1.5">
          {THROWING_PAIN_RULES.map((r) => (
            <li key={r.when}>
              <b className="font-semibold text-ink">{r.when}</b>
              <span className="text-ink/85"> — {r.then}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted">{HALF_EFFORT_NOTE}</p>
    </div>
  );
}

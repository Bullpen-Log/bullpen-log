'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createPitchLogs, type OrgActionState } from '@/app/actions/org-record';
import { Badge, Button, Card, Field, FormError, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import { EFFORT_CHIPS } from '@/lib/pitch-effort';
import { SESSION_TYPES } from '@/lib/session-type';

export type RecordRow = {
  id: string;
  nickname: string;
  tags: string[];
  can: 'ok' | 'no-user' | 'no-consent';
};

/**
 * 대신 기록 폼(3단계 · 경기 투구수표) — 날짜 · 종류 · 기본 강도 하나, 선수마다 투구수(·강도 ·최고 구속). 빈 줄은 건너뛴다.
 * 종류가 휴식이면 투구수 대신 체크 — 그날 안 던진 선수를 한 번에 '휴식'으로.
 */
export function RecordForm({
  orgId,
  rows,
  todayKey,
  memberWord,
}: {
  orgId: string;
  rows: RecordRow[];
  todayKey: string;
  memberWord: string;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(createPitchLogs),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef<OrgActionState>(undefined);
  const [type, setType] = useState<string>('경기');
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) {
      toast(state.success);
      formRef.current
        ?.querySelectorAll<HTMLInputElement>('input[data-row]')
        .forEach((el) => {
          if (el.type === 'checkbox') el.checked = false;
          else el.value = '';
        });
    }
  }, [state]);
  const resting = type === '휴식';
  const ok = rows.filter((r) => r.can === 'ok');
  const blocked = rows.filter((r) => r.can !== 'ok');

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <Card className="grid gap-3 sm:grid-cols-3">
        <Field label="날짜">
          <Input
            name="date"
            type="date"
            defaultValue={todayKey}
            max={todayKey}
            required
          />
        </Field>
        <Field label="종류">
          <select
            name="sessionType"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:outline-none desk:border-line desk:bg-surface-2"
          >
            {SESSION_TYPES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} — {t.hint}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="기본 강도"
          hint={resting ? '휴식은 강도 없음' : '줄마다 따로 적으면 그 값'}
        >
          <select
            name="effortPct"
            defaultValue={type === '경기' ? '100' : '80'}
            disabled={resting}
            className="w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:outline-none disabled:opacity-50 desk:border-line desk:bg-surface-2"
          >
            {EFFORT_CHIPS.map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="divide-y divide-line p-0">
        {ok.length === 0 && (
          <p className="px-4 py-4 text-xs text-muted">
            투구 기록을 공유한 {memberWord}이 아직 없어요.
          </p>
        )}
        {ok.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="w-24 shrink-0 truncate text-sm font-semibold text-ink">
              {r.nickname}
            </span>
            {r.tags[0] && <Badge className="hidden sm:inline-flex">{r.tags[0]}</Badge>}
            <span className="ml-auto flex items-center gap-2">
              {resting ? (
                <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name={`rest-${r.id}`}
                    data-row
                    className="h-4 w-4 accent-sky"
                  />{' '}
                  휴식
                </label>
              ) : (
                <>
                  <Input
                    name={`pitch-${r.id}`}
                    data-row
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    placeholder="투구수"
                    aria-label={`${r.nickname} 투구수`}
                    className="w-24"
                  />
                  <select
                    name={`effort-${r.id}`}
                    data-row
                    defaultValue=""
                    aria-label={`${r.nickname} 강도`}
                    className="rounded-xl border border-transparent bg-ink/5 px-2 py-2.5 text-xs text-ink desk:border-line desk:bg-surface-2"
                  >
                    <option value="">기본</option>
                    {EFFORT_CHIPS.map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </select>
                  <Input
                    name={`max-${r.id}`}
                    data-row
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={30}
                    max={200}
                    placeholder="최고 km/h"
                    aria-label={`${r.nickname} 최고 구속`}
                    className="hidden w-28 sm:block"
                  />
                </>
              )}
            </span>
          </div>
        ))}
        {blocked.map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 opacity-60">
            <span className="w-24 shrink-0 truncate text-sm font-semibold text-ink">
              {r.nickname}
            </span>
            <span className="text-xs text-muted">
              {r.can === 'no-user'
                ? '가입 전 — 가입하면 적을 수 있어요'
                : '투구 기록 공유를 안 켬'}
            </span>
          </div>
        ))}
      </Card>

      {state?.error && <FormError>{state.error}</FormError>}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? '저장하는 중…' : '기록 저장'}
    </Button>
  );
}

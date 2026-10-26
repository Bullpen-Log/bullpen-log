'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  deleteOrgEvent,
  saveOrgEvent,
  type OrgActionState,
} from '@/app/actions/org-calendar';
import { ConfirmButton } from '@/components/master/confirm-button';
import {
  Badge,
  Button,
  Card,
  Field,
  FormError,
  Input,
  Textarea,
} from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import {
  EVENT_KINDS,
  EVENT_KIND_LABEL,
  EVENT_MEMO_MAX,
  EVENT_TITLE_MAX,
  type EventKind,
  type OrgKind,
} from '@/lib/org/rules';

export type EventView = {
  id: string;
  key: string;
  time: string | null;
  kind: string;
  title: string;
  memo: string | null;
  memberId: string | null;
};

const selectCls =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:outline-none desk:border-line desk:bg-surface-2';

/**
 * 고른 날의 일정(5단계 팀 달력 · 레슨 시간표) — 목록 + 더하기 · 고치기 폼. 레슨장은 '레슨'을 회원에 붙인다.
 */
export function CalendarDay({
  orgId,
  orgKind,
  dayKey,
  events,
  members,
}: {
  orgId: string;
  orgKind: OrgKind;
  dayKey: string;
  events: EventView[];
  members: { id: string; nickname: string }[];
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(saveOrgEvent),
    undefined
  );
  const [editing, setEditing] = useState<EventView | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>(
    orgKind === 'LESSON' ? 'lesson' : 'training'
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [seen, setSeen] = useState<OrgActionState>(undefined);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) {
      setEditing(null);
      setOpen(false);
    }
  }
  useEffect(() => {
    if (state?.success) {
      toast(state.success);
      formRef.current?.reset();
    }
  }, [state]);
  const nameOf = new Map(members.map((m) => [m.id, m.nickname]));
  const label = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${dayKey}T00:00:00Z`));

  function startEdit(e: EventView) {
    setEditing(e);
    setKind(e.kind as EventKind);
    setOpen(true);
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">{label}</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen((v) => !v);
          }}
        >
          {open && !editing ? '닫기' : '일정 더하기'}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted">이날 일정이 없어요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-12 shrink-0 text-xs text-muted">
                {e.time ?? '종일'}
              </span>
              <Badge>{EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}</Badge>
              <span className="min-w-0 flex-1 truncate text-ink">
                {e.memberId ? `${nameOf.get(e.memberId) ?? '?'} · ` : ''}
                {e.title}
              </span>
              <span className="flex items-center gap-1">
                {orgKind === 'TEAM' ? (
                  <Link
                    href={`/manage/calendar/${e.id}`}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-strong hover:bg-ink/5"
                  >
                    참석 · 메뉴
                  </Link>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(e)}
                >
                  고치기
                </Button>
                <ConfirmButton
                  action={deleteOrgEvent}
                  fields={{ id: e.id }}
                  message="이 일정을 지울까요?"
                  doneToast="지웠어요."
                >
                  지우기
                </ConfirmButton>
              </span>
              {e.memo && <p className="basis-full text-xs text-muted">{e.memo}</p>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          key={editing?.id ?? 'new'}
          ref={formRef}
          action={action}
          className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3 motion-safe:animate-fade-in"
        >
          <input type="hidden" name="orgId" value={orgId} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="날짜">
              <Input
                name="date"
                type="date"
                defaultValue={editing?.key ?? dayKey}
                required
              />
            </Field>
            <Field label="시각" hint="비우면 하루 종일">
              <Input name="time" type="time" defaultValue={editing?.time ?? ''} />
            </Field>
            <Field label="종류">
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as EventKind)}
                className={selectCls}
              >
                {EVENT_KINDS.filter((k) =>
                  orgKind === 'LESSON' ? k.key !== 'game' : true
                ).map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {kind === 'lesson' && (
            <Field label="회원" hint="고르면 제목을 비워도 돼요">
              <select
                name="memberId"
                defaultValue={editing?.memberId ?? ''}
                className={selectCls}
              >
                <option value="">(회원 없이)</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="제목">
            <Input
              name="title"
              type="text"
              defaultValue={editing?.title ?? ''}
              maxLength={EVENT_TITLE_MAX}
              placeholder={
                kind === 'game'
                  ? '○○ 리그 3차전'
                  : kind === 'lesson'
                    ? '투구 레슨'
                    : '팀 훈련'
              }
            />
          </Field>
          <Field label="메모" hint="선택">
            <Textarea
              name="memo"
              rows={2}
              defaultValue={editing?.memo ?? ''}
              maxLength={EVENT_MEMO_MAX}
            />
          </Field>
          {state?.error && <FormError>{state.error}</FormError>}
          <div className="flex gap-2">
            <Submit editing={!!editing} />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '저장하는 중…' : editing ? '고치기' : '더하기'}
    </Button>
  );
}

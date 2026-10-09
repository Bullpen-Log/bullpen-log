'use client';

import { useState, useTransition } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-delete';
import { toast } from '@/components/toast';
import { orOffline, OFFLINE_MESSAGE } from '@/lib/action-offline';
import { hasNativeBridge } from '@/lib/native-bridge';
import { deleteCalendarEvent, saveCalendarEvent } from '@/app/actions/calendar-event';
import {
  EVENT_MEMO_MAX,
  EVENT_TITLE_MAX,
  REMIND_OPTIONS,
  defaultRemind,
  timeLabel,
  type CalendarEventView,
} from '@/lib/calendar-event';

const OFFLINE = { ok: false as const, error: OFFLINE_MESSAGE };

/** '30분 전' — 목록 줄에 붙인다 */
function remindText(e: CalendarEventView) {
  const o = REMIND_OPTIONS.find((x) => x.value === e.remindMin);
  if (!o || o.value == null) return null;
  return e.time ? o.label : o.allDayLabel;
}

/**
 * 캘린더 밑 칸의 '일정' — 그날 일정 목록과 더하기 · 고치기 · 지우기.
 *
 * 창을 띄우지 않고 이 칸 안에서 폼이 펴진다. 달력을 보며 적는 것이라 달력이 가려지면 안 된다.
 * 저장하면 서버가 돌려준 줄로 부르는 쪽 목록을 고친다(onSaved) — 홈 전체를 다시 받지 않는다.
 */
export function DaySchedule({
  date,
  events,
  onSaved,
  onDeleted,
}: {
  date: string;
  /** 그날 일정(차례대로) */
  events: CalendarEventView[];
  onSaved: (event: CalendarEventView) => void;
  onDeleted: (id: string) => void;
}) {
  /* 펴 둔 폼 — 'new' 는 새 일정, 그 밖은 고치는 일정의 id */
  const [editing, setEditing] = useState<'new' | string | null>(
    events.length === 0 ? 'new' : null
  );
  const editingEvent = events.find((e) => e.id === editing) ?? null;

  return (
    <div className="space-y-3">
      {events.length > 0 && (
        <ul className="divide-y divide-line">
          {events.map((e) =>
            editing === e.id ? (
              <li key={e.id} className="py-3">
                <EventForm
                  date={date}
                  event={e}
                  onDone={(saved) => {
                    onSaved(saved);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                  onDeleted={() => {
                    onDeleted(e.id);
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setEditing(e.id)}
                  aria-label={`${e.title}, ${timeLabel(e.time)}, 고치기`}
                  className="flex min-h-14 w-full items-start gap-3 py-2.5 text-left"
                >
                  <span
                    className="mt-1 h-4 w-1 shrink-0 rounded-full bg-sky"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {e.title}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {timeLabel(e.time)}
                      {remindText(e) && (
                        <>
                          <Bell aria-hidden className="ml-1 h-3 w-3" />
                          <span className="sr-only">알림</span>
                          {remindText(e)}
                        </>
                      )}
                    </span>
                    {e.memo && (
                      <span className="mt-0.5 block whitespace-pre-line break-words text-xs text-muted">
                        {e.memo}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          )}
        </ul>
      )}

      {editing === 'new' ? (
        <EventForm
          date={date}
          event={null}
          onDone={(saved) => {
            onSaved(saved);
            setEditing(null);
          }}
          onCancel={events.length === 0 ? undefined : () => setEditing(null)}
        />
      ) : (
        !editingEvent && (
          <Button
            variant="secondary"
            onClick={() => setEditing('new')}
            className="w-full py-2.5"
          >
            <Plus aria-hidden className="h-4 w-4" />
            일정 추가
          </Button>
        )
      )}
    </div>
  );
}

function EventForm({
  date,
  event,
  onDone,
  onCancel,
  onDeleted,
}: {
  date: string;
  event: CalendarEventView | null;
  onDone: (saved: CalendarEventView) => void;
  /** 없으면 취소 단추를 안 둔다(일정이 하나도 없는 날의 첫 폼) */
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');
  /* 'auto' — 아직 안 골랐다: 시각이 있으면 30분 전, 하루 종일이면 그날 아침(defaultRemind) */
  const [remind, setRemind] = useState<number | null | 'auto'>(
    event ? event.remindMin : 'auto'
  );
  const remindMin = remind === 'auto' ? defaultRemind(time || null) : remind;
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  const save = () =>
    start(async () => {
      setError(undefined);
      const res = await orOffline(
        saveCalendarEvent(event?.id ?? null, { date, title, time, memo, remindMin }),
        OFFLINE
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(event ? '고쳤어요' : '일정을 더했어요');
      if (!event) {
        setTitle('');
        setTime('');
        setMemo('');
        setRemind('auto');
      }
      onDone(res.event);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-3"
    >
      <Field label="일정">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EVENT_TITLE_MAX}
          placeholder="예: 연습 경기, 병원"
          autoFocus={event === null}
          required
        />
      </Field>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="시각" hint={time ? undefined : '비우면 하루 종일'}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {time && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTime('')}
            className="mb-0.5 px-3 py-2.5"
          >
            하루 종일
          </Button>
        )}
      </div>
      <Field
        label="알림"
        hint={hasNativeBridge() ? undefined : '알림은 아이폰 앱에서 와요.'}
      >
        <select
          value={remindMin == null ? 'none' : String(remindMin)}
          onChange={(e) =>
            setRemind(e.target.value === 'none' ? null : Number(e.target.value))
          }
          className="w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink transition-colors focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2"
        >
          {REMIND_OPTIONS.map((o) => (
            <option
              key={String(o.value)}
              value={o.value == null ? 'none' : String(o.value)}
            >
              {time ? o.label : o.allDayLabel}
            </option>
          ))}
        </select>
      </Field>
      <Field label="메모">
        <Textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={EVENT_MEMO_MAX}
          rows={2}
          placeholder="선택"
        />
      </Field>
      <FormError>{error}</FormError>
      <div className="flex items-center gap-2">
        {event && onDeleted && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            aria-label="일정 지우기"
            className="grid h-11 w-11 place-items-center rounded-full text-danger transition-colors hover:bg-danger-bg desk:h-9 desk:w-9"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        )}
        <span className="flex-1" />
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="px-4 py-2.5"
          >
            취소
          </Button>
        )}
        <Button
          type="submit"
          disabled={pending || !title.trim()}
          className="px-5 py-2.5"
        >
          {pending ? '저장하는 중…' : event ? '저장' : '추가'}
        </Button>
      </div>

      {event && onDeleted && (
        <ConfirmDialog
          open={asking}
          onClose={() => setAsking(false)}
          title="이 일정을 지울까요?"
          detail={event.title}
          confirmLabel="지우기"
          pending={pending}
          onConfirm={() =>
            start(async () => {
              const res = await orOffline(deleteCalendarEvent(event.id), OFFLINE);
              if (!res.ok) {
                setError(res.error);
                setAsking(false);
                return;
              }
              setAsking(false);
              toast('지웠어요');
              onDeleted();
            })
          }
        />
      )}
    </form>
  );
}

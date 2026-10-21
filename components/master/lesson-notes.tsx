'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createLessonNote,
  deleteLessonNote,
  type OrgActionState,
} from '@/app/actions/org-notes';
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
import { HOMEWORK_MAX, NOTE_MAX, type OrgKind } from '@/lib/org/rules';

export type NoteView = {
  id: string;
  key: string;
  body: string;
  homework: string | null;
  mine: boolean;
};

/**
 * 레슨 노트 · 숙제(4단계) — 회원 카드 아래. 레슨장은 '레슨 노트'(수강권 한 회 차감 선택), 팀은 '코치 노트'.
 * 숙제는 다음 노트를 쓸 때까지 맨 위에 보인다.
 */
export function LessonNotes({
  memberId,
  orgKind,
  todayKey,
  notes,
  hasPass,
}: {
  memberId: string;
  orgKind: OrgKind;
  todayKey: string;
  notes: NoteView[];
  hasPass: boolean;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(createLessonNote),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  /* 저장이 끝나면 폼을 접는다 — 그리는 도중에 상태를 맞춘다(effect 안의 setState 는 한 그림 늦고 lint 가 막는다, auth-form 과 같은 꼴) */
  const [seen, setSeen] = useState<OrgActionState>(undefined);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) setOpen(false);
  }
  useEffect(() => {
    if (state?.success) {
      toast(state.success);
      formRef.current?.reset();
    }
  }, [state]);
  const word = orgKind === 'LESSON' ? '레슨 노트' : '코치 노트';
  const latestHomework = notes.find((n) => n.homework);
  const fmt = (key: string) => {
    const [, m, d] = key.split('-');
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">{word}</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '닫기' : `${word} 쓰기`}
        </Button>
      </div>

      {latestHomework && (
        <div className="rounded-xl border border-sky/30 bg-sky/5 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-sky-strong">
            숙제 · {fmt(latestHomework.key)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-ink">
            {latestHomework.homework}
          </p>
        </div>
      )}

      {open && (
        <form
          ref={formRef}
          action={action}
          className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3 motion-safe:animate-fade-in"
        >
          <input type="hidden" name="memberId" value={memberId} />
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <Field label="날짜">
              <Input
                name="date"
                type="date"
                defaultValue={todayKey}
                max={todayKey}
                required
              />
            </Field>
            {orgKind === 'LESSON' && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="countPass"
                  defaultChecked={hasPass}
                  disabled={!hasPass}
                  className="h-4 w-4 accent-sky"
                />
                수강권 한 회 차감
                {!hasPass && (
                  <span className="text-xs text-muted">(쓸 수 있는 수강권 없음)</span>
                )}
              </label>
            )}
          </div>
          <Field label="오늘 한 것 · 본 것">
            <Textarea
              name="body"
              rows={4}
              maxLength={NOTE_MAX}
              placeholder="릴리스 포인트 앞으로 · 하체 쓰임 좋아짐 · 커브 회전 10회"
            />
          </Field>
          <Field label="숙제" hint="선택 — 다음 레슨까지">
            <Input
              name="homework"
              type="text"
              maxLength={HOMEWORK_MAX}
              placeholder="섀도 피칭 20회 × 3일"
            />
          </Field>
          {/* 한 일(2026-10-21 개편 3단계) — 선수의 레슨 줄 · 트레이닝 엔진이 읽는다(lib/org/lesson-work.ts) */}
          <Field label="한 일" hint="한 줄에 하나 — 운동 세트×횟수 메모">
            <Textarea
              name="exercises"
              rows={3}
              placeholder={'스쿼트 3x10 60kg\n런지 12회\n밴드 외회전'}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="던진 공 수" hint="선택">
              <Input
                name="pitchCount"
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                placeholder="0"
              />
            </Field>
            <Field label="강도 1~10" hint="선택">
              <Input
                name="intensity"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                placeholder="5"
              />
            </Field>
          </div>
          {state?.error && <FormError>{state.error}</FormError>}
          <Submit />
        </form>
      )}

      {notes.length === 0 ? (
        <p className="text-xs text-muted">아직 {word}가 없어요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{fmt(n.key)}</span>
                {n.homework && <Badge>숙제</Badge>}
                <span className="ml-auto">
                  <ConfirmButton
                    action={deleteLessonNote}
                    fields={{ id: n.id }}
                    message="이 노트를 지울까요?"
                    doneToast="지웠어요."
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink">{n.body}</p>
              {n.homework && (
                <p className="mt-1 text-xs text-sky-strong">숙제: {n.homework}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '남기는 중…' : '남기기'}
    </Button>
  );
}

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createLessonNote,
  deleteLessonNote,
  type OrgActionState,
} from '@/app/actions/org-notes';
import { ConfirmButton } from '@/components/master/confirm-button';
import { OrgThread } from '@/components/master/org-thread';
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
  /** 말 수 · 회원이 쓴 안 푼 말 수 · 붙인 영상 수(2단계) */
  talk: { total: number; open: number };
  videos: number;
};

/**
 * 레슨 노트 · 숙제(4단계) — 회원 카드 아래. 레슨장은 '레슨 노트', 팀은 '코치 노트'. 수강권은 덕아웃 예약을 '끝남'으로 바꿀 때 준다(app/actions/lessons.ts finishBooking).
 * 숙제는 다음 노트를 쓸 때까지 맨 위에 보인다.
 */
export function LessonNotes({
  memberId,
  orgId,
  orgKind,
  todayKey,
  canLink,
  selfLogs,
  notes,
}: {
  memberId: string;
  orgId: string;
  orgKind: OrgKind;
  todayKey: string;
  /** 던진 공이 선수 투구 기록에 들어가나(가입 · 투구 공유) — 2단계 */
  canLink: boolean;
  /** 선수가 최근 7일 직접 남긴 기록 — 같은 공이면 잇는다 */
  selfLogs: { id: string; key: string; label: string }[];
  notes: NoteView[];
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
            <Field label="강도 1~10" hint={canLink ? '던진 공이 있으면 꼭' : '선택'}>
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
          {canLink ? (
            <Field
              label="던진 공을 선수 투구 기록에"
              hint="선수가 그날 직접 남긴 기록이 있으면 같은 공인지 골라요(두 번 세지 않게)"
            >
              <select
                name="link"
                defaultValue=""
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">새로 남기기(선수 기록이 없을 때)</option>
                <option value="new">따로 던진 공 — 새로 남기기</option>
                {selfLogs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {fmt(l.key)} {l.label}에 잇기
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-xs text-muted">
              가입 전이거나 투구 기록 공유를 안 켜서 던진 공은 노트에만 남아요.
            </p>
          )}
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
              <OrgThread orgId={orgId} kind="note" id={n.id} talk={n.talk} videos={n.videos} />
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

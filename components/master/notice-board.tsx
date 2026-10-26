'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  deleteOrgNotice,
  saveOrgNotice,
  type OrgActionState,
} from '@/app/actions/org-notices';
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
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from '@/lib/org/rules';

export type NoticeView = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  key: string;
  /** 읽은 선수 수(3단계) */
  read?: number;
};

/** 조직 공지(5단계) — 고정 먼저. 쓰기 · 고치기 폼 하나를 같이 쓴다 */
export function NoticeBoard({
  orgId,
  notices,
  players = 0,
}: {
  orgId: string;
  notices: NoticeView[];
  /** 공지를 볼 수 있는 선수 수(가입한 활동 선수) — 0 이면 읽음 수를 안 보인다 */
  players?: number;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(saveOrgNotice),
    undefined
  );
  const [editing, setEditing] = useState<NoticeView | null>(null);
  const [open, setOpen] = useState(false);
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

  return (
    <div className="stack-page">
      <div className="flex justify-end">
        <Button
          type="button"
          variant={open && !editing ? 'secondary' : 'primary'}
          onClick={() => {
            setEditing(null);
            setOpen((v) => !v);
          }}
        >
          {open && !editing ? '닫기' : '공지 쓰기'}
        </Button>
      </div>

      {open && (
        <Card key={editing?.id ?? 'new'} className="motion-safe:animate-fade-in">
          <form ref={formRef} action={action} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="제목">
              <Input
                name="title"
                type="text"
                defaultValue={editing?.title ?? ''}
                maxLength={NOTICE_TITLE_MAX}
                required
              />
            </Field>
            <Field label="내용">
              <Textarea
                name="body"
                rows={6}
                defaultValue={editing?.body ?? ''}
                maxLength={NOTICE_BODY_MAX}
                required
              />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={editing?.pinned ?? false}
                className="h-4 w-4 accent-sky"
              />{' '}
              맨 위에 고정
            </label>
            {state?.error && <FormError>{state.error}</FormError>}
            <div className="flex gap-2">
              <Submit editing={!!editing} />
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                취소
              </Button>
            </div>
          </form>
        </Card>
      )}

      {notices.length === 0 ? (
        <p className="text-sm text-muted">
          아직 공지가 없어요. 훈련 시간 변경 · 준비물 · 경기 집합을 올려 두면 선수가
          참여 화면에서 봐요.
        </p>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n.id} id={n.id} className="space-y-2">
              <div className="flex items-center gap-2">
                {n.pinned && <Badge className="text-sky-strong">고정</Badge>}
                <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {n.title}
                </h2>
                <span className="text-xs text-muted">
                  {n.key.slice(5).replace('-', '/')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              <div className="flex items-center justify-end gap-1">
                {players ? (
                  <span className="mr-auto text-xs text-muted">
                    읽음 {n.read ?? 0}/{players}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(n);
                    setOpen(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  고치기
                </Button>
                <ConfirmButton
                  action={deleteOrgNotice}
                  fields={{ id: n.id }}
                  message="이 공지를 지울까요?"
                  doneToast="지웠어요."
                >
                  지우기
                </ConfirmButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '저장하는 중…' : editing ? '고치기' : '올리기'}
    </Button>
  );
}

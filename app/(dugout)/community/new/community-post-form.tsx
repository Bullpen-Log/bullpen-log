'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createPost, type CommunityState } from '@/app/actions/community';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import {
  INJURY_NOTE,
  POST_BODY_MAX,
  POST_CATEGORIES,
  POST_TAGS,
  POST_TITLE_MAX,
  isPostCategory,
  type PostCategory,
} from '@/lib/community';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';
import { CommunityMediaPicker } from '@/components/community/community-media-picker';

function SubmitButton({ busy }: { busy: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || busy}>
      {pending ? '올리는 중…' : busy ? '사진 · 영상 올리는 중…' : '올리기'}
    </Button>
  );
}

const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink transition-colors peer-checked:bg-sky peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky desk:bg-surface-2';

const PLACEHOLDER: Record<PostCategory, string> = {
  free: '오늘 경기 어떻게 봤어요?',
  question: '슬라이더가 자꾸 빠져요',
  meetup: '토요일 오전 캐치볼 하실 분',
  team: '주말 리그 팀원 모집해요',
};

/**
 * 글쓰기 폼 — 게시판을 먼저 고르면 그 게시판의 말머리가 나온다(docs/designs/dugout-community.md). 제목 · 내용 · 사진 · 영상.
 * 게시판 · 말머리는 칩처럼 보이는 라디오(눌린 것만 파랑).
 */
export function CommunityPostForm({ initialCategory }: { initialCategory?: string }) {
  const [state, formAction] = useActionState<CommunityState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(createPost),
    undefined
  );
  /* 오류로 되돌아왔을 때 쓰던 글을 그대로 되살린다 */
  const before = state?.values;
  const keptCategory = kept(before, 'category');
  const [category, setCategory] = useState<PostCategory>(
    isPostCategory(keptCategory)
      ? keptCategory
      : isPostCategory(initialCategory)
        ? initialCategory
        : POST_CATEGORIES[0].key
  );
  const [tag, setTag] = useState(kept(before, 'tag') ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      <FormError>{state?.error}</FormError>

      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-muted">게시판</legend>
        <div className="flex flex-wrap gap-2">
          {POST_CATEGORIES.map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={c.key}
                checked={category === c.key}
                onChange={() => {
                  setCategory(c.key);
                  setTag('');
                }}
                className="peer sr-only"
              />
              <span className={CHIP}>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-muted">
          말머리 <span className="text-muted/70">고르지 않아도 돼요</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {POST_TAGS[category].map((t) => (
            <label key={t.key} className="cursor-pointer">
              <input
                type="radio"
                name="tag"
                value={t.key}
                checked={tag === t.key}
                /* 다시 누르면 풀린다 — 라디오는 스스로 안 풀려서 click 으로 */
                onClick={() => setTag((now) => (now === t.key ? '' : t.key))}
                onChange={() => {}}
                className="peer sr-only"
              />
              <span className={CHIP}>{t.label}</span>
            </label>
          ))}
        </div>
        {tag === 'injury' && (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn">{INJURY_NOTE}</p>
        )}
      </fieldset>

      <Field label="제목" hint={`${POST_TITLE_MAX}자까지 적을 수 있어요.`}>
        <Input
          name="title"
          defaultValue={kept(before, 'title')}
          maxLength={POST_TITLE_MAX}
          placeholder={PLACEHOLDER[category]}
          required
        />
      </Field>

      <Field
        label="내용"
        hint={`${POST_BODY_MAX}자까지 적을 수 있어요. 전화번호 · 카톡 아이디는 가려져요. 연락은 댓글로 해요.`}
      >
        <Textarea
          name="body"
          rows={10}
          defaultValue={kept(before, 'body')}
          maxLength={POST_BODY_MAX}
          placeholder="자유롭게 적어 보세요."
          required
        />
      </Field>

      <CommunityMediaPicker onBusy={setBusy} />

      <div className="flex gap-3">
        <SubmitButton busy={busy} />
        <ButtonLink href="/community" variant="secondary">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}

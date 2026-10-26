'use client';

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { createPost, updatePost, type CommunityState } from '@/app/actions/community';
import { guardFormAction } from '@/lib/action-offline';
import { kept, type FormValues } from '@/lib/form-values';
import {
  BOARD_GUIDES,
  INJURY_NOTE,
  POST_BODY_MAX,
  POST_CATEGORIES,
  POST_TAGS,
  POST_TITLE_MAX,
  STAFF_BADGE_NOTE,
  TAG_EXAMPLES,
  isPostCategory,
  type PostCategory,
} from '@/lib/community';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';
import { CommunityMediaPicker } from '@/components/community/community-media-picker';
import { CommunityCardPicker } from '@/components/community/community-card-picker';
import type { CardOption } from '@/lib/community-cards';
import { CommunityFormFields, type TeamPrefill } from '@/components/community/community-form-fields';
import {
  clearDraft,
  draftKey,
  loadDraft,
  markSubmitting,
  saveDraft,
  unmarkSubmitting,
} from '@/components/community/community-draft';

function SubmitButton({ busy, editing }: { busy: boolean; editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || busy}>
      {pending ? (editing ? '고치는 중…' : '올리는 중…') : busy ? '사진 · 영상 올리는 중…' : editing ? '고치기' : '올리기'}
    </Button>
  );
}

const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink transition-colors peer-checked:bg-sky peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky desk:bg-surface-2';

const noSubscribe = () => () => {};

/** 단계(휴대폰만 — PC 는 한 화면에 다) — 게시판 · 양식 · 글. 양식이 없는 게시판(자유 · 질문)은 둘 */
type Step = 'board' | 'form' | 'text';

/**
 * 글쓰기 · 고치기 폼 — 게시판을 먼저 고르면 그 게시판의 말머리 · 양식이 나온다(docs/designs/dugout-community.md). 제목 · 내용 · 사진 · 영상.
 * 게시판 · 말머리는 칩처럼 보이는 라디오(눌린 것만 파랑).
 * 2026-10-26: 휴대폰은 한 화면에 한 묶음씩(게시판 → 양식 → 글) — 칸은 모두 폼 안에 남아 앞 단계로 가도 적은 것이 그대로다.
 * 적는 동안 이 기기에 초안을 남기고(components/community/community-draft.ts), 다음에 열면 '이어 쓰기'를 묻는다.
 */
export function CommunityPostForm({
  initialCategory,
  cardOptions = [],
  initialCard,
  teamPrefill = null,
  editing,
  isAdmin = false,
}: {
  initialCategory?: string;
  /** '싱커 기록 붙이기' 목록(lib/community-cards.ts recentCardOptions) */
  cardOptions?: CardOption[];
  /** 싱커 결과 화면의 '덕아웃에 올리기'로 왔을 때 붙여 둘 기록(?card=velocity:… 등) */
  initialCard?: string;
  /** 팀 관리의 내 팀 정보 — 팀 홍보 · 선수 모집 양식을 미리 채운다 */
  teamPrefill?: TeamPrefill;
  /** 고치기 — 지금 글의 값 · 사진 · 잠긴 것 */
  editing?: {
    id: string;
    values: FormValues;
    media: { path: string; url: string; video: boolean }[];
    /** 참가 · 신청 · 대화가 있어 게시판을 못 바꿈 */
    lockCategory: boolean;
    /** 신청이 있어 팀 말머리를 못 바꿈 */
    lockTag: boolean;
    hasCard: boolean;
  };
  /** 운영자 글 표시 칸 */
  isAdmin?: boolean;
}) {
  const key = draftKey(editing?.id);
  /* 이 기기에 남은 초안 — 붙은 뒤에만 읽는다(서버 그림과 어긋나지 않게) */
  const stored = useSyncExternalStore(noSubscribe, () => (loadDraft(key) ? key : null), () => null);
  const [draftChoice, setDraftChoice] = useState<'ask' | 'used' | 'dropped'>('ask');
  const [restored, setRestored] = useState<FormValues | null>(null);
  const [formKey, setFormKey] = useState(0);

  const offer = stored !== null && draftChoice === 'ask';
  return (
    <div className="space-y-4">
      {offer && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-tint/50 px-(--block-pad) py-3 text-sm">
          <p className="text-ink">{editing ? '고치다 만 내용이 이 기기에 남아 있어요.' : '쓰다 만 글이 이 기기에 남아 있어요.'}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => {
                setRestored(loadDraft(key)?.values ?? null);
                setDraftChoice('used');
                setFormKey((k) => k + 1);
              }}
            >
              이어 쓰기
            </Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                clearDraft(key);
                setDraftChoice('dropped');
              }}
            >
              버리기
            </Button>
          </div>
        </div>
      )}
      <PostForm
        key={formKey}
        draftKey={key}
        restored={restored}
        initialCategory={initialCategory}
        cardOptions={cardOptions}
        initialCard={initialCard}
        teamPrefill={teamPrefill}
        editing={editing}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function PostForm({
  draftKey: key,
  restored,
  initialCategory,
  cardOptions,
  initialCard,
  teamPrefill,
  editing,
  isAdmin,
}: {
  draftKey: string;
  restored: FormValues | null;
  initialCategory?: string;
  cardOptions: CardOption[];
  initialCard?: string;
  teamPrefill: TeamPrefill;
  editing?: Parameters<typeof CommunityPostForm>[0]['editing'];
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState<CommunityState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(editing ? updatePost : createPost),
    undefined
  );
  /* 오류로 되돌아왔을 때 > 이어 쓴 초안 > 고칠 글의 값 */
  const before = state?.values ?? restored ?? editing?.values;
  const keptCategory = kept(before, 'category');
  const [category, setCategory] = useState<PostCategory>(
    isPostCategory(keptCategory)
      ? keptCategory
      : isPostCategory(initialCategory)
        ? initialCategory
        : POST_CATEGORIES[0].key
  );
  /* 기록을 붙여 왔으면 자유는 '내 기록', 질문은 '내 폼 봐 주세요'로 시작 */
  const cardTag = (c: PostCategory) => (c === 'free' ? 'record' : c === 'question' ? 'form' : '');
  const startCard = cardOptions.some((o) => o.ref === initialCard) ? initialCard : undefined;
  const [tag, setTag] = useState(kept(before, 'tag') ?? (startCard ? cardTag(category) : ''));
  const [busy, setBusy] = useState(false);
  const steps: Step[] = category === 'meetup' || category === 'team' ? ['board', 'form', 'text'] : ['board', 'text'];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  /* 실패로 돌아왔으면 '보낸 초안' 표시를 지운다 — 초안은 남겨 둔다 */
  useEffect(() => {
    if (state?.error) unmarkSubmitting();
  }, [state]);

  /** 다음 단계 — 지금 묶음의 칸을 먼저 본다(브라우저 검사 그대로) */
  function next() {
    const box = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const bad = box ? [...box.querySelectorAll<HTMLInputElement>('input,select,textarea')].find((el) => !el.checkValidity()) : undefined;
    if (bad) return bad.reportValidity();
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  }

  const section = (s: Step) => `space-y-6 ${step === s ? '' : 'hidden'} desk:block`;
  const last = step === 'text';
  const placeholder = TAG_EXAMPLES[`${category}:${tag}`] ?? BOARD_GUIDES[category].examples[0];

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => markSubmitting(key)}
      onInput={() => {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => formRef.current && saveDraft(key, formRef.current), 500);
      }}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <FormError>{state?.error}</FormError>

      {/* 휴대폰 단계 표시 */}
      <p className="text-xs font-semibold text-muted desk:hidden" aria-live="polite">
        {stepIndex + 1} / {steps.length} · {step === 'board' ? '게시판' : step === 'form' ? '양식' : '글'}
      </p>

      <div data-step="board" className={section('board')}>
        <fieldset className="space-y-2">
          <legend className="block text-xs font-medium text-muted">게시판</legend>
          {editing?.lockCategory && (
            <p className="text-xs text-muted">참가 · 신청한 사람이 있어 게시판은 바꿀 수 없어요.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {POST_CATEGORIES.map((c) => (
              <label key={c.key} className="cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value={c.key}
                  checked={category === c.key}
                  disabled={editing?.lockCategory && category !== c.key}
                  onChange={() => {
                    setCategory(c.key);
                    setTag('');
                  }}
                  className="peer sr-only"
                />
                <span className={`${CHIP} peer-disabled:opacity-40`}>{c.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">{BOARD_GUIDES[category].what}</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="block text-xs font-medium text-muted">
            말머리 <span className="text-muted/70">{category === 'team' ? '무엇을 하는 글인지 골라 주세요' : '고르지 않아도 돼요'}</span>
          </legend>
          {editing?.lockTag && category === 'team' && (
            <p className="text-xs text-muted">신청한 사람이 있어 말머리는 바꿀 수 없어요.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {POST_TAGS[category].map((t) => (
              <label key={t.key} className="cursor-pointer">
                <input
                  type="radio"
                  name="tag"
                  value={t.key}
                  checked={tag === t.key}
                  disabled={editing?.lockTag && category === 'team' && tag !== t.key}
                  /* 다시 누르면 풀린다 — 라디오는 스스로 안 풀려서 click 으로(팀은 말머리가 양식을 정해 꼭 고른다) */
                  onClick={() => setTag((now) => (now === t.key && category !== 'team' ? '' : t.key))}
                  onChange={() => {}}
                  required={category === 'team'}
                  className="peer sr-only"
                />
                <span className={`${CHIP} peer-disabled:opacity-40`}>{t.label}</span>
              </label>
            ))}
          </div>
          {tag === 'injury' && (
            <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn">{INJURY_NOTE}</p>
          )}
        </fieldset>
      </div>

      {(category === 'meetup' || category === 'team') && (
        <div data-step="form" className={section('form')}>
          <CommunityFormFields category={category} tag={tag} before={before} teamPrefill={teamPrefill} />
        </div>
      )}

      <div data-step="text" className={section('text')}>
        <Field label="제목" hint={`${POST_TITLE_MAX}자까지 적을 수 있어요.`}>
          <Input
            name="title"
            defaultValue={kept(before, 'title')}
            maxLength={POST_TITLE_MAX}
            placeholder={placeholder}
            required
          />
        </Field>

        <Field
          label="내용"
          hint={`${POST_BODY_MAX}자까지 적을 수 있어요. 전화번호 · 카톡 아이디는 가려져요. 연락은 댓글 · 글에 묶인 대화로 해요.`}
        >
          <Textarea
            name="body"
            rows={10}
            defaultValue={kept(before, 'body')}
            maxLength={POST_BODY_MAX}
            placeholder={
              category === 'question'
                ? '어떤 상황인지(나이 · 경력 · 언제부터), 해 본 것을 같이 적으면 답이 빨라요.'
                : '자유롭게 적어 보세요.'
            }
            required
          />
        </Field>

        {editing ? (
          editing.hasCard && <p className="text-xs text-muted">붙인 싱커 기록 카드는 그대로 둬요.</p>
        ) : (
          <CommunityCardPicker
            options={cardOptions}
            initialRef={startCard}
            onPick={(ref) => {
              if (ref && !tag) setTag(cardTag(category));
            }}
          />
        )}

        <CommunityMediaPicker onBusy={setBusy} initial={editing?.media} />

        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="byStaff"
              value="1"
              defaultChecked={kept(before, 'byStaff') === '1'}
              className="h-4 w-4 accent-sky"
            />
            운영자 글로 표시 <span className="text-xs text-muted">{STAFF_BADGE_NOTE}</span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {stepIndex > 0 && (
          <Button type="button" variant="secondary" className="desk:hidden" onClick={() => setStepIndex((i) => i - 1)}>
            이전
          </Button>
        )}
        {!last && (
          <Button type="button" className="desk:hidden" onClick={next}>
            다음
          </Button>
        )}
        <span className={last ? 'contents' : 'hidden desk:contents'}>
          <SubmitButton busy={busy} editing={Boolean(editing)} />
        </span>
        <ButtonLink href={editing ? `/community/${editing.id}` : '/community'} variant="secondary">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}

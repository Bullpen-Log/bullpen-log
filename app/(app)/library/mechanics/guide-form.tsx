'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Film, RefreshCw } from '@/components/icon';
import { createGuide, updateGuide, type ActionState } from '@/app/actions/content';
import { guardFormAction } from '@/lib/action-offline';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { orderedFocus } from '@/lib/mechanics/focus-priority';
import { kept, keptAll } from '@/lib/form-values';
import { ADMIN_MAX_VIDEO_MB, VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { MECHANICS_CATEGORY_NAMES } from '@/lib/categories';
import {
  DRILL_EQUIPMENT,
  DRILL_STAGES,
  FOCUS_POINT_DESC,
  FOCUS_POINTS,
  focusPointLabel,
} from '@/lib/exercise-meta';

/** 주 요소 고르기 칸 — 요소마다 한 줄 뜻을 붙인다 */
const FOCUS_OPTIONS = FOCUS_POINTS.map((name) => ({ name, desc: FOCUS_POINT_DESC[name] }));
/** 종류 고르기 칸 — 목록이 요소로 칸을 나눠(2026-10-16) 등록할 때 종류를 따로 고른다 */
const CATEGORY_OPTIONS = MECHANICS_CATEGORY_NAMES.map((name) => ({ name }));

/** 수정할 때 폼에 채워 넣을 기존 값 */
export type GuideDraft = {
  id: string;
  title: string;
  category: string;
  description: string;
  /** 맨 앞이 주 요소, 뒤가 보조 */
  focusPoints: string[];
  equipment: string[];
  /** 기초 · 연결 · 통합 — 아직 안 정했으면 null */
  stage: string | null;
  sortOrder: number;
};

function RankedFocusPicker({ initial }: { initial: string[] }) {
  const [points, setPoints] = useState(() => orderedFocus(initial, FOCUS_POINTS));
  const move = (index: number, offset: number) => setPoints((current) => {
    const next = [...current];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return next;
  });
  return <fieldset className="space-y-3">
    <legend className="font-semibold">훈련 목적 · 우선순위</legend>
    <p className="text-sm text-muted">실제로 개선하려는 목적만 선택하세요. 위에 있을수록 더 집중하는 목적이며 추천에 먼저 반영됩니다.</p>
    <p className="text-sm text-muted">공을 던진다는 이유만으로 스로잉을 선택하지 마세요. 팔 동작 교정이나 던지는 속도 자체가 목적일 때 선택합니다.</p>
    <input type="hidden" name="focusMain" value={points[0] ?? ''} />
    {points.slice(1).map((point) => <input key={point} type="hidden" name="focusPoints" value={point} />)}
    <div className="flex flex-wrap gap-2">{FOCUS_OPTIONS.map(({ name, desc }) => <label key={name} className="rounded-lg border border-line p-2 text-sm">
      <input type="checkbox" checked={points.includes(name)} onChange={(event) => setPoints((current) => event.target.checked ? [...current, name] : current.filter((point) => point !== name))} /> {focusPointLabel(name)}<span className="block text-xs text-muted">{desc}</span>
    </label>)}</div>
    <ol className="space-y-2">{points.map((point, index) => <li key={point} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2 text-sm">
      <span className="flex-1">{index + 1}순위 · {focusPointLabel(point)}{index === 0 ? ' · 핵심 목적' : ''}</span>
      <button type="button" disabled={index === 0} aria-label={`${focusPointLabel(point)} 우선순위 올리기`} onClick={() => move(index, -1)}>위로</button>
      <button type="button" disabled={index === points.length - 1} aria-label={`${focusPointLabel(point)} 우선순위 내리기`} onClick={() => move(index, 1)}>아래로</button>
    </li>)}</ol>
    {!points.length && <p className="text-sm text-muted">훈련 목적을 하나 이상 선택하세요.</p>}
  </fieldset>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '저장 중…' : label}
    </Button>
  );
}

export function GuideForm({
  category,
  focus,
  initial,
  onDone,
}: {
  /** 미리 고를 종류 — 요소 칸에서 열면 빈 글(고르게 둔다) */
  category: string;
  /** 미리 고를 주 요소 — 요소 칸에서 열 때 */
  focus?: string;
  /** 주어지면 등록이 아니라 수정 폼이 된다. */
  initial?: GuideDraft;
  onDone?: () => void;
}) {
  const editing = Boolean(initial);
  const [state, formAction] = useActionState<ActionState, FormData>(
    guardFormAction(editing ? updateGuide : createGuide),
    undefined
  );
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [replacing, setReplacing] = useState(!editing);

  /**
   * 등록에 성공하면 폼을 비워 다음 항목을 바로 입력할 수 있게 한다.
   * key를 바꿔 폼을 새로 그리면 입력칸이 한 번에 비워지므로
   * effect 안에서 상태를 건드릴 필요가 없다.
   */
  const [formKey, setFormKey] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.success) {
      setVideos([]);
      if (editing) {
        setReplacing(false);
      } else {
        setFormKey((k) => k + 1);
      }
    }
  }

  /* 수정 저장에 성공하면 부모가 닫는다 — 그리는 도중에 부모 상태를 바꾸면 React 가 경고했다(2026-10-18) */
  useEffect(() => {
    if (editing && state?.success) onDone?.();
  }, [editing, state, onDone]);

  /*
   * 오류로 되돌아왔을 때 방금 보낸 내용을 그대로 다시 보여준다.
   * 기존 값(initial)으로 되돌리지 않는 이유는, 수정 중에 지웠던 항목이
   * 되살아나 사용자가 한 일이 없던 것처럼 보이기 때문이다.
   */
  const before = state?.values;
  const pick = (name: string, fallback?: string | number | null) =>
    before ? (kept(before, name) ?? '') : (fallback ?? undefined);
  const pickAll = (name: string, fallback?: string[]) =>
    before ? (keptAll(before, name) ?? []) : fallback;

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-sky-soft/50 bg-sky/10 px-4 py-3 text-sm text-sky-strong">
          {state.success}
        </p>
      )}

      <RadioGroup
        name="category"
        label="종류 · 필수"
        options={CATEGORY_OPTIONS}
        selected={String(pick('category', initial?.category ?? category) ?? '') || null}
        required
        compact
      />

      <Field label="드릴 이름">
        <Input
          name="title"
          defaultValue={pick('title', initial?.title)}
          placeholder="타월 드릴"
          required
        />
      </Field>

      <Field
        label="드릴 영상"
        hint={
          editing
            ? '그대로 두면 지금 영상이 유지돼요.'
            : '폰이나 컴퓨터에 있는 영상을 바로 올려요.'
        }
      >
        <input type="hidden" name="videoPath" value={videos[0]?.path ?? ''} />
        <input type="hidden" name="thumbPath" value={videos[0]?.thumbPath ?? ''} />

        {editing && !replacing ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <Film className="h-4 w-4 shrink-0 text-sky" />
            <span className="min-w-0 flex-1 text-sm text-muted">
              지금 올려둔 영상을 그대로 써요
            </span>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs text-ink transition-colors hover:border-sky hover:text-sky"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              영상 교체
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <VideoUpload
              maxMb={ADMIN_MAX_VIDEO_MB}
              videos={videos}
              onChange={setVideos}
              max={1}
              endpoint="/api/library/upload-url"
              withThumbnail
            />
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setVideos([]);
                  setReplacing(false);
                }}
                className="text-xs text-muted transition-colors hover:text-ink"
              >
                교체 취소(지금 영상 그대로)
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="노출 순서" hint="숫자가 작을수록 위에 표시돼요. 비워두면 0.">
        <Input
          name="sortOrder"
          type="number"
          defaultValue={pick('sortOrder', initial?.sortOrder)}
          placeholder="1"
        />
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          defaultValue={pick('description', initial?.description)}
          placeholder="앞발이 착지하는 순간까지 상체를 닫아두고, 골반이 먼저 열리도록 합니다."
          required
        />
      </Field>

      <div className="space-y-5 border-t border-sky-soft/30 pt-5">
        <RankedFocusPicker
          key={JSON.stringify([pick('focusMain', initial?.focusPoints[0] ?? focus), pickAll('focusPoints', initial?.focusPoints.slice(1))])}
          initial={[String(pick('focusMain', initial?.focusPoints[0] ?? focus) ?? ''), ...(pickAll('focusPoints', initial?.focusPoints.slice(1)) ?? [])]}
        />

        <RadioGroup
          name="stage"
          label="단계"
          hint="메카닉 프로그램이 쉬운 단계부터 고를 때 써요."
          options={DRILL_STAGES}
          selected={String(pick('stage', initial?.stage) ?? '') || null}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={DRILL_EQUIPMENT}
          selected={pickAll('equipment', initial?.equipment)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={editing ? '수정 저장' : '드릴 등록'} />
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}

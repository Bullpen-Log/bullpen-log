'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Film, RefreshCw } from 'lucide-react';
import { createGuide, updateGuide, type ActionState } from '@/app/actions/content';
import { guardFormAction } from '@/lib/action-offline';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { kept, keptAll } from '@/lib/form-values';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import {
  DRILL_EQUIPMENT,
  DRILL_STAGES,
  FOCUS_POINT_DESC,
  FOCUS_POINTS,
} from '@/lib/exercise-meta';

/** 주 요소 고르기 칸 — 요소마다 한 줄 뜻을 붙인다 */
const FOCUS_OPTIONS = FOCUS_POINTS.map((name) => ({ name, desc: FOCUS_POINT_DESC[name] }));

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
  initial,
  onDone,
}: {
  category: string;
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
        onDone?.();
      } else {
        setFormKey((k) => k + 1);
      }
    }
  }

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
      <input type="hidden" name="category" value={initial?.category ?? category} />
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-sky-soft/50 bg-sky/10 px-4 py-3 text-sm text-sky-strong">
          {state.success}
        </p>
      )}

      <Field label={`드릴 이름 — ${initial?.category ?? category}`}>
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
                교체 취소 — 기존 영상 그대로 두기
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

      {/* 나중에 영상분석에서 찾은 문제와 드릴을 이어주는 항목이다. */}
      <div className="space-y-5 border-t border-sky-soft/30 pt-5">
        {/*
          주 요소와 보조 요소를 따로 받는다 — 서버가 주 요소를 맨 앞에 두고 보조를 두 개까지 잇는다
          (app/actions/content.ts readFocusPoints). 보조에서 주 요소와 같은 것을 골라도 한 번만 들어간다.
        */}
        <RadioGroup
          name="focusMain"
          label="주 요소 · 필수"
          hint="이 드릴이 투구의 어느 부분을 가장 키우는지 고르세요."
          options={FOCUS_OPTIONS}
          selected={String(pick('focusMain', initial?.focusPoints[0]) ?? '') || null}
          required
        />

        <CheckboxGroup
          name="focusPoints"
          label="보조 요소 · 두 개까지"
          hint="함께 쓰는 요소가 있으면 고르세요. 두 개를 넘으면 앞의 두 개만 저장돼요."
          options={FOCUS_POINTS}
          selected={pickAll('focusPoints', initial?.focusPoints.slice(1))}
        />

        <RadioGroup
          name="stage"
          label="단계"
          hint="메커니즘 프로그램이 쉬운 단계부터 고를 때 써요."
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

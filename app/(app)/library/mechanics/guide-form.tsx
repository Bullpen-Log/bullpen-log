'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Film, RefreshCw } from 'lucide-react';
import { createGuide, updateGuide, type ActionState } from '@/app/actions/content';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup } from '@/components/choice-inputs';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { DRILL_EQUIPMENT, FOCUS_POINTS } from '@/lib/exercise-meta';

/** 수정할 때 폼에 채워 넣을 기존 값 */
export type GuideDraft = {
  id: string;
  title: string;
  category: string;
  description: string;
  focusPoints: string[];
  equipment: string[];
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
    editing ? updateGuide : createGuide,
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

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      <input type="hidden" name="category" value={initial?.category ?? category} />
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-gold-dim/50 bg-gold/10 px-4 py-3 text-sm text-gold-bright">
          {state.success}
        </p>
      )}

      <Field label={`드릴 이름 — ${initial?.category ?? category}`}>
        <Input
          name="title"
          defaultValue={initial?.title}
          placeholder="타월 드릴"
          required
        />
      </Field>

      <Field
        label="드릴 영상"
        hint={
          editing
            ? '그대로 두면 지금 영상이 유지됩니다.'
            : '폰이나 컴퓨터에 있는 영상을 바로 올립니다.'
        }
      >
        <input type="hidden" name="videoPath" value={videos[0]?.path ?? ''} />
        <input type="hidden" name="thumbPath" value={videos[0]?.thumbPath ?? ''} />

        {editing && !replacing ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <Film className="h-4 w-4 shrink-0 text-gold" />
            <span className="min-w-0 flex-1 text-sm text-muted">
              지금 올려둔 영상을 그대로 씁니다
            </span>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs text-cream transition-colors hover:border-gold hover:text-gold"
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
                className="text-xs text-muted transition-colors hover:text-cream"
              >
                교체 취소 — 기존 영상 그대로 두기
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="노출 순서" hint="숫자가 작을수록 위에 표시됩니다. 비워두면 0.">
        <Input
          name="sortOrder"
          type="number"
          defaultValue={initial?.sortOrder}
          placeholder="1"
        />
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          defaultValue={initial?.description}
          placeholder="앞발이 착지하는 순간까지 상체를 닫아두고, 골반이 먼저 열리도록 합니다."
          required
        />
      </Field>

      {/* 나중에 영상분석에서 찾은 문제와 드릴을 이어주는 항목이다. */}
      <div className="space-y-5 border-t border-gold-dim/30 pt-5">
        <CheckboxGroup
          name="focusPoints"
          label="교정 포인트 · 필수"
          hint="이 드릴이 무엇을 고치는 드릴인지 고르세요."
          options={FOCUS_POINTS}
          selected={initial?.focusPoints}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={DRILL_EQUIPMENT}
          selected={initial?.equipment}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={editing ? '수정 저장' : '드릴 등록'} />
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-muted transition-colors hover:text-cream"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}

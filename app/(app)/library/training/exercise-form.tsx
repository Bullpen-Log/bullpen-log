'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Film, RefreshCw } from 'lucide-react';
import {
  createExercise,
  updateExercise,
  type ActionState,
} from '@/app/actions/content';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import {
  BODY_PARTS,
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
} from '@/lib/exercise-meta';

/** 수정할 때 폼에 채워 넣을 기존 값 */
export type ExerciseDraft = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '저장 중…' : label}
    </Button>
  );
}

export function ExerciseForm({
  category,
  initial,
  onDone,
}: {
  category: string;
  /** 주어지면 등록이 아니라 수정 폼이 된다. */
  initial?: ExerciseDraft;
  onDone?: () => void;
}) {
  const editing = Boolean(initial);
  const [state, formAction] = useActionState<ActionState, FormData>(
    editing ? updateExercise : createExercise,
    undefined
  );
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  // 수정할 때는 기본적으로 기존 영상을 그대로 두고, 눌렀을 때만 교체한다.
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

      <Field label={`운동 이름 — ${initial?.category ?? category}`}>
        <Input
          name="title"
          defaultValue={initial?.title}
          placeholder="트랩바 데드리프트"
          required
        />
      </Field>

      <Field
        label="운동 영상"
        hint={
          editing
            ? '그대로 두면 지금 영상이 유지됩니다.'
            : '폰이나 컴퓨터에 있는 영상을 바로 올립니다.'
        }
      >
        {/* 새로 올렸을 때만 경로가 실려간다. 비어 있으면 서버가 기존 영상을 유지한다. */}
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

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          defaultValue={initial?.description}
          placeholder="허리를 중립으로 유지하고 고관절을 접으며 내려갑니다."
          required
        />
      </Field>

      {/* 나중에 몸 상태에 맞는 운동을 코드로 추려내려면 이 항목들이 필요하다. */}
      <div className="space-y-5 border-t border-gold-dim/30 pt-5">
        <CheckboxGroup
          name="bodyParts"
          label="목표 부위 · 필수"
          hint="여러 개 고를 수 있습니다."
          options={BODY_PARTS}
          selected={initial?.bodyParts}
        />

        <RadioGroup
          name="intensity"
          label="운동 강도 · 필수"
          hint="부하가 높은 날 어떤 운동을 뺄지 정하는 기준이 됩니다."
          options={INTENSITY_LEVELS}
          required
          selected={initial?.intensity}
        />

        <RadioGroup
          name="difficulty"
          label="난이도"
          options={DIFFICULTY_LEVELS}
          selected={initial?.difficulty}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={EXERCISE_EQUIPMENT}
          selected={initial?.equipment}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={editing ? '수정 저장' : '운동 영상 등록'} />
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

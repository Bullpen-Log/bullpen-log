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
import { kept, keptAll } from '@/lib/form-values';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import {
  BODY_PARTS,
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
  type Prescription,
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
} & Partial<Prescription>;

/** 숫자 항목의 기본값 — 비어 있으면 입력칸도 비워둔다. */
function num(value: number | null | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

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

  /*
   * 오류로 되돌아왔을 때 방금 보낸 내용을 그대로 다시 보여준다.
   * 기존 값(initial)으로 되돌리지 않는 이유는, 수정 중에 지웠던 항목이
   * 되살아나 사용자가 한 일이 없던 것처럼 보이기 때문이다.
   */
  const before = state?.values;
  const pick = (name: string, fallback?: string | null) =>
    before ? kept(before, name) ?? '' : fallback ?? undefined;
  const pickAll = (name: string, fallback?: string[]) =>
    before ? keptAll(before, name) ?? [] : fallback;

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

      <Field label={`운동 이름 — ${initial?.category ?? category}`}>
        <Input
          name="title"
          defaultValue={pick('title', initial?.title)}
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
            <Film className="h-4 w-4 shrink-0 text-sky" />
            <span className="min-w-0 flex-1 text-sm text-muted">
              지금 올려둔 영상을 그대로 씁니다
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

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          defaultValue={pick('description', initial?.description)}
          placeholder="허리를 중립으로 유지하고 고관절을 접으며 내려갑니다."
          required
        />
      </Field>

      {/* 나중에 몸 상태에 맞는 운동을 코드로 추려내려면 이 항목들이 필요하다. */}
      <div className="space-y-5 border-t border-sky-soft/30 pt-5">
        <CheckboxGroup
          name="bodyParts"
          label="목표 부위 · 필수"
          hint="여러 개 고를 수 있습니다."
          options={BODY_PARTS}
          selected={pickAll('bodyParts', initial?.bodyParts)}
        />

        <RadioGroup
          name="intensity"
          label="운동 강도 · 필수"
          hint="부하가 높은 날 어떤 운동을 뺄지 정하는 기준이 됩니다."
          options={INTENSITY_LEVELS}
          required
          selected={pick('intensity', initial?.intensity)}
        />

        <RadioGroup
          name="difficulty"
          label="난이도"
          options={DIFFICULTY_LEVELS}
          selected={pick('difficulty', initial?.difficulty)}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={EXERCISE_EQUIPMENT}
          selected={pickAll('equipment', initial?.equipment)}
        />
      </div>

      {/*
        수행 방법. 트레이닝 화면이 "45분에 맞춰 몇 개" 를 정할 때 이 값으로
        운동마다 걸리는 시간을 계산한다. 비워두면 종류로 어림하므로,
        정확한 시간 배분을 원하면 채워두는 편이 좋다.
      */}
      <div className="space-y-4 border-t border-sky-soft/30 pt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          수행 방법
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="세트">
            <Input
              name="sets"
              type="number"
              min={1}
              max={10}
              inputMode="numeric"
              placeholder="3"
              defaultValue={pick('sets', num(initial?.sets))}
            />
          </Field>
          <Field label="횟수">
            <Input
              name="reps"
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              placeholder="10"
              defaultValue={pick('reps', num(initial?.reps))}
            />
          </Field>
          <Field label="버티는 시간(초)">
            <Input
              name="holdSeconds"
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              placeholder="30"
              defaultValue={pick('holdSeconds', num(initial?.holdSeconds))}
            />
          </Field>
          <Field label="휴식(초)">
            <Input
              name="restSeconds"
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              placeholder="60"
              defaultValue={pick('restSeconds', num(initial?.restSeconds))}
            />
          </Field>
        </div>
        <p className="text-xs text-muted/70">
          시간으로 버티는 운동은 횟수를 비우고 버티는 시간만 적습니다.
        </p>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="perSide"
            value="on"
            defaultChecked={
              before ? kept(before, 'perSide') === 'on' : Boolean(initial?.perSide)
            }
            className="h-4 w-4 rounded border-line-strong accent-sky"
          />
          좌우를 따로 하는 운동 (한 세트에 양쪽 다)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={editing ? '수정 저장' : '운동 영상 등록'} />
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

'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createGuide, type ActionState } from '@/app/actions/content';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup } from '@/components/choice-inputs';
import { VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { DRILL_EQUIPMENT, FOCUS_POINTS } from '@/lib/exercise-meta';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '등록 중…' : '드릴 등록'}
    </Button>
  );
}

export function GuideForm({ category }: { category: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createGuide,
    undefined
  );
  const [videos, setVideos] = useState<UploadedVideo[]>([]);

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
      setFormKey((k) => k + 1);
    }
  }

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      <input type="hidden" name="category" value={category} />

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-gold-dim/50 bg-gold/10 px-4 py-3 text-sm text-gold-bright">
          {state.success}
        </p>
      )}

      <Field label={`드릴 이름 — ${category}`}>
        <Input name="title" placeholder="타월 드릴" required />
      </Field>

      <Field label="드릴 영상" hint="폰이나 컴퓨터에 있는 영상을 바로 올립니다.">
        <input type="hidden" name="videoPath" value={videos[0]?.path ?? ''} />
        <input type="hidden" name="thumbPath" value={videos[0]?.thumbPath ?? ''} />
        <VideoUpload
          videos={videos}
          onChange={setVideos}
          max={1}
          endpoint="/api/library/upload-url"
          withThumbnail
        />
      </Field>

      <Field label="노출 순서" hint="숫자가 작을수록 위에 표시됩니다. 비워두면 0.">
        <Input name="sortOrder" type="number" placeholder="1" />
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
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
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={DRILL_EQUIPMENT}
        />
      </div>

      <SubmitButton />
    </form>
  );
}

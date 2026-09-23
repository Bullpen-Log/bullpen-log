'use client';

import { useActionState, useState } from 'react';
import { Check } from 'lucide-react';
import { updatePatchNote, type PatchNoteState } from '@/app/actions/patch-note';
import { Button, FormError, Textarea } from '@/components/ui';

/**
 * 메모를 적는 칸.
 *
 * 버튼은 글이 바뀌었을 때만 나타난다. 늘 띄워 두면 '저장 안 한 것이 있나'
 * 하고 한 번 더 보게 되는데, 바뀐 것이 없으면 누를 일도 없는 버튼이다.
 *
 * 나타나고 사라지는 것을 grid-rows 로 한다. display 를 껐다 켜면 툭 튀어
 * 나오고, 높이를 픽셀로 적으면 글자 크기를 바꾼 사람에게서 어긋난다.
 * 0fr → 1fr 은 내용이 제 높이를 정하면서도 부드럽게 열린다.
 */
export function PatchNoteEditor({ id, note }: { id: string; note: string }) {
  const [state, formAction, pending] = useActionState<PatchNoteState, FormData>(
    updatePatchNote,
    undefined
  );
  const [text, setText] = useState(note);

  const changed = text.trim() !== note.trim();

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />

      <Textarea
        name="note"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder="예) 스키마가 바뀌었으니 받고 나서 npx prisma generate 하세요."
        className="resize-y"
      />

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          changed || state?.success ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending || !changed}>
              {pending ? '저장하는 중…' : '저장'}
            </Button>

            {/* 저장한 뒤 잠깐 뜨는 표시. 바뀐 것이 없으면 이것만 남는다. */}
            {state?.success && !changed && (
              <span className="motion-safe:animate-fade-in inline-flex items-center gap-1 text-xs text-sky">
                <Check aria-hidden className="h-3.5 w-3.5" />
                {state.success}
              </span>
            )}
          </div>
        </div>
      </div>

      <FormError>{state?.error}</FormError>
    </form>
  );
}

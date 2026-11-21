'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/modal';
import { SHOOT_NOTE_MAX } from '@/lib/shoot/guide';

export function PostponeDialog({ title, initialNote, onSave, onClose }: {
  title: string;
  initialNote: string;
  onSave: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const close = () => { if (!saving.current) onClose(); };

  return (
    <Modal open onClose={close} title="미루기" description={title}>
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        const text = reason.trim();
        if (!text || saving.current) return;
        saving.current = true;
        setPending(true);
        setFailed(false);
        let ok = false;
        try {
          ok = await onSave(text);
        } catch {
          ok = false;
        } finally {
          saving.current = false;
          setPending(false);
          if (ok) onClose();
          else setFailed(true);
        }
      }}>
        <label htmlFor="shoot-postpone-reason" className="block text-sm font-semibold">미룸 사유</label>
        <textarea id="shoot-postpone-reason" rows={3} value={reason} maxLength={SHOOT_NOTE_MAX} disabled={pending} onChange={(event) => setReason(event.target.value)} placeholder="예: 장비가 없어 다음 촬영일에 찍기로 했어요" className="w-full rounded-xl border border-line bg-surface p-3 text-base" />
        {failed && <p role="alert" className="text-sm text-danger">저장하지 못했어요. 입력한 사유는 그대로예요. 다시 시도해 주세요.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={close} disabled={pending} className="min-h-12 flex-1 rounded-xl bg-ink/6 font-semibold">취소</button>
          <button type="submit" disabled={pending || !reason.trim()} className="min-h-12 flex-1 rounded-xl bg-sky font-semibold text-white disabled:opacity-50">{pending ? '저장 중…' : '사유 저장하고 미루기'}</button>
        </div>
      </form>
    </Modal>
  );
}

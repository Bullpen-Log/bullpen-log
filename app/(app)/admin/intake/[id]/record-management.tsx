'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { ConfirmDialog } from '@/components/confirm-delete';
import { manageIntakeRecord } from '@/app/actions/intake-admin';
import { useAction } from './use-action';

export function RecordManagement({ submissionId, version, athleteName, note, archived = false }: {
  submissionId: string; version: number; athleteName: string | null; note: string | null; archived?: boolean;
}) {
  const router = useRouter();
  const { pending, error, run, refresh } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(athleteName ?? '');
  const [memo, setMemo] = useState(note ?? '');
  const [ask, setAsk] = useState(false);
  return <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
    <h2 className="text-base font-semibold text-ink">{archived ? '휴지통의 접수' : '선수 정보 관리'}</h2>
    {archived ? <p className="text-sm leading-6 text-muted">이 접수는 일반 목록과 공유 링크에서 숨겨져 있습니다. 복원해도 결과는 자동 공개되지 않습니다. 원본 보관 기한은 유지되므로 기한이 지난 파일은 복원되지 않을 수 있습니다.</p> :
      <p className="text-sm leading-6 text-muted">접수 목록의 선수 이름과 관리자용 메모를 수정합니다. 접속 이름·비밀번호, 원본과 이미 제작한 결과의 판 기록은 유지됩니다.</p>}
    {!archived && editing && <form className="space-y-3" onSubmit={e => {
      e.preventDefault();
      run(() => manageIntakeRecord({ submissionId, expectedVersion: version, operation: 'edit', athleteName: name, note: memo }), () => { setEditing(false); refresh(); });
    }}>
      <label className="block space-y-1 text-sm text-ink"><span>선수 이름</span><Input value={name} onChange={e => setName(e.target.value)} maxLength={40} required disabled={pending} /></label>
      <label className="block space-y-1 text-sm text-ink"><span>접수 메모 · 관리자에게만 표시</span><Textarea value={memo} onChange={e => setMemo(e.target.value)} maxLength={2000} rows={3} disabled={pending} /></label>
      <div className="flex gap-2"><Button type="submit" disabled={pending || !name.trim()}>저장</Button><Button type="button" variant="secondary" disabled={pending} onClick={() => setEditing(false)}>취소</Button></div>
    </form>}
    <div className="flex flex-wrap gap-2">
      {!archived && !editing && <Button type="button" variant="secondary" disabled={pending} onClick={() => { setName(athleteName ?? ''); setMemo(note ?? ''); setEditing(true); }}>선수 정보 수정</Button>}
      <Button type="button" variant={archived ? 'secondary' : 'danger'} disabled={pending} onClick={() => setAsk(true)}>{archived ? '접수 복원' : '접수 삭제'}</Button>
    </div>
    {error && <ErrorLine>{error}</ErrorLine>}
    <ConfirmDialog open={ask} onClose={() => setAsk(false)} title={archived ? '접수를 복원할까요?' : `${athleteName || '이름 미입력'} 접수를 삭제할까요?`}
      detail={archived ? '일반 접수 목록으로 복원합니다. 이전에 폐기한 링크는 폐기 상태를 유지하며, 결과는 검토 후 별도로 공개해야 합니다.' : '휴지통으로 이동하고 공유 링크 접근과 공개 결과를 차단합니다. 원본을 즉시 영구 삭제하지 않으며 기존 보관 기한 안에서 복원할 수 있습니다.'}
      confirmLabel={archived ? '복원' : '휴지통으로 이동'} pending={pending} pendingLabel="처리 중…"
      onConfirm={() => run(() => manageIntakeRecord({ submissionId, expectedVersion: version, operation: archived ? 'restore' : 'archive' }), () => { setAsk(false); router.push(archived ? `/admin/intake/${submissionId}` : '/admin/intake'); refresh(); })} />
  </section>;
}

'use client';

import { useEffect, useState } from 'react';
import {
  assignHomework,
  loadMemberHomework,
  setHomeworkStatus,
  type HomeworkView,
} from '@/app/actions/app-lesson';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { OrgThread } from '@/components/master/org-thread';
import { HOMEWORK_STATUS_LABEL } from '@/lib/org/homework';
import { LibraryList, PickedRows, pickItems, togglePick, useLibrary, type Pick } from '@/components/master/library-picker';

/**
 * 웹 /manage 회원 카드의 숙제(2단계) — 앱 native/src/app/org/homework.tsx · org/homework.tsx 와 같은 동작(app/actions/app-lesson.ts).
 * 라이브러리 운동 · 드릴에서 골라 내고(세트 · 횟수 · 기한 선택), 선수가 트레이닝에서 하거나 숙제 영상을 보내면 완료. 코치는 면제 · 다시 하게 · 취소.
 */
const dayText = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export function HomeworkCard({ orgId, memberId, todayKey }: { orgId: string; memberId: string; todayKey: string }) {
  const [list, setList] = useState<HomeworkView[] | null>(null);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadMemberHomework(orgId, memberId).then((r) => alive && r.ok && setList(r.homework));
    return () => {
      alive = false;
    };
  }, [orgId, memberId, version]);
  const reload = () => setVersion((v) => v + 1);

  const change = async (id: string, status: 'assigned' | 'excused' | 'canceled') => {
    if (status === 'canceled' && !window.confirm('이 숙제를 취소할까요?')) return;
    const r = await setHomeworkStatus(orgId, id, status);
    if (!r.ok) return toast(r.error ?? '바꾸지 못했어요.');
    reload();
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">숙제</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? '닫기' : '숙제 내기'}
        </Button>
      </div>
      {open ? (
        <AssignForm
          orgId={orgId}
          memberId={memberId}
          todayKey={todayKey}
          onDone={() => {
            setOpen(false);
            reload();
          }}
        />
      ) : null}
      {!list ? (
        <p className="text-xs text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted">아직 낸 숙제가 없어요. 라이브러리 운동 · 드릴로 내면 선수가 트레이닝에서 해요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((h) => (
            <li key={h.id} className="space-y-1 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {dayText(h.key)} 낸 숙제{h.due ? ` · ${dayText(h.due)}까지` : ''}
                </span>
                <Badge className={h.status === 'done' ? 'text-ok' : ''}>
                  {HOMEWORK_STATUS_LABEL[h.status]}
                  {h.status === 'done' && h.doneKey ? ` · ${dayText(h.doneKey)}` : ''}
                </Badge>
                <span className="ml-auto flex gap-3 text-xs">
                  {h.status === 'assigned' || h.status === 'in_progress' ? (
                    <button type="button" className="text-muted" onClick={() => void change(h.id, 'excused')}>
                      면제
                    </button>
                  ) : (
                    <button type="button" className="text-muted" onClick={() => void change(h.id, 'assigned')}>
                      다시 하게
                    </button>
                  )}
                  <button type="button" className="text-danger" onClick={() => void change(h.id, 'canceled')}>
                    취소
                  </button>
                </span>
              </div>
              {h.lines.map((l, i) => (
                <p key={i} className="flex gap-2 text-ink">
                  <span className="flex-1">
                    {l.name}
                    {l.kind === 'drill' ? <span className="text-muted"> · 드릴</span> : null}
                  </span>
                  {l.dose ? <span className="text-xs text-muted">{l.dose}</span> : null}
                </p>
              ))}
              <OrgThread orgId={orgId} kind="homework" id={h.id} talk={h.talk} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AssignForm({ orgId, memberId, todayKey, onDone }: { orgId: string; memberId: string; todayKey: string; onDone: () => void }) {
  const lib = useLibrary(orgId);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (picks.length === 0) return setError('숙제로 낼 운동을 골라 주세요.');
    setBusy(true);
    setError(null);
    const r = await assignHomework(orgId, memberId, { dueDate: due || null, items: pickItems(picks) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast('숙제를 냈어요');
    onDone();
  };
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      <PickedRows picks={picks} setPicks={setPicks} />
      <Field label="기한" hint="비우면 기한 없음">
        <Input type="date" min={todayKey} value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <LibraryList lib={lib} picked={(id) => picks.some((p) => p.id === id)} onToggle={(it, kind) => setPicks((ps) => togglePick(ps, it, kind))} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="button" disabled={busy || picks.length === 0} onClick={() => void save()}>
        {busy ? '내는 중…' : '숙제 내기'}
      </Button>
    </div>
  );
}

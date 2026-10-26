'use client';

import { useEffect, useState } from 'react';
import {
  confirmOutings,
  deletePlan,
  loadEventDetail,
  loadMemberWork,
  loadPlan,
  markAllAttended,
  recordAttendedAsPlan,
  recordWork,
  saveOuting,
  savePlan,
  setAttended,
  type EventDetail,
  type EventMemberView,
} from '@/app/actions/app-team';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { LibraryList, PickedRows, pickItems, togglePick, useLibrary, type Lib, type Pick } from '@/components/master/library-picker';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { EVENT_STATUS_LABEL, type EventStatus } from '@/lib/org/lesson-pitch';
import { ORG_WORK_ITEMS_MAX, ORG_WORK_SETS_MAX } from '@/lib/org/team-work';
import type { HomeworkItem } from '@/lib/org/homework';
import { ATTEND_LABEL, OUTING_ROLES, OUTING_ROLE_LABEL, OUTING_STATUS_LABEL, PITCH_LIMIT_MAX, PLAN_TITLE_MAX, isOutingRole } from '@/lib/org/team';

/**
 * 웹 /manage 팀 일정 하나(3단계) — 앱 native/src/app/org/team-event.tsx · plan.tsx · work.tsx 와 같은 동작(app/actions/app-team.ts).
 * 수행일지는 선수의 그날 운동 판에 코치 세트로 붙어 부하 · 달력에 든다. 메뉴는 계획이라 안 든다. 등판은 확정만 선수의 다음 등판으로 읽힌다.
 */
type Res = { ok: boolean; error?: string };

export function TeamEventPanel({ orgId, eventId }: { orgId: string; eventId: string }) {
  const [d, setD] = useState<EventDetail | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadEventDetail(orgId, eventId).then((r) => alive && r.ok && setD(r));
    return () => {
      alive = false;
    };
  }, [orgId, eventId, version]);
  const reload = () => setVersion((v) => v + 1);
  const send = async <R extends Res>(p: Promise<R>, done?: (r: Extract<R, { ok: true }>) => string) => {
    setBusy(true);
    try {
      const r = await p;
      if (!r.ok) return toast(r.error ?? '처리하지 못했어요.');
      const word = done?.(r as Extract<R, { ok: true }>);
      if (word) toast(word);
      reload();
    } finally {
      setBusy(false);
    }
  };
  if (!d) return <p className="text-xs text-muted">불러오는 중…</p>;
  const e = d.event;
  const past = e.date <= d.todayKey;
  const part = { d, orgId, busy, send, reload };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {e.date} · {e.time ?? '종일'} · {EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind} · {EVENT_STATUS_LABEL[e.status as EventStatus] ?? e.status}
        {e.memo ? ` · ${e.memo}` : ''}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Attendance {...part} past={past} />
        <Plans {...part} />
        {past ? <Work {...part} /> : null}
        {e.kind === 'game' ? <Outings {...part} /> : null}
      </div>
    </div>
  );
}

type Part = {
  d: EventDetail;
  orgId: string;
  busy: boolean;
  send: <R extends Res>(p: Promise<R>, done?: (r: Extract<R, { ok: true }>) => string) => Promise<void>;
  reload: () => void;
};

function Attendance({ d, orgId, busy, send, past }: Part & { past: boolean }) {
  const none = d.members.length - d.counts.yes - d.counts.no - d.counts.maybe;
  const mark = (m: EventMemberView, v: boolean) => void send(setAttended(orgId, d.event.id, m.memberId, m.attended === v ? null : v));
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">참석</h2>
        {past && d.members.length ? (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void send(markAllAttended(orgId, d.event.id), (r) => `${r.count ?? 0}명을 참석으로 했어요`)}>
            모두 왔어요
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        가요 {d.counts.yes} · 못 가요 {d.counts.no} · 아직 몰라요 {d.counts.maybe}
        {none > 0 ? ` · 답 안 함 ${none}` : ''}
        {past ? ' · 모두 왔어요는 못 간다고 답한 선수를 빼요' : ''}
      </p>
      <ul className="divide-y divide-line">
        {d.members.map((m) => (
          <li key={m.memberId} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="text-ink">{m.nickname}</span>
              <span className={`ml-2 text-xs ${m.reply === 'no' ? 'text-warn' : 'text-muted'}`}>
                {m.reply ? ATTEND_LABEL[m.reply] : '답 안 함'}
                {m.note ? ` · ${m.note}` : ''}
              </span>
            </span>
            {past ? (
              <>
                <Pill on={m.attended === true} disabled={busy} onClick={() => mark(m, true)}>
                  왔어요
                </Pill>
                <Pill on={m.attended === false} disabled={busy} onClick={() => mark(m, false)}>
                  안 왔어요
                </Pill>
              </>
            ) : null}
          </li>
        ))}
        {d.members.length === 0 ? <li className="py-2 text-xs text-muted">이 일정의 선수가 없어요.</li> : null}
      </ul>
    </Card>
  );
}

function Plans({ d, orgId, busy, send, reload }: Part) {
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const lib = useLibrary(orgId);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">훈련 메뉴</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(open === 'new' ? null : 'new')}>
          {open === 'new' ? '닫기' : '메뉴 만들기'}
        </Button>
      </div>
      <p className="text-xs text-muted">메뉴는 계획이라 선수 기록에 안 들어가요. 끝난 뒤 수행일지로 남겨요.</p>
      {open === 'new' ? <PlanForm d={d} orgId={orgId} lib={lib} planId={null} onDone={() => (setOpen(null), reload())} /> : null}
      <ul className="divide-y divide-line">
        {d.plans.map((pl) => (
          <li key={pl.id} className="space-y-1 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">{pl.title}</span>
              <Badge>{pl.memberIds.length ? `${pl.targets.length}명` : '모두'}</Badge>
              <span className="ml-auto flex gap-3 text-xs">
                <button type="button" className="text-muted" onClick={() => setOpen(open === pl.id ? null : pl.id)}>
                  {open === pl.id ? '닫기' : '고치기'}
                </button>
                <button
                  type="button"
                  className="text-danger"
                  disabled={busy}
                  onClick={() => window.confirm('이 메뉴를 지울까요? 이미 남긴 수행일지는 그대로예요.') && void send(deletePlan(orgId, pl.id), () => '지웠어요')}
                >
                  지우기
                </button>
              </span>
            </div>
            {pl.lines.map((l, i) => (
              <p key={i} className="flex gap-2 text-xs text-muted">
                <span className="flex-1">
                  {l.name}
                  {l.kind === 'drill' ? ' · 드릴' : ''}
                </span>
                {l.dose}
              </p>
            ))}
            {open === pl.id ? <PlanForm d={d} orgId={orgId} lib={lib} planId={pl.id} onDone={() => (setOpen(null), reload())} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PlanForm({ d, orgId, lib, planId, onDone }: { d: EventDetail; orgId: string; lib: Lib | null; planId: string | null; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loaded, setLoaded] = useState(planId == null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!planId || !lib) return;
    let alive = true;
    void loadPlan(orgId, planId).then((r) => {
      if (!alive || !r.ok || !r.plan) return;
      const names = new Map([...lib.exercises, ...lib.drills].map((x) => [x.id, x.name]));
      setTitle(r.plan.title);
      setMemberIds(r.plan.memberIds);
      setPicks(
        (r.plan.items as HomeworkItem[]).flatMap((i): Pick[] => {
          const id = i.exerciseId ?? i.guideId;
          return id ? [{ id, kind: i.exerciseId ? 'exercise' : 'drill', name: names.get(id) ?? '지운 운동', sets: i.sets ? String(i.sets) : '', reps: i.reps ? String(i.reps) : '' }] : [];
        })
      );
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [orgId, planId, lib]);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await savePlan(orgId, d.event.id, { id: planId, title, memberIds, items: pickItems(picks) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast('메뉴를 저장했어요');
    onDone();
  };
  if (!loaded) return <p className="text-xs text-muted">불러오는 중…</p>;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      <Field label="이름">
        <Input value={title} maxLength={PLAN_TITLE_MAX} placeholder="투수조" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">대상 · 안 고르면 모두</p>
        <div className="flex flex-wrap gap-1.5">
          {d.members.map((m) => (
            <Pill
              key={m.memberId}
              on={memberIds.includes(m.memberId)}
              onClick={() => setMemberIds((ids) => (ids.includes(m.memberId) ? ids.filter((x) => x !== m.memberId) : [...ids, m.memberId]))}
            >
              {m.nickname}
            </Pill>
          ))}
        </div>
      </div>
      <PickedRows picks={picks} setPicks={setPicks} />
      <LibraryList lib={lib} picked={(id) => picks.some((p) => p.id === id)} onToggle={(it, kind) => setPicks((ps) => togglePick(ps, it, kind))} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? '저장하는 중…' : '메뉴 저장'}
      </Button>
    </div>
  );
}

function Work({ d, orgId, busy, send, reload }: Part) {
  const [editing, setEditing] = useState<string | null>(null);
  const lib = useLibrary(orgId);
  /* 선수가 그날 같은 운동을 직접 남겼으면 '메뉴대로'가 멈춘다 — 따로 한 운동일 때만 남긴다(계약 9-6 ①-6 F, 결정 3) */
  const planFor = async (memberId: string) => {
    const r = await recordWork(orgId, d.event.id, memberId, 'plan');
    const done = (x: { sets: number }) => `${x.sets}세트를 남겼어요`;
    if (!r.ok && r.own) {
      if (window.confirm(`${r.error}\n\n따로 한 운동이면 남길까요?`)) return send(recordWork(orgId, d.event.id, memberId, 'plan-anyway'), done);
      return;
    }
    return send(Promise.resolve(r), done);
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">수행일지</h2>
        {d.plans.length ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void send(
                recordAttendedAsPlan(orgId, d.event.id),
                (r) => `${r.done}명 남겼어요${r.own ? ` · ${r.own}명은 직접 남긴 기록이 있어 건너뜀` : ''}${r.skipped ? ` · ${r.skipped}명은 못 남김` : ''}`
              )
            }
          >
            참석한 선수 모두 메뉴대로
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">남긴 기록은 선수의 그날 운동에 들어가 부하 · 달력에 셈해져요.</p>
      <ul className="divide-y divide-line">
        {d.members.map((m) => (
          <li key={m.memberId} className="space-y-2 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-ink">{m.nickname}</span>
              <span className={`text-xs ${m.recordedSets ? 'text-ok' : 'text-muted'}`}>
                {!m.hasUser ? '가입 전' : !m.canTrain ? '트레이닝 공유 꺼짐' : m.recordedSets ? `${m.recordedSets}세트 남김` : '기록 없음'}
                {m.ownSets ? ' · 선수가 직접 남긴 기록 있음' : ''}
              </span>
              {m.canTrain ? (
                <span className="flex gap-3 text-xs">
                  {d.plans.length ? (
                    <button type="button" className="text-sky-strong" disabled={busy} onClick={() => void planFor(m.memberId)}>
                      메뉴대로
                    </button>
                  ) : null}
                  <button type="button" className="text-muted" onClick={() => setEditing(editing === m.memberId ? null : m.memberId)}>
                    {editing === m.memberId ? '닫기' : '고쳐 적기'}
                  </button>
                  {m.recordedSets ? (
                    <button type="button" className="text-danger" disabled={busy} onClick={() => void send(recordWork(orgId, d.event.id, m.memberId, 'clear'), () => '기록을 뺐어요')}>
                      빼기
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {editing === m.memberId ? <WorkEditor orgId={orgId} eventId={d.event.id} memberId={m.memberId} lib={lib} onDone={() => (setEditing(null), reload())} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type SetDraft = { kg: string; reps: string; sec: string };
type WorkItem = { exerciseId: string; name: string; sets: SetDraft[] };
const str = (n: number | null) => (n == null ? '' : String(n));
const numOrNull = (s: string) => (s.trim() ? Number(s) : null);
const EMPTY_SET: SetDraft = { kg: '', reps: '', sec: '' };

function WorkEditor({ orgId, eventId, memberId, lib, onDone }: { orgId: string; eventId: string; memberId: string; lib: Lib | null; onDone: () => void }) {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMemberWork(orgId, eventId, memberId).then((r) => {
      if (!alive || !r.ok) return;
      setRecorded(r.recorded);
      setItems(r.items.map((i) => ({ exerciseId: i.exerciseId, name: i.name, sets: i.sets.map((s) => ({ kg: str(s.weightKg), reps: str(s.reps), sec: str(s.holdSeconds) })) })));
    });
    return () => {
      alive = false;
    };
  }, [orgId, eventId, memberId]);
  if (!items) return <p className="text-xs text-muted">불러오는 중…</p>;
  const patch = (id: string, f: (x: WorkItem) => WorkItem) => setItems(items.map((x) => (x.exerciseId === id ? f(x) : x)));
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await recordWork(
      orgId,
      eventId,
      memberId,
      'custom',
      items.map((x) => ({ exerciseId: x.exerciseId, sets: x.sets.map((s) => ({ weightKg: numOrNull(s.kg), reps: numOrNull(s.reps), holdSeconds: numOrNull(s.sec) })) }))
    );
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(r.sets ? `${r.sets}세트를 남겼어요` : '기록을 뺐어요');
    onDone();
  };
  const num = (v: string, set: (s: string) => void, ph: string, decimal = false) => (
    <Input
      className="w-16 px-2 py-1.5"
      inputMode={decimal ? 'decimal' : 'numeric'}
      placeholder={ph}
      value={v}
      onChange={(e) => set((decimal ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, '')).slice(0, 5))}
    />
  );
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      <p className="text-xs text-muted">{recorded ? '남긴 기록이에요.' : '아직 남긴 기록이 없어 메뉴 처방으로 채웠어요.'} 세트마다 무게 · 횟수 · 초 가운데 하나는 적어요.</p>
      {items.map((x) => (
        <div key={x.exerciseId} className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex-1">{x.name}</span>
            <button type="button" aria-label={`${x.name} 빼기`} className="text-danger" onClick={() => setItems(items.filter((y) => y.exerciseId !== x.exerciseId))}>
              ×
            </button>
          </p>
          {x.sets.map((s, n) => (
            <div key={n} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-10">{n + 1}세트</span>
              {num(s.kg, (kg) => patch(x.exerciseId, (y) => ({ ...y, sets: y.sets.map((t, i) => (i === n ? { ...t, kg } : t)) })), 'kg', true)}
              {num(s.reps, (reps) => patch(x.exerciseId, (y) => ({ ...y, sets: y.sets.map((t, i) => (i === n ? { ...t, reps } : t)) })), '회')}
              {num(s.sec, (sec) => patch(x.exerciseId, (y) => ({ ...y, sets: y.sets.map((t, i) => (i === n ? { ...t, sec } : t)) })), '초')}
              <button type="button" aria-label={`${n + 1}세트 빼기`} onClick={() => patch(x.exerciseId, (y) => ({ ...y, sets: y.sets.filter((_, i) => i !== n) }))}>
                ×
              </button>
            </div>
          ))}
          {x.sets.length < ORG_WORK_SETS_MAX ? (
            <button type="button" className="text-xs font-semibold text-sky-strong" onClick={() => patch(x.exerciseId, (y) => ({ ...y, sets: [...y.sets, { ...(y.sets.at(-1) ?? EMPTY_SET) }] }))}>
              + 세트
            </button>
          ) : null}
        </div>
      ))}
      <LibraryList
        lib={lib}
        exerciseOnly
        picked={(id) => items.some((x) => x.exerciseId === id)}
        onToggle={(it) =>
          setItems(
            items.some((x) => x.exerciseId === it.id)
              ? items.filter((x) => x.exerciseId !== it.id)
              : items.length >= ORG_WORK_ITEMS_MAX
                ? items
                : [...items, { exerciseId: it.id, name: it.name, sets: [{ ...EMPTY_SET }] }]
          )
        }
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? '저장하는 중…' : '수행일지 저장'}
      </Button>
    </div>
  );
}

function Outings({ d, orgId, busy, send }: Part) {
  const drafts = d.members.filter((m) => m.outing?.status === 'draft').length;
  const save = (m: EventMemberView, role: string, limit: string) =>
    void send(saveOuting(orgId, d.event.id, m.memberId, role || null, limit.trim() || null));
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">등판 계획</h2>
        {drafts ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void send(confirmOutings(orgId, d.event.id), (r) => `${r.count ?? 0}명 확정했어요`)}>
            등판 {drafts}명 확정
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">확정한 선발 · 불펜만 선수의 다음 등판으로 읽혀요(선수 체크인 답이 먼저). 고치면 다시 짜는 중으로 돌아가요.</p>
      <ul className="divide-y divide-line">
        {d.members.map((m) => (
          <OutingRow key={m.memberId} m={m} busy={busy} onSave={(role, limit) => save(m, role, limit)} />
        ))}
      </ul>
    </Card>
  );
}

function OutingRow({ m, busy, onSave }: { m: EventMemberView; busy: boolean; onSave: (role: string, limit: string) => void }) {
  const role = m.outing?.role ?? '';
  const [limit, setLimit] = useState(m.outing?.pitchLimit ? String(m.outing.pitchLimit) : '');
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="flex-1 text-ink">{m.nickname}</span>
      <select
        aria-label={`${m.nickname} 등판 역할`}
        value={role}
        disabled={busy}
        onChange={(e) => onSave(e.target.value, limit)}
        className="rounded-xl border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink"
      >
        <option value="">없음</option>
        {OUTING_ROLES.map((r) => (
          <option key={r} value={r}>
            {OUTING_ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <Input
        className="w-20 px-2 py-1.5"
        inputMode="numeric"
        placeholder={`한도(~${PITCH_LIMIT_MAX})`}
        value={limit}
        disabled={!role || busy}
        onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={() => isOutingRole(role) && limit !== (m.outing?.pitchLimit ? String(m.outing.pitchLimit) : '') && onSave(role, limit)}
      />
      <span className={`w-12 text-right text-xs ${m.outing?.status === 'confirmed' ? 'text-ok' : 'text-muted'}`}>
        {m.outing ? (OUTING_STATUS_LABEL[m.outing.status as keyof typeof OUTING_STATUS_LABEL] ?? m.outing.status) : ''}
      </span>
      {m.outingNote ? <p className="basis-full text-xs text-warn">{m.outingNote}</p> : null}
    </li>
  );
}

function Pill({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${on ? 'bg-sky text-white' : 'bg-ink/6 text-ink'}`}
    >
      {children}
    </button>
  );
}

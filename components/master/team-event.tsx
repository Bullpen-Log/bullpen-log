'use client';

import { useEffect, useState } from 'react';
import {
  confirmOutings,
  confirmTeamWork,
  copyPlansFrom,
  deletePlan,
  loadEventDetail,
  loadPlan,
  loadPlanSources,
  resolveTeamCheck,
  saveActual,
  saveMemberResult,
  saveOuting,
  savePlan,
  saveTeamValues,
  setRosterMember,
  type EventDetail,
  type EventMemberView,
  type PlanSource,
  type PlanView,
} from '@/app/actions/app-team';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { LibraryList, PickedRows, pickItems, togglePick, useLibrary, type Lib, type LibItem, type Pick } from '@/components/master/library-picker';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { EVENT_STATUS_LABEL, type EventStatus } from '@/lib/org/lesson-pitch';
import type { HomeworkItem } from '@/lib/org/homework';
import { OUTING_ROLES, OUTING_ROLE_LABEL, OUTING_STATUS_LABEL, PITCH_LIMIT_MAX, PLAN_TITLE_MAX, isOutingRole } from '@/lib/org/team';
import {
  EXCEPTION_LABEL,
  LINES_MAX,
  NOTE_MAX,
  PLAN_SCOPE_LABEL,
  WORK_REASON_LABEL,
  WORK_STATUS_LABEL,
  confirmSummary,
  type ExceptionKind,
  type PlanScope,
  type ValueMode,
  type WorkLine,
} from '@/lib/org/team-session';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';

/**
 * 웹 /manage 팀 훈련 하나(계약 11절) — 앱 native/src/app/org/team-event.tsx · plan.tsx · actual.tsx · exception.tsx 와 같은 동작(app/actions/app-team.ts).
 * 단계 [계획 · 실제 확인 · 결과]. 긴 명단의 예외 고치기 · 조 짜기는 PC 가 편하다. 계획 · 명단만으로는 기록이 안 생기고 '이대로 확인'에서 선수마다 개인 기록이 된다.
 * 참석 응답 · 참석 확인은 없다(안 온 선수는 '빠짐' 예외). 등판은 확정만 선수의 다음 등판으로 읽힌다.
 */
type Res = { ok: boolean; error?: string };
type Stage = 'plan' | 'confirm' | 'result';

export function TeamEventPanel({ orgId, eventId }: { orgId: string; eventId: string }) {
  const [d, setD] = useState<EventDetail | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [picked, setStage] = useState<Stage | null>(null);
  useEffect(() => {
    let alive = true;
    void loadEventDetail(orgId, eventId).then((r) => alive && r.ok && setD(r));
    return () => {
      alive = false;
    };
  }, [orgId, eventId, version]);
  const reload = () => setVersion((v) => v + 1);
  const send = async <R extends Res>(p: Promise<R>, done?: (r: Extract<R, { ok: true }>) => string): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await p;
      if (!r.ok) {
        toast(r.error ?? '처리하지 못했어요.');
        return false;
      }
      const word = done?.(r as Extract<R, { ok: true }>);
      if (word) toast(word);
      reload();
      return true;
    } finally {
      setBusy(false);
    }
  };
  if (!d) return <p className="text-xs text-muted">불러오는 중…</p>;
  const e = d.event;
  const past = e.date <= d.todayKey;
  const stage: Stage = picked ?? (!past ? 'plan' : e.confirmedAt ? 'result' : 'confirm');
  const part = { d, orgId, busy, send, reload };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {e.date} · {e.time ?? '종일'} · {EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind} · {EVENT_STATUS_LABEL[e.status as EventStatus] ?? e.status}
        {e.memo ? ` · ${e.memo}` : ''}
      </p>
      <div role="tablist" aria-label="단계" className="inline-flex gap-1 rounded-full bg-ink/6 p-1">
        {(
          [
            ['plan', '계획'],
            ['confirm', '실제 확인'],
            ['result', '결과'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={stage === k}
            onClick={() => setStage(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${stage === k ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {stage === 'plan' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Roster {...part} />
          <Plans {...part} />
        </div>
      ) : stage === 'confirm' ? (
        past ? (
          <Confirm {...part} onDone={() => setStage('result')} />
        ) : (
          <Card>
            <p className="text-sm text-muted">끝난 뒤에 실제를 확인해요. 계획만으로는 선수 기록에 아무것도 안 들어가요.</p>
          </Card>
        )
      ) : (
        <Result {...part} />
      )}
      {e.kind === 'game' ? <Outings {...part} /> : null}
    </div>
  );
}

type Part = {
  d: EventDetail;
  orgId: string;
  busy: boolean;
  send: <R extends Res>(p: Promise<R>, done?: (r: Extract<R, { ok: true }>) => string) => Promise<boolean>;
  reload: () => void;
};

/* ── 계획 ── */

function scopeLine(pl: PlanView, d: EventDetail): string {
  const name = (id: string) => d.members.find((m) => m.memberId === id)?.nickname ?? '선수';
  const base =
    pl.scope === 'all'
      ? `전체 ${pl.targets.length}명`
      : pl.scope === 'group'
        ? `${pl.groupName ?? '조'} ${pl.targets.length}명`
        : `${name(pl.memberIds[0] ?? '')}만${pl.replacesPlanId ? ` · ${d.plans.find((x) => x.id === pl.replacesPlanId)?.title ?? '조 활동'} 대신` : ' · 더하기'}`;
  return pl.valueMode === 'individual' ? `${base} · 투구는 선수마다` : base;
}

function Roster({ d, orgId, busy, send }: Part) {
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-bold text-ink">명단 {d.members.filter((m) => !m.left).length}명</h2>
      <p className="text-xs text-muted">
        {d.event.rosterAt ? '준비할 때 담은 명단이라 선수가 나중에 들어오고 나가도 그대로예요. 누르면 뺄 수 있어요.' : '첫 활동을 만들 때 지금 선수로 명단을 담아요.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {d.members.map((m) => (
          <Pill
            key={m.memberId}
            on={false}
            disabled={busy}
            onClick={() => window.confirm(`${m.nickname}을(를) 명단에서 뺄까요?`) && void send(setRosterMember(orgId, d.event.id, m.memberId, false), () => '뺐어요')}
          >
            {m.nickname}
            {m.left ? ' · 떠남' : ''}
          </Pill>
        ))}
      </div>
      {d.others.length ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">명단에 더하기</p>
          <div className="flex flex-wrap gap-1.5">
            {d.others.map((m) => (
              <Pill key={m.memberId} on disabled={busy} onClick={() => void send(setRosterMember(orgId, d.event.id, m.memberId, true), () => `${m.nickname}을(를) 더했어요`)}>
                + {m.nickname}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Plans({ d, orgId, busy, send, reload }: Part) {
  const [open, setOpen] = useState<string | 'new' | 'copy' | null>(null);
  const lib = useLibrary(orgId);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">활동</h2>
        <span className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(open === 'copy' ? null : 'copy')}>
            {open === 'copy' ? '닫기' : '지난 일정에서 가져오기'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(open === 'new' ? null : 'new')}>
            {open === 'new' ? '닫기' : '활동 만들기'}
          </Button>
        </span>
      </div>
      <p className="text-xs text-muted">전체 워밍업 → 조 활동 → 전체 근력처럼 쌓아요. 계획은 선수 기록이 아니에요.</p>
      {open === 'new' ? <PlanForm d={d} orgId={orgId} lib={lib} planId={null} onDone={() => (setOpen(null), reload())} /> : null}
      {open === 'copy' ? <PlanCopy orgId={orgId} eventId={d.event.id} busy={busy} send={send} onDone={() => setOpen(null)} /> : null}
      <ul className="divide-y divide-line">
        {d.plans.map((pl) => (
          <li key={pl.id} className="space-y-1 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">{pl.title}</span>
              <Badge>{scopeLine(pl, d)}</Badge>
              <span className="ml-auto flex gap-3 text-xs">
                <button type="button" className="text-muted" onClick={() => setOpen(open === pl.id ? null : pl.id)}>
                  {open === pl.id ? '닫기' : '고치기'}
                </button>
                <button
                  type="button"
                  className="text-danger"
                  disabled={busy}
                  onClick={() => window.confirm('이 활동을 지울까요? 이 활동을 대신하던 개인 바꾸기도 같이 지워요.') && void send(deletePlan(orgId, pl.id), () => '지웠어요')}
                >
                  지우기
                </button>
              </span>
            </div>
            <LineList lines={pl.lines} />
            {open === pl.id ? <PlanForm d={d} orgId={orgId} lib={lib} planId={pl.id} onDone={() => (setOpen(null), reload())} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 지난 일정에서 활동 가져오기(계약 10-4 ②) — 앱 org/plan-copy 와 같은 동작. 복사본은 새 활동, 이 일정의 실제 · 결과는 그대로 */
function PlanCopy({ orgId, eventId, busy, send, onDone }: { orgId: string; eventId: string; busy: boolean; send: Part['send']; onDone: () => void }) {
  const [sources, setSources] = useState<PlanSource[] | null>(null);
  const [pick, setPick] = useState('');
  useEffect(() => {
    let live = true;
    void loadPlanSources(orgId, eventId).then((r) => live && setSources(r.ok ? r.sources : []));
    return () => {
      live = false;
    };
  }, [orgId, eventId]);
  if (!sources) return <p className="text-xs text-muted">불러오는 중…</p>;
  if (sources.length === 0) return <p className="text-xs text-muted">활동이 있는 지난 일정이 없어요.</p>;
  const run = (mode: 'add' | 'replace') => void send(copyPlansFrom(orgId, pick, eventId, mode), (r) => (r.copied ? `활동 ${r.copied}개를 가져왔어요` : '이미 가져왔어요')).then(onDone);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2">
      <select
        aria-label="활동을 가져올 일정"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        <option value="">일정 고르기</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.date} {s.time ?? ''} {s.title} — {s.plans.join(' · ')}
          </option>
        ))}
      </select>
      <Button type="button" variant="secondary" size="sm" disabled={!pick || busy} onClick={() => run('add')}>
        더하기
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={!pick || busy} onClick={() => window.confirm('이 일정의 활동을 지우고 가져온 활동으로 바꿀까요?') && run('replace')}>
        바꾸기
      </Button>
    </div>
  );
}

function PlanForm({ d, orgId, lib, planId, onDone }: { d: EventDetail; orgId: string; lib: Lib | null; planId: string | null; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<PlanScope>('all');
  const [groupName, setGroupName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [replacesPlanId, setReplaces] = useState<string | null>(null);
  const [valueMode, setValueMode] = useState<ValueMode>('shared');
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
      setScope(r.plan.scope);
      setGroupName(r.plan.groupName ?? '');
      setMemberIds(r.plan.memberIds);
      setReplaces(r.plan.replacesPlanId);
      setValueMode(r.plan.valueMode);
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
  const members = d.members.filter((m) => !m.left);
  const replaceable = d.plans.filter((x) => x.scope !== 'member' && x.id !== planId && memberIds[0] != null && x.targets.includes(memberIds[0]));
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await savePlan(orgId, d.event.id, {
      id: planId,
      title,
      scope,
      groupName: scope === 'group' ? groupName : null,
      memberIds: scope === 'all' ? [] : memberIds,
      replacesPlanId: scope === 'member' ? replacesPlanId : null,
      valueMode,
      items: pickItems(picks),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast('활동을 저장했어요');
    onDone();
  };
  if (!loaded) return <p className="text-xs text-muted">불러오는 중…</p>;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      <Field label="이름">
        <Input value={title} maxLength={PLAN_TITLE_MAX} placeholder="전체 워밍업" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="대상">
        {(['all', 'group', 'member'] as const).map((s) => (
          <Pill key={s} on={scope === s} onClick={() => (setScope(s), s === 'member' && setMemberIds((ids) => ids.slice(0, 1)))}>
            {PLAN_SCOPE_LABEL[s]}
          </Pill>
        ))}
      </div>
      {scope === 'group' ? (
        <div className="space-y-1">
          {d.tags.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">태그로 고르기</span>
              {d.tags.map((t) => (
                <Pill key={t} on={groupName === t} onClick={() => (setGroupName(t), setMemberIds(members.filter((m) => m.tags.includes(t)).map((m) => m.memberId)))}>
                  {t}
                </Pill>
              ))}
            </div>
          ) : null}
          <Field label="조 이름 · 표시만">
            <Input value={groupName} maxLength={20} placeholder="투수" onChange={(e) => setGroupName(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {scope !== 'all' ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">{scope === 'group' ? `선수 ${memberIds.length}명` : '선수 한 명'}</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <Pill
                key={m.memberId}
                on={memberIds.includes(m.memberId)}
                onClick={() =>
                  scope === 'member'
                    ? (setMemberIds([m.memberId]), setReplaces(null))
                    : setMemberIds((ids) => (ids.includes(m.memberId) ? ids.filter((x) => x !== m.memberId) : [...ids, m.memberId]))
                }
              >
                {m.nickname}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
      {scope === 'member' && memberIds.length === 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">이 선수만</span>
          <Pill on={!replacesPlanId} onClick={() => setReplaces(null)}>
            더하기
          </Pill>
          {replaceable.map((x) => (
            <Pill key={x.id} on={replacesPlanId === x.id} onClick={() => setReplaces(x.id)}>
              {x.title} 대신
            </Pill>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={valueMode === 'individual'} onChange={(e) => setValueMode(e.target.checked ? 'individual' : 'shared')} />
        투구 수를 선수마다 받기 <span className="text-xs text-muted">(불펜 — 조 전체에 같은 투구 수는 안 넣어요)</span>
      </label>
      <PickedRows picks={picks} setPicks={setPicks} />
      <LibraryList lib={lib} picked={(id) => picks.some((p) => p.id === id)} onToggle={(it, kind) => setPicks((ps) => togglePick(ps, it, kind))} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? '저장하는 중…' : '활동 저장'}
      </Button>
    </div>
  );
}

/* ── 처방 줄(조 실제 · 예외) ── */

type LineDraft = { id: string; kind: 'exercise' | 'drill'; name: string; sets: string; reps: string; sec: string; kg: string };
const s = (n: number | undefined) => (n == null ? '' : String(n));
const n = (v: string) => (v.trim() ? Number(v) : undefined);
const fromLines = (lines: readonly WorkLine[], names: Record<string, string>): LineDraft[] =>
  lines.flatMap((l) => {
    const id = l.exerciseId ?? l.guideId;
    return id ? [{ id, kind: l.exerciseId ? ('exercise' as const) : ('drill' as const), name: names[id] ?? '지운 운동', sets: s(l.sets), reps: s(l.reps), sec: s(l.holdSec), kg: s(l.weightKg) }] : [];
  });
const toLines = (ds: readonly LineDraft[], weight: boolean): WorkLine[] =>
  ds.map((x) => ({ ...(x.kind === 'exercise' ? { exerciseId: x.id } : { guideId: x.id }), sets: n(x.sets), reps: n(x.reps), holdSec: n(x.sec), ...(weight ? { weightKg: n(x.kg) } : {}) }));
const toggleLine = (ds: LineDraft[], it: LibItem, kind: 'exercise' | 'drill'): LineDraft[] =>
  ds.some((x) => x.id === it.id) ? ds.filter((x) => x.id !== it.id) : ds.length >= LINES_MAX ? ds : [...ds, { id: it.id, kind, name: it.name, sets: '', reps: '', sec: '', kg: '' }];

function LineRows({ lines, onChange, weight }: { lines: LineDraft[]; onChange: (next: LineDraft[]) => void; weight: boolean }) {
  const patch = (i: number, v: Partial<LineDraft>) => onChange(lines.map((x, k) => (k === i ? { ...x, ...v } : x)));
  const box = (v: string, set: (x: string) => void, ph: string, decimal = false) => (
    <Input
      className="w-16 px-2 py-1.5"
      inputMode={decimal ? 'decimal' : 'numeric'}
      placeholder={ph}
      aria-label={ph}
      value={v}
      onChange={(e) => set((decimal ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, '')).slice(0, 5))}
    />
  );
  if (lines.length === 0) return <p className="text-xs text-muted">운동이 없어요.</p>;
  return (
    <div className="space-y-1">
      {lines.map((x, i) => (
        <div key={`${x.id}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-32 flex-1 text-ink">
            {x.name}
            {x.kind === 'drill' ? ' · 드릴' : ''}
          </span>
          {x.kind === 'exercise' ? (
            <>
              {box(x.sets, (sets) => patch(i, { sets }), '세트')}
              {box(x.reps, (reps) => patch(i, { reps }), '회')}
              {box(x.sec, (sec) => patch(i, { sec }), '초')}
              {weight ? box(x.kg, (kg) => patch(i, { kg }), 'kg', true) : null}
            </>
          ) : null}
          <button type="button" aria-label={`${x.name} 빼기`} className="text-danger" onClick={() => onChange(lines.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── 실제 확인 ── */

function plansOfMember(d: EventDetail, memberId: string): PlanView[] {
  const mine = d.plans.filter((p) => p.targets.includes(memberId));
  const replaced = new Set(mine.filter((p) => p.scope === 'member' && p.replacesPlanId).map((p) => p.replacesPlanId!));
  return mine.filter((p) => !replaced.has(p.id));
}

function exceptionLine(m: EventMemberView, d: EventDetail): string {
  const e = m.exception;
  const mine = plansOfMember(d, m.memberId);
  if (e && mine.length && mine.every((pl) => e.items.some((x) => x.planId === pl.id && x.kind === 'absent')) && !e.extra.length) return '빠짐';
  const parts = (e?.items ?? []).map((x) => `${d.plans.find((pl) => pl.id === x.planId)?.title ?? '활동'} ${EXCEPTION_LABEL[x.kind]}`);
  if (e?.extra.length) parts.push('더 함');
  return parts.length ? parts.join(' · ') : '조와 같음';
}

function Confirm({ d, orgId, busy, send, reload, onDone }: Part & { onDone: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const lib = useLibrary(orgId);
  const sum = confirmSummary(
    d.members.map((m) => m.memberId),
    new Map(d.members.map((m) => [m.memberId, m.exception]))
  );
  const pending = d.members.filter((m) => m.pending).length;
  if (d.plans.length === 0)
    return (
      <Card>
        <p className="text-sm text-muted">활동이 없어요. 계획에서 활동을 먼저 만들어 주세요.</p>
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {d.plans.map((pl) => (
          <ActivityCard key={pl.id} pl={pl} d={d} orgId={orgId} lib={lib} busy={busy} send={send} reload={reload} />
        ))}
      </div>
      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-ink">선수 {d.members.length}명 · 다르게 한 선수만 고쳐요</h2>
        <ul className="divide-y divide-line">
          {d.members.map((m) => (
            <li key={m.memberId} className="space-y-2 py-2 text-sm">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === m.memberId ? null : m.memberId)}>
                <span className="w-28 shrink-0 font-semibold text-ink">{m.nickname}</span>
                <span className={`flex-1 text-xs ${m.exception ? 'text-warn' : 'text-muted'}`}>
                  {exceptionLine(m, d)}
                  {m.sameAsGroup.length ? ' · 조 기록과 같아졌어요 — 예외를 풀까요' : ''}
                  {m.selfSets ? ` · 선수 기록 ${m.selfSets}세트` : ''}
                </span>
                <span className="text-xs text-muted">{open === m.memberId ? '닫기' : '고치기'}</span>
              </button>
              {open === m.memberId ? <ExceptionForm d={d} orgId={orgId} m={m} lib={lib} onDone={() => (setOpen(null), reload())} /> : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={busy || (!!d.event.confirmedAt && pending === 0)}
            onClick={() =>
              void send(confirmTeamWork(orgId, d.event.id), (r) => {
                const failed = r.results.filter((x) => x.status === 'failed').length;
                return `확인했어요 · 바뀐 선수 ${r.changed}명${failed ? ` · 실패 ${failed}명` : ''}`;
              }).then((ok) => ok && onDone())
            }
          >
            {d.event.confirmedAt ? `다시 확인 — 바뀐 선수 ${pending}명` : `이대로 확인 — 같음 ${sum.same} · 예외 ${sum.exceptions}`}
          </Button>
          <span className="text-xs text-muted">확인하면 선수마다 개인 기록(운동 · 투구)에 들어가 부하 · 달력에 셈해져요.</span>
        </div>
      </Card>
    </div>
  );
}

const EFFORTS = EFFORT_CHIPS.map((p) => ({ value: String(p), label: effortScaleText(p) }));

function ActivityCard({ pl, d, orgId, lib, busy, send }: Part & { pl: PlanView; lib: Lib | null }) {
  const [editing, setEditing] = useState<LineDraft[] | null>(null);
  const [effort, setEffort] = useState('');
  const pitchers = d.members.filter((m) => pl.targets.includes(m.memberId) && !m.exception?.items.some((x) => x.planId === pl.id && x.kind === 'absent'));
  const valueOf = (m: EventMemberView) => m.values.find((v) => v.planId === pl.id);
  const [rows, setRows] = useState<Record<string, { count: string; kmh: string }> | null>(null);
  const cur = rows ?? Object.fromEntries(pitchers.map((m) => [m.memberId, { count: valueOf(m) ? String(valueOf(m)!.pitchCount) : '', kmh: valueOf(m)?.maxVelocity ? String(valueOf(m)!.maxVelocity) : '' }]));
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-ink">{pl.title}</h3>
        <Badge>{scopeLine(pl, d)}</Badge>
        <button type="button" className="ml-auto text-xs text-sky-strong" onClick={() => setEditing(editing ? null : fromLines(pl.actual, d.names))}>
          {editing ? '닫기' : '실제 고치기'}
        </button>
      </div>
      <p className="text-xs text-muted">{pl.actualSet ? '실제(고침)' : '실제 — 계획 그대로'}</p>
      {editing ? (
        <div className="space-y-2 rounded-2xl border border-line bg-surface-2/60 p-3">
          <p className="text-xs text-muted">예외 없는 선수 모두에게 이대로 들어가요. 무게는 선수마다 달라 여기서 안 적어요.</p>
          <LineRows lines={editing} onChange={setEditing} weight={false} />
          <LibraryList lib={lib} picked={(id) => editing.some((x) => x.id === id)} onToggle={(it, kind) => setEditing(toggleLine(editing, it, kind))} />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void send(saveActual(orgId, d.event.id, pl.id, toLines(editing, false)), () => '실제를 고쳤어요').then((ok) => ok && setEditing(null))}>
              저장
            </Button>
            {pl.actualSet ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send(saveActual(orgId, d.event.id, pl.id, null), () => '계획대로 되돌렸어요').then((ok) => ok && setEditing(null))}>
                계획대로 되돌리기
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <LineList lines={pl.actualLines} />
      )}
      {pl.valueMode === 'individual' ? (
        <div className="space-y-2 border-t border-line pt-2">
          <p className="text-xs text-muted">투구는 선수마다 적어요. 비우면 그 선수 투구는 안 남아요.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">체감 강도</span>
            {EFFORTS.map((x) => (
              <Pill key={x.value} on={effort === x.value} onClick={() => setEffort(x.value)}>
                {x.label}
              </Pill>
            ))}
          </div>
          {pitchers.map((m) => (
            <div key={m.memberId} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-ink">
                {m.nickname}
                {!m.canPitch ? <span className="text-xs text-muted"> · {m.hasUser ? '투구 비공개' : '앱 연결 대기'}</span> : null}
              </span>
              <Input
                className="w-20 px-2 py-1.5"
                inputMode="numeric"
                placeholder="구"
                aria-label={`${m.nickname} 투구 수`}
                value={cur[m.memberId]?.count ?? ''}
                onChange={(e) => setRows({ ...cur, [m.memberId]: { ...cur[m.memberId], count: e.target.value.replace(/\D/g, '').slice(0, 3) } })}
              />
              <Input
                className="w-20 px-2 py-1.5"
                inputMode="decimal"
                placeholder="km/h"
                aria-label={`${m.nickname} 구속`}
                value={cur[m.memberId]?.kmh ?? ''}
                onChange={(e) => setRows({ ...cur, [m.memberId]: { ...cur[m.memberId], kmh: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) } })}
              />
            </div>
          ))}
          {rows ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void send(
                  saveTeamValues(
                    orgId,
                    d.event.id,
                    pl.id,
                    pitchers.map((m) => ({ memberId: m.memberId, pitchCount: cur[m.memberId]?.count ?? '', effortPct: valueOf(m)?.effortPct ?? (effort || null), maxVelocity: cur[m.memberId]?.kmh || null }))
                  ),
                  () => '투구 수를 적어 두었어요'
                ).then((ok) => ok && setRows(null))
              }
            >
              투구 수 적어 두기
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

type State = 'same' | ExceptionKind;
type PlanDraft = { kind: State; lines: LineDraft[]; note: string };

function ExceptionForm({ d, orgId, m, lib, onDone }: { d: EventDetail; orgId: string; m: EventMemberView; lib: Lib | null; onDone: () => void }) {
  const mine = plansOfMember(d, m.memberId);
  const [plans, setPlans] = useState<Record<string, PlanDraft>>(() =>
    Object.fromEntries(
      mine.map((pl) => {
        const e = m.exception?.items.find((x) => x.planId === pl.id);
        return [pl.id, { kind: e?.kind ?? 'same', lines: fromLines(e?.items ?? pl.actual, d.names), note: e?.note ?? '' }];
      })
    )
  );
  const [extra, setExtra] = useState<LineDraft[]>(() => fromLines(m.exception?.extra.flatMap((x) => x.items) ?? [], d.names));
  const [pitch, setPitch] = useState<Record<string, { count: string; effort: string; kmh: string }>>(() =>
    Object.fromEntries(m.values.map((v) => [v.planId, { count: String(v.pitchCount), effort: String(v.effortPct), kmh: v.maxVelocity ? String(v.maxVelocity) : '' }]))
  );
  const [browse, setBrowse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPlan = (id: string, v: Partial<PlanDraft>) => setPlans((p) => ({ ...p, [id]: { ...p[id], ...v } }));
  const save = async (reset = false) => {
    setBusy(true);
    setError(null);
    const items = reset
      ? []
      : mine
          .filter((pl) => plans[pl.id].kind !== 'same')
          .map((pl) => ({ planId: pl.id, kind: plans[pl.id].kind, ...(plans[pl.id].kind === 'absent' ? {} : { items: toLines(plans[pl.id].lines, true) }), note: plans[pl.id].note.trim() || undefined }));
    const values = reset
      ? []
      : mine
          .filter((pl) => pl.valueMode === 'individual' && pitch[pl.id]?.count)
          .map((pl) => ({ planId: pl.id, pitchCount: Number(pitch[pl.id].count), effortPct: pitch[pl.id].effort ? Number(pitch[pl.id].effort) : null, maxVelocity: pitch[pl.id].kmh || null }));
    const r = await saveMemberResult(orgId, d.event.id, m.memberId, {
      exception: { items, extra: !reset && extra.length ? [{ items: toLines(extra, true) }] : [], separate: reset ? [] : (m.exception?.separate ?? []) },
      values,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? '저장하지 못했어요.');
    toast(reset ? '조와 같게 했어요' : '적어 두었어요 · 확인하면 기록돼요');
    onDone();
  };
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      {mine.map((pl, i) => {
        const x = plans[pl.id];
        return (
          <div key={pl.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-32 shrink-0 text-xs font-semibold text-ink">{pl.title}</span>
              {(['same', 'absent', 'reduced', 'substitute'] as const).map((k) => (
                <Pill key={k} on={x.kind === k} onClick={() => setPlan(pl.id, { kind: k })}>
                  {k === 'same' ? '같음' : EXCEPTION_LABEL[k]}
                </Pill>
              ))}
              {i < mine.length - 1 && x.kind !== 'absent' ? (
                <button
                  type="button"
                  className="text-xs text-sky-strong"
                  onClick={() => setPlans((p) => Object.fromEntries(mine.map((y, k) => [y.id, k > i ? { ...p[y.id], kind: 'absent' as const } : p[y.id]])))}
                >
                  이 활동까지만(뒤는 빠짐)
                </button>
              ) : null}
            </div>
            {x.kind !== 'same' ? <Input value={x.note} maxLength={NOTE_MAX} placeholder="까닭(선택) — 어깨 피로" onChange={(e) => setPlan(pl.id, { note: e.target.value })} /> : null}
            {x.kind === 'reduced' || x.kind === 'substitute' ? (
              <>
                <LineRows lines={x.lines} onChange={(lines) => setPlan(pl.id, { lines })} weight />
                <button type="button" className="text-xs text-sky-strong" onClick={() => setBrowse(browse === pl.id ? null : pl.id)}>
                  {browse === pl.id ? '운동 고르기 닫기' : '+ 운동 고르기'}
                </button>
                {browse === pl.id ? <LibraryList lib={lib} picked={(id) => x.lines.some((y) => y.id === id)} onToggle={(it, kind) => setPlan(pl.id, { lines: toggleLine(x.lines, it, kind) })} /> : null}
              </>
            ) : null}
            {pl.valueMode === 'individual' && x.kind !== 'absent' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  className="w-20 px-2 py-1.5"
                  inputMode="numeric"
                  placeholder="구"
                  aria-label="투구 수"
                  value={pitch[pl.id]?.count ?? ''}
                  onChange={(e) => setPitch((p) => ({ ...p, [pl.id]: { ...(p[pl.id] ?? { count: '', effort: '', kmh: '' }), count: e.target.value.replace(/\D/g, '').slice(0, 3) } }))}
                />
                <Input
                  className="w-20 px-2 py-1.5"
                  inputMode="decimal"
                  placeholder="km/h"
                  aria-label="구속"
                  value={pitch[pl.id]?.kmh ?? ''}
                  onChange={(e) => setPitch((p) => ({ ...p, [pl.id]: { ...(p[pl.id] ?? { count: '', effort: '', kmh: '' }), kmh: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) } }))}
                />
                {EFFORTS.map((ef) => (
                  <Pill key={ef.value} on={pitch[pl.id]?.effort === ef.value} onClick={() => setPitch((p) => ({ ...p, [pl.id]: { ...(p[pl.id] ?? { count: '', effort: '', kmh: '' }), effort: ef.value } }))}>
                    {ef.label}
                  </Pill>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="space-y-2 border-t border-line pt-2">
        <p className="text-xs font-semibold text-ink">더 한 운동</p>
        <LineRows lines={extra} onChange={setExtra} weight />
        <button type="button" className="text-xs text-sky-strong" onClick={() => setBrowse(browse === 'extra' ? null : 'extra')}>
          {browse === 'extra' ? '운동 고르기 닫기' : '+ 운동 고르기'}
        </button>
        {browse === 'extra' ? <LibraryList lib={lib} picked={(id) => extra.some((y) => y.id === id)} onToggle={(it, kind) => setExtra(toggleLine(extra, it, kind))} /> : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? '저장하는 중…' : '적어 두기'}
        </Button>
        {m.exception || m.values.length ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void save(true)}>
            조와 같게 되돌리기
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ── 결과 ── */

function Result({ d, orgId, busy, send }: Part) {
  if (!d.event.confirmedAt)
    return (
      <Card>
        <p className="text-sm text-muted">아직 확인 전이에요. 실제 확인에서 &apos;이대로 확인&apos;을 누르면 선수마다 결과가 생겨요.</p>
      </Card>
    );
  const failed = d.members.filter((m) => m.status === 'failed').map((m) => m.memberId);
  const pending = d.members.filter((m) => m.pending).length;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-ink">선수마다 결과</h2>
        <span className="text-xs text-muted">
          {d.event.confirmedBy ?? '코치'} 확인 · {new Date(d.event.confirmedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {pending ? ` · 확인 뒤 바뀐 선수 ${pending}명(실제 확인에서 다시 확인)` : ''}
        </span>
        {failed.length ? (
          <Button type="button" size="sm" className="ml-auto" disabled={busy} onClick={() => void send(confirmTeamWork(orgId, d.event.id, failed), (r) => `다시 보냈어요 · 바뀐 선수 ${r.changed}명`)}>
            실패한 {failed.length}명 다시 보내기
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {d.members.map((m) => (
          <li key={m.memberId} className="space-y-1 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 font-semibold text-ink">{m.nickname}</span>
              <span className={`text-xs font-semibold ${m.status === 'recorded' || m.status === 'reconciled' ? 'text-ok' : m.status === 'needs_check' || m.status === 'failed' ? 'text-warn' : 'text-muted'}`}>
                {m.status ? WORK_STATUS_LABEL[m.status] : '확인 전'}
              </span>
              <span className="flex-1 text-xs text-muted">
                {m.reasons.map((r) => WORK_REASON_LABEL[r] ?? r).join(' · ')}
                {m.exception ? `${m.reasons.length ? ' · ' : ''}예외: ${exceptionLine(m, d)}` : ''}
              </span>
            </div>
            {m.held.map((h) => (
              <p key={h.exerciseId} className="flex flex-wrap items-center gap-2 pl-30 text-xs">
                <span className="text-warn">확인 필요 — {h.name}(선수가 그날 따로 남긴 같은 운동)</span>
                <button type="button" className="text-sky-strong" disabled={busy} onClick={() => void send(resolveTeamCheck(orgId, d.event.id, m.memberId, h.exerciseId, 'link'), () => '맞췄어요')}>
                  팀 훈련에 잇기
                </button>
                <button type="button" className="text-sky-strong" disabled={busy} onClick={() => void send(resolveTeamCheck(orgId, d.event.id, m.memberId, h.exerciseId, 'separate'), () => '팀 기록도 남겼어요')}>
                  따로 한 운동
                </button>
              </p>
            ))}
            {m.fixes.map((f) => (
              <p key={f.id} className="pl-30 text-xs text-warn">
                정정 요청: {f.body}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── 등판(경기) ── */

function Outings({ d, orgId, busy, send }: Part) {
  const live = d.members.filter((m) => !m.left);
  const drafts = live.filter((m) => m.outing?.status === 'draft').length;
  const save = (m: EventMemberView, role: string, limit: string) => void send(saveOuting(orgId, d.event.id, m.memberId, role || null, limit.trim() || null));
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
        {live.map((m) => (
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

function LineList({ lines }: { lines: PlanView['lines'] }) {
  if (lines.length === 0) return <p className="text-xs text-muted">운동 없음</p>;
  return (
    <>
      {lines.map((l, i) => (
        <p key={i} className="flex gap-2 text-xs text-muted">
          <span className="flex-1">
            {l.name}
            {l.kind === 'drill' ? ' · 드릴' : ''}
          </span>
          {l.dose}
        </p>
      ))}
    </>
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

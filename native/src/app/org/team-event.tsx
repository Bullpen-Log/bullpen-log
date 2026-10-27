import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventDetail, EventMemberView, PlanView, loadEventDetail } from '@/app/actions/app-team';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { EVENT_STATUS_LABEL, type EventStatus } from '@/lib/org/lesson-pitch';
import { OUTING_ROLES, OUTING_ROLE_LABEL, OUTING_STATUS_LABEL, PITCH_LIMIT_MAX, type OutingRole } from '@/lib/org/team';
import { EXCEPTION_LABEL, WORK_REASON_LABEL, WORK_STATUS_LABEL, confirmSummary } from '@/lib/org/team-session';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { toast } from '~/shell/toast';
import { ChoiceChips, dayWithWeekday, st as fst } from '~/org/forms';
import { plansOfMember } from '~/org/lines';
import { Card, Empty, GroupTitle, Primary, st } from '~/org/parts';
import { Num } from '~/org/picker';

/**
 * 팀 훈련 하나(앱 화면 — docs/designs/sinker-team-lesson-contract.md 11절) — 단계 [계획 · 실제 확인 · 결과] + 경기면 등판 계획.
 * 계획: 명단(준비할 때 담아 고정) · 활동(전체 · 조 · 개인). 실제 확인: 조 실제 · 선수 예외 · 투구 수(선수마다) → '이대로 확인' 한 번에 선수마다 개인 기록.
 * 결과: 선수마다 상태 · 까닭 · 확인 필요 풀기 · 실패만 다시. 참석 응답 · 참석 확인은 없다(안 온 선수는 '빠짐' 예외).
 * 자료 · 쓰기는 app/actions/app-team.ts. 일정 자체를 고치는 것은 org/event(웹과 같은 폼).
 */
type Loaded = Awaited<ReturnType<typeof loadEventDetail>>;
type Res = { ok: boolean; error?: string } & Record<string, unknown>;
type Stage = 'plan' | 'confirm' | 'result';
const STAGES = [
  { value: 'plan', label: '계획' },
  { value: 'confirm', label: '실제 확인' },
  { value: 'result', label: '결과' },
] as const;

export default function TeamEventScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; id: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-team.loadEventDetail', p.org ?? '', p.id ?? '');
  const [busy, setBusy] = useState(false);
  const [picked, setStage] = useState<Stage | null>(null);
  const org = p.org ?? '';

  const send = async (done: string | ((r: Res) => string), action: string, ...args: unknown[]): Promise<Res | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = (await call<Res>(action, ...args)) as Res;
      if (!r.ok) {
        toast(r.error || '처리하지 못했어요.', 'error');
        return r;
      }
      const word = typeof done === 'string' ? done : done(r);
      if (word) toast(word);
      await reload();
      return r;
    } finally {
      setBusy(false);
    }
  };

  const past = !!data && data.event.date <= data.todayKey;
  const stage: Stage = picked ?? (!data || !past ? 'plan' : data.event.confirmedAt ? 'result' : 'confirm');
  const part = data ? { d: data, org, send, busy, c } : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={data?.event.title ?? '일정'} c={c} />
      {!part ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Head {...part} />
          <Segmented label="단계" options={STAGES} value={stage} onChange={setStage} />
          {stage === 'plan' ? (
            <>
              <Roster {...part} />
              <Plans {...part} />
            </>
          ) : stage === 'confirm' ? (
            past ? (
              <Confirm {...part} onDone={() => setStage('result')} />
            ) : (
              <Card c={c}>
                <Empty text="끝난 뒤에 실제를 확인해요. 계획만으로는 선수 기록에 아무것도 안 들어가요." c={c} />
              </Card>
            )
          ) : (
            <Result {...part} />
          )}
          {part.d.event.kind === 'game' ? <Outings {...part} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

type Send = (done: string | ((r: Res) => string), action: string, ...args: unknown[]) => Promise<Res | null>;
type Part = { d: EventDetail; org: string; send: Send; busy: boolean; c: Palette };

function Head({ d, org, c }: Part) {
  const e = d.event;
  return (
    <Card c={c}>
      <Text style={[TYPE.card, { color: c.ink }]}>{e.title}</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {dayWithWeekday(e.date)} · {e.time ?? '종일'} · {EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind} · {EVENT_STATUS_LABEL[e.status as EventStatus] ?? e.status}
      </Text>
      {e.memo ? <Text style={[TYPE.body, { color: c.ink }]}>{e.memo}</Text> : null}
      <SmallLink label="일정 고치기" onPress={() => router.push(`/org/event?org=${org}&date=${e.date}&id=${e.id}` as Href)} c={c} />
    </Card>
  );
}

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

function Roster({ d, org, send, busy, c }: Part) {
  const [open, setOpen] = useState(false);
  const live = d.members.filter((m) => !m.left);
  const remove = (m: EventMemberView) =>
    Alert.alert(`${m.nickname}을(를) 명단에서 뺄까요?`, '이 훈련의 활동 대상에서 빠져요.', [
      { text: '취소', style: 'cancel' },
      { text: '빼기', style: 'destructive', onPress: () => void send('뺐어요', 'app-team.setRosterMember', org, d.event.id, m.memberId, false) },
    ]);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={`명단 ${live.length}명`} c={c} />
      <Card c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>
          {d.event.rosterAt ? '준비할 때 담은 명단이라 선수가 나중에 들어오고 나가도 그대로예요.' : '첫 활동을 만들 때 지금 선수로 명단을 담아요.'}
        </Text>
        <View style={fst.chips}>
          {d.members.map((m) => (
            <Pressable key={m.memberId} accessibilityRole="button" accessibilityLabel={`${m.nickname} 명단에서 빼기`} onPress={() => remove(m)} disabled={busy} style={[st.chip, { backgroundColor: c.page }]}>
              <Text style={{ color: m.left ? c.muted : c.ink, fontSize: 14, fontWeight: '600' }}>
                {m.nickname}
                {m.left ? ' · 떠남' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        {d.others.length ? <SmallLink label={open ? '닫기' : `+ 명단에 더하기(${d.others.length}명)`} onPress={() => setOpen(!open)} c={c} /> : null}
        {open ? (
          <View style={fst.chips}>
            {d.others.map((m) => (
              <Pressable
                key={m.memberId}
                accessibilityRole="button"
                accessibilityLabel={`${m.nickname} 명단에 더하기`}
                onPress={() => void send(`${m.nickname}을(를) 더했어요`, 'app-team.setRosterMember', org, d.event.id, m.memberId, true)}
                disabled={busy}
                style={[st.chip, { backgroundColor: c.sky }]}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>+ {m.nickname}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function Plans({ d, org, c }: Part) {
  const open = (id?: string) => router.push(`/org/plan?org=${org}&event=${d.event.id}${id ? `&id=${id}` : ''}` as Href);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="활동" c={c} />
      {d.plans.map((pl) => (
        <Pressable key={pl.id} accessibilityRole="button" onPress={() => open(pl.id)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Card c={c}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{pl.title}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>›</Text>
            </View>
            <Text style={[TYPE.sub, { color: c.link }]}>{scopeLine(pl, d)}</Text>
            <LinesText lines={pl.lines} c={c} />
          </Card>
        </Pressable>
      ))}
      <Card c={c}>
        {d.plans.length === 0 ? <Empty text="전체 워밍업 → 조 활동 → 전체 근력처럼 쌓아요. 계획은 선수 기록이 아니에요." c={c} /> : null}
        <SmallLink label="+ 활동 만들기" onPress={() => open()} c={c} />
        {/* 다시 쓰기(계약 10-4 ②) — 지난 일정의 활동을 가져와 고친다 */}
        <SmallLink label="지난 일정에서 가져오기" onPress={() => router.push(`/org/plan-copy?org=${org}&event=${d.event.id}` as Href)} c={c} />
      </Card>
    </View>
  );
}

/* ── 실제 확인 ── */

function exceptionLine(m: EventMemberView, d: EventDetail): string {
  const e = m.exception;
  const mine = plansOfMember(d, m.memberId);
  if (e && mine.length && mine.every((pl) => e.items.some((x) => x.planId === pl.id && x.kind === 'absent')) && !e.extra.length) return '빠짐';
  const parts = (e?.items ?? []).map((x) => `${d.plans.find((pl) => pl.id === x.planId)?.title ?? '활동'} ${EXCEPTION_LABEL[x.kind]}`);
  if (e?.extra.length) parts.push('더 함');
  return parts.length ? parts.join(' · ') : '조와 같음';
}

function Confirm({ d, org, send, busy, c, onDone }: Part & { onDone: () => void }) {
  const ex = new Map(d.members.map((m) => [m.memberId, m.exception]));
  const sum = confirmSummary(
    d.members.map((m) => m.memberId),
    ex
  );
  const pending = d.members.filter((m) => m.pending).length;
  const confirm = async () => {
    const r = await send((x) => {
      const results = (x.results as { status: string }[]) ?? [];
      const failed = results.filter((y) => y.status === 'failed').length;
      return `확인했어요 · 바뀐 선수 ${x.changed ?? 0}명${failed ? ` · 실패 ${failed}명` : ''}`;
    }, 'app-team.confirmTeamWork', org, d.event.id);
    if (r?.ok) onDone();
  };
  return (
    <>
      {d.plans.length === 0 ? (
        <Card c={c}>
          <Empty text="활동이 없어요. 계획에서 활동을 먼저 만들어 주세요." c={c} />
        </Card>
      ) : null}
      {d.plans.map((pl) => (
        <Activity key={pl.id} pl={pl} d={d} org={org} send={send} busy={busy} c={c} />
      ))}
      {d.plans.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title={`선수 ${d.members.length}명 — 다르게 한 선수만 눌러 고쳐요`} c={c} />
          <Card c={c} style={{ paddingVertical: 4 }}>
            {d.members.map((m, i) => (
              <Pressable
                key={m.memberId}
                accessibilityRole="button"
                onPress={() => router.push(`/org/exception?org=${org}&event=${d.event.id}&member=${m.memberId}` as Href)}
                style={({ pressed }) => [st.row, i < d.members.length - 1 && line(c), pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
                  <Text style={[TYPE.sub, { color: m.exception ? c.warn : c.muted }]} numberOfLines={2}>
                    {exceptionLine(m, d)}
                    {m.sameAsGroup.length ? ' · 조 기록과 같아졌어요 — 예외를 풀까요' : ''}
                    {m.selfSets ? ` · 선수 기록 ${m.selfSets}세트` : ''}
                  </Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            ))}
          </Card>
          <Primary
            label={busy ? '확인하는 중…' : d.event.confirmedAt ? `다시 확인 — 바뀐 선수 ${pending}명` : `이대로 확인 — 같음 ${sum.same} · 예외 ${sum.exceptions}`}
            onPress={() => void confirm()}
            disabled={busy || (!!d.event.confirmedAt && pending === 0)}
            c={c}
          />
          <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>확인하면 선수마다 개인 기록(운동 · 투구)에 들어가 부하 · 달력에 셈해져요.</Text>
        </View>
      ) : null}
    </>
  );
}

const EFFORTS = EFFORT_CHIPS.map((p) => ({ value: String(p), label: effortScaleText(p) }));

function Activity({ pl, d, org, send, busy, c }: Part & { pl: PlanView }) {
  const [effort, setEffort] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, { count: string; kmh: string }> | null>(null);
  /* 그 활동을 '빠짐'으로 둔 선수는 투구 칸에서 뺀다 */
  const pitchers = d.members.filter((m) => pl.targets.includes(m.memberId) && !m.exception?.items.some((x) => x.planId === pl.id && x.kind === 'absent'));
  const valueOf = (m: EventMemberView) => m.values.find((v) => v.planId === pl.id);
  const cur = rows ?? Object.fromEntries(pitchers.map((m) => [m.memberId, { count: valueOf(m) ? String(valueOf(m)!.pitchCount) : '', kmh: valueOf(m)?.maxVelocity ? String(valueOf(m)!.maxVelocity) : '' }]));
  const savePitch = async () => {
    const r = await send(
      '투구 수를 적어 두었어요',
      'app-team.saveTeamValues',
      org,
      d.event.id,
      pl.id,
      pitchers.map((m) => ({ memberId: m.memberId, pitchCount: cur[m.memberId]?.count ?? '', effortPct: valueOf(m)?.effortPct ?? effort, maxVelocity: cur[m.memberId]?.kmh || null }))
    );
    if (r?.ok) setRows(null);
  };
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={`${pl.title} · ${scopeLine(pl, d)}`} c={c} />
      <Card c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>{pl.actualSet ? '실제(고침)' : '실제 — 계획 그대로'}</Text>
        <LinesText lines={pl.actualLines} c={c} />
        <SmallLink label="실제 고치기" onPress={() => router.push(`/org/actual?org=${org}&event=${d.event.id}&plan=${pl.id}` as Href)} c={c} />
      </Card>
      {pl.valueMode === 'individual' ? (
        <Card c={c}>
          <Text style={[TYPE.sub, { color: c.muted }]}>투구는 선수마다 적어요. 비우면 그 선수 투구는 안 남아요.</Text>
          <ChoiceChips options={EFFORTS} value={effort} onChange={setEffort} c={c} />
          {pitchers.map((m, i) => (
            <View key={m.memberId} style={[st.row, i < pitchers.length - 1 && line(c)]}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
                {!m.canPitch ? <Text style={[TYPE.sub, { color: c.muted }]}>{m.hasUser ? '투구 비공개 — 기록엔 안 남아요' : '앱 연결 대기'}</Text> : null}
              </View>
              <Num value={cur[m.memberId]?.count ?? ''} onChange={(count) => setRows({ ...cur, [m.memberId]: { ...cur[m.memberId], count } })} unit="구" max={3} c={c} />
              <Num value={cur[m.memberId]?.kmh ?? ''} onChange={(kmh) => setRows({ ...cur, [m.memberId]: { ...cur[m.memberId], kmh } })} unit="km/h" max={5} decimal c={c} />
            </View>
          ))}
          {rows ? <Primary label={busy ? '저장하는 중…' : '투구 수 적어 두기'} onPress={() => void savePitch()} disabled={busy} c={c} /> : null}
        </Card>
      ) : null}
    </View>
  );
}

/* ── 결과 ── */

function Result({ d, org, send, busy, c }: Part) {
  if (!d.event.confirmedAt)
    return (
      <Card c={c}>
        <Empty text="아직 확인 전이에요. 실제 확인에서 '이대로 확인'을 누르면 선수마다 결과가 생겨요." c={c} />
      </Card>
    );
  const failed = d.members.filter((m) => m.status === 'failed').map((m) => m.memberId);
  const pending = d.members.filter((m) => m.pending).length;
  const when = new Date(d.event.confirmedAt);
  const settle = (m: EventMemberView, exerciseId: string, name: string) =>
    Alert.alert(`${m.nickname} · ${name}`, '선수가 그날 따로 남긴 같은 운동이에요. 팀 훈련이었나요?', [
      { text: '닫기', style: 'cancel' },
      { text: '팀 훈련에 잇기(선수 기록으로)', onPress: () => void send('맞췄어요', 'app-team.resolveTeamCheck', org, d.event.id, m.memberId, exerciseId, 'link') },
      { text: '따로 한 운동(팀 기록도)', onPress: () => void send('팀 기록도 남겼어요', 'app-team.resolveTeamCheck', org, d.event.id, m.memberId, exerciseId, 'separate') },
    ]);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="선수마다 결과" c={c} />
      <Card c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>
          {d.event.confirmedBy ?? '코치'} 확인 · {when.getMonth() + 1}/{when.getDate()} {String(when.getHours()).padStart(2, '0')}:{String(when.getMinutes()).padStart(2, '0')}
          {pending ? ` · 확인 뒤 바뀐 선수 ${pending}명(실제 확인에서 다시 확인)` : ''}
        </Text>
        {failed.length ? (
          <Primary
            label={busy ? '보내는 중…' : `실패한 ${failed.length}명 다시 보내기`}
            onPress={() => void send((r) => `다시 보냈어요 · 바뀐 선수 ${r.changed ?? 0}명`, 'app-team.confirmTeamWork', org, d.event.id, failed)}
            disabled={busy}
            c={c}
          />
        ) : null}
        {d.members.map((m, i) => (
          <View key={m.memberId} style={[{ paddingVertical: 8, gap: 4 }, i < d.members.length - 1 && line(c)]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{m.nickname}</Text>
              <Text style={[TYPE.sub, { color: statusColor(m.status, c), fontWeight: '600' }]}>{m.status ? WORK_STATUS_LABEL[m.status] : '확인 전'}</Text>
            </View>
            {m.reasons.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{m.reasons.map((r) => WORK_REASON_LABEL[r] ?? r).join(' · ')}</Text> : null}
            {m.exception ? <Text style={[TYPE.sub, { color: c.muted }]}>예외: {exceptionLine(m, d)}</Text> : null}
            {m.held.map((h) => (
              <SmallLink key={h.exerciseId} label={`확인 필요 — ${h.name} ›`} onPress={() => settle(m, h.exerciseId, h.name)} disabled={busy} c={c} />
            ))}
            {m.fixes.map((f) => (
              <Text key={f.id} style={[TYPE.sub, { color: c.warn }]}>
                정정 요청: {f.body}
              </Text>
            ))}
          </View>
        ))}
      </Card>
    </View>
  );
}

const statusColor = (s: EventMemberView['status'], c: Palette) =>
  s === 'recorded' || s === 'reconciled' ? c.ok : s === 'needs_check' || s === 'failed' ? c.warn : c.muted;

/* ── 등판(경기) ── */

function Outings({ d, org, send, busy, c }: Part) {
  const live = d.members.filter((m) => !m.left);
  const drafts = live.filter((m) => m.outing?.status === 'draft').length;
  const limit = (m: EventMemberView, role: OutingRole) =>
    Alert.prompt(
      `${m.nickname} ${OUTING_ROLE_LABEL[role]}`,
      `투구 수 한도(선택, 1~${PITCH_LIMIT_MAX})`,
      [
        { text: '취소', style: 'cancel' },
        { text: '저장', onPress: (v?: string) => void send('', 'app-team.saveOuting', org, d.event.id, m.memberId, role, v?.trim() || null) },
      ],
      'plain-text',
      m.outing?.pitchLimit ? String(m.outing.pitchLimit) : '',
      'number-pad'
    );
  const pick = (m: EventMemberView) =>
    Alert.alert(m.nickname, '등판 역할', [
      ...OUTING_ROLES.map((r) => ({ text: OUTING_ROLE_LABEL[r], onPress: () => limit(m, r) })),
      ...(m.outing ? [{ text: '빼기', style: 'destructive' as const, onPress: () => void send('', 'app-team.saveOuting', org, d.event.id, m.memberId, null, null) }] : []),
      { text: '닫기', style: 'cancel' as const },
    ]);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="등판 계획" c={c} />
      <Card c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>확정한 선발 · 불펜만 선수의 다음 등판으로 읽혀요(선수 체크인 답이 먼저).</Text>
        {live.map((m, i) => (
          <Pressable key={m.memberId} accessibilityRole="button" disabled={busy} onPress={() => pick(m)} style={({ pressed }) => [st.row, i < live.length - 1 && line(c), pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
              {m.outingNote ? <Text style={[TYPE.sub, { color: c.warn }]}>{m.outingNote}</Text> : null}
            </View>
            <Text style={[TYPE.sub, { color: m.outing?.status === 'confirmed' ? c.ok : m.outing ? c.link : c.muted }]}>
              {m.outing
                ? `${OUTING_ROLE_LABEL[m.outing.role]}${m.outing.pitchLimit ? ` · ${m.outing.pitchLimit}구` : ''} · ${OUTING_STATUS_LABEL[m.outing.status as keyof typeof OUTING_STATUS_LABEL] ?? m.outing.status}`
                : '없음'}
            </Text>
            <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
          </Pressable>
        ))}
      </Card>
      {drafts ? (
        <Primary label={busy ? '확정하는 중…' : `등판 ${drafts}명 확정`} onPress={() => void send((r) => `${r.count ?? 0}명 확정했어요`, 'app-team.confirmOutings', org, d.event.id)} disabled={busy} c={c} />
      ) : null}
    </View>
  );
}

const line = (c: Palette) => ({ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line });

function LinesText({ lines, c }: { lines: PlanView['lines']; c: Palette }) {
  if (lines.length === 0) return <Text style={[TYPE.sub, { color: c.muted }]}>운동 없음</Text>;
  return (
    <>
      {lines.map((l, i) => (
        <Text key={i} style={[TYPE.sub, { color: c.muted }]} numberOfLines={1}>
          {l.name}
          {l.dose ? ` · ${l.dose}` : ''}
          {l.kind === 'drill' ? ' · 드릴' : ''}
        </Text>
      ))}
    </>
  );
}

function SmallLink({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

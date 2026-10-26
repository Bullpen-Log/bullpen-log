import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventDetail, EventMemberView, loadEventDetail } from '@/app/actions/app-team';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { EVENT_STATUS_LABEL, type EventStatus } from '@/lib/org/lesson-pitch';
import { ATTEND_LABEL, OUTING_ROLES, OUTING_ROLE_LABEL, OUTING_STATUS_LABEL, PITCH_LIMIT_MAX, type OutingRole } from '@/lib/org/team';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { dayWithWeekday } from '~/org/forms';
import { Card, Empty, GroupTitle, Primary, st } from '~/org/parts';

/**
 * 팀 일정 하나(앱 화면, 3단계 — docs/designs/sinker-team-lesson-contract.md 4절) — 참석 응답 · 실제 참석, 훈련 메뉴, 수행일지, 등판 계획.
 * 자료 · 쓰기는 app/actions/app-team.ts. 일정 자체를 고치는 것은 org/event(웹과 같은 폼).
 * 수행일지는 선수의 그날 운동 판에 코치 세트로 붙어 부하 · 달력에 든다(가입 · 트레이닝 공유를 켠 선수만). 메뉴는 계획일 뿐이라 부하에 안 든다.
 */
type Loaded = Awaited<ReturnType<typeof loadEventDetail>>;
type Res = { ok: boolean; error?: string };

export default function TeamEventScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; id: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-team.loadEventDetail', p.org ?? '', p.id ?? '');
  const [busy, setBusy] = useState(false);

  const send = async (done: string | ((r: Res & Record<string, unknown>) => string), action: string, ...args: unknown[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call<Res & Record<string, unknown>>(action, ...args);
      if (!r.ok) return toast(('error' in r && r.error) || '처리하지 못했어요.', 'error');
      const word = typeof done === 'string' ? done : done(r);
      if (word) toast(word);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={data?.event.title ?? '일정'} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Head d={data} org={p.org ?? ''} c={c} />
          <Attendance d={data} org={p.org ?? ''} send={send} busy={busy} c={c} />
          <Plans d={data} org={p.org ?? ''} c={c} />
          {data.event.date <= data.todayKey ? <Work d={data} org={p.org ?? ''} send={send} busy={busy} c={c} /> : null}
          {data.event.kind === 'game' ? <Outings d={data} org={p.org ?? ''} send={send} busy={busy} c={c} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

type Send = (done: string | ((r: Res & Record<string, unknown>) => string), action: string, ...args: unknown[]) => Promise<void>;
type Part = { d: EventDetail; org: string; c: Palette };

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

function Attendance({ d, org, send, busy, c }: Part & { send: Send; busy: boolean }) {
  const past = d.event.date <= d.todayKey;
  const none = d.members.length - d.counts.yes - d.counts.no - d.counts.maybe;
  const mark = (m: EventMemberView, v: boolean) =>
    void send('', 'app-team.setAttended', org, d.event.id, m.memberId, m.attended === v ? null : v);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="참석" c={c} />
      <Card c={c}>
        <Text style={[TYPE.body, { color: c.ink }]}>
          가요 {d.counts.yes} · 못 가요 {d.counts.no} · 아직 몰라요 {d.counts.maybe}
          {none > 0 ? ` · 답 안 함 ${none}` : ''}
        </Text>
        {past && d.members.length ? (
          <SmallLink label="모두 왔어요(못 간다는 선수 빼고)" onPress={() => void send((r) => `${r.count ?? 0}명을 참석으로 했어요`, 'app-team.markAllAttended', org, d.event.id)} disabled={busy} c={c} />
        ) : null}
        {d.members.length === 0 ? <Empty text="이 일정의 선수가 없어요." c={c} /> : null}
        {d.members.map((m, i) => (
          <View key={m.memberId} style={[st.row, i < d.members.length - 1 && line(c)]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
              <Text style={[TYPE.sub, { color: m.reply === 'no' ? c.warn : c.muted }]} numberOfLines={2}>
                {m.reply ? ATTEND_LABEL[m.reply] : '답 안 함'}
                {m.note ? ` · ${m.note}` : ''}
              </Text>
            </View>
            {past ? (
              <>
                <Toggle label="왔어요" on={m.attended === true} onPress={() => mark(m, true)} disabled={busy} c={c} />
                <Toggle label="안 왔어요" on={m.attended === false} onPress={() => mark(m, false)} disabled={busy} c={c} />
              </>
            ) : null}
          </View>
        ))}
      </Card>
    </View>
  );
}

function Plans({ d, org, c }: Part) {
  const open = (id?: string) => router.push(`/org/plan?org=${org}&event=${d.event.id}${id ? `&id=${id}` : ''}` as Href);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="훈련 메뉴" c={c} />
      {d.plans.map((pl) => (
        <Pressable key={pl.id} accessibilityRole="button" onPress={() => open(pl.id)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Card c={c}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{pl.title}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{pl.memberIds.length ? `${pl.targets.length}명` : '모두'} ›</Text>
            </View>
            {pl.lines.map((l, i) => (
              <Text key={i} style={[TYPE.sub, { color: c.muted }]} numberOfLines={1}>
                {l.name}
                {l.dose ? ` · ${l.dose}` : ''}
                {l.kind === 'drill' ? ' · 드릴' : ''}
              </Text>
            ))}
          </Card>
        </Pressable>
      ))}
      <Card c={c}>
        {d.plans.length === 0 ? <Empty text="메뉴는 계획이라 선수 기록에 안 들어가요. 끝난 뒤 수행일지로 남겨요." c={c} /> : null}
        <SmallLink label="+ 메뉴 만들기" onPress={() => open()} c={c} />
      </Card>
    </View>
  );
}

function Work({ d, org, send, busy, c }: Part & { send: Send; busy: boolean }) {
  const menu = (m: EventMemberView) =>
    Alert.alert(m.nickname, m.recordedSets ? `이 일정에 ${m.recordedSets}세트를 남겼어요.` : '아직 남긴 기록이 없어요.', [
      ...(d.plans.length ? [{ text: '메뉴대로 했어요', onPress: () => void send((r) => `${r.sets ?? 0}세트를 남겼어요`, 'app-team.recordWork', org, d.event.id, m.memberId, 'plan') }] : []),
      { text: '고쳐 적기', onPress: () => router.push(`/org/work?org=${org}&event=${d.event.id}&member=${m.memberId}` as Href) },
      ...(m.recordedSets ? [{ text: '기록 빼기', style: 'destructive' as const, onPress: () => void send('기록을 뺐어요', 'app-team.recordWork', org, d.event.id, m.memberId, 'clear') }] : []),
      { text: '닫기', style: 'cancel' as const },
    ]);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="수행일지" c={c} />
      <Card c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>남긴 기록은 선수의 그날 운동에 들어가 부하 · 달력에 셈해져요.</Text>
        {d.plans.length ? (
          <SmallLink
            label="참석한 선수 모두 메뉴대로"
            onPress={() => void send((r) => `${r.done ?? 0}명 남겼어요${r.skipped ? ` · ${r.skipped}명은 못 남김` : ''}`, 'app-team.recordAttendedAsPlan', org, d.event.id)}
            disabled={busy}
            c={c}
          />
        ) : null}
        {d.members.map((m, i) => (
          <Pressable
            key={m.memberId}
            accessibilityRole="button"
            disabled={!m.canTrain || busy}
            onPress={() => menu(m)}
            style={({ pressed }) => [st.row, i < d.members.length - 1 && line(c), pressed && { opacity: 0.6 }]}
          >
            <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{m.nickname}</Text>
            <Text style={[TYPE.sub, { color: m.recordedSets ? c.ok : c.muted }]}>
              {!m.hasUser ? '가입 전' : !m.canTrain ? '트레이닝 공유 꺼짐' : m.recordedSets ? `${m.recordedSets}세트 남김` : '기록 없음'}
            </Text>
            {m.canTrain ? <Text style={{ color: c.muted, fontSize: 17 }}>›</Text> : null}
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function Outings({ d, org, send, busy, c }: Part & { send: Send; busy: boolean }) {
  const drafts = d.members.filter((m) => m.outing?.status === 'draft').length;
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
        {d.members.map((m, i) => (
          <Pressable key={m.memberId} accessibilityRole="button" disabled={busy} onPress={() => pick(m)} style={({ pressed }) => [st.row, i < d.members.length - 1 && line(c), pressed && { opacity: 0.6 }]}>
            <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{m.nickname}</Text>
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

function SmallLink({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, on, onPress, disabled, c }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      disabled={disabled}
      style={[st.chip, { minHeight: 32, paddingHorizontal: 10, backgroundColor: on ? c.sky : c.page }]}
    >
      <Text style={{ color: on ? '#fff' : c.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

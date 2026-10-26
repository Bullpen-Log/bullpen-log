import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { loadInvite, loadOrgEvents, loadOrgMembers, loadOrgNotes, loadOrgToday, makeInvite, MySpace } from '@/app/actions/app-org';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { call, LoadState, useLoad } from '~/community/parts';
import { SITE_URL } from '~/lib/site';
import { toast } from '~/shell/toast';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { ChoiceChips, dayWithWeekday } from '~/org/forms';
import { EVENT_STATUS_LABEL } from '@/lib/org/lesson-pitch';
import { COMMENT_KIND_LABEL } from '@/lib/org/comments';
import type { loadInbox } from '@/app/actions/app-lesson';
import type { loadTeamTraining } from '@/app/actions/app-team';
import { openDugout, setSpaceTab, spaceNow } from '~/org/space-store';
import { withJosa } from '@/lib/korean';
import { WATCH_KINDS, WATCH_LABEL, type WatchKind } from '@/lib/org/watch';
import { orgRecordHref, spaceKeyOf } from '@/lib/org/space-nav';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, armLook, dayLabel, st } from '~/org/parts';

/**
 * 코치(대표 · 코치) 공간의 탭 화면 — S단계(docs/designs/sinker-team-lesson-contract.md 8-3): 팀 오늘 · 일정 · 훈련 · 선수단 · 더보기,
 * 레슨장 오늘 · 회원 · 레슨일지 · 받은 것 · 더보기. 아래 탭은 껍데기(app/index.tsx)가 lib/org/space-nav.ts 표로 그리고 여기는 본문만.
 * 예약 · 수강권 · 결제는 덕아웃 — 여기에 그 단추를 두지 않는다(결정 1). 긴 표 · 내보내기는 PC 웹 /manage.
 */

type Today = Awaited<ReturnType<typeof loadOrgToday>>;
type Members = Awaited<ReturnType<typeof loadOrgMembers>>;
type Invite = Awaited<ReturnType<typeof loadInvite>>;
type Made = Awaited<ReturnType<typeof makeInvite>>;
type Events = Awaited<ReturnType<typeof loadOrgEvents>>;

/** 탭 하나의 본문 — tab 은 lib/org/space-nav.ts spaceTabs 의 key */
export function CoachTab({ space, tab }: { space: MySpace; tab: string }) {
  const c = usePalette();
  switch (tab) {
    case 'schedule':
      return <ScheduleTab space={space} c={c} />;
    case 'training':
      return <TrainingTab space={space} c={c} />;
    case 'roster':
      return <MembersTab space={space} c={c} />;
    case 'notes':
      return <NotesTab space={space} c={c} />;
    case 'inbox':
      return <Inbox space={space} empty c={c} />;
    case 'more':
      return <MoreTab space={space} c={c} />;
    default:
      return <TodayTab space={space} c={c} />;
  }
}

const memberWord = (space: MySpace) => (space.kind === 'TEAM' ? '선수' : '회원');
const openMember = (space: MySpace, memberId: string) =>
  router.push(`/org/member/${memberId}?org=${space.orgId}` as Href);
/* 팀의 있는 일정은 참석 · 메뉴 · 수행 · 등판 화면(3단계, org/team-event), 레슨장 · 새 일정은 고치기 화면 */
const openEvent = (space: MySpace, date: string, id?: string) =>
  router.push(
    (id && space.kind === 'TEAM' ? `/org/team-event?org=${space.orgId}&id=${id}` : `/org/event?org=${space.orgId}&date=${date}${id ? `&id=${id}` : ''}`) as Href
  );

/** 작은 글 단추 줄(+ 일정 · 투구 기록 적기 …) */
function Actions({ items, c }: { items: { label: string; onPress: () => void }[]; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          accessibilityRole="button"
          onPress={it.onPress}
          style={({ pressed }) => [st.chip, { backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 코치 '오늘'(계약 9-4) — 위에서 아래로 오늘 일정 · 살필 선수 · 받은 것 · 빠른 일. 숫자는 눌러서 그 목록으로, 자료가 없으면 0 대신 그 칸을 안 그린다 */
function TodayTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Today>('app-org.loadOrgToday', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const team = space.kind === 'TEAM';
  /* 훈련 준비 = 가장 가까운 일정의 메뉴(오늘 일정 먼저, 없으면 다음 일정) */
  const prep = data.events.find((e) => e.status !== 'canceled') ?? (data.next ? { id: data.next.id } : null);
  return (
    <View style={{ gap: 16 }}>
      <TodayEvents space={space} data={data} c={c} />
      <Briefing space={space} data={data} c={c} />
      <Watch space={space} data={data} c={c} />
      {/* 레슨장은 '받은 것'이 따로 탭 — 팀은 오늘 화면 칸 그대로(계약 8-3) */}
      {team ? <Inbox space={space} c={c} /> : null}
      <Actions
        items={[
          { label: team ? '+ 일정' : '+ 활동', onPress: () => openEvent(space, data.todayKey) },
          ...(team && prep ? [{ label: '훈련 준비', onPress: () => openEvent(space, data.todayKey, prep.id) }] : []),
          ...(team ? [{ label: '투구 기록 적기', onPress: () => router.push(`/org/pitch?org=${space.orgId}` as Href) }] : []),
        ]}
        c={c}
      />
    </View>
  );
}

/** 오늘 일정 줄 — 시각 · 이름 · 응답(가요 · 못 가요 · 답 안 함) · 메뉴 · 끝났으면 수행일지. 없으면 한 줄 + 다음 일정 하나 */
function TodayEvents({ space, data, c }: { space: MySpace; data: Extract<Today, { ok: true }>; c: Palette }) {
  const team = space.kind === 'TEAM';
  const line = (e: Extract<Today, { ok: true }>['events'][number]) => {
    if (!team) return e.memberName ?? '';
    const answered = e.replies.yes + e.replies.no + e.replies.maybe;
    const silent = e.targets != null ? Math.max(0, e.targets - answered) : 0;
    const replies = [e.replies.yes ? `가요 ${e.replies.yes}` : '', e.replies.no ? `못 가요 ${e.replies.no}` : '', e.replies.maybe ? `몰라요 ${e.replies.maybe}` : '', silent ? `답 안 함 ${silent}` : '']
      .filter(Boolean)
      .join(' · ');
    const done = e.status === 'done' || !!e.recorded || !!e.attended;
    return [
      replies,
      e.plans ? `메뉴 ${e.plans}` : '메뉴 만들기',
      done ? `수행일지 ${e.recorded ?? 0}${e.attended ? ` / 참석 ${e.attended}` : ''}` : '',
      e.selfRecorded ? `선수 기록 ${e.selfRecorded}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={`오늘 · ${dayLabel(data.todayKey)}`} c={c} />
      <Card c={c} float style={{ paddingVertical: 4 }}>
        {data.events.length === 0 ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => openEvent(space, data.todayKey)} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
              <Text style={[TYPE.body, { color: c.muted, flex: 1 }]}>오늘 일정이 없어요</Text>
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{team ? '+ 일정' : '+ 활동'}</Text>
            </Pressable>
            {data.next ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openEvent(space, data.next!.date, data.next!.id)}
                style={({ pressed }) => [st.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.sub, { color: c.muted }]}>다음 일정</Text>
                  <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={2}>
                    {dayWithWeekday(data.next.date)} · {data.next.time ?? '종일'} · {data.next.title}
                  </Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          data.events.map((e, i) => {
            const sub = line(e);
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => openEvent(space, data.todayKey, e.id)}
                style={({ pressed }) => [st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[TYPE.numInline, { color: c.muted, width: 52 }]}>{e.time ?? '종일'}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.body, { color: e.status === 'canceled' ? c.muted : c.ink }]} numberOfLines={2}>
                    {e.title}
                  </Text>
                  {sub ? (
                    <Text style={[TYPE.sub, { color: team && !e.plans ? c.link : c.muted }]} numberOfLines={2}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
                <StatusWord status={e.status} c={c} />
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            );
          })
        )}
      </Card>
    </View>
  );
}

/**
 * 오늘 브리핑(계약 10-4 ③) — 확인 대기 · 답 안 한 일정. 있을 때만, 줄마다 원래 자리로. 원래 일을 처리하면 서버가 안 보내 저절로 빠진다(따로 치우기 없음).
 * 받은 것(질문 · 정정 · 숙제 영상)은 그 칸에 있어 여기 다시 안 넣는다.
 */
function Briefing({ space, data, c }: { space: MySpace; data: Extract<Today, { ok: true }>; c: Palette }) {
  const b = data.briefing;
  if (!b || (b.review.length === 0 && b.unanswered.length === 0)) return null;
  const row = (key: string, title: string, line: string, onPress: () => void, first: boolean) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [st.row, { minHeight: 48 }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{line}</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );
  return (
    <>
      {b.review.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title={`확인 대기 ${b.review.length}`} c={c} />
          <Card c={c} style={{ paddingVertical: 0 }}>
            {b.review.map((r, i) =>
              row(
                `${r.kind}:${r.id}`,
                r.kind === 'work' ? `${dayLabel(r.date)} · ${r.title}` : r.title,
                r.line,
                () =>
                  r.kind === 'work'
                    ? openEvent(space, r.date, r.id)
                    : router.push(orgRecordHref(space.orgId, 'c', { kind: 'homework', id: r.id, member: r.memberId ?? undefined }) as Href),
                i === 0
              )
            )}
          </Card>
        </View>
      ) : null}
      {b.unanswered.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="답 안 한 일정 · 7일 안" c={c} />
          <Card c={c} style={{ paddingVertical: 0 }}>
            {b.unanswered.map((e, i) => row(e.id, `${dayWithWeekday(e.date)} · ${e.time ?? '종일'} · ${e.title}`, `답 안 함 ${e.silent}명`, () => openEvent(space, e.date, e.id), i === 0))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

/* 오늘의 숫자 → 선수단 거르개(계약 9-4). 선수단 탭은 열 때마다 새로 그려지므로 다음 한 번만 읽는다 */
type RosterFilter = 'all' | 'attention' | 'insufficient' | 'hidden' | 'waiting';
let nextRosterFilter: RosterFilter | null = null;
const filterOfWatch = (k: WatchKind): RosterFilter => (k === 'pending' || k === 'unlinked' ? 'waiting' : k);
function openRoster(space: MySpace, f: RosterFilter) {
  nextRosterFilter = f;
  setSpaceTab(spaceKeyOf(space), 'roster');
}

/**
 * 살필 선수(계약 9-6 ①-1) — 주의 · 위험 / 정보 부족 / 투구 기록 비공개 / 공유 동의 대기 / 앱 연결 대기를 따로. 정보 부족을 '주의 · 위험 없음'으로 덮지 않는다.
 * 줄을 누르면 그 선수 카드. 살필 사람이 없을 때만 '없어요' 한 줄(선수가 없으면 초대 안내).
 */
function Watch({ space, data, c }: { space: MySpace; data: Extract<Today, { ok: true }>; c: Palette }) {
  const who = memberWord(space);
  /* 옛 서버(watch 없음)는 주의 · 위험만 */
  const watch = data.watch ?? data.alerts.map((a) => ({ kind: 'attention' as const, memberId: a.memberId, nickname: a.nickname, line: a.headline }));
  const groups = WATCH_KINDS.map((k) => ({ k, rows: watch.filter((w) => w.kind === k) })).filter((g) => g.rows.length);
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => openRoster(space, 'all')} hitSlop={4}>
        <GroupTitle title={`살필 ${who} · ${space.kind === 'TEAM' ? '선수단' : '회원'} ${data.counts.members}명 ›`} c={c} />
      </Pressable>
      <Card c={c}>
        {data.counts.members === 0 ? (
          <Empty text={`아직 ${withJosa(who, '이/가')} 없어요. 더보기의 초대 코드를 보내요.`} c={c} />
        ) : groups.length === 0 ? (
          <Empty text={`살필 ${withJosa(who, '이/가')} 없어요 — 모두 최근 기록이 있고 주의 · 위험 신호가 없어요.`} c={c} />
        ) : (
          groups.map((g, gi) => (
            <View key={g.k} style={gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 6 }}>
              <Pressable accessibilityRole="button" onPress={() => openRoster(space, filterOfWatch(g.k))} hitSlop={4} style={{ minHeight: 32, justifyContent: 'center' }}>
                <Text style={[TYPE.sub, { color: g.k === 'attention' ? c.warn : c.muted, fontWeight: '700' }]}>
                  {WATCH_LABEL[g.k]} {g.rows.length}명 ›
                </Text>
              </Pressable>
              {g.rows.map((w) => (
                <Pressable key={w.memberId} accessibilityRole="button" onPress={() => openMember(space, w.memberId)} style={({ pressed }) => [st.row, { minHeight: 44 }, pressed && { opacity: 0.6 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[TYPE.card, { color: c.ink }]}>{w.nickname}</Text>
                    {w.line ? (
                      <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={2}>
                        {w.line}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

/** 코치 '선수단' · '회원'(계약 9-4) — 위 거르개 칩(전체 · 살필 · 정보 부족 · 비공개 · 연결 대기, 있는 것만) + 줄(이름 · 태그 · 상태 한 단어) */
function MembersTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Members>('app-org.loadOrgMembers', space.orgId);
  const [filter, setFilter] = useState<RosterFilter>(() => {
    const f = nextRosterFilter ?? 'all';
    nextRosterFilter = null;
    return f;
  });
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const who = memberWord(space);
  const add = <Actions items={[{ label: `+ ${who} 등록`, onPress: () => router.push(`/org/member-edit?org=${space.orgId}` as Href) }]} c={c} />;
  if (data.members.length === 0)
    return (
      <View style={{ gap: 16 }}>
        <Card c={c}>
          <Empty text={`아직 ${withJosa(who, '이/가')} 없어요. 더보기의 초대 코드를 보내거나, 앱 연결 전에 먼저 등록해 일지를 남길 수 있어요.`} c={c} />
        </Card>
        {add}
      </View>
    );
  const kindOf = (m: (typeof data.members)[number]): RosterFilter | null => (m.watch ? filterOfWatch(m.watch) : null);
  const count = (f: RosterFilter) => data.members.filter((m) => kindOf(m) === f).length;
  const chips = (['attention', 'insufficient', 'hidden', 'waiting'] as const).filter((f) => count(f) > 0 || f === filter);
  const label: Record<RosterFilter, string> = { all: '전체', attention: '살필', insufficient: '정보 부족', hidden: '비공개', waiting: '연결 대기' };
  const shown = filter === 'all' ? data.members : data.members.filter((m) => kindOf(m) === filter);
  return (
    <View style={{ gap: 12 }}>
      {chips.length ? (
        <ChoiceChips
          options={[{ value: 'all' as RosterFilter, label: `전체 ${data.members.length}` }, ...chips.map((f) => ({ value: f as RosterFilter, label: `${label[f]} ${count(f)}` }))]}
          value={filter}
          onChange={setFilter}
          c={c}
        />
      ) : null}
      <Card c={c} style={{ paddingVertical: 4 }}>
        {shown.length === 0 ? (
          <Empty text={`해당하는 ${withJosa(who, '이/가')} 없어요.`} c={c} />
        ) : (
          shown.map((m, i) => {
            const status = !m.hasUser
              ? { word: '앱 연결 대기', color: c.muted }
              : m.consentPending
                ? { word: '공유 동의 대기', color: c.muted }
                : m.arm
                  ? armLook(m.arm, c)
                  : { word: '투구 기록 비공개', color: c.muted };
            return (
              <Pressable
                key={m.memberId}
                accessibilityRole="button"
                onPress={() => openMember(space, m.memberId)}
                style={({ pressed }) => [st.row, i < shown.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
                  {m.tags.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{m.tags.join(' · ')}</Text> : null}
                </View>
                <Text style={[TYPE.sub, { color: status.color, fontWeight: '600' }]}>{status.word}</Text>
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            );
          })
        )}
      </Card>
      {add}
    </View>
  );
}

/**
 * 코치 '일정'(계약 9-4) — 위 한 주 띠(일곱 칸 · 일정 있는 날 점) + 밑 그 주 일정 목록(날짜 머리 + 줄, 빈 날은 안 그림). '+ 일정' 하나 — 날짜는 띠에서 고른 날.
 * 팀은 일정을 누르면 참석 · 메뉴 · 수행 · 등판, 레슨장은 고치기(더보기 '예정 활동' 화면도 이것).
 */
export function ScheduleTab({ space, c }: { space: MySpace; c: Palette }) {
  const todayKey = toDateKey(new Date());
  const [from, setFrom] = useState(() => mondayOf(todayKey));
  const [picked, setPicked] = useState(todayKey);
  const { data, error, reload } = useLoad<Events>('app-org.loadOrgEvents', space.orgId, from, 7);
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(from, i));
  const thisWeek = mondayOf(data?.todayKey ?? todayKey);
  const day = days.includes(picked) ? picked : days[0];
  const move = (n: number) => {
    setFrom(shiftDateKey(from, n));
    setPicked(shiftDateKey(day, n));
  };
  const withEvents = data ? days.filter((d) => data.events.some((e) => e.date === d)) : [];
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.weekNav}>
        <Pressable accessibilityRole="button" accessibilityLabel="지난 주" onPress={() => move(-7)} hitSlop={8} style={styles.weekBtn}>
          <Icon name="chevron-left" size={22} color={c.sky} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFrom(thisWeek);
            setPicked(data?.todayKey ?? todayKey);
          }}
          style={{ flex: 1, alignItems: 'center' }}
        >
          <Text style={[TYPE.card, { color: c.ink }]}>
            {dayLabel(days[0])} – {dayLabel(days[6])}
          </Text>
          {from !== thisWeek ? <Text style={[TYPE.sub, { color: c.sky }]}>이번 주로</Text> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => move(7)} hitSlop={8} style={styles.weekBtn}>
          <Icon name="chevron-right" size={22} color={c.sky} />
        </Pressable>
      </View>
      {/* 한 주 띠 — 고른 날은 파란 원, 오늘은 파란 글자, 일정 있는 날은 밑에 점 */}
      <View style={styles.strip}>
        {days.map((d) => {
          const on = d === day;
          const today = d === (data?.todayKey ?? todayKey);
          const has = withEvents.includes(d);
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${dayWithWeekday(d)}${has ? ', 일정 있음' : ''}`}
              onPress={() => setPicked(d)}
              style={styles.stripDay}
            >
              <Text style={[TYPE.sub, { color: c.muted, fontSize: 12 }]}>{WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</Text>
              <View style={[styles.stripNum, on && { backgroundColor: c.sky }]}>
                <Text style={[TYPE.numInline, { color: on ? '#fff' : today ? c.sky : c.ink, fontWeight: on || today ? '700' : '500' }]}>{Number(d.slice(8))}</Text>
              </View>
              <View style={[styles.dot, { width: 5, height: 5, backgroundColor: has ? c.sky : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <Card c={c} style={{ paddingVertical: 4 }}>
          {withEvents.length === 0 ? (
            <Empty text="이 주에 잡힌 일정이 없어요." c={c} />
          ) : (
            withEvents.map((d, di) => (
              <View key={d} style={di > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, marginTop: 4 }}>
                <Text style={[TYPE.sub, { color: d === data.todayKey ? c.sky : c.muted, fontWeight: '700', paddingTop: 10 }]}>
                  {dayWithWeekday(d)}
                  {d === data.todayKey ? ' · 오늘' : ''}
                </Text>
                {data.events
                  .filter((e) => e.date === d)
                  .map((e) => (
                    <Pressable key={e.id} accessibilityRole="button" onPress={() => openEvent(space, d, e.id)} style={({ pressed }) => [st.row, { minHeight: 44, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
                      <Text style={[TYPE.numInline, { color: c.muted, width: 52 }]}>{e.time ?? '종일'}</Text>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[TYPE.body, { color: e.status === 'canceled' ? c.muted : c.ink }]} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Text style={[TYPE.sub, { color: c.muted }]}>{EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}</Text>
                      </View>
                      <StatusWord status={e.status} c={c} />
                      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                    </Pressable>
                  ))}
              </View>
            ))
          )}
        </Card>
      )}
      <Actions
        items={[
          { label: `+ ${dayLabel(day)} ${space.kind === 'TEAM' ? '일정' : '활동'}`, onPress: () => openEvent(space, day) },
          ...(withEvents.length ? [{ label: '이 주를 다음 주로 복사', onPress: () => copyWeekAsk(space, from, () => move(7)) }] : []),
        ]}
        c={c}
      />
    </View>
  );
}

/** 한 주 복사(계약 10-4 ②) — 일정 · 메뉴만 옮기고 참석 · 등판 · 수행은 안 옮긴다. 같은 일정이 이미 있으면 건너뜀 */
function copyWeekAsk(space: MySpace, from: string, after: () => void) {
  const to = shiftDateKey(from, 7);
  Alert.alert('이 주를 다음 주로 복사할까요?', `${dayLabel(from)} 주의 일정과 메뉴를 ${dayLabel(to)} 주 같은 요일로 옮겨요. 참석 · 등판 · 수행은 안 옮겨요.`, [
    { text: '취소', style: 'cancel' },
    {
      text: '복사',
      onPress: async () => {
        const r = await call<{ ok: true; events: number; skipped: number }>('app-team.copyWeek', space.orgId, from, to);
        if (!r.ok) return toast(('error' in r && r.error) || '복사하지 못했어요.', 'error');
        toast(`일정 ${r.events}개를 복사했어요${r.skipped ? ` · ${r.skipped}개는 이미 있어 건너뜀` : ''}`);
        after();
      },
    },
  ]);
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 그 주 월요일 */
function mondayOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return shiftDateKey(key, wd === 0 ? -6 : 1 - wd);
}

function MoreTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Invite>('app-org.loadInvite', space.orgId);
  const [busy, setBusy] = useState<'PLAYER' | 'STAFF' | null>(null);
  const make = async (role: 'PLAYER' | 'STAFF') => {
    setBusy(role);
    const r = await call<Made>('app-org.makeInvite', space.orgId, role);
    setBusy(null);
    if (!r.ok) return toast(r.error, 'error');
    await reload();
  };
  const who = memberWord(space);
  const share = (code: string, role: 'PLAYER' | 'STAFF') =>
    void Share.share({
      message:
        role === 'STAFF'
          ? `${space.name} 코치 초대 코드 ${code} — 싱커 가입에서 ${withJosa(KIND_WORD[space.kind], '을/를')} 고르고 '코치로 들어가나요?'에 넣어 주세요. 한 번만 쓸 수 있어요.`
          : `${space.name} 초대 코드 ${code} — 싱커 더보기 › 소속 관리 › 코드로 들어가기에 넣어 주세요.`,
    });
  return (
    <View style={{ gap: 16 }}>
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <>
          <InviteCard
            title={`${who} 초대 코드`}
            note={(until) => `${dayLabel(until)}까지 여러 ${withJosa(who, '이/가')} 같이 써요.`}
            invite={data.player}
            busy={busy === 'PLAYER'}
            onMake={() => void make('PLAYER')}
            onShare={(code) => share(code, 'PLAYER')}
            c={c}
          />
          {data.canInviteCoach && data.staff ? (
            <InviteCard
              title="코치 초대 코드"
              note={(until) => `한 사람이 한 번 써요 · ${dayLabel(until)}까지. 코치는 싱커 가입에서 이 코드를 넣어요.`}
              invite={data.staff}
              busy={busy === 'STAFF'}
              onMake={() => void make('STAFF')}
              onShare={(code) => share(code, 'STAFF')}
              c={c}
            />
          ) : null}
        </>
      )}
      {/* 묶음 하나 = 카드 하나(계약 9-3) — 줄마다 카드를 세우지 않는다 */}
      <Card c={c} style={{ paddingVertical: 0 }}>
        <MoreRow title="공지" sub={`${who}에게 알릴 것을 써요. ${who} 화면에 보여요.`} onPress={() => router.push(`/org/notices?org=${space.orgId}` as Href)} c={c} />
        {space.kind === 'LESSON' ? (
          <MoreRow title="예정 활동" sub="덕아웃 예약 없이 잡은 레슨 시간 · 지도 확인" onPress={() => router.push(`/org/schedule?org=${space.orgId}` as Href)} c={c} />
        ) : null}
        {data?.canInviteCoach && !data.staff ? (
          <MoreRow title={busy === 'STAFF' ? '만드는 중…' : '코치 초대 코드 만들기'} sub="함께 볼 코치에게 보내는 한 번짜리 코드" onPress={() => void make('STAFF')} c={c} />
        ) : null}
        <MoreRow title="덕아웃 열기" sub="레슨 예약 · 수강권 · 결제는 덕아웃에서 해요" onPress={openDugout} last c={c} />
      </Card>
      <View style={{ gap: 6 }}>
        <GroupTitle title="PC 에서 관리" c={c} />
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {space.kind === 'TEAM' ? '팀 설정 · 긴 표 · 내보내기는 PC 웹에서 해요.' : '레슨장 설정 · 보호자 리포트 · 긴 표는 PC 웹에서 해요. 예약 · 수강권은 덕아웃이에요.'}
          </Text>
          <Text selectable style={[TYPE.sub, { color: c.muted }]}>
            {SITE_URL.replace(/^https?:\/\//, '')}/manage
          </Text>
        </Card>
      </View>
      <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>설정</Text>
        </Pressable>
        {/* 마스터 계정은 내 싱커 더보기가 없어 계정이 여기 하나 */}
        {spaceNow().hasSinker ? null : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/account' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>계정 · 로그아웃</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function InviteCard({
  title,
  note,
  invite,
  busy,
  onMake,
  onShare,
  c,
}: {
  title: string;
  note: (until: string) => string;
  invite: { code: string; until: string } | null;
  busy: boolean;
  onMake: () => void;
  onShare: (code: string) => void;
  c: Palette;
}) {
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={title} c={c} />
      <Card c={c}>
        {invite ? (
          <>
            <Text selectable style={[TYPE.num, { fontSize: 32, color: c.ink, letterSpacing: 4 }]}>
              {invite.code}
            </Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{note(invite.until)}</Text>
            <Primary label="코드 보내기" onPress={() => onShare(invite.code)} c={c} />
          </>
        ) : (
          <Empty text="쓸 수 있는 코드가 없어요." c={c} />
        )}
        <Pressable accessibilityRole="button" onPress={onMake} disabled={busy} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600', opacity: busy ? 0.5 : 1 }]}>
            {busy ? '만드는 중…' : invite ? '새 코드 만들기' : '코드 만들기'}
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}

/** 받은 것(2단계) — 회원이 일지 · 숙제에 남긴 질문 · 정정 요청 가운데 안 푼 것. 누르면 회원 카드, 답 없이 처리했으면 '풀었어요' */
function Inbox({ space, empty = false, c }: { space: MySpace; empty?: boolean; c: Palette }) {
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadInbox>>>('app-lesson.loadInbox', space.orgId);
  const resolve = async (id: string) => {
    const r = await call<{ ok: boolean; error?: string }>('app-lesson.resolveComment', space.orgId, id);
    if (!r.ok) return toast(('error' in r && r.error) || '처리하지 못했어요.', 'error');
    void reload();
  };
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  if (data.items.length === 0)
    return empty ? (
      <Card c={c}>
        <Empty text="받은 질문 · 정정 요청 · 숙제 영상이 없어요." c={c} />
      </Card>
    ) : null;
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={`받은 것 ${data.items.length}`} c={c} />
      <Card c={c}>
        {data.items.map((m) => (
          <View key={m.id} style={{ gap: 4, paddingVertical: 4 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => (m.rec ? router.push(orgRecordHref(space.orgId, 'c', m.rec) as Href) : openMember(space, m.memberId))}
              style={({ pressed }) => [{ gap: 2 }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[TYPE.sub, { color: m.kind === 'fix' ? c.warn : c.link, fontWeight: '600' }]}>
                {m.nickname} · {COMMENT_KIND_LABEL[m.kind]} · {m.where}
              </Text>
              <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={3}>
                {m.body}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void resolve(m.id)} hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
              <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>풀었어요</Text>
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** 팀 코치 '훈련'(S단계) — 지난 2주 · 다가오는 2주 훈련 · 경기의 메뉴와 수행일지. 누르면 일정 하나(참석 · 메뉴 · 수행 · 등판) */
function TrainingTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadTeamTraining>>>('app-team.loadTeamTraining', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const coming = data.rows.filter((r) => r.date >= data.todayKey);
  const past = data.rows.filter((r) => r.date < data.todayKey).reverse();
  const open = (id: string) => router.push(`/org/team-event?org=${space.orgId}&id=${id}` as Href);
  const list = (rows: typeof data.rows, done: boolean) =>
    rows.length === 0 ? (
      <Empty text={done ? '지난 2주에 훈련 · 경기가 없어요.' : "2주 안에 잡힌 훈련 · 경기가 없어요. '일정'에서 더해요."} c={c} />
    ) : (
      rows.map((r, i) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => open(r.id)}
          style={({ pressed }) => [st.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.card, { color: c.ink }]} numberOfLines={1}>
              {dayWithWeekday(r.date)} · {r.title}
            </Text>
            {/* 메뉴가 없으면 경고색 대신 할 일로(계약 9-4) — 누르면 일정 하나의 메뉴 칸 */}
            <Text style={[TYPE.sub, { color: r.plans.length ? c.muted : c.link }]} numberOfLines={1}>
              {r.plans.length ? `메뉴 ${r.plans.join(' · ')}` : '메뉴 만들기'}
              {done ? ` · 수행일지 ${r.recorded}명 · 참석 ${r.attended}명` : ''}
            </Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
        </Pressable>
      ))
    );
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <GroupTitle title="다가오는 훈련 · 경기" c={c} />
        <Card c={c} style={{ paddingVertical: 4 }}>
          {list(coming, false)}
        </Card>
      </View>
      <View style={{ gap: 6 }}>
        <GroupTitle title="지난 2주" c={c} />
        <Card c={c} style={{ paddingVertical: 4 }}>
          {list(past, true)}
        </Card>
      </View>
    </View>
  );
}

/** 레슨장 코치 '레슨일지'(S단계) — 조직 전체 일지 최신순. 누르면 그 일지 하나(말 · 영상), 쓰기는 '+ 일지' · 회원 카드에서 */
function NotesTab({ space, c }: { space: MySpace; c: Palette }) {
  const [before, setBefore] = useState<string | null>(null);
  const [older, setOlder] = useState<Awaited<ReturnType<typeof loadOrgNotes>> extends infer R ? (R extends { ok: true; notes: infer N } ? N : never) : never>([]);
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadOrgNotes>>>('app-org.loadOrgNotes', space.orgId, before);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const notes = before ? [...older, ...data.notes.filter((n) => !older.some((o) => o.id === n.id))] : data.notes;
  const more = () => {
    setOlder(notes);
    setBefore(notes[notes.length - 1]?.key ?? null);
  };
  return (
    <View style={{ gap: 16 }}>
      <Actions items={[{ label: '+ 일지', onPress: () => router.push(`/org/note?org=${space.orgId}` as Href) }]} c={c} />
      {/* 묶음 하나 = 카드 하나(계약 9-3). 줄을 누르면 그 일지 하나(말 · 영상 — 계약 9-6 ①-3) */}
      <Card c={c} style={{ paddingVertical: 4 }}>
        {notes.length === 0 ? (
          <Empty text="아직 남긴 레슨일지가 없어요. '+ 일지'나 회원 카드에서 써요." c={c} />
        ) : (
          notes.map((n, i) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => router.push(orgRecordHref(space.orgId, 'c', { kind: 'note', id: n.id, member: n.memberId }) as Href)}
              style={({ pressed }) => [{ paddingVertical: 10, gap: 2 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {dayLabel(n.key)} · {n.nickname}
                {n.author ? ` · ${n.author}` : ''}
                {n.pitchCount ? ` · ${n.pitchCount}구` : ''}
              </Text>
              <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={3}>
                {n.body}
              </Text>
              {n.videos.length || n.talk.total ? (
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  {n.videos.length ? `영상 ${n.videos.length}` : ''}
                  {n.videos.length && n.talk.total ? ' · ' : ''}
                  {n.talk.total ? `말 ${n.talk.total}` : ''}
                </Text>
              ) : null}
            </Pressable>
          ))
        )}
      </Card>
      {data.notes.length >= 40 ? (
        <Pressable accessibilityRole="button" onPress={more} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>더 보기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MoreRow({ title, sub, onPress, last = false, c }: { title: string; sub: string; onPress: () => void; last?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.card, { color: c.ink }]}>{title}</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{sub}</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );
}

/** 지도 확인 — 예정은 안 적고 실시 · 취소만 */
function StatusWord({ status, c }: { status: string; c: Palette }) {
  if (status !== 'done' && status !== 'canceled') return null;
  return <Text style={[TYPE.sub, { color: status === 'done' ? c.ok : c.muted, fontWeight: '600' }]}>{EVENT_STATUS_LABEL[status]}</Text>;
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  stripDay: { flex: 1, alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center' },
  stripNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  weekNav: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  weekBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

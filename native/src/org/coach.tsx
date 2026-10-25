import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { loadInvite, loadOrgEvents, loadOrgMembers, loadOrgToday, makeInvite, MySpace } from '@/app/actions/app-org';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { call, LoadState, useLoad } from '~/community/parts';
import { SITE_URL } from '~/lib/site';
import { Segmented } from '~/shell/heading';
import { toast } from '~/shell/toast';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { dayWithWeekday } from '~/org/forms';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, armLook, dayLabel, st } from '~/org/parts';

/**
 * 코치(대표 · 코치) 공간 — 1단계 탭 셋: 오늘 · 회원 · 더보기(docs/designs/sinker-team-lesson-contract.md 2-2). 일지 · 받은 것은 2단계에 붙는다.
 * 긴 표 · 수강권 · 내보내기는 PC 웹 /manage 에 둔다.
 */
type Tab = 'today' | 'schedule' | 'members' | 'more';
const TABS = [
  { value: 'today', label: '오늘' },
  { value: 'schedule', label: '일정' },
  { value: 'members', label: '회원' },
  { value: 'more', label: '더보기' },
] as const;

type Today = Awaited<ReturnType<typeof loadOrgToday>>;
type Members = Awaited<ReturnType<typeof loadOrgMembers>>;
type Invite = Awaited<ReturnType<typeof loadInvite>>;
type Made = Awaited<ReturnType<typeof makeInvite>>;
type Events = Awaited<ReturnType<typeof loadOrgEvents>>;

export function CoachSpace({ space }: { space: MySpace }) {
  const c = usePalette();
  const [tab, setTab] = useState<Tab>('today');
  return (
    <View style={{ gap: 16 }}>
      <Segmented label="코치 탭" options={TABS} value={tab} onChange={setTab} />
      {tab === 'today' ? (
        <TodayTab space={space} c={c} />
      ) : tab === 'schedule' ? (
        <ScheduleTab space={space} c={c} />
      ) : tab === 'members' ? (
        <MembersTab space={space} c={c} />
      ) : (
        <MoreTab space={space} c={c} />
      )}
    </View>
  );
}

const memberWord = (space: MySpace) => (space.kind === 'TEAM' ? '선수' : '회원');
const openMember = (space: MySpace, memberId: string) =>
  router.push(`/org/member/${memberId}?org=${space.orgId}` as Href);
const openEvent = (space: MySpace, date: string, id?: string) =>
  router.push(`/org/event?org=${space.orgId}&date=${date}${id ? `&id=${id}` : ''}` as Href);

/** 작은 글 단추 줄(+ 일정 · 투구 기록 적기 …) */
function Actions({ items, c }: { items: { label: string; onPress: () => void }[]; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          accessibilityRole="button"
          onPress={it.onPress}
          style={({ pressed }) => [st.chip, { backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TodayTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Today>('app-org.loadOrgToday', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const who = memberWord(space);
  return (
    <View style={{ gap: 16 }}>
      <Actions
        items={[
          { label: '+ 일정', onPress: () => openEvent(space, data.todayKey) },
          ...(space.kind === 'TEAM' ? [{ label: '투구 기록 적기', onPress: () => router.push(`/org/pitch?org=${space.orgId}` as Href) }] : []),
        ]}
        c={c}
      />
      <View style={{ gap: 6 }}>
        <GroupTitle title={`오늘 · ${dayLabel(data.todayKey)}`} c={c} />
        <Card c={c}>
          {data.events.length === 0 ? (
            <Empty text="오늘 일정이 없어요." c={c} />
          ) : (
            data.events.map((e) => (
              <Pressable key={e.id} accessibilityRole="button" onPress={() => openEvent(space, data.todayKey, e.id)} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
                <Text style={[TYPE.numInline, { color: c.muted, width: 52 }]}>{e.time ?? '종일'}</Text>
                <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                  {e.title}
                </Text>
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            ))
          )}
        </Card>
      </View>

      <View style={{ gap: 6 }}>
        <GroupTitle title={who} c={c} />
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {who} {data.counts.members}명
            {data.counts.pending ? ` · 공유 대기 ${data.counts.pending}` : ''}
            {data.counts.placeholders ? ` · 가입 전 ${data.counts.placeholders}` : ''}
          </Text>
          {data.counts.pending ? (
            <Text style={[TYPE.sub, { color: c.muted }]}>공유 대기 {who}은 싱커에서 보여 줄 기록을 고르기 전이라 기록이 안 보여요.</Text>
          ) : null}
        </Card>
      </View>

      <View style={{ gap: 6 }}>
        <GroupTitle title="팔 상태 살필 사람" c={c} />
        <Card c={c}>
          {data.alerts.length === 0 ? (
            <Empty text={`주의 · 위험인 ${who}이 없어요.`} c={c} />
          ) : (
            data.alerts.map((a) => {
              const look = armLook(a, c);
              return (
                <Pressable key={a.memberId} accessibilityRole="button" onPress={() => openMember(space, a.memberId)} style={st.row}>
                  <View style={[styles.dot, { backgroundColor: look.color }]} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[TYPE.card, { color: c.ink }]}>
                      {a.nickname} <Text style={{ color: look.color }}>{look.word}</Text>
                    </Text>
                    <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={2}>
                      {a.headline}
                    </Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              );
            })
          )}
        </Card>
      </View>
    </View>
  );
}

function MembersTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Members>('app-org.loadOrgMembers', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const add = <Actions items={[{ label: '+ 가입 전 자리', onPress: () => router.push(`/org/member-edit?org=${space.orgId}` as Href) }]} c={c} />;
  if (data.members.length === 0)
    return (
      <View style={{ gap: 16 }}>
        {add}
        <Card c={c}>
          <Empty text={`아직 ${memberWord(space)}이 없어요. 더보기의 초대 코드를 보내거나, 가입 전 자리를 먼저 만들어 일지를 남길 수 있어요.`} c={c} />
        </Card>
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
    {add}
    <Card c={c} style={{ paddingVertical: 4 }}>
      {data.members.map((m, i) => {
        const status = !m.hasUser
          ? { word: '가입 전', color: c.muted }
          : m.consentPending
            ? { word: '공유 대기', color: c.muted }
            : m.arm
              ? armLook(m.arm, c)
              : { word: '투구 비공유', color: c.muted };
        return (
          <Pressable
            key={m.memberId}
            accessibilityRole="button"
            onPress={() => openMember(space, m.memberId)}
            style={({ pressed }) => [
              st.row,
              i < data.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
              {m.tags.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{m.tags.join(' · ')}</Text> : null}
            </View>
            <Text style={[TYPE.sub, { color: status.color, fontWeight: '600' }]}>{status.word}</Text>
            <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
          </Pressable>
        );
      })}
    </Card>
    </View>
  );
}

/** 코치 '일정' — 한 주씩(월 ~ 일). 일정을 누르면 고치기, 날마다 + 로 더하기 */
function ScheduleTab({ space, c }: { space: MySpace; c: Palette }) {
  const [from, setFrom] = useState(() => mondayOf(toDateKey(new Date())));
  const { data, error, reload } = useLoad<Events>('app-org.loadOrgEvents', space.orgId, from, 7);
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(from, i));
  const thisWeek = mondayOf(data?.todayKey ?? toDateKey(new Date()));
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.weekNav}>
        <Pressable accessibilityRole="button" accessibilityLabel="지난 주" onPress={() => setFrom(shiftDateKey(from, -7))} hitSlop={8} style={styles.weekBtn}>
          <Icon name="chevron-left" size={22} color={c.sky} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setFrom(thisWeek)} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[TYPE.card, { color: c.ink }]}>
            {dayLabel(days[0])} – {dayLabel(days[6])}
          </Text>
          {from !== thisWeek ? <Text style={[TYPE.sub, { color: c.sky }]}>이번 주로</Text> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => setFrom(shiftDateKey(from, 7))} hitSlop={8} style={styles.weekBtn}>
          <Icon name="chevron-right" size={22} color={c.sky} />
        </Pressable>
      </View>
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        days.map((d) => {
          const list = data.events.filter((e) => e.date === d);
          const today = d === data.todayKey;
          return (
            <Card key={d} c={c} style={{ paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[TYPE.card, { color: today ? c.sky : c.ink, flex: 1 }]}>
                  {dayWithWeekday(d)}
                  {today ? ' · 오늘' : ''}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${dayWithWeekday(d)} 일정 더하기`} onPress={() => openEvent(space, d)} hitSlop={8} style={styles.weekBtn}>
                  <Icon name="plus" size={20} color={c.sky} />
                </Pressable>
              </View>
              {list.map((e) => (
                <Pressable key={e.id} accessibilityRole="button" onPress={() => openEvent(space, d, e.id)} style={({ pressed }) => [st.row, { minHeight: 44, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
                  <Text style={[TYPE.numInline, { color: c.muted, width: 52 }]}>{e.time ?? '종일'}</Text>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={[TYPE.sub, { color: c.muted }]}>{EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}</Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              ))}
            </Card>
          );
        })
      )}
    </View>
  );
}

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
          ? `${space.name} 코치 초대 코드 ${code} — 싱커 가입에서 ${KIND_WORD[space.kind]}을 고르고 '코치로 들어가나요?'에 넣어 주세요. 한 번만 쓸 수 있어요.`
          : `${space.name} 초대 코드 ${code} — 싱커 더보기 › 팀 · 레슨장 › 코드 넣기에 넣어 주세요.`,
    });
  return (
    <View style={{ gap: 16 }}>
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <>
          <InviteCard
            title={`${who} 초대 코드`}
            note={(until) => `${dayLabel(until)}까지 여러 ${who}이 같이 써요.`}
            invite={data.player}
            busy={busy === 'PLAYER'}
            onMake={() => void make('PLAYER')}
            onShare={(code) => share(code, 'PLAYER')}
            c={c}
          />
          {data.canInviteCoach ? (
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
      <Pressable accessibilityRole="button" onPress={() => router.push(`/org/notices?org=${space.orgId}` as Href)}>
        <Card c={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.card, { color: c.ink }]}>공지</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{who}에게 알릴 것을 써요. {who} 화면에 보여요.</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
        </Card>
      </Pressable>
      <View style={{ gap: 6 }}>
        <GroupTitle title="PC 에서 관리" c={c} />
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {KIND_WORD[space.kind]} 설정 · 수강권 · 보호자 리포트 · 긴 표는 PC 웹에서 해요.
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
        <Pressable accessibilityRole="button" onPress={() => router.push('/account' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>계정 · 로그아웃</Text>
        </Pressable>
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

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  weekNav: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  weekBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

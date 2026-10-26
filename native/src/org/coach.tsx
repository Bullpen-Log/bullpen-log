import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { loadInvite, loadOrgEvents, loadOrgMembers, loadOrgNotes, loadOrgToday, makeInvite, MySpace } from '@/app/actions/app-org';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { call, LoadState, useLoad } from '~/community/parts';
import { SITE_URL } from '~/lib/site';
import { toast } from '~/shell/toast';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { dayWithWeekday } from '~/org/forms';
import { EVENT_STATUS_LABEL } from '@/lib/org/lesson-pitch';
import { COMMENT_KIND_LABEL } from '@/lib/org/comments';
import type { loadInbox } from '@/app/actions/app-lesson';
import type { loadTeamTraining } from '@/app/actions/app-team';
import { openDugout, spaceNow } from '~/org/space-store';
import { withJosa } from '@/lib/korean';
import { WATCH_KINDS, WATCH_LABEL } from '@/lib/org/watch';
import { orgRecordHref } from '@/lib/org/space-nav';
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
  return (
    <View style={{ gap: 16 }}>
      <Actions
        items={[
          { label: space.kind === 'TEAM' ? '+ 일정' : '+ 활동', onPress: () => openEvent(space, data.todayKey) },
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
                <Text style={[TYPE.body, { color: e.status === 'canceled' ? c.muted : c.ink, flex: 1 }]} numberOfLines={2}>
                  {e.title}
                </Text>
                {space.kind === 'TEAM' && e.replies.yes + e.replies.no + e.replies.maybe > 0 ? (
                  <Text style={[TYPE.sub, { color: c.muted }]}>
                    가요 {e.replies.yes}
                    {e.replies.no ? ` · 못 가요 ${e.replies.no}` : ''}
                  </Text>
                ) : null}
                <StatusWord status={e.status} c={c} />
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Pressable>
            ))
          )}
        </Card>
      </View>

      {/* 레슨장은 '받은 것'이 따로 탭 — 팀은 오늘 화면 칸 그대로(계약 8-3) */}
      {space.kind === 'TEAM' ? <Inbox space={space} c={c} /> : null}

      <Watch space={space} data={data} c={c} />
    </View>
  );
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
      <GroupTitle title={`살필 ${who} · ${space.kind === 'TEAM' ? '선수단' : '회원'} ${data.counts.members}명`} c={c} />
      <Card c={c}>
        {data.counts.members === 0 ? (
          <Empty text={`아직 ${withJosa(who, '이/가')} 없어요. 더보기의 초대 코드를 보내요.`} c={c} />
        ) : groups.length === 0 ? (
          <Empty text={`살필 ${withJosa(who, '이/가')} 없어요 — 모두 최근 기록이 있고 주의 · 위험 신호가 없어요.`} c={c} />
        ) : (
          groups.map((g, gi) => (
            <View key={g.k} style={gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 6 }}>
              <Text style={[TYPE.sub, { color: g.k === 'attention' ? c.warn : c.muted, fontWeight: '700' }]}>
                {WATCH_LABEL[g.k]} {g.rows.length}명
              </Text>
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

function MembersTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Members>('app-org.loadOrgMembers', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const add = <Actions items={[{ label: `+ ${memberWord(space)} 등록`, onPress: () => router.push(`/org/member-edit?org=${space.orgId}` as Href) }]} c={c} />;
  if (data.members.length === 0)
    return (
      <View style={{ gap: 16 }}>
        {add}
        <Card c={c}>
          <Empty text={`아직 ${withJosa(memberWord(space), '이/가')} 없어요. 더보기의 초대 코드를 보내거나, 앱 연결 전에 먼저 등록해 일지를 남길 수 있어요.`} c={c} />
        </Card>
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
    {add}
    <Card c={c} style={{ paddingVertical: 4 }}>
      {data.members.map((m, i) => {
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

/** 코치 '일정' — 한 주씩(월 ~ 일). 팀은 일정을 누르면 참석 · 메뉴 · 수행 · 등판, 레슨장은 고치기(더보기 '예정 활동' 화면도 이것). 날마다 + 로 더하기 */
export function ScheduleTab({ space, c }: { space: MySpace; c: Palette }) {
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
                    <Text style={[TYPE.body, { color: e.status === 'canceled' ? c.muted : c.ink }]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={[TYPE.sub, { color: c.muted }]}>{EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}</Text>
                  </View>
                  <StatusWord status={e.status} c={c} />
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
      {space.kind === 'LESSON' ? (
        <MoreRow title="예정 활동" sub="덕아웃 예약 없이 잡은 레슨 시간 · 지도 확인" onPress={() => router.push(`/org/schedule?org=${space.orgId}` as Href)} c={c} />
      ) : null}
      <MoreRow title="덕아웃 열기" sub="레슨 예약 · 수강권 · 결제는 덕아웃에서 해요" onPress={openDugout} c={c} />
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
            <Text style={[TYPE.sub, { color: r.plans.length ? c.muted : c.warn }]} numberOfLines={1}>
              {r.plans.length ? `메뉴 ${r.plans.join(' · ')}` : '메뉴 없음'}
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

/** 레슨장 코치 '레슨일지'(S단계) — 조직 전체 일지 최신순. 누르면 그 회원 카드(일지 · 말 · 영상), 쓰기는 회원 카드에서 */
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
      {notes.length === 0 ? (
        <Card c={c}>
          <Empty text="아직 남긴 레슨일지가 없어요. '+ 일지'나 회원 카드에서 써요." c={c} />
        </Card>
      ) : (
        notes.map((n) => (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => openMember(space, n.memberId)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Card c={c}>
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
            </Card>
          </Pressable>
        ))
      )}
      {data.notes.length >= 40 ? (
        <Pressable accessibilityRole="button" onPress={more} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>더 보기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MoreRow({ title, sub, onPress, c }: { title: string; sub: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card c={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[TYPE.card, { color: c.ink }]}>{title}</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>{sub}</Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
      </Card>
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
  weekNav: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  weekBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

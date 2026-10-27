import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { loadMyMembership, MySpace } from '@/app/actions/app-org';
import type { loadMyHomework } from '@/app/actions/app-lesson';
import type { loadMyTeam, MyEventView } from '@/app/actions/app-team';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { OUTING_ROLE_LABEL } from '@/lib/org/team';
import { spaceKeyOf } from '@/lib/org/space-nav';
import { dayWithWeekday } from '~/org/forms';
import { HomeworkList } from '~/org/homework';
import { TalkToggle } from '~/org/thread';
import { LoadState, useLoad } from '~/community/parts';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, dayLabel, scopeText, st } from '~/org/parts';
import { openDugout, setOrgReturn, setSpaceTab } from '~/org/space-store';

/**
 * 선수(회원) 공간의 탭 화면 — S단계(docs/designs/sinker-team-lesson-contract.md 8-3): 팀 오늘 · 일정 · 내 훈련 · 더보기,
 * 레슨장 홈 · 레슨일지 · 숙제 · 더보기(성장은 4단계). 공유를 아직 안 골랐으면(예약 확정으로 연결됨) 첫 탭에서 그것부터 묻는다.
 * 떠난 곳은 이 공간에 안 뜬다 — 받은 일지는 소속 관리 '지난 소속'(ReceivedNotes readOnly). 나가기도 소속 관리에서만.
 */
type Membership = Awaited<ReturnType<typeof loadMyMembership>>;
type Team = Awaited<ReturnType<typeof loadMyTeam>>;

export function PlayerTab({ space, tab }: { space: MySpace; tab: string }) {
  const memberId = space.memberId!;
  switch (tab) {
    case 'schedule':
      return <MyEvents memberId={memberId} orgId={space.orgId} />;
    case 'mytraining':
      return <MyTraining space={space} />;
    case 'notes':
      return <ReceivedNotes memberId={memberId} />;
    case 'homework':
      return <MyHomework space={space} tab="homework" />;
    case 'more':
      return <PlayerMore space={space} />;
    default:
      return space.kind === 'TEAM' ? <TeamToday space={space} /> : <LessonHome space={space} />;
  }
}

const share = (memberId: string) => router.push(`/org/share/${memberId}` as Href);

/** 공유 대기 카드 · 공지 — 팀 오늘 · 레슨장 홈 위. 공지는 제목 + 두 줄, 눌러 열어야 '읽음'(계약 9-6 ①-4 — 목록에 보였다고 읽음으로 안 센다) */
function Top({ space, data }: { space: MySpace; data: Extract<Membership, { ok: true }> }) {
  const c = usePalette();
  const open = (id?: string) => router.push(`/org/notice-view?member=${space.memberId}${id ? `&id=${id}` : ''}` as Href);
  return (
    <>
      {data.consentPending ? (
        <Card c={c}>
          <Text style={[TYPE.card, { color: c.ink }]}>코치에게 보여 줄 기록을 골라 주세요</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>고르기 전에는 코치가 내 기록을 볼 수 없어요. 일지는 그대로 받아요.</Text>
          <Primary label="보여 줄 기록 고르기" onPress={() => share(space.memberId!)} c={c} />
        </Card>
      ) : null}
      {data.notices.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="공지" c={c} />
          <Card c={c} style={{ paddingVertical: 4 }}>
            {data.notices.slice(0, 3).map((n, i) => (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                onPress={() => open(n.id)}
                style={({ pressed }) => [{ paddingVertical: 8, gap: 2 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[TYPE.sub, { color: n.pinned ? c.sky : c.muted }]}>
                  {n.pinned ? '고정 · ' : ''}
                  {dayLabel(n.key)}
                </Text>
                <Text style={[TYPE.card, { color: c.ink }]}>{n.title}</Text>
                <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={2}>
                  {n.body}
                </Text>
              </Pressable>
            ))}
            {data.notices.length > 3 ? (
              <Pressable accessibilityRole="button" onPress={() => open()} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>공지 모두 보기</Text>
              </Pressable>
            ) : null}
          </Card>
        </View>
      ) : null}
    </>
  );
}

/** 팀 선수 '오늘' — 오늘 · 다음 일정 하나(응답 · 메뉴 · 확정 등판), 공지 */
function TeamToday({ space }: { space: MySpace }) {
  const c = usePalette();
  const mem = useLoad<Membership>('app-org.loadMyMembership', space.memberId);
  const team = useLoad<Team>('app-team.loadMyTeam', space.memberId);
  if (!mem.data || !team.data) return <LoadState error={mem.error ?? team.error} onRetry={() => void Promise.all([mem.reload(), team.reload()])} c={c} />;
  const today = team.data.events.filter((e) => e.date === team.data!.todayKey);
  const next = today.length ? today : team.data.events.slice(0, 1);
  return (
    <View style={{ gap: 16 }}>
      <Top space={space} data={mem.data} />
      {team.data.outingCheck?.length ? (
        /* 팀 확정 등판이 체크인 답 · 내 달력 · 다른 팀과 날이 다르면 묻는다 — 조용히 덮지 않는다(계약 9-6 ①-5 E) */
        <Card c={c}>
          <Text style={[TYPE.card, { color: c.ink }]}>팀 등판 확인</Text>
          {team.data.outingCheck.map((l) => (
            <Text key={l} style={[TYPE.body, { color: c.ink }]}>
              {l}
            </Text>
          ))}
          <Text style={[TYPE.sub, { color: c.muted }]}>어느 쪽이 맞나요? 오늘 추천은 체크인 답을 먼저 따라요. 다르면 체크인의 던지는 일정을 고치거나 코치에게 알려 주세요.</Text>
        </Card>
      ) : null}
      <View style={{ gap: 6 }}>
        <GroupTitle title={today.length ? '오늘' : '다음 일정'} c={c} />
        {next.length ? (
          next.map((e) => <MyEvent key={e.id} e={e} memberId={space.memberId!} orgId={space.orgId} />)
        ) : (
          <Card c={c}>
            <Empty text="2주 안에 잡힌 일정이 없어요." c={c} />
          </Card>
        )}
      </View>
    </View>
  );
}

/** 레슨장 회원 '홈' — 다음 예정 활동 · 최근 일지 하나 · 열린 숙제 수 · 공지 */
function LessonHome({ space }: { space: MySpace }) {
  const c = usePalette();
  const mem = useLoad<Membership>('app-org.loadMyMembership', space.memberId);
  const team = useLoad<Team>('app-team.loadMyTeam', space.memberId);
  const hw = useLoad<Awaited<ReturnType<typeof loadMyHomework>>>('app-lesson.loadMyHomework', space.memberId);
  if (!mem.data || !team.data) return <LoadState error={mem.error ?? team.error} onRetry={() => void Promise.all([mem.reload(), team.reload()])} c={c} />;
  const key = spaceKeyOf(space);
  const next = team.data.events[0];
  const note = mem.data.notes[0];
  const open = hw.data ? hw.data.homework.filter((h) => h.status === 'assigned' || h.status === 'in_progress').length : 0;
  return (
    <View style={{ gap: 16 }}>
      <Top space={space} data={mem.data} />
      {/* 묶음 하나 = 카드 하나(계약 9-3) — 다음 레슨 · 최근 일지 · 할 숙제를 한 카드의 줄로 */}
      <Card c={c} float style={{ paddingVertical: 0 }}>
        <View style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.sub, { color: c.muted }]}>다음 레슨</Text>
            <Text style={[TYPE.body, { color: next ? c.ink : c.muted }]}>{next ? `${dayWithWeekday(next.date)} · ${next.time ?? '종일'} · ${next.title}` : '잡힌 레슨이 없어요'}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSpaceTab(key, 'notes')}
          style={({ pressed }) => [st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.sub, { color: c.muted }]}>최근 레슨일지{note ? ` · ${dayLabel(note.key)}` : ''}</Text>
            <Text style={[TYPE.body, { color: note ? c.ink : c.muted }]} numberOfLines={3}>
              {note ? note.body : '아직 받은 일지가 없어요'}
            </Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSpaceTab(key, 'homework')} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
          <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{open ? `할 숙제 ${open}개` : '할 숙제가 없어요'}</Text>
          <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
        </Pressable>
      </Card>
    </View>
  );
}

/** 받은 일지 — 레슨장 '레슨일지' 탭 · 팀 '내 훈련' 아래 · 소속 관리 '지난 소속'(readOnly — 말 · 영상 보내기 없음) */
export function ReceivedNotes({ memberId, readOnly = false, title, hideEmpty = false }: { memberId: string; readOnly?: boolean; title?: string; hideEmpty?: boolean }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Membership>('app-org.loadMyMembership', memberId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  /* 다른 칸 밑에 붙을 때 빈 카드를 쌓지 않는다(계약 9-3) */
  if (hideEmpty && data.notes.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {title ? <GroupTitle title={title} c={c} /> : null}
      {data.notes.length === 0 ? (
        <Card c={c}>
          <Empty text="아직 받은 일지가 없어요." c={c} />
        </Card>
      ) : (
        data.notes.map((n) => (
          <Card key={n.id} c={c}>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              {dayLabel(n.key)}
              {n.author ? ` · ${n.author}` : ''}
              {n.pitchCount ? ` · ${n.pitchCount}구` : ''}
            </Text>
            <Text selectable style={[TYPE.body, { color: c.ink }]}>
              {n.body}
            </Text>
            {n.homework ? (
              <Text selectable style={[TYPE.body, { color: c.ink }]}>
                <Text style={{ fontWeight: '700' }}>숙제 </Text>
                {n.homework}
              </Text>
            ) : null}
            {n.pitchLog ? (
              <Text style={[TYPE.sub, { color: c.muted }]}>
                던진 공 {n.pitchCount}구 · {n.pitchLog === 'own' ? '코치가 내 투구 기록에 남겼어요' : '내 투구 기록에 이었어요'}
              </Text>
            ) : null}
            {!readOnly && !data.left ? <TalkToggle kind="note" id={n.id} talk={n.talk} videos={n.videos.length} who={{ role: 'player', memberId }} c={c} /> : null}
          </Card>
        ))
      )}
    </View>
  );
}

/** 숙제 · 내 훈련의 '운동하기' — 내 개인 운동을 열고, 마치면 이 공간 · 탭으로 돌아온다(계약 8-4) */
function StartWorkout({ space, tab, c }: { space: MySpace; tab: string; c: Palette }) {
  return (
    <Primary
      label="운동하기"
      onPress={() => {
        setOrgReturn(spaceKeyOf(space), tab);
        router.push('/workout' as Href);
      }}
      c={c}
    />
  );
}

/** 받은 숙제 — '오늘 운동에 넣기'로 트레이닝에 넣어 하면 저절로 완료 */
function MyHomework({ space, tab }: { space: MySpace; tab: string }) {
  const c = usePalette();
  const memberId = space.memberId!;
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadMyHomework>>>('app-lesson.loadMyHomework', memberId);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="숙제" c={c} />
      {data ? (
        <>
          <HomeworkList items={data.homework} who={{ role: 'player', memberId }} onChanged={() => void reload()} c={c} />
          {data.homework.some((h) => h.status === 'in_progress') ? <StartWorkout space={space} tab={tab} c={c} /> : null}
        </>
      ) : (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      )}
    </View>
  );
}

/** 팀 선수 '내 훈련' — 다가오는 내 메뉴(계획) · 코치가 남긴 내 수행(내 운동 세트 참조) · 숙제 · 받은 일지 */
function MyTraining({ space }: { space: MySpace }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Team>('app-team.loadMyTeam', space.memberId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const menus = data.events.filter((e) => e.plans.length);
  return (
    <View style={{ gap: 16 }}>
      {/* 빈 칸은 한 줄로 합친다 — 빈 카드를 쌓지 않게(계약 9-3) */}
      {menus.length === 0 && data.recent.length === 0 ? (
        <Card c={c}>
          <Empty text="2주 안에 받은 메뉴 · 코치가 남긴 수행이 없어요." c={c} />
        </Card>
      ) : null}
      {menus.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="다가오는 내 메뉴" c={c} />
          <Card c={c}>
            {menus.map((e) => (
              <View key={e.id} style={{ gap: 2, paddingVertical: 4 }}>
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  {dayWithWeekday(e.date)} · {e.title}
                </Text>
                {e.plans.map((p, i) => (
                  <Text key={i} style={[TYPE.body, { color: c.ink }]} numberOfLines={2}>
                    {p.title} · {p.lines.map((l) => l.name).join(', ')}
                  </Text>
                ))}
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      {data.recent.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="코치가 남긴 내 수행" c={c} />
          <Card c={c}>
            {data.recent.map((w) => (
              <View key={w.eventId} style={{ gap: 2, paddingVertical: 4 }}>
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  {dayWithWeekday(w.date)} · {w.title} · {w.sets}세트
                </Text>
                <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={2}>
                  {w.exercises.join(', ')}
                </Text>
              </View>
            ))}
            <Text style={[TYPE.sub, { color: c.muted }]}>내 운동 기록 · 부하에 한 번만 들어가 있어요.</Text>
          </Card>
        </View>
      ) : null}
      <MyHomework space={space} tab="mytraining" />
      <ReceivedNotes memberId={space.memberId!} title="받은 일지" hideEmpty />
    </View>
  );
}

/** 선수 공간 '더보기' — 보여 줄 기록 · 소속 관리(나가기는 여기 안) · 코드로 들어가기 · 덕아웃 열기 · 설정 */
function PlayerMore({ space }: { space: MySpace }) {
  const c = usePalette();
  const rows = [
    { title: '보여 줄 기록', sub: '코치가 볼 수 있는 내 기록을 고르거나 바꿔요', onPress: () => share(space.memberId!) },
    { title: '소속 관리', sub: '들어간 팀 · 레슨장 · 지난 소속 · 나가기', onPress: () => router.push('/org' as Href) },
    { title: '코드로 들어가기', sub: '다른 팀 · 레슨장의 초대 코드를 넣어요', onPress: () => router.push('/org/join' as Href) },
    { title: '덕아웃 열기', sub: '레슨 예약 · 수강권 · 장터는 덕아웃에서 해요', onPress: openDugout },
    { title: '설정', sub: '테마 · 단위 · 앱 판', onPress: () => router.push('/settings' as Href) },
  ];
  return (
    <View style={{ gap: 12 }}>
      <MembershipCard space={space} />
      {/* 묶음 하나 = 카드 하나(계약 9-3) */}
      <Card c={c} style={{ paddingVertical: 0 }}>
        {rows.map((r, i) => (
          <Pressable
            key={r.title}
            accessibilityRole="button"
            onPress={r.onPress}
            style={({ pressed }) => [st.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>{r.title}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{r.sub}</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function MembershipCard({ space }: { space: MySpace }) {
  const c = usePalette();
  const { data } = useLoad<Membership>('app-org.loadMyMembership', space.memberId);
  if (!data) return null;
  return (
    <Card c={c} float>
      <Text style={[TYPE.card, { color: c.ink }]}>
        {data.org.name} {KIND_WORD[data.org.kind]}
      </Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {data.consentPending ? '보여 줄 기록을 아직 안 골랐어요' : `코치에게 보여 주는 것: ${scopeText(data.scope!)}`}
      </Text>
    </Card>
  );
}

/** 다가오는 일정(3단계) — 내 활동(전체 · 내 조 · 내 개인), 확정된 등판. 참석 응답은 없다(2026-10-27) */
function MyEvents({ memberId, orgId }: { memberId: string; orgId: string }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Team>('app-team.loadMyTeam', memberId);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="다가오는 일정" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : data.events.length === 0 ? (
        <Card c={c}>
          <Empty text="2주 안에 잡힌 일정이 없어요." c={c} />
        </Card>
      ) : (
        data.events.map((e) => <MyEvent key={e.id} e={e} memberId={memberId} orgId={orgId} />)
      )}
    </View>
  );
}

/** 일정 카드 — 내 활동 · 확정 등판. orgId 를 주면 '자세히'로 일정 하나 화면(팀 훈련 기록 · 운동하기, 계약 9-6 ③-2 · 11-6) */
export function MyEvent({ e, memberId, orgId }: { e: MyEventView; memberId: string; orgId?: string }) {
  const c = usePalette();
  return (
    <Card c={c}>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {dayWithWeekday(e.date)} · {e.time ?? '종일'} · {EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}
      </Text>
      <Text style={[TYPE.card, { color: c.ink }]}>{e.title}</Text>
      {e.outing ? (
        <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>
          {OUTING_ROLE_LABEL[e.outing.role]}로 확정{e.outing.pitchLimit ? ` · 투구 수 한도 ${e.outing.pitchLimit}구` : ''}
        </Text>
      ) : null}
      {e.plans.map((p, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>
            {p.scope === 'all' ? '전체' : p.scope === 'group' ? (p.groupName ?? '내 조') : '내 활동'} · {p.title}
          </Text>
          {p.lines.map((l, j) => (
            <Text key={j} style={[TYPE.sub, { color: c.muted }]} numberOfLines={1}>
              {l.name}
              {l.dose ? ` · ${l.dose}` : ''}
            </Text>
          ))}
        </View>
      ))}
      {orgId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/org/my-event?org=${orgId}&id=${e.id}&member=${memberId}` as Href)}
          hitSlop={6}
          style={{ minHeight: 40, justifyContent: 'center' }}
        >
          <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>팀 훈련 기록 · 운동하기 ›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

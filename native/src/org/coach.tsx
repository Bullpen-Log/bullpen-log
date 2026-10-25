import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { loadInvite, loadOrgMembers, loadOrgToday, MySpace } from '@/app/actions/app-org';
import { LoadState, useLoad } from '~/community/parts';
import { rpcForm } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import { Segmented } from '~/shell/heading';
import { toast } from '~/shell/toast';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, armLook, dayLabel, st } from '~/org/parts';

/**
 * 코치(대표 · 코치) 공간 — 1단계 탭 셋: 오늘 · 회원 · 더보기(docs/designs/sinker-team-lesson-contract.md 2-2). 일지 · 받은 것은 2단계에 붙는다.
 * 긴 표 · 수강권 · 내보내기는 PC 웹 /manage 에 둔다.
 */
type Tab = 'today' | 'members' | 'more';
const TABS = [
  { value: 'today', label: '오늘' },
  { value: 'members', label: '회원' },
  { value: 'more', label: '더보기' },
] as const;

type Today = Awaited<ReturnType<typeof loadOrgToday>>;
type Members = Awaited<ReturnType<typeof loadOrgMembers>>;
type Invite = Awaited<ReturnType<typeof loadInvite>>;

export function CoachSpace({ space }: { space: MySpace }) {
  const c = usePalette();
  const [tab, setTab] = useState<Tab>('today');
  return (
    <View style={{ gap: 16 }}>
      <Segmented label="코치 탭" options={TABS} value={tab} onChange={setTab} />
      {tab === 'today' ? <TodayTab space={space} c={c} /> : tab === 'members' ? <MembersTab space={space} c={c} /> : <MoreTab space={space} c={c} />}
    </View>
  );
}

const memberWord = (space: MySpace) => (space.kind === 'TEAM' ? '선수' : '회원');
const openMember = (space: MySpace, memberId: string) =>
  router.push(`/org/member/${memberId}?org=${space.orgId}` as Href);

function TodayTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Today>('app-org.loadOrgToday', space.orgId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const who = memberWord(space);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <GroupTitle title={`오늘 · ${dayLabel(data.todayKey)}`} c={c} />
        <Card c={c}>
          {data.events.length === 0 ? (
            <Empty text="오늘 일정이 없어요." c={c} />
          ) : (
            data.events.map((e) => (
              <View key={e.id} style={st.row}>
                <Text style={[TYPE.numInline, { color: c.muted, width: 52 }]}>{e.time ?? '종일'}</Text>
                <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                  {e.title}
                </Text>
              </View>
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
  if (data.members.length === 0)
    return (
      <Card c={c}>
        <Empty text={`아직 ${memberWord(space)}이 없어요. 더보기의 초대 코드를 보내 주세요.`} c={c} />
      </Card>
    );
  return (
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
  );
}

function MoreTab({ space, c }: { space: MySpace; c: Palette }) {
  const { data, error, reload } = useLoad<Invite>('app-org.loadInvite', space.orgId);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      await rpcForm('org.createInvite', { orgId: space.orgId, role: 'PLAYER' });
      await reload();
    } catch {
      toast('코드를 만들지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const share = (code: string) =>
    void Share.share({ message: `${space.name} 초대 코드 ${code} — 싱커 더보기 › 팀 · 레슨장 › 초대 코드로 들어가기에 넣어 주세요.` });
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <GroupTitle title={`${memberWord(space)} 초대 코드`} c={c} />
        <Card c={c}>
          {!data ? (
            <LoadState error={error} onRetry={() => void reload()} c={c} />
          ) : data.code ? (
            <>
              <Text selectable style={[TYPE.num, { fontSize: 32, color: c.ink, letterSpacing: 4 }]}>
                {data.code}
              </Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{data.until ? `${dayLabel(data.until)}까지 여럿이 쓸 수 있어요.` : ''}</Text>
              <Primary label="코드 보내기" onPress={() => share(data.code!)} c={c} />
            </>
          ) : (
            <Empty text="쓸 수 있는 코드가 없어요." c={c} />
          )}
          <Pressable accessibilityRole="button" onPress={() => void make()} disabled={busy} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[TYPE.body, { color: c.sky, fontWeight: '600', opacity: busy ? 0.5 : 1 }]}>새 코드 만들기</Text>
          </Pressable>
        </Card>
      </View>
      <View style={{ gap: 6 }}>
        <GroupTitle title="PC 에서 관리" c={c} />
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {KIND_WORD[space.kind]} 설정 · 수강권 · 일정 · 공지 · 긴 표는 PC 웹에서 해요.
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

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
});

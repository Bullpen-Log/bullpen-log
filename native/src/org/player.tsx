import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { loadMyMembership, MySpace } from '@/app/actions/app-org';
import type { loadMyHomework } from '@/app/actions/app-lesson';
import type { loadMyTeam, MyEventView } from '@/app/actions/app-team';
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/org/rules';
import { ATTEND_LABEL, ATTEND_REPLIES, OUTING_ROLE_LABEL, type AttendReply } from '@/lib/org/team';
import { toast } from '~/shell/toast';
import { dayWithWeekday } from '~/org/forms';
import { HomeworkList } from '~/org/homework';
import { TalkToggle } from '~/org/thread';
import { LoadState, call, useLoad } from '~/community/parts';
import { TYPE, usePalette } from '~/lib/ui';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, dayLabel, scopeText } from '~/org/parts';

/**
 * 선수(회원) 공간 — 공유 범위 · 받은 일지(1단계). 공유를 아직 안 골랐으면(예약 확정으로 연결됨) 그것부터 묻는다.
 * 떠난 곳은 받은 일지만 읽기로 남는다(결정 8). 2단계: 숙제(트레이닝에서 하면 저절로 완료). 내 성장은 4단계.
 * 3단계(팀): 다가오는 2주 일정 · 참석 응답 · 내 훈련 메뉴 · 확정된 등판, 보인 공지는 읽음으로(app-team.ts).
 */
type Membership = Awaited<ReturnType<typeof loadMyMembership>>;

export function PlayerSpace({ space }: { space: MySpace }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Membership>('app-org.loadMyMembership', space.memberId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const share = () => router.push(`/org/share/${space.memberId}` as Href);
  return (
    <PlayerBody space={space} data={data} share={share} />
  );
}

function PlayerBody({ space, data, share }: { space: MySpace; data: Extract<Membership, { ok: true }>; share: () => void }) {
  const c = usePalette();
  /* 보인 공지(위 셋)는 읽음으로 — 코치 공지 목록의 '읽음 n/m' */
  const shownIds = data.left ? '' : data.notices.slice(0, 3).map((n) => n.id).join(',');
  useEffect(() => {
    if (shownIds) void call('app-team.markNoticesRead', space.memberId, shownIds.split(','));
  }, [shownIds, space.memberId]);
  return (
    <View style={{ gap: 16 }}>
      {data.left ? (
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>떠난 {KIND_WORD[data.org.kind]}이에요. 받은 일지만 볼 수 있어요.</Text>
        </Card>
      ) : data.consentPending ? (
        <Card c={c}>
          <Text style={[TYPE.card, { color: c.ink }]}>코치에게 보여 줄 기록을 골라 주세요</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>고르기 전에는 코치가 내 기록을 볼 수 없어요. 일지는 그대로 받아요.</Text>
          <Primary label="보여 줄 기록 고르기" onPress={share} c={c} />
        </Card>
      ) : (
        <View style={{ gap: 6 }}>
          <GroupTitle title="코치에게 보여 주는 것" c={c} />
          <Pressable accessibilityRole="button" onPress={share}>
            <Card c={c}>
              <Text style={[TYPE.body, { color: c.ink }]}>{scopeText(data.scope!)}</Text>
              <Text style={[TYPE.sub, { color: c.sky, fontWeight: '600' }]}>바꾸기 · 떠나기</Text>
            </Card>
          </Pressable>
        </View>
      )}

      {data.notices.length ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="공지" c={c} />
          {data.notices.slice(0, 3).map((n) => (
            <Card key={n.id} c={c}>
              <Text style={[TYPE.sub, { color: n.pinned ? c.sky : c.muted }]}>
                {n.pinned ? '고정 · ' : ''}
                {dayLabel(n.key)}
              </Text>
              <Text style={[TYPE.card, { color: c.ink }]}>{n.title}</Text>
              <Text selectable style={[TYPE.body, { color: c.ink }]}>
                {n.body}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      {!data.left && space.kind === 'TEAM' ? <MyEvents memberId={space.memberId!} /> : null}

      {!data.left ? <MyHomework memberId={space.memberId!} /> : null}

      <View style={{ gap: 6 }}>
        <GroupTitle title="받은 일지" c={c} />
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
              {!data.left ? <TalkToggle kind="note" id={n.id} talk={n.talk} videos={n.videos.length} who={{ role: 'player', memberId: space.memberId! }} c={c} /> : null}
            </Card>
          ))
        )}
      </View>
    </View>
  );
}

/** 받은 숙제(2단계) — '오늘 운동에 넣기'로 트레이닝에 넣어 하면 저절로 완료 */
function MyHomework({ memberId }: { memberId: string }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadMyHomework>>>('app-lesson.loadMyHomework', memberId);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="숙제" c={c} />
      {data ? (
        <HomeworkList items={data.homework} who={{ role: 'player', memberId }} onChanged={() => void reload()} c={c} />
      ) : (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      )}
    </View>
  );
}

/** 다가오는 팀 일정(3단계) — 참석 응답(가요 · 못 가요 · 아직 몰라요 + 한 줄), 내 훈련 메뉴, 확정된 등판 */
function MyEvents({ memberId }: { memberId: string }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadMyTeam>>>('app-team.loadMyTeam', memberId);
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
        data.events.map((e) => <MyEvent key={e.id} e={e} memberId={memberId} onChanged={() => void reload()} />)
      )}
    </View>
  );
}

function MyEvent({ e, memberId, onChanged }: { e: MyEventView; memberId: string; onChanged: () => void }) {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const send = async (reply: AttendReply, note: string | null) => {
    setBusy(true);
    try {
      const r = await call<{ ok: boolean; error?: string }>('app-team.replyEvent', memberId, e.id, reply, note);
      if (!r.ok) return toast(('error' in r && r.error) || '보내지 못했어요.', 'error');
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  /* 못 가요 · 아직 몰라요는 까닭 한 줄(선택) */
  const answer = (reply: AttendReply) =>
    reply === 'yes'
      ? void send(reply, null)
      : Alert.prompt(ATTEND_LABEL[reply], '코치에게 남길 한 줄(선택)', [
          { text: '취소', style: 'cancel' },
          { text: '보내기', onPress: (v?: string) => void send(reply, v?.trim() || null) },
        ], 'plain-text', e.reply === reply ? (e.note ?? '') : '');
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
          <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>메뉴 · {p.title}</Text>
          {p.lines.map((l, j) => (
            <Text key={j} style={[TYPE.sub, { color: c.muted }]} numberOfLines={1}>
              {l.name}
              {l.dose ? ` · ${l.dose}` : ''}
            </Text>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ATTEND_REPLIES.map((r) => {
          const on = e.reply === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              disabled={busy}
              onPress={() => answer(r)}
              style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? c.sky : c.page, opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{ATTEND_LABEL[r]}</Text>
            </Pressable>
          );
        })}
      </View>
      {e.note ? <Text style={[TYPE.sub, { color: c.muted }]}>남긴 말 · {e.note}</Text> : null}
    </Card>
  );
}

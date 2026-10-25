import { type Href, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { loadMyMembership, MySpace } from '@/app/actions/app-org';
import type { loadMyHomework } from '@/app/actions/app-lesson';
import { HomeworkList } from '~/org/homework';
import { TalkToggle } from '~/org/thread';
import { LoadState, useLoad } from '~/community/parts';
import { TYPE, usePalette } from '~/lib/ui';
import { Card, Empty, GroupTitle, KIND_WORD, Primary, dayLabel, scopeText } from '~/org/parts';

/**
 * 선수(회원) 공간 — 공유 범위 · 받은 일지(1단계). 공유를 아직 안 골랐으면(예약 확정으로 연결됨) 그것부터 묻는다.
 * 떠난 곳은 받은 일지만 읽기로 남는다(결정 8). 2단계: 숙제(트레이닝에서 하면 저절로 완료). 내 성장은 4단계.
 */
type Membership = Awaited<ReturnType<typeof loadMyMembership>>;

export function PlayerSpace({ space }: { space: MySpace }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Membership>('app-org.loadMyMembership', space.memberId);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  const share = () => router.push(`/org/share/${space.memberId}` as Href);
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

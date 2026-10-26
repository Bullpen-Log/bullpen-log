import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMyEvent } from '@/app/actions/app-team';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Card, Empty, GroupTitle, Primary } from '~/org/parts';
import { MyEvent } from '~/org/player';
import { setOrgReturn } from '~/org/space-store';

/**
 * 선수의 일정 하나(계약 9-6 ③-2) — 응답 · 내 메뉴 · 확정 등판, 코치가 남긴 수행, 이 일정에서 내가 한 기록.
 * '운동하기'로 연 운동은 마치면 그 뒤에 한 내 세트가 이 일정에 이어진다(space-store consumeOrgReturn → app-team.linkMyWork) —
 * 코치 '메뉴대로'가 같은 훈련을 또 세지 않게(결정 3). 오늘 이미 한 메뉴 운동은 '이 일정에 잇기'로. 알림이 이 화면을 연다.
 * 주소: /org/my-event?org=&id=&member=
 */
type Loaded = Awaited<ReturnType<typeof loadMyEvent>>;

export default function MyEventScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; id: string; member: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-team.loadMyEvent', p.member ?? '', p.id ?? '');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="일정" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !data.ok || !data.event ? (
        <View style={[{ padding: 16 }, READABLE]}>
          <Card c={c}>
            <Empty text={data.ok && data.left ? '떠난 곳의 일정은 볼 수 없어요.' : '일정을 찾을 수 없어요. 지워졌을 수 있어요.'} c={c} />
          </Card>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {data.event.status === 'canceled' ? (
            <Card c={c}>
              <Text style={[TYPE.card, { color: c.muted }]}>취소된 일정이에요</Text>
            </Card>
          ) : null}
          <MyEvent e={data.event} memberId={p.member ?? ''} onChanged={() => void reload()} />
          <Work data={data} org={p.org ?? ''} member={p.member ?? ''} reload={() => void reload()} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

function Work({ data, org, member, reload, c }: { data: Extract<Loaded, { ok: true }>; org: string; member: string; reload: () => void; c: Palette }) {
  const e = data.event!;
  const [busy, setBusy] = useState(false);
  const live = e.status !== 'canceled';
  const today = e.date === data.todayKey;
  const run = async (action: string, done: (r: { linked?: number }) => string) => {
    setBusy(true);
    try {
      const r = await call<{ ok: boolean; error?: string; linked?: number }>(action, member, e.id);
      if (!r.ok) return toast(('error' in r && r.error) || '처리하지 못했어요.', 'error');
      toast(done(r));
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <View style={{ gap: 6 }}>
        <GroupTitle title="이 일정에서 내가 한 운동" c={c} />
        <Card c={c}>
          {data.mine.sets ? (
            <>
              <Text style={[TYPE.body, { color: c.ink }]}>
                {data.mine.sets}세트 · {data.mine.exercises.join(', ')}
              </Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>내 운동 기록에 한 번만 들어가 있어요. 코치도 이 기록을 봐요(트레이닝을 보여 줄 때).</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run('app-team.unlinkMyWork', () => '이 일정에서 뗐어요')} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>이 일정에서 떼기</Text>
              </Pressable>
            </>
          ) : (
            <Empty text={live && today ? "'운동하기'로 하면 이 일정에 이어져요." : '이 일정에 이은 내 기록이 없어요.'} c={c} />
          )}
          {live && data.candidates ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void run('app-team.linkMyWork', (r) => `${r.linked ?? 0}세트를 이었어요`)}
              style={{ minHeight: 40, justifyContent: 'center' }}
            >
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>그날 한 메뉴 운동 {data.candidates}세트를 이 일정에 잇기</Text>
            </Pressable>
          ) : null}
          {live && today ? (
            <Primary
              label="운동하기"
              disabled={busy}
              onPress={() =>
                void (async () => {
                  /* 메뉴가 있으면 오늘 운동에 먼저 넣는다 — 그 운동을 해야 이 일정에 이어진다 */
                  if (e.plans.length) {
                    setBusy(true);
                    const r = await call<{ ok: boolean; added: number; error?: string }>('app-team.menuToToday', member, e.id);
                    setBusy(false);
                    if (!r.ok) return toast(('error' in r && r.error) || '오늘 운동에 넣지 못했어요.', 'error');
                  }
                  setOrgReturn(`${org}:p`, 'schedule', { memberId: member, eventId: e.id });
                  router.push('/workout' as Href);
                })()
              }
              c={c}
            />
          ) : null}
        </Card>
      </View>
      {data.coach.sets ? (
        <View style={{ gap: 6 }}>
          <GroupTitle title="코치가 남긴 수행" c={c} />
          <Card c={c}>
            <Text style={[TYPE.body, { color: c.ink }]}>
              {data.coach.sets}세트 · {data.coach.exercises.join(', ')}
            </Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>내 운동 기록 · 부하에 들어가 있어요. 다르면 코치에게 알려 주세요.</Text>
          </Card>
        </View>
      ) : null}
    </>
  );
}

import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MyTeamResult, loadMyEvent } from '@/app/actions/app-team';
import { EXCEPTION_LABEL, WORK_REASON_LABEL, WORK_STATUS_LABEL } from '@/lib/org/team-session';
import { effortScaleText } from '@/lib/pitch-effort';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Card, Empty, GroupTitle, Primary } from '~/org/parts';
import { MyEvent } from '~/org/player';
import { setOrgReturn } from '~/org/space-store';

/**
 * 선수의 일정 하나(계약 9-6 ③-2 · 11-6) — 내 활동 · 확정 등판, 팀 훈련 기록(코치 확인), 이 일정에서 내가 한 기록.
 * '운동하기'로 연 운동은 마치면 그 뒤에 한 내 세트가 이 일정에 이어진다(space-store consumeOrgReturn → app-team.linkMyWork) —
 * 코치 확인이 같은 훈련을 또 세지 않게 내 기록으로 맞춘다(결정 3). 오늘 이미 한 활동 운동은 '이 일정에 잇기'로. 알림이 이 화면을 연다.
 * 다시 확인할 것은 없다 — 다르면 '고쳐 주세요'(코치 받은 것으로). 주소: /org/my-event?org=&id=&member=
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
          <MyEvent e={data.event} memberId={p.member ?? ''} />
          {data.result ? <TeamResult r={data.result} eventId={data.event.id} member={p.member ?? ''} reload={() => void reload()} c={c} /> : null}
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
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>그날 한 활동 운동 {data.candidates}세트를 이 일정에 잇기</Text>
            </Pressable>
          ) : null}
          {live && today ? (
            <Primary
              label="운동하기"
              disabled={busy}
              onPress={() =>
                void (async () => {
                  /* 활동이 있으면 오늘 운동에 먼저 넣는다 — 그 운동을 해야 이 일정에 이어진다 */
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
      {data.coach.sets && !data.result ? (
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

/** 팀 훈련 기록 · 코치 확인(계약 11-6) — 내 결과만(남의 이름 · 결과는 서버가 안 보낸다). 확인 필요 운동은 '팀 훈련이었나요?', 다르면 '고쳐 주세요' */
function TeamResult({ r, eventId, member, reload, c }: { r: MyTeamResult; eventId: string; member: string; reload: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: string, done: string, ...args: unknown[]) => {
    setBusy(true);
    try {
      const x = await call<{ ok: boolean; error?: string }>(action, member, eventId, ...args);
      if (!x.ok) return toast(('error' in x && x.error) || '처리하지 못했어요.', 'error');
      toast(done);
      reload();
    } finally {
      setBusy(false);
    }
  };
  const ask = (exerciseId: string, name: string) =>
    Alert.alert(`오늘 ${name}가 팀 훈련이었나요?`, '내가 따로 남긴 기록에 같은 운동이 있어요.', [
      { text: '닫기', style: 'cancel' },
      { text: '팀 훈련에 잇기', onPress: () => void act('app-team.answerTeamCheck', '내 기록으로 맞췄어요', exerciseId, 'link') },
      { text: '따로 한 운동이에요', onPress: () => void act('app-team.answerTeamCheck', '팀 기록도 남겼어요', exerciseId, 'separate') },
    ]);
  const fix = () =>
    Alert.prompt('고쳐 주세요', '무엇이 다른지 코치에게 알려 주세요.', [
      { text: '취소', style: 'cancel' },
      { text: '보내기', onPress: (v?: string) => void act('app-team.requestTeamFix', '코치에게 보냈어요', v ?? '') },
    ]);
  const when = new Date(r.confirmedAt);
  const absent = r.status === 'absent';
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="팀 훈련 기록 · 코치 확인" c={c} />
      <Card c={c}>
        <Text style={[TYPE.card, { color: c.ink }]}>{r.status ? WORK_STATUS_LABEL[r.status] : '확인 전'}</Text>
        {!absent
          ? r.activities.map((a, i) => (
              <Text key={i} style={[TYPE.body, { color: a.state === 'absent' ? c.muted : c.ink }]}>
                {a.title}
                {a.state !== 'same' ? ` · ${EXCEPTION_LABEL[a.state]}` : ''}
                {a.note ? ` (${a.note})` : ''}
              </Text>
            ))
          : null}
        {r.pitch.map((x, i) => (
          <Text key={`p${i}`} style={[TYPE.body, { color: c.ink }]}>
            던진 공 {x.pitchCount}구{x.effortPct ? ` · 강도 ${effortScaleText(x.effortPct)}` : ''}
            {x.maxVelocity ? ` · ${x.maxVelocity}km/h` : ''}
          </Text>
        ))}
        {r.drills.length ? <Text style={[TYPE.sub, { color: c.muted }]}>드릴 함 · {r.drills.join(', ')}</Text> : null}
        {r.reasons.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{r.reasons.map((x) => WORK_REASON_LABEL[x] ?? x).join(' · ')}</Text> : null}
        <Text style={[TYPE.sub, { color: c.muted }]}>
          기록 {r.coach ?? '코치'} · {when.getMonth() + 1}/{when.getDate()} {String(when.getHours()).padStart(2, '0')}:{String(when.getMinutes()).padStart(2, '0')} · 내 운동 기록 · 부하에 들어가 있어요
        </Text>
        {r.held.map((h) => (
          <Pressable key={h.exerciseId} accessibilityRole="button" disabled={busy} onPress={() => ask(h.exerciseId, h.name)} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>오늘 {h.name}가 팀 훈련이었나요? ›</Text>
          </Pressable>
        ))}
        {r.fixOpen ? (
          <Text style={[TYPE.sub, { color: c.warn }]}>고쳐 달라고 했어요 · 코치가 보면 바뀌어요</Text>
        ) : (
          <Pressable accessibilityRole="button" disabled={busy} onPress={fix} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>고쳐 주세요</Text>
          </Pressable>
        )}
      </Card>
    </View>
  );
}

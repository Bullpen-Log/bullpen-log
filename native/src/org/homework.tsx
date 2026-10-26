import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeworkView } from '@/app/actions/app-lesson';
import { HOMEWORK_STATUS_LABEL, doneLabel, needsCoachLook } from '@/lib/org/homework';
import { call } from '~/community/parts';
import { TYPE, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Card, Empty, dayLabel } from '~/org/parts';
import { TalkToggle } from '~/org/thread';
import { pickAndUploadOrgVideo } from '~/org/video';

/**
 * 숙제 목록(2단계) — 코치 회원 카드와 선수 공간이 같이 쓴다. 코치는 누르면 확인 · 면제 · 취소 · 되돌리기, 선수는 '오늘 운동에 넣기' · '했어요'.
 * 완료는 선수가 처방대로 한 기록으로 저절로(서버 app-lesson.ts settleHomework) 또는 코치 확인. '했어요'는 보고, 숙제 영상은 '영상 받음'(계약 9-6 ①-2).
 */
type Who = { role: 'coach'; orgId: string } | { role: 'player'; memberId: string };

export function HomeworkList({ items, who, onChanged, c }: { items: HomeworkView[]; who: Who; onChanged: () => void; c: Palette }) {
  if (items.length === 0)
    return (
      <Card c={c}>
        <Empty text={who.role === 'coach' ? "아직 낸 숙제가 없어요. 위의 '숙제 내기'로 내요." : '받은 숙제가 없어요.'} c={c} />
      </Card>
    );
  return (
    <>
      {items.map((h) => (
        <Card key={h.id} c={c}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[TYPE.sub, { color: c.muted, flex: 1 }]}>
              {dayLabel(h.key)} 낸 숙제{h.due ? ` · ${dayLabel(h.due)}까지` : ''}
            </Text>
            <Text style={[TYPE.sub, { color: statusColor(h.status, c), fontWeight: '600' }]}>
              {h.status === 'done' ? doneLabel(h.doneByRecord) : HOMEWORK_STATUS_LABEL[h.status]}
              {h.doneKey && h.status === 'done' ? ` · ${dayLabel(h.doneKey)}` : ''}
            </Text>
          </View>
          {h.lines.map((l, i) => (
            <View key={i} style={st.line}>
              <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                {l.name}
                {l.kind === 'drill' ? <Text style={{ color: c.muted }}> · 드릴</Text> : null}
              </Text>
              {l.dose ? <Text style={[TYPE.sub, { color: c.muted }]}>{l.dose}</Text> : null}
            </View>
          ))}
          <Actions h={h} who={who} onChanged={onChanged} c={c} />
          <TalkToggle kind="homework" id={h.id} talk={h.talk} who={who.role === 'coach' ? who : { role: 'player', memberId: who.memberId }} c={c} />
        </Card>
      ))}
    </>
  );
}

const statusColor = (s: HomeworkView['status'], c: Palette) => (s === 'done' ? c.ok : s === 'in_progress' || needsCoachLook(s) ? c.link : c.muted);
const open = (s: HomeworkView['status']) => s === 'assigned' || s === 'in_progress';

function Actions({ h, who, onChanged, c }: { h: HomeworkView; who: Who; onChanged: () => void; c: Palette }) {
  const [busy, setBusy] = useState<string | null>(null);
  /* 숙제 영상 — 저장소에 올리고 숙제에 '숙제 영상' 말로 붙인다. 아직 할 숙제면 완료가 된다(서버) */
  const submitVideo = async (memberId: string) => {
    setBusy('영상을 고르는 중');
    try {
      const path = await pickAndUploadOrgVideo({ role: 'player', memberId }, (p) => setBusy(`올리는 중 ${p}%`));
      if (!path) return;
      const r = await call<{ ok: boolean; error?: string }>('app-lesson.addMyComment', memberId, 'homework', h.id, 'submit', '', path);
      if (!r.ok) return toast(('error' in r && r.error) || '보내지 못했어요.', 'error');
      toast('숙제 영상을 보냈어요');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '영상을 올리지 못했어요.', 'error');
    } finally {
      setBusy(null);
    }
  };
  const send = async (action: string, ...args: unknown[]) => {
    const r = await call<{ ok: boolean; error?: string; added?: number }>(action, ...args);
    if (!r.ok) return toast(('error' in r && r.error) || '처리하지 못했어요.', 'error');
    if (typeof r.added === 'number') toast(`오늘 운동에 ${r.added}개 넣었어요. 트레이닝에서 하면 완료돼요.`);
    onChanged();
  };
  if (who.role === 'player') {
    if (busy) return <Text style={[TYPE.sub, { color: c.muted }]}>{busy}</Text>;
    return (
      <View style={st.actions}>
        {open(h.status) && h.hasExercise ? <Link label="오늘 운동에 넣기" onPress={() => void send('app-lesson.homeworkToToday', who.memberId, h.id)} c={c} /> : null}
        {h.status !== 'canceled' && h.status !== 'excused' ? <Link label="영상 보내기" onPress={() => void submitVideo(who.memberId)} c={c} /> : null}
        {open(h.status) ? <Link label="했어요" onPress={() => void send('app-lesson.markMyHomework', who.memberId, h.id, 'reported')} c={c} /> : null}
      </View>
    );
  }
  const menu = () =>
    Alert.alert('숙제', needsCoachLook(h.status) ? `${HOMEWORK_STATUS_LABEL[h.status]} — 보고 확인하면 완료가 돼요.` : undefined, [
      ...(needsCoachLook(h.status) ? [{ text: '확인했어요(완료)', onPress: () => void send('app-lesson.setHomeworkStatus', who.orgId, h.id, 'done') }] : []),
      ...(open(h.status) || needsCoachLook(h.status)
        ? [{ text: '면제', onPress: () => void send('app-lesson.setHomeworkStatus', who.orgId, h.id, 'excused') }]
        : [{ text: '다시 하게', onPress: () => void send('app-lesson.setHomeworkStatus', who.orgId, h.id, 'assigned') }]),
      { text: '숙제 취소', style: 'destructive' as const, onPress: () => void send('app-lesson.setHomeworkStatus', who.orgId, h.id, 'canceled') },
      { text: '닫기', style: 'cancel' as const },
    ]);
  return (
    <View style={st.actions}>
      <Link label="바꾸기" onPress={menu} c={c} />
    </View>
  );
}

function Link({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center' }}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  actions: { flexDirection: 'row', gap: 20 },
});

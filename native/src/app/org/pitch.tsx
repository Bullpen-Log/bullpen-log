import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadOrgMembers, loadProxyLogs } from '@/app/actions/app-org';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import { Bar, LoadState, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { ChoiceChips, DateStepper, Field, formCall } from '~/org/forms';
import { Card, Empty, GroupTitle, Primary, dayLabel } from '~/org/parts';

/**
 * 팀 투구 대신 기록(앱 화면, 1.5단계) — 웹 /manage/record 와 같은 org-record.createPitchLogs(폼): 한 번에 여러 선수, 칸 이름 pitch-<회원 id>.
 * 줄은 선수 본인 기록으로(코치가 적음 표시) 남아 선수 팔 부하 · 추천에 들어간다. 투구 공유를 안 켠 선수 · 가입 전 자리는 적지 않는다(서버도 막음).
 * 잘못 적었으면 밑의 '방금 적은 기록'에서 지운다(org-record.deleteProxyPitchLog).
 */
type Members = Awaited<ReturnType<typeof loadOrgMembers>>;
type Logs = Awaited<ReturnType<typeof loadProxyLogs>>;
const TYPES = SESSION_TYPES.map((t) => ({ value: t.name as string, label: t.name }));
const EFFORTS = EFFORT_CHIPS.map((p) => ({ value: String(p), label: effortScaleText(p) }));

export default function TeamPitchScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { org } = useLocalSearchParams<{ org: string }>();
  const members = useLoad<Members>('app-org.loadOrgMembers', org ?? '');
  const logs = useLoad<Logs>('app-org.loadProxyLogs', org ?? '');
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const [type, setType] = useState('불펜');
  const [effort, setEffort] = useState('80');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [rested, setRested] = useState<Record<string, boolean>>({});
  const { busy, error, run } = useBusy();
  const resting = type === REST_SESSION_TYPE;

  const players = members.data ? members.data.members.filter((m) => m.pitchOk) : [];
  const hidden = members.data ? members.data.members.length - players.length : 0;

  const save = () =>
    run(async () => {
      const fields: Record<string, string | null> = { orgId: org ?? '', date, sessionType: type, effortPct: resting ? null : effort };
      for (const m of players) {
        if (resting) fields[`rest-${m.memberId}`] = rested[m.memberId] ? 'on' : null;
        else fields[`pitch-${m.memberId}`] = counts[m.memberId] ?? '';
      }
      const r = await formCall('org-record.createPitchLogs', fields);
      if (r.error) return r.error;
      toast(r.success ?? '기록했어요');
      setCounts({});
      setRested({});
      void logs.reload();
      return null;
    });
  const undo = (id: string, label: string) =>
    Alert.alert(`${label} 기록을 지울까요?`, '코치가 적은 줄만 지워요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const r = await formCall('org-record.deleteProxyPitchLog', { id }, true);
          if (r.error) return toast(r.error, 'error');
          toast('지웠어요');
          void logs.reload();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="투구 기록 적기" c={c} />
      {!members.data ? (
        <LoadState error={members.error} onRetry={() => void members.reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Field label="날짜" c={c}>
            <DateStepper value={date} onChange={setDate} max={today} c={c} />
          </Field>
          <Field label="종류" c={c}>
            <ChoiceChips options={TYPES} value={type} onChange={setType} c={c} />
          </Field>
          {!resting ? (
            <Field label="체감 강도" hint="1 가볍게 ~ 10 전력 · 모두에게" c={c}>
              <ChoiceChips options={EFFORTS} value={effort} onChange={setEffort} c={c} />
            </Field>
          ) : null}
          <View style={{ gap: 6 }}>
            <GroupTitle title={resting ? '쉰 선수' : '선수마다 던진 공'} c={c} />
            <Card c={c} style={{ paddingVertical: 4 }}>
              {players.length === 0 ? (
                <Empty text="투구 기록을 공유한 선수가 없어요." c={c} />
              ) : (
                players.map((m, i) => (
                  <View key={m.memberId} style={[st.row, i < players.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[TYPE.card, { color: c.ink }]}>{m.nickname}</Text>
                      {m.tags.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{m.tags.join(' · ')}</Text> : null}
                    </View>
                    {resting ? (
                      <Switch accessibilityLabel={`${m.nickname} 쉼`} value={!!rested[m.memberId]} onValueChange={(on) => setRested({ ...rested, [m.memberId]: on })} />
                    ) : (
                      <CountBox value={counts[m.memberId] ?? ''} onChange={(v) => setCounts({ ...counts, [m.memberId]: v })} label={`${m.nickname} 투구수`} c={c} />
                    )}
                  </View>
                ))
              )}
            </Card>
            {hidden ? <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>투구 기록을 비공개로 했거나 앱 연결 대기인 선수 {hidden}명은 적을 수 없어요.</Text> : null}
          </View>
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '기록하는 중…' : '기록하기'} onPress={() => void save()} disabled={busy || players.length === 0} c={c} />

          <View style={{ gap: 6 }}>
            <GroupTitle title="방금 적은 기록" c={c} />
            <Card c={c} style={{ paddingVertical: 4 }}>
              {!logs.data ? (
                <LoadState error={logs.error} onRetry={() => void logs.reload()} c={c} />
              ) : logs.data.logs.length === 0 ? (
                <Empty text="아직 대신 적은 기록이 없어요." c={c} />
              ) : (
                logs.data.logs.map((l, i) => {
                  const label = `${l.nickname} ${dayLabel(l.key)} ${l.sessionType}${l.pitchCount ? ` ${l.pitchCount}구` : ''}`;
                  return (
                    <View key={l.id} style={[st.row, i < logs.data!.logs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
                      <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={1}>
                        {label}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 지우기`} onPress={() => undo(l.id, label)} hitSlop={6} style={{ minHeight: 40, justifyContent: 'center' }}>
                        <Text style={[TYPE.sub, { color: c.danger }]}>지우기</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </Card>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function CountBox({ value, onChange, label, c }: { value: string; onChange: (v: string) => void; label: string; c: Palette }) {
  return (
    <View style={st.count}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 3))}
        placeholder="0"
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        accessibilityLabel={label}
        style={[TYPE.num, { fontSize: 20, color: c.ink, textAlign: 'right', minWidth: 56, paddingVertical: 8 }]}
      />
      <Text style={[TYPE.unit, { color: c.muted }]}>구</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 6 },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
});

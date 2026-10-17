import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ARM_PAIN_LEVELS,
  ARM_PAIN_SPOTS,
  CHECKIN_NOTE_MAX,
  CHECKIN_PARTS,
  CONDITION_BANDS,
  PAIN_FORCED_CONDITION,
  SLEEP_QUALITY_LEVELS,
  conditionBand,
  type CheckinPartKey,
} from '@/lib/checkin';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { loadDay } from '~/home/api';

/**
 * 체크인(앱 화면) — 웹 3판 흐름(components/checkin-flow)과 같은 신호 셋: 컨디션 1~10 · 어젯밤 수면의 질 1~5 · 불편한 곳 · 메모.
 * 웹의 3D 몸 그림 대신 다섯 부위(어깨 · 팔꿈치 · 손목 · 허리 · 하체)를 정상 · 뻐근 · 통증으로 고르고, 어깨 · 팔꿈치가 통증이면 자리 · 정도를
 * 묻는다(웹과 같은 칸). 저장은 웹과 같은 서버 셈(checkin.saveAppCheckin → 같은 trySaveCheckin). 오늘 것이 있으면 그 값으로 열린다.
 */
const LEVELS = ['정상', '뻐근', '통증'] as const;
type Level = (typeof LEVELS)[number];

export default function CheckinScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [parts, setParts] = useState<Record<CheckinPartKey, Level>>(
    () => Object.fromEntries(CHECKIN_PARTS.map((p) => [p.key, '정상'])) as Record<CheckinPartKey, Level>
  );
  const [armSpots, setArmSpots] = useState<string[]>([]);
  const [armLevel, setArmLevel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 오늘 이미 남겼으면 그 값으로(고치기) — 팔 통증 자리는 그날 칸에 없어 다시 고른다 */
  useEffect(() => {
    let alive = true;
    loadDay(date)
      .then((d) => {
        if (!alive || !d.checkin) return;
        setCondition(d.checkin.condition);
        setSleep(d.checkin.sleepQuality);
        setNote(d.checkin.note ?? '');
        const byLabel = new Map(d.checkin.parts.map((p) => [p.label, p.value]));
        setParts(
          (prev) =>
            Object.fromEntries(
              CHECKIN_PARTS.map((p) => {
                const v = byLabel.get(p.label);
                return [p.key, v === '뻐근' || v === '통증' ? v : prev[p.key]];
              })
            ) as Record<CheckinPartKey, Level>
        );
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  const armJoints = (['shoulder', 'elbow'] as const).filter((k) => parts[k] === '통증');
  const lowDay = condition != null && condition <= PAIN_FORCED_CONDITION;

  const save = async () => {
    if (saving) return;
    if (condition == null) return setError('오늘 컨디션을 골라 주세요.');
    setSaving(true);
    setError(null);
    try {
      const res = await rpc<{ error?: string; savedDate?: string } | undefined>('checkin.saveAppCheckin', {
        date,
        condition,
        sleepQuality: sleep,
        parts,
        /* 통증인 관절의 자리만 — 풀린 관절의 자리는 버린다(서버도 같은 규칙) */
        armSpots: armSpots.filter((s) => armJoints.some((j) => ARM_PAIN_SPOTS[j].some((x) => x.key === s))),
        armLevel: armJoints.length ? armLevel : null,
        note,
      });
      if (res?.error) return setError(res.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof RpcError && e.code === 'offline' ? '신호가 약해 저장하지 못했어요. 고른 것은 그대로 있어요.' : '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const chip = (label: string, on: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, { backgroundColor: on ? c.sky : c.chip }]}
    >
      <Text style={[styles.chipText, { color: on ? '#fff' : c.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.sky, fontSize: 17 }}>닫기</Text>
        </Pressable>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>오늘 체크인</Text>
        <Pressable accessibilityRole="button" onPress={save} disabled={saving} hitSlop={10}>
          <Text style={{ color: c.sky, fontSize: 17, fontWeight: '700', opacity: saving ? 0.4 : 1 }}>저장</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: inset.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.q, { color: c.ink }]}>오늘 컨디션은 어때요?</Text>
          <Text style={{ color: c.muted, fontSize: 14 }}>
            {condition == null
              ? '1 은 아주 나쁨, 10 은 최고예요.'
              : CONDITION_BANDS.find((b) => b.key === conditionBand(condition))?.label}
          </Text>
          <View style={styles.grid}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ selected: condition === n }}
                accessibilityLabel={`컨디션 ${n}`}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCondition(n);
                }}
                style={[styles.num, { backgroundColor: condition === n ? c.sky : c.card }]}
              >
                <Text style={{ color: condition === n ? '#fff' : c.ink, fontSize: 20, fontWeight: '700' }}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.q, { color: c.ink }]}>어젯밤 잠은 어땠어요?</Text>
          <View style={styles.chips}>
            {SLEEP_QUALITY_LEVELS.map((label, i) => chip(label, sleep === i + 1, () => setSleep(sleep === i + 1 ? null : i + 1)))}
          </View>

          <Text style={[styles.q, { color: c.ink }]}>불편한 곳이 있어요?</Text>
          {lowDay ? <Text style={{ color: c.danger, fontSize: 14 }}>컨디션이 낮아요. 아픈 곳이 있으면 꼭 골라 주세요.</Text> : null}
          {CHECKIN_PARTS.map((p) => (
            <View key={p.key} style={[styles.partRow, { backgroundColor: c.card }]}>
              <Text style={{ width: 76, color: c.ink, fontSize: 15, fontWeight: '600' }}>{p.label}</Text>
              <View style={[styles.chips, { flex: 1 }]}>
                {LEVELS.map((lv) => chip(lv, parts[p.key] === lv, () => setParts({ ...parts, [p.key]: lv }), `${p.key}-${lv}`))}
              </View>
            </View>
          ))}

          {armJoints.length ? (
            <View style={[styles.armBox, { backgroundColor: c.card }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>어디가 아파요?</Text>
              {armJoints.map((j) => (
                <View key={j} style={styles.chips}>
                  {ARM_PAIN_SPOTS[j].map((s) =>
                    chip(
                      j === 'shoulder' ? `어깨 ${s.chip}` : `팔꿈치 ${s.chip}`,
                      armSpots.includes(s.key),
                      () => setArmSpots(armSpots.includes(s.key) ? armSpots.filter((x) => x !== s.key) : [...armSpots, s.key]),
                      s.key
                    )
                  )}
                </View>
              ))}
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }}>언제 아파요?</Text>
              <View style={styles.chips}>
                {ARM_PAIN_LEVELS.map((l) => chip(l.label, armLevel === l.value, () => setArmLevel(l.value), `lv${l.value}`))}
              </View>
              <Text style={{ color: c.muted, fontSize: 13 }}>통증이 있으면 던지지 말고 전문의와 상담하세요.</Text>
            </View>
          ) : null}

          <Text style={[styles.q, { color: c.ink }]}>메모</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={CHECKIN_NOTE_MAX}
            multiline
            placeholder="선택"
            placeholderTextColor={c.muted}
            style={[styles.memo, { backgroundColor: c.card, color: c.ink }]}
          />
          {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={saving}
            style={[styles.primary, { backgroundColor: c.sky }, saving && { opacity: 0.5 }]}
          >
            <Text style={styles.primaryText}>{saving ? '저장하는 중' : '저장하기'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  q: { fontSize: 20, fontWeight: '700', marginTop: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  num: { width: '18%', aspectRatio: 1.2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  partRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 10, gap: 8 },
  armBox: { borderRadius: 14, padding: 14, gap: 10 },
  memo: { minHeight: 88, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, fontSize: 17, textAlignVertical: 'top' },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

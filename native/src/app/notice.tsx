import * as Haptics from 'expo-haptics';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { ApiError, call } from '~/pitch/api';
import { openCheckin } from '~/shell/web-nav';
import { usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { NotificationList } from '~/home/notifications';

/**
 * 알림 종의 창 — 맨 위는 진짜 알림(~/home/notifications.tsx, 2026-10-22), 그 밑 '오늘 할 일'은 웹 휴대폰 위 막대 종의 아래 시트(components/notice-bell.tsx NoticePanel variant sheet)와 같은 칸:
 * 체크인을 안 했으면 [체크인하기], 투구 기록이 없으면 [기록하기][오늘 안 던졌어요](잠겼으면 [투구 기록 설정하기]), 다 했으면 '알림이 없어요',
 * 맨 밑에 고치기 줄. 홈(home/tab.tsx)이 오늘 날짜 · 한 것을 넘겨 연다. 닫으면 홈이 다시 받는다(useFocusEffect).
 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function spokenDay(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

export default function NoticeScreen() {
  const params = useLocalSearchParams<{ date?: string; checkin?: string; pitch?: string; locked?: string }>();
  /* 날짜 없이 열려도(바깥 링크) 오늘로 — 'NaN월'과 날짜 없는 쉬는 날 기록을 막는다 */
  const p = { ...params, date: params.date || toDateKey(new Date()) };
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const checkinDone = p.checkin === '1';
  const locked = p.locked === '1';
  const [pitchDone, setPitchDone] = useState(p.pitch === '1');
  const [resting, setResting] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);
  /* 한 번 그리기 전에 두 번 눌려도 쉬는 날 기록이 둘 생기지 않게(웹 app-shell markRested 와 같다) */
  const busy = useRef(false);

  const rest = async () => {
    if (busy.current) return;
    busy.current = true;
    setResting(true);
    setRestError(null);
    try {
      await call('/api/pitch-log', { method: 'POST', body: { date: p.date, sessionType: REST_SESSION_TYPE, videoPaths: [] } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPitchDone(true);
    } catch (e) {
      setRestError(e instanceof ApiError ? e.message : '인터넷 연결을 확인한 뒤 다시 눌러 주세요.');
    } finally {
      busy.current = false;
      setResting(false);
    }
  };
  const go = (href: string) => {
    router.back();
    router.push(href as Href);
  };
  const allDone = checkinDone && pitchDone;

  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 20, gap: 12 }}>
      {/* 머리 — 웹 Modal 시트: 제목 17 굵게 + 오른쪽 닫기 ✕(44) */}
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          알림
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} hitSlop={6} style={({ pressed }) => [styles.close, { backgroundColor: c.chip }, pressed && { opacity: 0.55 }]}>
          <Icon name="x" size={18} color={c.muted} />
        </Pressable>
      </View>
      {/* 진짜 알림(2026-10-22 금윤호) — 있으면 목록, 없으면 '알림이 없습니다'. 오늘 할 일은 남은 것이 있을 때만 그 밑에 */}
      <NotificationList c={c} />

      {!allDone ? (
        <Text style={{ color: c.muted, fontSize: 15, fontWeight: '600', marginTop: 8 }}>{spokenDay(p.date)} · 오늘 할 일</Text>
      ) : null}

      {!checkinDone ? (
        <Item c={c} icon="clipboard-list" title="오늘 체크인을 아직 안 했어요" body="몇 초면 끝나요. 오늘 운동 추천에 바로 반영해요.">
          <Pill c={c} label="체크인하기" chevron primary onPress={() => openCheckin()} />
        </Item>
      ) : null}

      {!pitchDone && locked ? (
        <Item c={c} icon="target" title="투구 기록을 아직 시작하지 않았어요" body="몇 가지만 알려 주면 투구 기록을 시작할 수 있어요.">
          <Pill c={c} label="투구 기록 설정하기" chevron primary onPress={() => go('/setup/pitch')} />
        </Item>
      ) : null}

      {!pitchDone && !locked ? (
        <Item c={c} icon="target" title="오늘 투구 기록이 아직 없어요" body="남기지 않으면 안 던진 날로 봐요. 쉬었으면 한 번만 눌러 두세요.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Pill c={c} label="기록하기" chevron primary onPress={() => go(`/pitch/${p.date}`)} />
            <Pill c={c} label={resting ? '남기는 중…' : '오늘 안 던졌어요'} disabled={resting} onPress={() => void rest()} />
            {resting ? <ActivityIndicator color={c.muted} /> : null}
          </View>
          {restError ? <Text style={{ color: c.danger, fontSize: 13, marginTop: 8 }}>{restError}</Text> : null}
        </Item>
      ) : null}

      {/* 다 한 것도 여기서 고친다 — 잘못 누른 '통증' 하나가 오늘 운동을 막으니 고칠 길이 늘 있어야 한다(웹과 같은 까닭) */}
      {checkinDone || pitchDone ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {checkinDone ? <Pill c={c} label="체크인 고치기" onPress={() => openCheckin()} /> : null}
          {pitchDone ? <Pill c={c} label="오늘 투구 기록 보기" onPress={() => go(`/pitch/${p.date}`)} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Item({ c, icon, title, body, children }: { c: Palette; icon: 'clipboard-list' | 'target'; title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={{ borderRadius: 16, padding: 16, backgroundColor: c.page }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} color={c.sky} size={16} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 10 }}>{body}</Text>
      {children}
    </View>
  );
}

function Pill({ c, label, primary, disabled, chevron, onPress }: { c: Palette; label: string; primary?: boolean; disabled?: boolean; chevron?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: primary ? c.sky : c.chip, opacity: disabled ? 0.5 : pressed ? 0.55 : 1 },
      ]}
    >
      <Text style={{ color: primary ? '#fff' : c.ink, fontSize: 15, fontWeight: primary ? '600' : '500' }}>{label}</Text>
      {chevron ? <Icon name="chevron-right" size={16} color={primary ? '#fff' : c.ink} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700' },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', margin: 6, marginRight: -6 },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});

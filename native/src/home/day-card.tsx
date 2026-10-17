import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SLEEP_QUALITY_LEVELS } from '@/lib/checkin';
import { isRestSession } from '@/lib/session-type';
import { usePalette } from '~/lib/ui';
import type { PitchLog } from '~/pitch/api';
import { loadDay, type DayDetail } from './api';

/**
 * 홈 달력 밑 그날 칸 — 웹 day-summary.tsx 와 같은 재료(/api/day-detail · lib/day-detail.ts): 컨디션 · 투구 · 운동 · 영양.
 * 투구 줄을 누르면 앱 그날 화면(폰 영상도 튼다 — 웹 홈에서는 회원 폰 영상이 안 열렸다). 운동 · 영양은 그 탭으로(onTab).
 */
const days = new Map<string, DayDetail>();
/** 로그아웃 — 앞사람 그날 칸(체크인 메모 · 끼니)을 지운다 */
export const resetDayCache = () => days.clear();

export function DayCard({
  date,
  logs,
  onTab,
}: {
  date: string;
  /** 그날 투구 기록 — 달력이 이미 받은 달 묶음에서 */
  logs: PitchLog[];
  onTab: (href: string) => void;
}) {
  const c = usePalette();
  const [state, setState] = useState<{ date: string; detail: DayDetail | null; error: string | null }>(() => ({
    date,
    detail: days.get(date) ?? null,
    error: null,
  }));

  useEffect(() => {
    let alive = true;
    loadDay(date).then(
      (d) => {
        days.set(date, d);
        if (alive) setState({ date, detail: d, error: null });
      },
      (e: unknown) => alive && setState((s) => ({ date, detail: s.date === date ? s.detail : null, error: e instanceof Error ? e.message : '불러오지 못했어요.' }))
    );
    return () => {
      alive = false;
    };
  }, [date]);

  const d = state.date === date ? state.detail ?? days.get(date) ?? null : days.get(date) ?? null;
  const [, m, dd] = date.split('-').map(Number);
  const pitches = logs.reduce((n, l) => n + l.pitchCount, 0);
  const rest = logs.length > 0 && logs.every((l) => isRestSession(l.sessionType));
  const videos = logs.reduce((n, l) => n + l.videoPaths.length, 0);
  const done = d?.training.exercises.filter((e) => e.done).length ?? 0;
  const ex = d?.training.exercises.length ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Text style={[styles.title, { color: c.ink }]}>
        {m}월 {dd}일
      </Text>

      <Row
        label="투구"
        value={logs.length === 0 ? '기록 없음' : rest ? '휴식' : `${logs.map((l) => l.sessionType).join(' · ')} ${pitches}구${videos ? ` · 영상 ${videos}` : ''}`}
        action={logs.length ? '보기' : '남기기'}
        onPress={() =>
          logs.length
            ? router.push(`/pitch/${date}` as Href)
            : router.push({ pathname: '/pitch/edit' as Href as never, params: { date } })
        }
      />

      {!d ? (
        state.error ? (
          <Text style={{ color: c.danger, fontSize: 15 }}>{state.error}</Text>
        ) : (
          <ActivityIndicator style={{ paddingVertical: 12 }} />
        )
      ) : (
        <>
          <Row
            label="컨디션"
            value={
              d.checkin
                ? `${d.checkin.condition}/10${d.checkin.sleepQuality ? ` · 잠 ${SLEEP_QUALITY_LEVELS[d.checkin.sleepQuality - 1] ?? ''}` : ''}${
                    d.checkin.parts.some((p) => p.value !== '정상')
                      ? ` · ${d.checkin.parts
                          .filter((p) => p.value !== '정상')
                          .map((p) => `${p.label} ${p.value}`)
                          .join(', ')}`
                      : ''
                  }`
                : '체크인 없음'
            }
          />
          {d.checkin?.note ? <Text style={[styles.note, { color: c.muted }]}>{d.checkin.note}</Text> : null}
          <Row
            label="운동"
            value={ex ? `${done}/${ex} 했어요${d.training.intensity ? ` · 힘듦 ${d.training.intensity}` : ''}` : '운동 없음'}
            action="트레이닝"
            onPress={() => onTab('/training')}
          />
          {d.training.exercises
            .filter((e) => e.done)
            .slice(0, 6)
            .map((e) => (
              <Text key={e.id} style={[styles.note, { color: c.muted }]} numberOfLines={1}>
                · {e.title}
                {e.weightKg ? ` ${e.weightKg}kg` : ''}
              </Text>
            ))}
          <Row
            label="영양"
            value={
              d.nutrition.kcal > 0
                ? `${Math.round(d.nutrition.kcal).toLocaleString('ko-KR')} / ${Math.round(d.nutrition.target.kcal).toLocaleString('ko-KR')}kcal · 단백질 ${Math.round(d.nutrition.protein)}g`
                : '기록 없음'
            }
            action="영양"
            onPress={() => onTab('/nutrition')}
          />
        </>
      )}
    </View>
  );
}

function Row({ label, value, action, onPress }: { label: string; value: string; action?: string; onPress?: () => void }) {
  const c = usePalette();
  const body = (
    <>
      <Text style={[styles.rowLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.ink }]} numberOfLines={2}>
        {value}
      </Text>
      {action ? <Text style={[styles.rowAction, { color: c.sky }]}>{action} ›</Text> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 4 },
  title: { fontSize: 17, fontWeight: '700', paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowLabel: { width: 52, fontSize: 14, fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 15 },
  rowAction: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 14, paddingLeft: 62 },
});

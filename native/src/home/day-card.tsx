import { type Href, router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SLEEP_QUALITY_LEVELS } from '@/lib/checkin';
import { effortScaleText, maxEffortPct } from '@/lib/pitch-effort';
import { agoText, spokenDay } from '@/lib/report/trends';
import { isRestSession } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import type { PitchLog } from '~/pitch/api';
import { openCheckin } from '~/shell/web-nav';
import { loadDay, type DayDetail } from './api';
import { countDayEvents, DayEvents } from './events';

/**
 * 홈 달력 밑 그날 칸 — 웹 day-summary.tsx · day-detail.tsx 와 같은 꼴: 머리('오늘' · '10월 18일 (토)' · 닫기), 아이콘 여섯(투구 · 트레이닝 · 영양 ·
 * 컨디션 · 영상 · 일정 — 남긴 것만 짙은 하늘색으로 칠함, 통증이면 빨간 점), 누른 아이콘의 자세한 요약이 밑에 펴진다. 탭으로 넘어가는 길은 그 밑 칸에.
 * 재료는 /api/day-detail(lib/day-detail.ts) · 달력이 받은 그날 투구 기록 · 그날 일정(calendar-event).
 */
const days = new Map<string, DayDetail>();
/** 로그아웃 — 앞사람 그날 칸(체크인 메모 · 끼니)을 지운다 */
export const resetDayCache = () => days.clear();

type Focus = 'pitch' | 'training' | 'nutrition' | 'checkin' | 'video' | 'schedule';
const TILES: { key: Focus; label: string; icon: SFSymbol }[] = [
  { key: 'pitch', label: '투구', icon: 'baseball.fill' },
  { key: 'training', label: '트레이닝', icon: 'dumbbell.fill' },
  { key: 'nutrition', label: '영양', icon: 'fork.knife' },
  { key: 'checkin', label: '컨디션', icon: 'heart.text.square.fill' },
  { key: 'video', label: '영상', icon: 'film.fill' },
  { key: 'schedule', label: '일정', icon: 'calendar' },
];

export function DayCard({
  date,
  today,
  logs,
  onTab,
  onClose,
}: {
  date: string;
  today: string;
  /** 그날 투구 기록 — 달력이 이미 받은 달 묶음에서 */
  logs: PitchLog[];
  onTab: (href: string) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const [state, setState] = useState<{ date: string; detail: DayDetail | null; error: string | null }>(() => ({
    date,
    detail: days.get(date) ?? null,
    error: null,
  }));
  const [events, setEvents] = useState<{ date: string; n: number | null }>({ date, n: null });
  const [picked, setPicked] = useState<{ date: string; focus: Focus } | null>(null);

  useEffect(() => {
    let alive = true;
    const ahead = date > today;
    if (!ahead)
      loadDay(date).then(
        (d) => {
          days.set(date, d);
          if (alive) setState({ date, detail: d, error: null });
        },
        (e: unknown) => alive && setState((s) => ({ date, detail: s.date === date ? s.detail : null, error: e instanceof Error ? e.message : '불러오지 못했어요.' }))
      );
    void countDayEvents(date).then((n) => alive && setEvents({ date, n }));
    return () => {
      alive = false;
    };
  }, [date, today]);

  const ahead = date > today;
  const d = state.date === date ? (state.detail ?? days.get(date) ?? null) : (days.get(date) ?? null);
  const eventCount = events.date === date ? (events.n ?? 0) : 0;
  const thrown = logs.filter((l) => !isRestSession(l.sessionType));
  const rested = logs.length > 0 && thrown.length === 0;
  const pitches = thrown.reduce((n, l) => n + l.pitchCount, 0);
  const effort = maxEffortPct(thrown.map((l) => ({ intensity: l.intensity ?? 0, effortPct: l.effortPct })));
  const top = Math.max(0, ...thrown.map((l) => l.maxVelocity ?? 0));
  const kinds = [...new Set(thrown.map((l) => l.sessionType))];
  const videos = logs.reduce((n, l) => n + l.videoPaths.length, 0);
  const doneEx = d?.training.exercises.filter((e) => e.done) ?? [];
  const pain = d?.checkin?.parts.some((p) => p.value === '통증') ?? false;
  const has: Record<Focus, boolean> = {
    pitch: logs.length > 0,
    training: doneEx.length > 0 || d?.training.intensity != null,
    nutrition: (d?.nutrition.kcal ?? 0) > 0,
    checkin: d?.checkin != null,
    video: videos > 0,
    schedule: eventCount > 0,
  };
  /* 처음 펼칠 것 — 남긴 것 가운데 가장 앞, 아무것도 없으면 투구(앞날이면 일정 — 웹 firstFocus 와 같다) */
  const first = ahead ? 'schedule' : (TILES.find((t) => has[t.key])?.key ?? 'pitch');
  const focus = picked?.date === date ? picked.focus : first;

  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.sky, fontSize: 12, fontWeight: '600' }}>{agoText(date, today)}</Text>
          <Text accessibilityRole="header" style={[TYPE.heading, { color: c.ink, fontSize: 18, marginTop: 2 }]}>
            {spokenDay(date)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="그날 칸 닫기" onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.close, pressed && { backgroundColor: c.chip }]}>
          <SymbolView name="xmark" size={14} tintColor={c.muted} weight="semibold" />
        </Pressable>
      </View>

      <View style={[styles.tiles, { borderTopColor: c.line }]}>
        {TILES.map((t) => {
          const on = has[t.key];
          const sel = focus === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${t.label}, ${on ? '남김' : '기록 없음'}`}
              onPress={() => setPicked({ date, focus: t.key })}
              style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <View
                style={[
                  styles.tileIcon,
                  { backgroundColor: on ? c.skyStrong : c.page },
                  on && { boxShadow: '0 3px 8px -3px rgba(15,23,42,0.45)' },
                  sel && { outlineWidth: 2, outlineOffset: 2, outlineColor: on ? c.skyStrong : c.muted, outlineStyle: 'solid' },
                ]}
              >
                <SymbolView name={t.icon} size={20} tintColor={on ? c.card : c.muted} />
                {t.key === 'checkin' && pain ? <View style={[styles.warnDot, { backgroundColor: c.danger, borderColor: c.card }]} /> : null}
              </View>
              <Text style={{ fontSize: 12, color: sel || on ? c.ink : c.muted, fontWeight: sel ? '700' : on ? '600' : '500' }} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 펴 둔 아이콘의 자세한 요약 — 웹 day-detail.tsx 의 칸마다 무엇을 · 그 탭으로 가는 길 */}
      <View style={[styles.detail, { backgroundColor: c.page }]}>
        {focus === 'schedule' ? (
          <DayEvents date={date} />
        ) : ahead ? (
          <Text style={{ color: c.muted, fontSize: 15 }}>아직 오지 않은 날이에요.</Text>
        ) : focus === 'pitch' ? (
          <>
            <Line c={c} title={rested ? '쉬는 날' : logs.length ? `${kinds.join(' · ')} ${pitches}구` : '투구 기록이 없어요'} />
            {!rested && logs.length ? (
              <Sub c={c}>
                {[effort > 0 ? `강도 ${effortScaleText(effort)}` : null, top > 0 ? `최고 ${formatSpeed(top, speed)}` : null].filter(Boolean).join(' · ')}
              </Sub>
            ) : null}
            <Go
              c={c}
              label={logs.length ? '그날 투구 기록 ›' : '투구 남기기 ›'}
              onPress={() =>
                logs.length ? router.push(`/pitch/${date}` as Href) : router.push({ pathname: '/pitch/edit' as Href as never, params: { date } })
              }
            />
          </>
        ) : !d ? (
          state.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{state.error}</Text> : <ActivityIndicator style={{ paddingVertical: 12 }} />
        ) : focus === 'training' ? (
          <>
            <Line c={c} title={doneEx.length ? `${doneEx.length}개 완료` : d.training.intensity != null ? '강도만 남김' : '운동 기록이 없어요'} />
            {d.training.intensity != null ? <Sub c={c}>힘듦 {d.training.intensity}</Sub> : null}
            {doneEx.slice(0, 8).map((e) => (
              <Text key={e.id} style={{ color: c.ink, fontSize: 14 }} numberOfLines={1}>
                · {e.title}
                {e.weightKg ? ` ${e.weightKg}kg` : ''}
              </Text>
            ))}
            <Go c={c} label="트레이닝 ›" onPress={() => onTab('/training')} />
          </>
        ) : focus === 'nutrition' ? (
          <>
            <Line
              c={c}
              title={
                d.nutrition.kcal > 0
                  ? `${Math.round(d.nutrition.kcal).toLocaleString('ko-KR')} / ${Math.round(d.nutrition.target.kcal).toLocaleString('ko-KR')}kcal`
                  : '먹은 기록이 없어요'
              }
            />
            {d.nutrition.kcal > 0 ? (
              <>
                <Bar c={c} value={d.nutrition.kcal / Math.max(1, d.nutrition.target.kcal)} />
                <Sub c={c}>
                  단백질 {Math.round(d.nutrition.protein)} / {Math.round(d.nutrition.target.protein)}g
                </Sub>
                {d.nutrition.meals
                  .filter((m) => m.kcal > 0)
                  .map((m) => (
                    <Text key={m.meal} style={{ color: c.ink, fontSize: 14 }} numberOfLines={1}>
                      {m.label} {Math.round(m.kcal)}kcal <Text style={{ color: c.muted }}>· {m.items.map((i) => i.name).join(', ')}</Text>
                    </Text>
                  ))}
              </>
            ) : null}
            <Go c={c} label="영양 ›" onPress={() => onTab('/nutrition')} />
          </>
        ) : focus === 'checkin' ? (
          <>
            <Line c={c} title={d.checkin ? `컨디션 ${d.checkin.condition} / 10` : '체크인이 없어요'} />
            {d.checkin ? (
              <>
                {d.checkin.sleepQuality ? <Sub c={c}>어젯밤 잠 {SLEEP_QUALITY_LEVELS[d.checkin.sleepQuality - 1] ?? ''}</Sub> : null}
                <Sub c={c}>
                  {d.checkin.parts.some((p) => p.value !== '정상')
                    ? d.checkin.parts
                        .filter((p) => p.value !== '정상')
                        .map((p) => `${p.label} ${p.value}`)
                        .join(' · ')
                    : '통증 없음'}
                </Sub>
                {d.checkin.note ? <Text style={{ color: c.ink, fontSize: 14, lineHeight: 20 }}>{d.checkin.note}</Text> : null}
              </>
            ) : null}
            {date === today ? <Go c={c} label={d.checkin ? '체크인 고치기 ›' : '체크인하기 ›'} onPress={() => openCheckin()} /> : null}
          </>
        ) : (
          <>
            <Line c={c} title={videos ? `영상 ${videos}개` : '영상이 없어요'} />
            {videos ? <Go c={c} label="그날 화면에서 보기 ›" onPress={() => router.push(`/pitch/${date}` as Href)} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

function Line({ c, title }: { c: Palette; title: string }) {
  return <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700' }}>{title}</Text>;
}
function Sub({ c, children }: { c: Palette; children: React.ReactNode }) {
  return <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>{children}</Text>;
}
function Bar({ c, value }: { c: Palette; value: number }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden', marginVertical: 2 }}>
      <View style={{ width: `${Math.min(100, Math.round(value * 100))}%`, height: 6, borderRadius: 3, backgroundColor: c.sky }} />
    </View>
  );
}
function Go({ c, label, onPress }: { c: Palette; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -4 },
  tiles: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 16, paddingBottom: 16 },
  tile: { flex: 1, alignItems: 'center', gap: 6 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  warnDot: { position: 'absolute', right: -4, top: -4, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  detail: { margin: 12, marginTop: 0, borderRadius: 16, padding: 16, gap: 6 },
});

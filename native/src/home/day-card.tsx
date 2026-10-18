import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SLEEP_QUALITY_LEVELS } from '@/lib/checkin';
import { effortText } from '@/lib/pitch-effort';
import { agoText, spokenDay } from '@/lib/report/trends';
import { isRestSession } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import type { PitchLog } from '~/pitch/api';
import { Icon, type IconName } from '~/shell/icon';
import { fadeIn, rowIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import { loadDay, type DayDetail } from './api';
import { DayEvents, useDayEventCount } from './events';
import { PitchVideo } from '~/pitch/video';
import { useVelocityDays } from '~/pitch/store';

/**
 * 홈 달력 밑 그날 칸 — 웹 day-summary.tsx(요약 카드) · day-detail.tsx(자세히 카드)와 같은 두 카드.
 * - 요약 카드: '6일 전' · '10월 13일 (화)' · 닫기, 아이콘 여섯(남긴 것만 짙은 하늘색 · 통증이면 빨간 점). 날짜가 바뀌면 아이콘이 28ms 씩 차례로 떠오른다.
 * - 자세히 카드: 머리 '10월 13일 (화) · 투구' + 그날 분석 · 탭에서 자세히, 몸통은 누른 아이콘의 자세한 것(바뀌면 160ms 옅어짐 · 줄은 차례로).
 * 펴질 때 안쪽이 10px 아래에서 220ms 에 올라온다(웹 pitch-log-panel.tsx). 재료는 /api/day-detail · 달력이 받은 투구 기록 · 그날 일정.
 */
const days = new Map<string, DayDetail>();
/** 로그아웃 — 앞사람 그날 칸(체크인 메모 · 끼니)을 지운다 */
export const resetDayCache = () => days.clear();

type Focus = 'pitch' | 'training' | 'nutrition' | 'checkin' | 'video' | 'schedule';
const TILES: { key: Focus; label: string; icon: IconName }[] = [
  { key: 'pitch', label: '투구', icon: 'baseball' },
  { key: 'training', label: '트레이닝', icon: 'dumbbell' },
  { key: 'nutrition', label: '영양', icon: 'utensils' },
  { key: 'checkin', label: '컨디션', icon: 'heart-pulse' },
  { key: 'video', label: '영상', icon: 'film' },
  { key: 'schedule', label: '일정', icon: 'calendar-days' },
];
const TITLES: Record<Focus, string> = { pitch: '투구', training: '트레이닝', nutrition: '영양', checkin: '컨디션', video: '영상', schedule: '일정' };
const OPEN_EASE = Easing.bezier(0.22, 1, 0.36, 1);
/* 펴질 때 — 웹 pitch-log-panel.tsx 그날 칸: opacity · Y 10 → 0, 220ms */
const cardIn = FadeInDown.duration(220).easing(OPEN_EASE).withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
/** 자리 · 높이가 바뀔 때 — 웹 그날 칸 · 달력 칸 높이 300ms cubic-bezier(0.22,1,0.36,1) */
export const layoutMove = LinearTransition.duration(300).easing(OPEN_EASE);

export function DayCards({
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
  const [picked, setPicked] = useState<{ date: string; focus: Focus } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    if (date <= today)
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
  }, [date, today, retry]);

  const ahead = date > today;
  /* 같이 만든 투구 기록을 지워도 측정 세션은 남는다 — 그래도 카메라 줄은 보인다(웹 PitchDetail) */
  const vday = useVelocityDays()?.[date];
  const camera =
    vday && vday.n > 0 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="camera" size={14} color={c.sky} />
        <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>
          카메라로 잰 공 {vday.n}구 · 최고 {formatSpeed(vday.max, speed)}
          {vday.clips > 0 ? ` · 영상 ${vday.clips}개는 그날 화면에서 봐요` : ''}
        </Text>
      </View>
    ) : null;
  const d = state.date === date ? (state.detail ?? days.get(date) ?? null) : (days.get(date) ?? null);
  const eventCount = useDayEventCount(date) ?? 0;
  const videos = logs.reduce((n, l) => n + l.videoPaths.length, 0);
  const doneEx = d?.training.exercises.filter((e) => e.done) ?? [];
  const pain = d?.checkin?.parts.some((p) => p.value === '통증') ?? false;
  const has: Record<Focus, boolean> = {
    pitch: logs.length > 0 || (vday?.n ?? 0) > 0,
    training: doneEx.length > 0 || d?.training.intensity != null,
    nutrition: (d?.nutrition.kcal ?? 0) > 0,
    checkin: d?.checkin != null,
    video: videos > 0 || (vday?.clips ?? 0) > 0,
    schedule: eventCount > 0,
  };
  /* 처음 펼칠 것 — 남긴 것 가운데 가장 앞, 아무것도 없으면 투구(앞날이면 일정 — 웹 firstFocus 와 같다) */
  const first = ahead ? 'schedule' : (TILES.find((t) => has[t.key])?.key ?? 'pitch');
  /* 칸이 펴진 채 날을 바꾸면 보던 아이콘 그대로(웹 — 날마다 영양 · 투구를 견줘 본다). 처음 펼 때만 first */
  const focus = picked ? picked.focus : first;
  const link = tabLink(focus, date, today, !has[focus]);

  return (
    <>
      {/* 요약 카드 */}
      <Animated.View key={`s-${date}`} entering={cardIn} layout={layoutMove} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.sky, fontSize: 12, fontWeight: '600' }}>{agoText(date, today)}</Text>
            <Text accessibilityRole="header" style={[TYPE.heading, { color: c.ink, fontSize: 18, marginTop: 2 }]}>
              {spokenDay(date)}
            </Text>
          </View>
          <Press accessibilityRole="button" accessibilityLabel="그날 칸 닫기" onPress={onClose} hitSlop={6} style={styles.close}>
            <Icon name="x" size={16} color={c.muted} />
          </Press>
        </View>
        <View style={[styles.tiles, { borderTopColor: c.line }]}>
          {TILES.map((t, i) => {
            const on = has[t.key];
            const sel = focus === t.key;
            return (
              <Animated.View key={t.key} entering={rowIn(i)} style={{ flex: 1 }}>
                <Press
                  select
                  selected={sel}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${t.label}, ${on ? '남김' : '기록 없음'}`}
                  onPress={() => setPicked({ date, focus: t.key })}
                  style={styles.tile}
                >
                  <View
                    style={[
                      styles.tileIcon,
                      { backgroundColor: on ? c.skyStrong : c.page },
                      on && { boxShadow: '0 3px 8px -3px rgba(15,23,42,0.45)' },
                      sel && { outlineWidth: 2, outlineOffset: 2, outlineColor: on ? c.skyStrong : c.muted, outlineStyle: 'solid' },
                    ]}
                  >
                    <Icon name={t.icon} size={24} color={on ? c.card : c.muted} />
                    {t.key === 'checkin' && pain ? <View style={[styles.warnDot, { backgroundColor: c.danger, borderColor: c.card }]} /> : null}
                  </View>
                  <Text style={{ fontSize: 12, letterSpacing: -0.3, color: sel || on ? c.ink : c.muted, fontWeight: sel ? '700' : on ? '600' : '500' }} numberOfLines={1}>
                    {t.label}
                  </Text>
                </Press>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>

      {/* 자세히 카드 */}
      <Animated.View key={`d-${date}`} entering={cardIn} layout={layoutMove} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float, marginTop: 16 }]}>
        <View style={[styles.detailHead, { borderBottomColor: c.line }]}>
          <Text style={{ color: c.ink, fontSize: 14, fontWeight: '700' }}>
            {spokenDay(date)}
            <Text style={{ color: c.muted, fontWeight: '400' }}> · {TITLES[focus]}</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {!ahead && focus !== 'schedule' ? (
              <Press accessibilityRole="link" onPress={() => router.push(`/analysis?view=${focus === 'training' ? 'training' : 'pitch'}&date=${date}` as Href)} style={styles.headLink}>
                <Text style={{ color: c.muted, fontSize: 14, fontWeight: '500' }}>그날 분석</Text>
              </Press>
            ) : null}
            {link ? (
              <Press accessibilityRole="link" onPress={() => go(link.href, onTab)} style={[styles.headLink, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>{link.label}</Text>
                <Icon name="chevron-right" size={14} color={c.sky} />
              </Press>
            ) : null}
          </View>
        </View>
        <Animated.View key={`${date}-${focus}`} entering={fadeIn} style={styles.detailBody}>
          {!ahead && focus !== 'checkin' && d?.checkin?.note ? <Memo c={c} label="체크인 메모" text={d.checkin.note} /> : null}
          {focus === 'schedule' ? (
            <DayEvents date={date} />
          ) : ahead ? (
            <Empty c={c}>아직 오지 않은 날이에요. 일정을 적어 둘 수 있어요.</Empty>
          ) : focus === 'pitch' ? (
            logs.length === 0 ? (
              <View style={{ gap: 12 }}>
                {camera}
                <Empty c={c}>이 날 남긴 투구가 없어요.</Empty>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {camera}
                {logs.map((l, i) => {
                  const rest = isRestSession(l.sessionType);
                  return (
                    <Animated.View key={l.id} entering={rowIn(i)} style={[styles.box, { backgroundColor: c.page }]}>
                      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>{rest ? '쉬는 날' : `${l.sessionType} · ${l.pitchCount}구`}</Text>
                      {!rest ? (
                        <View style={styles.facts}>
                          <Fact c={c} label="강도" value={effortText({ intensity: l.intensity ?? 0, effortPct: l.effortPct }) ?? '—'} />
                          <Fact c={c} label="최고 구속" value={formatSpeed(l.maxVelocity, speed) ?? '—'} />
                          <Fact c={c} label="평균 구속" value={formatSpeed(l.avgVelocity, speed) ?? '—'} />
                        </View>
                      ) : null}
                      {l.memo?.trim() ? <Memo c={c} text={l.memo} bare /> : null}
                      {l.videoPaths.length ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                          <Icon name="film" size={14} color={c.muted} />
                          <Text style={{ color: c.muted, fontSize: 12 }}>영상 {l.videoPaths.length}개 · 영상 아이콘을 누르면 봐요</Text>
                        </View>
                      ) : null}
                    </Animated.View>
                  );
                })}
              </View>
            )
          ) : focus === 'video' ? (
            videos ? (
              /* 두 개까지 그 자리에서 튼다 — 더 있으면 투구 탭에서(웹 VideoDetail) */
              <View style={{ gap: 12 }}>
                {logs
                  .flatMap((l) => (isRestSession(l.sessionType) ? [] : l.videoPaths))
                  .slice(0, 2)
                  .map((p, i) => (
                    <View key={p} style={{ gap: 6 }}>
                      <PitchVideo path={p} />
                      <Text style={{ color: c.muted, fontSize: 12 }}>영상 {i + 1}</Text>
                    </View>
                  ))}
                {videos > 2 ? <Text style={{ color: c.muted, fontSize: 12 }}>외 {videos - 2}개는 투구 기록에서 볼 수 있어요.</Text> : null}
              </View>
            ) : vday?.clips ? (
              <Text style={{ color: c.muted, fontSize: 13 }}>구속 측정 영상 {vday.clips}개는 그날 화면에서 공마다 볼 수 있어요.</Text>
            ) : (
              <Empty c={c}>이 날 올린 영상이 없어요.</Empty>
            )
          ) : !d ? (
            state.error ? (
              /* 웹 day-detail — 못 불러왔으면 한 줄 + 다시 불러오기 */
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                <Text style={{ color: c.muted, fontSize: 15 }}>이 날 내용을 불러오지 못했어요.</Text>
                <Press accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} style={[styles.retry, { backgroundColor: c.chip }]}>
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
                </Press>
              </View>
            ) : (
              <Waiting c={c} />
            )
          ) : focus === 'training' ? (
            <TrainingDetail d={d} c={c} />
          ) : focus === 'nutrition' ? (
            <NutritionDetail d={d} c={c} />
          ) : (
            <CheckinDetail d={d} c={c} isToday={date === today} />
          )}
        </Animated.View>
      </Animated.View>
    </>
  );
}

/** 탭으로 가는 길 — 웹 day-detail.tsx tabLink 와 같은 글 */
function tabLink(focus: Focus, date: string, today: string, empty: boolean): { href: string; label: string } | null {
  const isToday = date === today;
  if (focus === 'pitch') return { href: `/pitch/${date}`, label: empty ? '이 날 투구 남기기' : '투구 탭에서 자세히' };
  if (focus === 'training')
    return { href: isToday ? '/training' : `/training/day/${date}`, label: empty ? (isToday ? '오늘 운동하러 가기' : '이 날 운동 채우기') : '트레이닝에서 자세히' };
  if (focus === 'nutrition') return { href: '/nutrition', label: empty ? '식단 기록하러 가기' : '영양 탭에서 자세히' };
  if (focus === 'video') return { href: `/pitch/${date}`, label: empty ? '투구 탭으로' : '투구 탭에서 보기' };
  return null;
}
function go(href: string, onTab: (href: string) => void) {
  if (href.startsWith('/pitch/') || href.startsWith('/training/day/')) return router.push(href as Href);
  onTab(href);
}

function TrainingDetail({ d, c }: { d: DayDetail; c: Palette }) {
  const t = d.training;
  const done = t.exercises.filter((e) => e.done);
  if (!t.exercises.length && t.intensity == null) return <Empty c={c}>이 날 남긴 운동이 없어요.</Empty>;
  const shown = t.exercises.slice(0, 8);
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.facts}>
        <Fact c={c} label="마친 운동" value={`${done.length}${t.exercises.length > done.length ? ` / ${t.exercises.length}` : ''}개`} />
        {t.intensity != null ? <Fact c={c} label="강도" value={String(t.intensity)} /> : null}
      </View>
      <View style={{ gap: 6 }}>
        {shown.map((e, i) => (
          <Animated.View key={e.id} entering={rowIn(i)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 2 }}>{e.done ? <Icon name="check" size={16} color={c.ok} /> : <Icon name="circle-check" size={16} color={c.lineStrong} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: e.done ? c.ink : c.muted, fontSize: 15 }} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
                {doneText(e)}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
      {t.exercises.length > shown.length ? <Text style={{ color: c.muted, fontSize: 12 }}>외 {t.exercises.length - shown.length}개는 트레이닝에서 볼 수 있어요.</Text> : null}
      {t.memo?.trim() ? <Memo c={c} text={t.memo} /> : null}
    </View>
  );
}
function doneText(e: DayDetail['training']['exercises'][number]) {
  const a = [
    e.setsDone != null ? `${e.setsDone}세트` : null,
    e.repsDone != null ? `${e.repsDone}회` : null,
    e.holdSecondsDone != null ? `${e.holdSecondsDone}초` : null,
    e.weightKg != null ? `${e.weightKg}kg` : null,
  ].filter(Boolean);
  return a.length ? a.join(' · ') : (e.planned ?? e.category);
}

const MACROS = [
  { key: 'carbs', label: '탄수화물' },
  { key: 'protein', label: '단백질' },
  { key: 'fat', label: '지방' },
] as const;
function NutritionDetail({ d, c }: { d: DayDetail; c: Palette }) {
  const n = d.nutrition;
  if (!n.meals.length) return <Empty c={c}>이 날 먹은 것을 아직 안 적었어요.</Empty>;
  const pct = (v: number, of: number) => `${Math.min(100, of > 0 ? (v / of) * 100 : 0)}%` as const;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 15 }}>
          <Text style={[TYPE.num, { color: c.ink, fontSize: 18 }]}>{Math.round(n.kcal).toLocaleString('ko-KR')}</Text> / {Math.round(n.target.kcal).toLocaleString('ko-KR')}kcal
        </Text>
        <View style={[styles.bar, { backgroundColor: c.page }]}>
          <View style={[styles.barFill, { width: pct(n.kcal, n.target.kcal), backgroundColor: n.kcal > n.target.kcal ? c.warn : c.sky }]} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
          {MACROS.map((m) => (
            <View key={m.key} style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: c.muted, fontSize: 11 }}>{m.label}</Text>
                <Text style={{ color: c.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  <Text style={{ color: c.ink, fontWeight: '600' }}>{Math.round(n[m.key])}</Text>/{Math.round(n.target[m.key])}g
                </Text>
              </View>
              <View style={[styles.barThin, { backgroundColor: c.page }]}>
                <View style={[styles.barFill, { width: pct(n[m.key], n.target[m.key]), backgroundColor: c.sky }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.meals, { borderColor: c.line }]}>
        {n.meals.map((m, i) => (
          <Animated.View key={m.meal} entering={rowIn(i)} style={[styles.meal, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <Text style={{ width: 32, color: c.muted, fontSize: 12, fontWeight: '600' }}>{m.label}</Text>
            <Text style={{ flex: 1, color: c.ink, fontSize: 13 }}>{m.items.map((it) => `${it.name}${it.amount === '1인분' ? '' : ` ${it.amount}`}`).join(', ')}</Text>
            <Text style={{ color: c.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{Math.round(m.kcal).toLocaleString('ko-KR')}kcal</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function CheckinDetail({ d, c, isToday }: { d: DayDetail; c: Palette; isToday: boolean }) {
  const ck = d.checkin;
  if (!ck)
    return (
      <View style={{ gap: 8 }}>
        <Empty c={c}>이 날 체크인이 없어요.</Empty>
        {isToday ? (
          <Press accessibilityRole="button" onPress={() => openCheckin()} style={{ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }}>
            <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>지금 체크인하기</Text>
          </Press>
        ) : null}
      </View>
    );
  const tone = (v: string) => (v === '통증' ? { bg: c.dangerBg, fg: c.danger } : v === '뻐근' ? { bg: c.warnBg, fg: c.warn } : { bg: c.page, fg: c.muted });
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.facts}>
        <Fact c={c} label="컨디션" value={`${ck.condition} / 10`} strong />
        <Fact c={c} label="수면" value={ck.sleepQuality ? (SLEEP_QUALITY_LEVELS[ck.sleepQuality - 1] ?? ck.sleep) : ck.sleep} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ck.parts.map((p) => {
          const t = tone(p.value);
          return (
            <View key={p.label} style={{ backgroundColor: t.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: t.fg, fontSize: 12, fontWeight: '500' }}>
                {p.label} {p.value}
              </Text>
            </View>
          );
        })}
      </View>
      {ck.details.length ? (
        <View style={styles.facts}>
          {ck.details.map((x) => (
            <Fact key={x.label} c={c} label={x.label} value={x.value} />
          ))}
        </View>
      ) : null}
      {ck.note ? <Memo c={c} text={ck.note} /> : null}
    </View>
  );
}

function Fact({ c, label, value, strong }: { c: Palette; label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ minWidth: 72, flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: strong ? 18 : 15, fontWeight: strong ? '700' : '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
function Memo({ c, text, label, bare }: { c: Palette; text: string; label?: string; bare?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 6 }, bare ? { marginTop: 8 } : [styles.memo, { backgroundColor: c.page }]]}>
      <View style={{ marginTop: 2 }}>
        <Icon name="clipboard-list" size={14} color={c.muted} />
      </View>
      <Text style={{ flex: 1, color: c.ink, opacity: 0.8, fontSize: 13, lineHeight: 19 }} numberOfLines={3}>
        {label ? <Text style={{ color: c.muted, fontWeight: '600' }}>{label} · </Text> : null}
        {text}
      </Text>
    </View>
  );
}
function Empty({ c, children }: { c: Palette; children: string }) {
  return <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>{children}</Text>;
}
/** 불러오는 동안 — 웹 Waiting(줄 뼈대 셋) */
function Waiting({ c }: { c: Palette }) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="불러오는 중이에요">
      {[100, 80, 60].map((w) => (
        <View key={w} style={{ height: 16, width: `${w}%`, borderRadius: 6, backgroundColor: c.page }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  retry: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' },
  card: { borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: -12, marginTop: -8 },
  tiles: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 16, paddingBottom: 20 },
  tile: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  warnDot: { position: 'absolute', right: -4, top: -4, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  detailHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headLink: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12 },
  detailBody: { paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  box: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  memo: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barThin: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  meals: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  meal: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
});

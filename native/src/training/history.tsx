import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { volumeIn } from '@/lib/workout/summarize';
import type { ExerciseHistory, HistoryDay, HistoryKind } from '@/lib/workout/history';
import { act } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { s } from '~/training/screen';
import { Press } from '~/shell/press';

/**
 * 운동 하나의 지난 기록(웹 components/exercise-history.tsx ExerciseHistoryPanel 과 같은 셈 · exercise-history.exerciseHistory) — 그날 운동 기록
 * (app/training/day/[date].tsx)과 운동 라이브러리(app/library)가 같이 쓴다.
 */

const WEEKDAY = '일월화수목금토';
const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d, week: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
};

/** '2026-09-20' → '9월 20일'. 올해가 아니면 해를 붙인다(웹 exercise-history.tsx 와 같다) */
function dayLabel(key: string) {
  const d = dayOf(key);
  return d.year === new Date().getFullYear() ? `${d.month}월 ${d.day}일` : `${d.year}년 ${d.month}월 ${d.day}일`;
}
/** 그날 한 양 — '1,240kg' · '45회' · '3분 20초' */
function volumeText(kind: HistoryKind, value: number, unit: WeightUnit) {
  if (kind === 'weight') return `${Math.round(volumeIn(value, unit)).toLocaleString('ko-KR')}${unit}`;
  if (kind === 'reps') return `${value.toLocaleString('ko-KR')}회`;
  return formatSeconds(value);
}
/** 하루를 한 줄로 — 세트별로 남긴 날은 '62.5kg×8 · 12회', 아니면 요약 */
function dayText(day: HistoryDay, unit: WeightUnit) {
  if (!day.sets) return formatAmount(day, unit) ?? '한 것으로 표시함';
  return day.sets
    .map((x) => {
      const w = x.weightKg != null && x.weightKg > 0 ? formatWeight(x.weightKg, unit) : null;
      const amount = x.holdSeconds != null ? formatSeconds(x.holdSeconds) : x.reps != null ? `${x.reps}회` : '?';
      return w ? `${w}×${amount.replace('회', '')}` : amount;
    })
    .join(' · ');
}

/** 최근 기록 몇 개 · 흐름 막대 몇 개(웹과 같다) */
const SHOWN = 8;
const TREND_POINTS = 12;

/** 지난 기록 — 내 메모 · 최고 기록 셋 · 볼륨 흐름(막대를 누르면 그날 값) · 최근 날짜별 기록. 열 때 받는다 */
export function HistoryPanel({
  exerciseId,
  excludeSessionId,
  unit,
  c,
  hideNote = false,
  recentFirst = false,
}: {
  exerciseId: string;
  /** 운동 화면에서 열었으면 지금 하는 판 — 그 판의 세트는 '지난 기록'이 아니라 뺀다(웹 ExerciseHistoryPanel 과 같다) */
  excludeSessionId?: string;
  unit: WeightUnit;
  c: Palette;
  /** 운동 영상 상세(2026-10-31) — 메모는 위 '운동 방법'에서 고치므로 여기선 안 보인다 */
  hideNote?: boolean;
  /** 운동 영상 상세 — 최근 날짜별 세트를 먼저, 최고 기록 · 흐름은 [기록 요약]을 펴서 */
  recentFirst?: boolean;
}) {
  type Got = { history: ExerciseHistory; note: string | null } | { error: string };
  /* 어느 운동 · 판 · 몇 번째 받기의 답인지 같이 — 앞 운동의 답이 다음 운동 밑에 잠깐도 안 보이게 */
  const [got, setGot] = useState<{ key: string; r: Got } | null>(null);
  const [tries, setTries] = useState(0);
  const key = `${exerciseId}|${excludeSessionId ?? ''}|${tries}`;
  const [more, setMore] = useState(false);
  const [summary, setSummary] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void act<{ history: ExerciseHistory; note: string | null }>('exercise-history.exerciseHistory', { exerciseId, excludeSessionId }).then((r) => {
      if (alive) setGot({ key: `${exerciseId}|${excludeSessionId ?? ''}|${tries}`, r });
    });
    return () => {
      alive = false;
    };
  }, [exerciseId, excludeSessionId, tries]);

  if (got?.key !== key) return <Text style={[s.small, s.center, { color: c.muted, paddingVertical: 24 }]}>기록을 불러오는 중…</Text>;
  /* 못 받음 — 0번으로 보이지 않게 따로, 이 칸만 다시 받는다 */
  if ('error' in got.r)
    return (
      <View style={[st.empty, { backgroundColor: c.card, gap: 8, alignItems: 'center' }]}>
        <Text style={[s.small, s.center, { color: c.muted }]}>내 기록을 불러오지 못했어요. {got.r.error}</Text>
        <Press onPress={() => setTries((n) => n + 1)} accessibilityRole="button" style={s.textBtn}>
          <Text style={[s.smallBold, { color: c.link }]}>다시 불러오기</Text>
        </Press>
      </View>
    );

  const { history } = got.r;
  const note = hideNote ? null : got.r.note;
  const { kind, days } = history;
  const noteBox = note ? (
    <View style={[s.box, { backgroundColor: c.card, boxShadow: c.float, gap: 4 }]}>
      <Text style={[s.smallBold, { color: c.muted }]}>내 메모</Text>
      <Text selectable style={[s.body, { color: c.ink }]}>
        {note}
      </Text>
    </View>
  ) : null;
  if (days.length === 0) {
    return (
      <View style={{ gap: 12 }}>
        {noteBox}
        <Text style={[s.small, s.center, st.empty, { color: c.muted, backgroundColor: c.card }]}>아직 이 운동을 한 기록이 없어요. 운동을 마치면 여기에 쌓여요.</Text>
      </View>
    );
  }

  const w = (kg: number) => formatWeight(kg, unit) ?? '';
  const first =
    kind === 'weight' && history.bestWeight
      ? { label: '최고 무게', value: w(history.bestWeight.kg), sub: dayLabel(history.bestWeight.date) }
      : kind === 'hold' && history.bestHold
        ? { label: '가장 오래', value: formatSeconds(history.bestHold.seconds), sub: dayLabel(history.bestHold.date) }
        : history.bestReps
          ? { label: '한 세트 최다', value: `${history.bestReps.reps}회`, sub: dayLabel(history.bestReps.date) }
          : { label: '마지막', value: dayLabel(days[0].date), sub: null };
  const second =
    kind === 'weight' && history.bestSet
      ? { label: '추정 1RM', value: w(history.bestSet.e1rm), sub: `${w(history.bestSet.weightKg)} × ${history.bestSet.reps}회` }
      : { label: '모두', value: `${history.total}번`, sub: `마지막 ${dayLabel(days[0].date)}` };
  const third = { label: '최근 4주', value: `${history.last28}번`, sub: kind === 'weight' && history.bestSet ? `모두 ${history.total}번` : null };

  /* 흐름에 올리는 날 — 양을 셀 수 있는 최근 날들, 막대는 오래된 것부터 */
  const trendDays = days.filter((x): x is HistoryDay & { volume: number } => x.volume != null).slice(0, TREND_POINTS);
  const trend = [...trendDays].reverse();
  const max = Math.max(...trend.map((x) => x.volume), 1);
  const peak = trend.reduce((a, b) => (b.volume > a.volume ? b : a), trend[0]);
  const picked = hover == null ? null : trend[hover];
  const shown = more ? days : days.slice(0, SHOWN);

  const summaryEl = (
    <>
      {/* 세 칸 높이를 같게(셋째 칸은 밑 줄이 없을 때가 많다 — 가운데로 떠 보였다) */}
      <View style={[s.row, { alignItems: 'stretch' }]}>
        {[first, second, third].map((x) => (
          <View key={x.label} style={[st.stat, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[s.tiny, { color: c.muted }]}>{x.label}</Text>
            <Text numberOfLines={1} style={[s.bodyBold, { color: c.ink }]}>
              {x.value}
            </Text>
            {x.sub ? (
              <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                {x.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {trend.length >= 2 ? (
        <View style={{ gap: 6 }}>
          <View style={s.between}>
            <Text style={[s.tiny, { color: c.muted }]}>
              {picked ? dayLabel(picked.date) : `${kind === 'weight' ? '볼륨(무게×횟수)' : kind === 'reps' ? '횟수 합' : '버틴 시간 합'} · 최근 ${trend.length}번`}
            </Text>
            <Text style={[s.tiny, { color: picked ? c.link : c.muted, fontWeight: picked ? '700' : '400' }]}>
              {picked ? volumeText(kind, picked.volume, unit) : `가장 많이 ${volumeText(kind, peak.volume, unit)}`}
            </Text>
          </View>
          <View style={[st.bars, { borderBottomColor: c.line }]}>
            {trend.map((x, i) => (
              <Press
                key={x.date}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setHover(hover === i ? null : i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(x.date)} ${volumeText(kind, x.volume, unit)}`}
                style={st.barSlot}
              >
                <View
                  style={[
                    st.barFill,
                    { height: `${Math.max(4, (x.volume / max) * 100)}%`, backgroundColor: c.action, opacity: hover != null && hover !== i ? 0.35 : 1 },
                  ]}
                />
              </Press>
            ))}
          </View>
          <View style={s.between}>
            <Text style={[s.tiny, { color: c.muted }]}>{dayLabel(trend[0].date)}</Text>
            <Text style={[s.tiny, { color: c.muted }]}>{dayLabel(trend[trend.length - 1].date)}</Text>
          </View>
          {trendDays.some((x) => x.approx) ? (
            <Text style={[s.tiny, { color: c.muted }]}>세트를 하나씩 남기지 않은 날은 요약(세트 × 횟수 × 가장 무거운 무게)으로 어림했어요.</Text>
          ) : null}
        </View>
      ) : null}

    </>
  );
  const recentEl = (
      <View style={{ gap: 6 }}>
        <Text style={[s.smallBold, { color: c.muted }]}>최근 기록</Text>
        <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
          {shown.map((x, i) => (
            <View key={x.date} style={[st.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
              <View style={s.between}>
                <Text style={[s.smallBold, { color: c.ink }]}>{dayLabel(x.date)}</Text>
                {x.volume != null ? (
                  <Text style={[s.tiny, { color: c.muted }]}>
                    {x.approx ? '약 ' : ''}
                    {volumeText(kind, x.volume, unit)}
                  </Text>
                ) : null}
              </View>
              <Text style={[s.tiny, { color: c.muted }]}>{dayText(x, unit)}</Text>
            </View>
          ))}
        </View>
        {!more && days.length > SHOWN ? (
          <Press onPress={() => setMore(true)} accessibilityRole="button" style={[s.textBtn, { alignSelf: 'center' }]}>
            <Text style={[s.smallBold, { color: c.link }]}>{days.length - SHOWN}번 더 보기</Text>
          </Press>
        ) : null}
      </View>
  );
  if (recentFirst)
    return (
      <View style={{ gap: 16 }}>
        {noteBox}
        {recentEl}
        <Press onPress={() => setSummary((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: summary }} style={[s.textBtn, { alignSelf: 'flex-start' }]}>
          <Text style={[s.smallBold, { color: c.link }]}>{summary ? '기록 요약 접기' : '기록 요약 · 최고 기록 · 흐름 보기'}</Text>
        </Press>
        {summary ? summaryEl : null}
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
      {noteBox}
      {summaryEl}
      {recentEl}
    </View>
  );
}

const st = StyleSheet.create({
  empty: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 32, overflow: 'hidden' },
  stat: { flex: 1, minWidth: 0, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  bars: { height: 64, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barFill: { width: '60%', maxWidth: 22, minWidth: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  list: { borderRadius: 12, overflow: 'hidden' },
  listRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
});

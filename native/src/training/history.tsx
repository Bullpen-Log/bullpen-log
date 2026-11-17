import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { volumeIn } from '@/lib/workout/summarize';
import type { ExerciseHistory, HistoryDay, HistoryKind, HistorySet } from '@/lib/workout/history';
import { BAND_ROLE_LABEL, MASS_MODES, type LoadMode } from '@/lib/workout/load/contract';
import { bandText } from '@/lib/workout/load/band-catalog';
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
/**
 * EX-LOAD01 — 이 운동의 기록 계약(서버가 지금 장비로 정한 loadMode). 칸이 없으면(옛 서버) 예전처럼 본다.
 * massMode: kg 카드 · 추정 1RM 을 보여도 되는 운동(자유 중량 · 기구 설정값 · 도구 무게). setKg: 세트 줄에 kg 을 써도 되는 운동(섞임은 무게 성분이 있다).
 */
function loadView(mode: LoadMode | undefined) {
  return {
    massMode: mode == null || MASS_MODES.has(mode),
    setKg: mode == null || MASS_MODES.has(mode) || mode === 'combined',
  };
}

/** 하루를 한 줄로 — 세트별로 남긴 날은 '62.5kg×8 · 12회', 아니면 요약. kg 을 받지 않는 운동이면 kg 을 쓰지 않는다 */
function dayText(day: HistoryDay, unit: WeightUnit, setKg: boolean) {
  if (!day.sets) return (setKg ? formatAmount(day, unit) : formatAmount({ ...day, weightKg: null }, unit)) ?? '한 것으로 표시함';
  return day.sets
    .map((x) => {
      const w = setKg && x.weightKg != null && x.weightKg > 0 ? formatWeight(x.weightKg, unit) : null;
      const amount = x.holdSeconds != null ? formatSeconds(x.holdSeconds) : x.reps != null ? `${x.reps}회` : '?';
      /* 서로 다른 무게 도구(왼 · 오른)는 한 숫자가 없어도 그대로, 기구 이름은 앞에(견줌은 같은 기구끼리만) */
      const parts =
        !w && setKg && x.parts?.length
          ? x.parts.map((p) => `${p.side === 'left' ? '왼 ' : p.side === 'right' ? '오른 ' : ''}${formatWeight(p.kg, unit)}${p.count != null && p.count > 1 ? `×${p.count}` : ''}`).join(' · ')
          : null;
      const main = w ? `${w}×${amount.replace('회', '')}` : parts ? `${parts} · ${amount}` : amount;
      return x.setupLabel ? `${x.setupLabel} · ${main}` : main;
    })
    .join(' · ');
}

/** 그날 쓴 밴드 — 역할 · 상표 · 계열 · 단계(같은 묶음은 한 번). kg 으로 바꾸지 않는다 */
function bandLines(sets: readonly HistorySet[] | null): string[] {
  if (!sets) return [];
  const out = new Set<string>();
  for (const x of sets) {
    if (!x.band) continue;
    const role = x.band.role === 'resistance' || x.band.role === 'assistance' ? BAND_ROLE_LABEL[x.band.role] : '역할 모름';
    out.add(`${role} · ${x.band.bands.length ? x.band.bands.map((b) => bandText(b)).join(' + ') : '어느 밴드인지 모름'}`);
  }
  return [...out];
}

/**
 * 계산에서 뺀 kg — 확인 전(unverified) · 맞지 않음(incompatible)인 세트의 원래 값. 지우지 않고 흐린 한 줄로만(같은 값 · 같은 까닭은 한 번).
 */
function excludedLines(sets: readonly HistorySet[] | null, unit: WeightUnit): string[] {
  if (!sets) return [];
  const out = new Set<string>();
  for (const x of sets) {
    if (x.rawKg == null) continue;
    if (x.loadStatus === 'unverified') out.add(`기록된 무게 ${formatWeight(x.rawKg, unit)} · 확인 전이라 계산에서 뺐어요`);
    else if (x.loadStatus === 'incompatible') out.add(`기록된 무게 ${formatWeight(x.rawKg, unit)} · 맞지 않는 무게라 계산에서 뺐어요`);
  }
  return [...out];
}

/** 최근 기록 몇 개 · 흐름 막대 몇 개(웹과 같다) */
const SHOWN = 8;
const TREND_POINTS = 12;

/** 지난 기록 — 내 메모 · 최고 기록 셋 · 볼륨 흐름(막대를 누르면 그날 값) · 최근 날짜별 기록. 열 때 받는다 */
export function HistoryPanel({
  exerciseId,
  excludeSessionId,
  beforeDate,
  unit,
  c,
  hideNote = false,
  recentFirst = false,
}: {
  exerciseId: string;
  /** 운동 화면에서 열었으면 지금 하는 판 — 그 판의 세트는 '지난 기록'이 아니라 뺀다(웹 ExerciseHistoryPanel 과 같다) */
  excludeSessionId?: string;
  beforeDate?: string;
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
  const key = `${exerciseId}|${excludeSessionId ?? ''}|${beforeDate ?? ''}|${tries}`;
  const [more, setMore] = useState(false);
  const [summary, setSummary] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void act<{ history: ExerciseHistory; note: string | null }>('exercise-history.exerciseHistory', { exerciseId, excludeSessionId, beforeDate }).then((r) => {
      if (alive) setGot({ key: `${exerciseId}|${excludeSessionId ?? ''}|${beforeDate ?? ''}|${tries}`, r });
    });
    return () => {
      alive = false;
    };
  }, [exerciseId, excludeSessionId, beforeDate, tries]);

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
  /*
   * EX-LOAD01 — kg 카드 · 추정 1RM 은 계약이 무게를 받는 운동에서만(밴드 · 맨몸 · 섞임이면 서버가 실수로 weight 를 줘도 안 보인다).
   * 1RM 은 서버가 허락한 운동(e1rmEligible)만 — 칸이 없으면(옛 서버) 예전처럼.
   */
  const lv = loadView(history.loadMode);
  const kind: HistoryKind = history.kind === 'weight' && !lv.massMode ? 'reps' : history.kind;
  /* weight 를 reps 로 바꿔 보인 날의 양은 kg 합이라 횟수로 읽히면 틀린다 — 그때는 흐름 막대를 안 그린다 */
  const volumeTrusted = !(history.kind === 'weight' && !lv.massMode);
  const showE1rm = kind === 'weight' && history.e1rmEligible !== false;
  const { days } = history;
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
    showE1rm && history.bestSet
      ? { label: '추정 1RM', value: w(history.bestSet.e1rm), sub: `${w(history.bestSet.weightKg)} × ${history.bestSet.reps}회` }
      : { label: '모두', value: `${history.total}번`, sub: `마지막 ${dayLabel(days[0].date)}` };
  const third = { label: '최근 4주', value: `${history.last28}번`, sub: showE1rm && history.bestSet ? `모두 ${history.total}번` : null };

  /* 흐름에 올리는 날 — 양을 셀 수 있는 최근 날들, 막대는 오래된 것부터 */
  const trendDays = volumeTrusted ? days.filter((x): x is HistoryDay & { volume: number } => x.volume != null).slice(0, TREND_POINTS) : [];
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

      {kind === 'weight' && history.comparison && (history.comparison.setupLabel || history.comparison.otherSetupDays > 0) ? (
        <Text style={[s.tiny, { color: c.muted }]}>
          {history.comparison.setupLabel ? `최고 · 볼륨은 ${history.comparison.setupLabel} 기준이에요.` : '최고 · 볼륨은 가장 최근 기구 기준이에요.'}
          {history.comparison.otherSetupDays > 0 ? ` 다른 기구로 한 ${history.comparison.otherSetupDays}일은 견주지 않았어요.` : ''}
        </Text>
      ) : null}

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
      {/* EX-LOAD01 — 확인 전 · 맞지 않는 kg 이 있던 날 수(값은 지우지 않았다 — 최근 기록 줄에 흐리게) */}
      {history.excludedKgDays ? (
        <Text style={[s.tiny, { color: c.muted }]}>확인 전이거나 맞지 않는 무게가 있던 {history.excludedKgDays}일은 그 무게를 계산에서 뺐어요.</Text>
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
                {x.volume != null && volumeTrusted ? (
                  <Text style={[s.tiny, { color: c.muted }]}>
                    {x.approx ? '약 ' : ''}
                    {volumeText(kind, x.volume, unit)}
                  </Text>
                ) : null}
              </View>
              <Text style={[s.tiny, { color: c.muted }]}>{dayText(x, unit, lv.setKg)}</Text>
              {bandLines(x.sets).map((line) => (
                <Text key={line} style={[s.tiny, { color: c.ink }]}>
                  {line}
                </Text>
              ))}
              {excludedLines(x.sets, unit).map((line) => (
                <Text key={line} style={[s.tiny, { color: c.muted, fontStyle: 'italic' }]}>
                  {line}
                </Text>
              ))}
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

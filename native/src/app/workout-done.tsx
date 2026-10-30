import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, round1, type WeightUnit } from '@/lib/units';
import { totalVolumeKg, volumeIn } from '@/lib/workout/summarize';
import { trainingEffortLevel } from '@/lib/training-effort';
import type { NewRecord } from '@/lib/workout/bests';
import type { WorkoutDone } from '@/lib/workout/done-load';
import type { FinishReceipt } from '@/lib/workout/finish';
import { rpc, RpcError } from '~/lib/rpc';
import { takeWorkoutDone } from '~/workout/done-prefetch';
import { outboxOwner } from '~/workout/outbox';
import { IntensitySlider } from '~/workout/intensity-slider';
import { Sheet } from '~/workout/sheets';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { leaveTo } from '~/shell/web-nav';
import { consumeOrgReturn } from '~/org/space-store';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 운동 완료(2026-10-30 확정 시안 09) — 종료 확인(08) 다음의 최종 화면 하나. 재료는 웹과 같은 곳(app-workout.loadAppWorkoutDone → lib/workout/done-load.ts).
 *
 * 차례: 완료 카드(세션 · 날짜 · 체크 스탬프 · 본운동 시간 · 기록한 세트 · 저장된 운동 수, 숫자는 처음부터 다 보인다) → 실제 새 최고(있을 때만) →
 * 프로그램 결과(다음 세션 · 이번 세션 유지 · 전체 완료 · 확인 필요) → 접힌 '오늘 한 운동'(펼치면 운동별 · 총 볼륨, 누르면 세트 표) → 오늘 체감 강도
 * (남긴 값은 읽기만, 없을 때만 슬라이더로 따로 저장) → [완료].
 *
 * 이 화면은 읽기다 — 종료를 다시 부르지 않고 일차 · 기록을 만들지 않는다. 쓰는 것은 둘뿐: 사람이 고른 그날 강도(rateWorkoutEffort)와,
 * 결과를 확인하지 못했을 때 사람이 누르는 '다시 확인'(recoverFinish — 같은 판 · 같은 제출로 한 번만 반영된다).
 * 스탬프는 마치기에서 막 넘어왔을 때(?fresh=1) 한 번만 — 다시 열거나 다시 읽어도 되풀이하지 않는다.
 */
type Loaded = ({ ok: true } & WorkoutDone) | { ok: false; to: string };
type Row = WorkoutDone['rows'][number];

/** 스탬프를 이미 보인 판 — 같은 판을 다시 읽어도 되풀이하지 않는다 */
const stamped = new Set<string>();

export default function WorkoutDoneScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [programOpen, setProgramOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (takeWorkoutDone<Loaded>(id ?? '') ?? rpc<Loaded>('app-workout.loadAppWorkoutDone', id ?? '')).then(
      (r) => {
        if (!alive) return;
        if (r.ok) {
          setData(r);
          setFailed(false);
        } else leaveTo(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
        setFailed(true);
      }
    );
    return () => {
      alive = false;
    };
  }, [id, tries]);

  /* 결과를 확인하지 못했을 때 — 같은 판의 뒤처리만 다시(종료를 다시 부르지 않는다), 그다음 요약을 다시 읽는다 */
  const recheck = async () => {
    if (!data || checking) return;
    setChecking(true);
    setCheckError(null);
    try {
      const r = await rpc<{ ok: true; receipt: FinishReceipt } | { error: string }>('workout.recoverFinish', { sessionId: data.sessionId });
      if ('error' in r) setCheckError(r.error);
      setTries((n) => n + 1);
    } catch {
      setCheckError('확인하지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setChecking(false);
    }
  };

  /* 조직 공간에서 연 운동이면 그 공간으로, 아니면 트레이닝 — 다시 마치기가 아니다 */
  const close = () => {
    if (!consumeOrgReturn()) leaveTo('/training');
  };

  const header = (
    <View style={[st.bar, { paddingTop: inset.top + 4 }]}>
      <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={close} style={st.barBtn}>
        <Icon name="x" size={22} color={c.ink} />
      </Press>
      <Text accessibilityRole="header" style={[st.barTitle, { color: c.ink }]}>
        운동 완료
      </Text>
      <View style={st.barBtn} />
    </View>
  );

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        {header}
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 60, paddingHorizontal: 24 }}>
          {failed ? (
            <>
              <Text style={[st.section, { color: c.ink, textAlign: 'center' }]}>요약을 불러오지 못했어요</Text>
              <Text style={[st.body, { color: c.muted, textAlign: 'center' }]}>
                운동을 마친 기록은 그대로예요. 요약만 다시 불러와요.
              </Text>
              <Press accessibilityRole="button" onPress={() => (setFailed(false), setTries((n) => n + 1))} style={[st.pill, { backgroundColor: c.action }]}>
                <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>요약 다시 불러오기</Text>
              </Press>
              <Press accessibilityRole="button" onPress={close} style={st.pill}>
                <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>트레이닝으로</Text>
              </Press>
            </>
          ) : (
            <>
              <ActivityIndicator />
              <Text style={[st.small, { color: c.muted }]}>오늘 기록을 정리하는 중이에요</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  const records = data.rows.filter((r) => r.record);
  const volume = data.volumeKg;
  const program = data.program;
  const outcome = program?.outcome ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {header}
      <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 14 }, READABLE]}>
        {/* 완료 카드 — 숫자는 처음부터, 스탬프만 짧게 */}
        <View style={[st.card, { backgroundColor: withAlpha(c.action, 0.08) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[st.small, { color: c.link, fontWeight: '700' }]}>{data.themeLabel}</Text>
              <Text style={[st.hero, { color: c.ink }]}>오늘 운동 끝</Text>
              <Text style={[st.small, { color: c.muted }]}>{data.dateLabel}</Text>
            </View>
            <Stamp sessionId={data.sessionId} play={fresh === '1'} c={c} />
          </View>
          <View style={st.stats}>
            <Stat label="본운동 시간" value={`${data.minutes}`} unit="분" c={c} />
            <Stat label="기록한 세트" value={`${data.setCount}`} unit="세트" c={c} />
          </View>
          <View style={st.savedRow}>
            <Icon name="circle-check" size={15} color={c.link} />
            <Text style={[st.small, { color: c.muted }]}>{data.rows.length}개 운동 기록 저장됨</Text>
          </View>
        </View>

        {/* 실제 새 최고 — 있을 때만 */}
        {records.length > 0 ? (
          <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[st.bodyBold, { color: c.ink }]}>새 최고 기록 {records.length}개</Text>
            {records.map(({ id: rid, title, record }) =>
              record ? (
                <View key={rid} style={st.lineRow}>
                  <Text numberOfLines={2} style={[st.body, { flex: 1, color: c.ink }]}>
                    {title}
                  </Text>
                  <Text style={[st.bodyBold, { color: c.link, fontVariant: ['tabular-nums'] }]}>
                    {record.before != null ? `${recordText(record.kind, record.before, unit)} → ` : ''}
                    {recordText(record.kind, record.value, unit)}
                  </Text>
                </View>
              ) : null
            )}
          </View>
        ) : null}

        {/* 프로그램 결과 — 다음 세션 · 이번 세션 유지 · 전체 완료 · 확인 필요 */}
        {program && outcome && outcome.state !== 'none' ? (
          <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Press accessibilityRole="button" accessibilityState={{ expanded: programOpen }} onPress={() => setProgramOpen((v) => !v)} style={st.fold}>
              <View style={[st.badge, { backgroundColor: withAlpha(c.action, 0.12) }]}>
                <Icon name={outcome.state === 'pending' || outcome.state === 'unknown' ? 'circle-alert' : 'layers'} size={18} color={c.link} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[st.small, { color: c.muted }]}>{outcome.name}</Text>
                <Text style={[st.bodyBold, { color: c.ink }]}>
                  {outcome.state === 'done'
                    ? '프로그램을 다 마쳤어요'
                    : outcome.state === 'advanced'
                      ? `${outcome.label} 완료`
                      : outcome.state === 'below'
                        ? `${outcome.label} 유지`
                        : '진행 상태 확인 필요'}
                </Text>
                <Text style={[st.small, { color: c.muted }]}>
                  {outcome.state === 'done'
                    ? '다음 프로그램은 트레이닝에서 골라요.'
                    : outcome.state === 'advanced'
                      ? outcome.nextLabel
                        ? `다음: ${outcome.nextLabel}`
                        : '다음 세션으로'
                      : outcome.state === 'below'
                        ? `기준 ${outcome.needed}세트 중 ${outcome.logged}세트 · 기록은 남았어요. 다음에도 이 세션을 해요.`
                        : '운동은 마쳤어요. 프로그램 진행 결과만 아직 확인하지 못했어요.'}
                </Text>
              </View>
              <Icon name={programOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
            </Press>
            {outcome.state === 'pending' || outcome.state === 'unknown' ? (
              <Press accessibilityRole="button" disabled={checking} onPress={() => void recheck()} style={st.inlineBtn}>
                {checking ? <ActivityIndicator /> : <Text style={[st.bodyBold, { color: c.link }]}>다시 확인</Text>}
              </Press>
            ) : null}
            {programOpen && program.lifts.length > 0 ? (
              <View style={{ gap: 6 }}>
                {program.lifts.map((l) => (
                  <View key={l.title} style={{ gap: 2 }}>
                    <Text numberOfLines={2} style={[st.small, { color: c.ink, fontWeight: '600' }]}>
                      {l.title}
                    </Text>
                    <Text style={[st.small, { color: c.muted }]}>
                      추천 {formatWeight(l.suggested, unit)} · 실제 최고 {formatWeight(l.actual, unit) ?? '—'}
                      {l.rir != null ? ` · 마지막 세트 여유 ${l.rir >= 4 ? '4+' : l.rir}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {programOpen && program.note ? <Text style={[st.small, { color: c.muted }]}>{program.note}</Text> : null}
          </View>
        ) : null}

        {/* 오늘 한 운동 — 접힌 채로 */}
        <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Press accessibilityRole="button" accessibilityState={{ expanded: listOpen }} onPress={() => setListOpen((v) => !v)} style={st.fold}>
            <View style={{ flex: 1 }}>
              <Text style={[st.bodyBold, { color: c.ink }]}>오늘 한 운동</Text>
              <Text style={[st.small, { color: c.muted }]}>{data.rows.length}개 운동</Text>
            </View>
            <Icon name={listOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
          </Press>
          {listOpen ? (
            <View>
              {data.rows.map((r, i) => (
                <Press
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityHint="세트별 기록 보기"
                  onPress={() => setDetail(r)}
                  style={[st.exRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[st.body, { color: c.ink }]}>{r.title}</Text>
                    <Text style={[st.small, { color: c.muted }]}>{rowSummary(r, unit)}</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={c.muted} />
                </Press>
              ))}
              {volume > 0 ? (
                <Text style={[st.small, { color: c.muted, paddingTop: 8 }]}>
                  총 볼륨 {round1(volumeIn(volume, unit)).toLocaleString('ko-KR')}
                  {unit} · 무게 × 횟수의 합
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Effort
          data={data}
          onSaved={(n) => setData((d) => (d ? { ...d, dailyNote: { intensity: n, memo: d.dailyNote?.memo ?? null } } : d))}
          onRecheck={() => void recheck()}
          onReload={() => setTries((n) => n + 1)}
          checking={checking}
          c={c}
        />
        {checkError ? <Text style={[st.small, { color: c.danger }]}>{checkError}</Text> : null}

        {data.nutritionLine ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => leaveTo(data.nutritionLine!.href)}
            style={({ pressed }) => [st.nudge, { backgroundColor: pressed ? c.chip : c.card }]}
          >
            <View style={{ marginTop: 2 }}>
              <Icon name="utensils" size={17} color={c.link} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.small, { color: c.muted }]}>{data.nutritionLine.title}</Text>
              <Text style={[st.bodyBold, { color: c.ink }]}>{data.nutritionLine.text}</Text>
              {data.nutritionLine.example ? <Text style={[st.small, { color: c.muted }]}>{data.nutritionLine.example}</Text> : null}
            </View>
            <Icon name="chevron-right" size={16} color={c.muted} />
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[st.foot, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line, backgroundColor: c.page }, READABLE]}>
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [st.done, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={{ color: c.onAction, fontSize: 18, fontWeight: '700' }}>완료</Text>
        </Pressable>
      </View>

      <Sheet fit open={detail != null} onClose={() => setDetail(null)} title={detail?.title ?? ''} description={detail ? metaLine(detail) : undefined} c={c}>
        {detail ? <SetTable row={detail} unit={unit} c={c} /> : null}
      </Sheet>
    </View>
  );
}

/** 기록 값 — 102.5kg · 15회 · 1분 05초 */
function recordText(kind: NewRecord['kind'], value: number, unit: WeightUnit) {
  if (kind === 'weight') return formatWeight(value, unit) ?? `${value}kg`;
  if (kind === 'reps') return `${value}회`;
  return formatSeconds(value);
}

/**
 * 운동 한 줄 — 세트 수 · 최고 중량(또는 시간 · 횟수 합) · 그 운동의 볼륨. 최고 중량과 가장 많이 한 횟수는 서로 다른 세트일 수 있어
 * '50kg × 10회' 같은 한 세트로 묶지 않는다(실제 조합은 세트 표).
 */
function rowSummary(r: Row, unit: WeightUnit): string {
  const sets = r.sets ?? [];
  const parts = [`${r.summary.setsDone}세트`];
  const w = formatWeight(r.summary.weightKg, unit);
  if (w) parts.push(`최고 ${w}${r.meta?.perHand ? ' (한 손)' : ''}`);
  else if (r.meta?.isHold) {
    const best = Math.max(0, ...sets.map((x) => x.holdSeconds ?? 0));
    if (best > 0) parts.push(r.meta.inMinutes ? `최고 ${Math.round(best / 60)}분` : `최고 ${formatSeconds(best)}`);
  } else {
    const total = sets.reduce((n, x) => n + (x.reps ?? 0), 0);
    if (total > 0) parts.push(`총 ${total}회${r.meta?.perSide ? ' (좌우 각각)' : ''}`);
  }
  const vol = totalVolumeKg(sets.map((x) => ({ ...x, exerciseId: r.id })));
  if (vol > 0) parts.push(`볼륨 ${round1(volumeIn(vol, unit)).toLocaleString('ko-KR')}${unit}`);
  return parts.join(' · ');
}

function metaLine(r: Row): string | undefined {
  const m = r.meta;
  if (!m) return undefined;
  const out = [m.perHand ? '무게는 한 손 기준' : null, m.perSide ? '좌우 각각' : null, m.inMinutes ? '시간은 분' : null].filter(Boolean);
  return out.length ? out.join(' · ') : undefined;
}

/** 세트 표 — 원래 세트 번호 · 무게 · 횟수 또는 시간 · 여유. 읽기만 */
function SetTable({ row, unit, c }: { row: Row; unit: WeightUnit; c: Palette }) {
  const sets = [...(row.sets ?? [])].sort((a, b) => a.setNo - b.setNo);
  if (sets.length === 0) return <Text style={[st.body, { color: c.muted }]}>세트 기록을 읽지 못했어요.</Text>;
  return (
    <View style={{ gap: 0 }}>
      <View style={[st.tableRow, { borderBottomColor: c.line }]}>
        <Text style={[st.cellNo, st.small, { color: c.muted }]}>세트</Text>
        <Text style={[st.cell, st.small, { color: c.muted }]}>무게</Text>
        <Text style={[st.cell, st.small, { color: c.muted }]}>{row.meta?.isHold ? '시간' : '횟수'}</Text>
        <Text style={[st.cell, st.small, { color: c.muted }]}>여유</Text>
      </View>
      {sets.map((x) => (
        <View
          key={x.setNo}
          style={[st.tableRow, { borderBottomColor: c.line }]}
          accessible
          accessibilityLabel={`${x.setNo}번 세트, ${formatWeight(x.weightKg, unit) ?? '무게 없음'}, ${amountText(x, row)}, 여유 ${x.rir == null ? '안 답함' : x.rir >= 4 ? '4개 이상' : `${x.rir}개`}`}
        >
          <Text style={[st.cellNo, st.body, { color: c.ink }]}>{x.setNo}</Text>
          <Text style={[st.cell, st.body, { color: c.ink }]}>{formatWeight(x.weightKg, unit) ?? '—'}</Text>
          <Text style={[st.cell, st.body, { color: c.ink }]}>{amountText(x, row)}</Text>
          <Text style={[st.cell, st.body, { color: x.rir == null ? c.muted : c.ink }]}>{x.rir == null ? '—' : x.rir >= 4 ? '4+' : x.rir}</Text>
        </View>
      ))}
    </View>
  );
}

function amountText(x: { reps: number | null; holdSeconds: number | null }, row: Row): string {
  if (x.holdSeconds != null) return row.meta?.inMinutes ? `${Math.round(x.holdSeconds / 60)}분` : formatSeconds(x.holdSeconds);
  return x.reps != null ? `${x.reps}회` : '—';
}

/**
 * 오늘 체감 강도 — 남긴 값이 있으면 숫자로 읽기만. 마치기에서 제출했는데 확인이 안 됐으면 '확인 필요'. 없을 때만 '남기기'로 슬라이더를 열고
 * [저장]으로 따로 남긴다(저장 전 값은 초안 — 이 판 · 이 계정에 묶어 폰에 둔다). 실패해도 운동 완료와 상관없다.
 */
function Effort({
  data,
  onSaved,
  onRecheck,
  onReload,
  checking,
  c,
}: {
  data: Extract<Loaded, { ok: true }>;
  onSaved: (n: number) => void;
  onRecheck: () => void;
  /** 그날 값을 다시 읽는다(읽기만) — 저장 답을 못 받았을 때 */
  onReload: () => void;
  checking: boolean;
  c: Palette;
}) {
  const key = `bullpen-done-effort:${outboxOwner() ?? 'anon'}:${data.sessionId}`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(key).then(
      (raw) => {
        const n = raw ? Number(raw) : NaN;
        if (Number.isInteger(n) && n >= 1 && n <= 10) {
          setDraft(n);
          setOpen(true);
        }
      },
      () => undefined
    );
  }, [key]);
  const change = (n: number | null) => {
    setDraft(n);
    void (n == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, String(n))).catch(() => undefined);
  };

  const saved = data.dailyNote;
  if (saved) {
    const level = trainingEffortLevel(saved.intensity);
    return (
      <View style={[st.box, st.effortRow, { backgroundColor: c.card, boxShadow: c.float }]} accessible accessibilityLabel={`오늘 체감 강도 ${saved.intensity} / 10, ${level?.label ?? ''}`}>
        <Text style={[st.body, { flex: 1, color: c.muted }]}>오늘 체감 강도</Text>
        <Text style={[st.bodyBold, { color: c.ink }]}>
          {level?.label ?? ''} · {saved.intensity}/10
        </Text>
        {kept ? <Text style={[st.small, { color: c.muted, width: '100%' }]}>이미 남긴 값을 그대로 뒀어요.</Text> : null}
      </View>
    );
  }
  if (data.noteOutcome.state === 'pending') {
    return (
      <View style={[st.box, { backgroundColor: c.warnBg }]}>
        <Text style={[st.bodyBold, { color: c.ink }]}>강도 · 메모 확인 필요</Text>
        <Text style={[st.small, { color: c.muted }]}>
          마칠 때 고른 강도{data.noteOutcome.submitted?.intensity != null ? `(${data.noteOutcome.submitted.intensity})` : ''}{data.noteOutcome.submitted?.memo ? '와 메모' : ''}가 저장됐는지 아직 확인하지 못했어요.
        </Text>
        <Press accessibilityRole="button" disabled={checking} onPress={onRecheck} style={st.inlineBtn}>
          {checking ? <ActivityIndicator /> : <Text style={[st.bodyBold, { color: c.link }]}>다시 확인</Text>}
        </Press>
      </View>
    );
  }

  const save = async () => {
    if (draft == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<{ ok: true; intensity: number; existing?: boolean } | { error: string }>('workout.rateWorkoutEffort', {
        sessionId: data.sessionId,
        intensity: draft,
      });
      if ('error' in r) {
        setError(r.error);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void AsyncStorage.removeItem(key).catch(() => undefined);
      setKept(r.existing === true);
      onSaved(r.intensity);
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      /* 답을 못 받았다 — 저장됐을 수도 있어 그날 값부터 다시 읽는다(초안은 그대로, 다시 저장해도 이미 남은 값이 있으면 그 값을 돌려준다) */
      setError('저장했는지 확인하지 못했어요. 고른 값은 그대로예요. 그날 값을 다시 읽어 볼게요.');
      onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={st.fold}>
        <Text style={[st.body, { flex: 1, color: c.ink }]}>오늘 체감 강도</Text>
        <Text style={[st.bodyBold, { color: c.link }]}>{open ? '접기' : '남기기'}</Text>
      </Press>
      {open ? (
        <View style={{ gap: 10 }}>
          <IntensitySlider value={draft} onChange={change} disabled={busy} />
          {error ? <Text style={[st.small, { color: c.danger }]}>{error}</Text> : null}
          <Press
            accessibilityRole="button"
            accessibilityState={{ disabled: draft == null || busy, busy }}
            disabled={draft == null || busy}
            onPress={() => void save()}
            style={[st.saveBtn, { backgroundColor: draft == null ? c.chip : c.action }]}
          >
            {busy ? <ActivityIndicator color={c.onAction} /> : null}
            <Text style={{ color: draft == null ? c.muted : c.onAction, fontSize: 16, fontWeight: '700' }}>{busy ? '저장 중' : '저장'}</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

/** 완료 스탬프 — 막 마치고 왔을 때 한 번(약 0.48초), 동작 줄이기면 멈춘 모습. 내용 · 단추는 기다리지 않는다 */
function Stamp({ sessionId, play, c }: { sessionId: string; play: boolean; c: Palette }) {
  const reduced = useReducedMotion();
  const first = play && !stamped.has(sessionId);
  const scale = useSharedValue(first && !reduced ? 0.6 : 1);
  const turn = useSharedValue(first && !reduced ? -12 : 0);
  useEffect(() => {
    if (!first) return;
    stamped.add(sessionId);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduced) return;
    scale.set(withSequence(withTiming(1.08, { duration: 260 }), withSpring(1, { damping: 12, stiffness: 260 })));
    turn.set(withTiming(0, { duration: 480 }));
  }, [first, reduced, sessionId, scale, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={[st.stamp, { backgroundColor: c.action, boxShadow: '0 6px 14px rgba(10,84,160,0.28)' }, style]} accessible accessibilityLabel="완료">
      <Icon name="check" size={30} color={c.onAction} />
    </Animated.View>
  );
}

function Stat({ label, value, unit, c }: { label: string; value: string; unit: string; c: Palette }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      <Text style={[st.small, { color: c.muted }]}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
        {value}
        <Text style={{ color: c.muted, fontSize: 15, fontWeight: '600' }}> {unit}</Text>
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  barBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  card: { borderRadius: 22, padding: 18, gap: 14 },
  hero: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  stats: { flexDirection: 'row', gap: 12 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stamp: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: 18, padding: 14, gap: 8 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  effortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 52 },
  inlineBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  saveBtn: { minHeight: 50, borderRadius: 25, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  nudge: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  foot: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', alignSelf: 'center' },
  done: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  cellNo: { width: 48 },
  cell: { flex: 1, fontVariant: ['tabular-nums'] },
  section: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});

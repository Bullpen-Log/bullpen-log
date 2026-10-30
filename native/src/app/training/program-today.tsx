import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ProgramCardProps } from '@/lib/program/load';
import { sessionTitle } from '@/lib/program/program';
import { formatWeight } from '@/lib/units';
import { withJosa } from '@/lib/korean';
import { ExerciseMedia, HowTo } from '~/armcare/parts';
import { act } from '~/mechanics/parts';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import { toast } from '~/shell/toast';
import { useTrainingToday } from '~/training/program/data';
import { FlowBar, FooterActions, type FooterAction } from '~/videos/flow-parts';
import { Sheet, SwapSheet } from '~/workout/sheets';

/**
 * 오늘 운동 준비(2026-10-30 확정 시안 05) — 등록한 프로그램의 오늘 세션을 읽기만 한다. 판(세션)은 [운동 시작]에서만 연다(program.startProgramWorkout —
 * 그 순간의 판정 · 장비 · 운동으로 다시 확인해 얼리거나, 열린 판이면 그 판을 이어 간다).
 *
 * 차례: 오늘 상태 · 세션 이름 · 날짜 → 순서대로 운동 목록(처방 · 추천 무게 · 첫 무게 미정 · 묶음 · 선택 · 오늘 조정) → 아래 단추 하나.
 *   - 추천 무게는 추천일 뿐 — 실제 무게는 운동 중에 적는다. 첫 무게가 없으면 '미정'(0kg 이 아니다). 한 손 · 좌우 각각을 따로 적는다.
 *   - 세트마다 무게가 다른 날(% 방식)은 서버가 준 세트 목표를 그대로 표로 — 처방 글을 다시 읽어 만들지 않는다.
 *   - 운동을 누르면 설명 · 영상 · 추천 까닭 · 세트 표, 거기서 '오늘만 바꾸기'(고정 운동 바꾸기와 다른 동작). 바꾼 뒤에는 서버가 다시 만든 처방을 읽는다.
 *   - 컨디션 조정(태그 · 뺀 운동)은 보이기만 하고 여기서 풀지 않는다.
 *   - 체크인 필요 · 쉬는 날 · 할 운동 없음이면 시작 단추 대신 그 다음 행동.
 */
type Row = ProgramCardProps['rows'][number];

export default function ProgramTodayScreen() {
  const c = usePalette();
  const unit = useWeightUnit();
  const { data, failed, reload } = useTrainingToday();
  const [detail, setDetail] = useState<Row | null>(null);
  const [swap, setSwap] = useState<Row | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* [운동 시작]을 두 번 눌러 운동 화면이 둘 쌓이지 않게 — 화면으로 돌아오면 풀린다 */
  const opening = useRef(false);

  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
      if (focused.current) void reload();
      focused.current = true;
    }, [reload])
  );

  const p = data?.programCard ?? null;

  const start = () => {
    if (opening.current) return;
    opening.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    /* 판을 여는 것은 운동 화면이 한다(?start=program) — 워밍업 · 쉬는 날 · 이미 열린 판은 서버 답대로 */
    router.push({ pathname: '/workout' as never, params: { start: 'program' } });
  };

  const restore = async (r: Row) => {
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('program.swapProgramToday', { variant: r.variant, exerciseId: null });
    setPending(false);
    if ('error' in res) return setError(res.error);
    setDetail(null);
    toast('원래 운동으로 되돌렸어요');
    await reload();
  };

  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <FlowBar title="오늘 운동" onBack={() => router.back()} />
        <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
          {failed ? (
            <>
              <Text style={[st.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
              <Press accessibilityRole="button" onPress={() => void reload()} style={st.inline}>
                <Text style={[st.bodyBold, { color: c.link }]}>다시 불러오기</Text>
              </Press>
            </>
          ) : data ? (
            <Text style={[st.body, { color: c.muted, textAlign: 'center' }]}>진행 중인 프로그램이 없어요.</Text>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );
  }

  const finished = p.todayState === 'finished';
  const active = p.todayState === 'active';
  const going = p.kind === 'go' && !finished;
  /* 상태 한 줄 */
  const status = finished
    ? '오늘 운동을 마쳤어요'
    : active
      ? '운동 중이에요 · 이어서 해요'
      : p.kind === 'needCheckin'
        ? '체크인이 필요해요'
        : p.kind === 'rest' || p.kind === 'painWait'
          ? '오늘은 쉬어요'
          : p.kind === 'otherMode'
            ? '오늘은 다른 운동을 했어요'
            : p.kind === 'done'
              ? '프로그램을 다 마쳤어요'
              : !p.canStart
                ? '오늘 할 수 있는 운동이 없어요'
                : '오늘 할 수 있어요';
  const sub =
    p.kind === 'rest'
      ? p.restText
      : p.kind === 'painWait'
        ? `통증 기록이 있어 ${withJosa(p.dayLabel, '은/는')} 기다려요.`
        : p.kind === 'needCheckin'
          ? '체크인을 남기면 오늘 몸 상태에 맞춰 정해요. 아래 목록은 바뀔 수 있어요.'
          : finished && p.nextLabel
            ? `다음: ${sessionTitle(p.nextLabel)}`
            : null;

  let primary: FooterAction | null = null;
  let secondary: FooterAction | null = null;
  if (active) primary = { label: '운동 이어하기', icon: 'play', onPress: () => router.push('/workout' as Href) };
  else if (going && p.canStart) primary = { label: '운동 시작', icon: 'play', onPress: start };
  else if (p.kind === 'needCheckin') primary = { label: '체크인하기', onPress: () => openCheckin('/training/program-today') };
  else primary = { label: '트레이닝으로', onPress: () => router.back() };
  if (p.kind === 'rest') {
    secondary = {
      label: '그래도 오늘 할래요',
      onPress: () =>
        Alert.alert(p.restText ? `${p.restText}. 그래도 할까요?` : '그래도 할까요?', '가볍게 하고, 아프면 바로 멈춰요.', [
          { text: '취소', style: 'cancel' },
          {
            text: '할래요',
            onPress: () =>
              void (async () => {
                setPending(true);
                const r = await act<{ ok: true }>('program.overrideProgramRest');
                setPending(false);
                if ('error' in r) return setError(r.error);
                await reload();
              })(),
          },
        ]),
    };
  }
  const preview = !going || !p.canStart;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <FlowBar title="오늘 운동" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 14, paddingBottom: 24 }, READABLE]}>
        <View style={[st.card, { backgroundColor: withAlpha(c.action, 0.08) }]}>
          <Text style={[st.small, { color: c.link, fontWeight: '700' }]}>{p.name}</Text>
          <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
            {sessionTitle(p.dayLabel)}
          </Text>
          <Text style={[st.small, { color: c.muted }]}>{todayLabel(data?.today)}</Text>
          <View style={[st.status, { backgroundColor: c.card }]}>
            <Icon name={finished ? 'circle-check' : active ? 'play' : p.kind === 'go' && p.canStart ? 'target' : 'info'} size={16} color={c.link} />
            <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>{status}</Text>
          </View>
          {sub ? <Text style={[st.small, { color: c.muted }]}>{sub}</Text> : null}
          {going && p.caution ? <Text style={[st.small, { color: c.ink }]}>{p.caution}</Text> : null}
        </View>

        {p.rows.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={[st.section, { color: c.ink }]}>운동 {p.rows.length}개</Text>
            {preview ? <Text style={[st.small, { color: c.muted }]}>미리 보기예요. 실제 운동은 시작할 때 다시 확인해요.</Text> : null}
            <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
              {p.rows.map((r, i) => (
                <Press
                  key={`${r.id}-${i}`}
                  accessibilityRole="button"
                  accessibilityHint="설명 · 추천 까닭 · 세트별 무게 보기"
                  onPress={() => setDetail(r)}
                  style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                >
                  <Text style={[st.num, { color: c.muted }]}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      {r.optional ? <Text style={[st.tag, { color: c.muted, backgroundColor: c.chip }]}>선택</Text> : null}
                      {r.swappedFrom ? <Text style={[st.tag, { color: c.link, backgroundColor: withAlpha(c.action, 0.1) }]}>오늘만 바꿈</Text> : null}
                      <Text numberOfLines={2} style={[st.bodyBold, { color: c.ink, flexShrink: 1 }]}>
                        {r.title}
                      </Text>
                    </View>
                    <Text style={[st.small, { color: c.muted }]}>
                      {r.amount}
                      {r.perSide ? ' · 좌우 각각' : ''}
                    </Text>
                    {r.contrast ? <Text style={[st.small, { color: c.muted }]}>{r.contrast}</Text> : null}
                    {r.tag ? <Text style={[st.small, { color: c.warn }]}>{r.tag}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', maxWidth: 110 }}>
                    {r.kg != null ? (
                      <>
                        <Text style={[st.bodyBold, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{formatWeight(r.kg, unit)}</Text>
                        <Text style={[st.small, { color: c.muted }]}>추천{r.perHand ? ' · 한 손' : ''}</Text>
                      </>
                    ) : r.first ? (
                      <Text style={[st.small, { color: c.muted, textAlign: 'right' }]}>첫 무게 미정</Text>
                    ) : null}
                  </View>
                </Press>
              ))}
            </View>
          </View>
        ) : null}

        {p.dropped.length > 0 ? (
          <View style={[st.box, { backgroundColor: c.chip }]}>
            <Text style={[st.bodyBold, { color: c.ink }]}>오늘 몸 상태로 뺀 운동</Text>
            {p.dropped.map((d) => (
              <Text key={d.title} style={[st.small, { color: c.muted }]}>
                {d.title} · {d.reason}
              </Text>
            ))}
          </View>
        ) : null}
        {pending ? <ActivityIndicator /> : null}
        {error ? <Text style={[st.small, { color: c.danger }]}>{error}</Text> : null}
      </ScrollView>
      <FooterActions primary={primary} secondary={secondary} />

      <Sheet fit open={detail != null} onClose={() => setDetail(null)} title={detail?.title ?? ''} description={detail ? `${detail.slotLabel} · ${detail.line}` : undefined} c={c}>
        {detail ? (
          <View style={{ gap: 12 }}>
            <ExerciseMedia key={detail.id} path={detail.videoPath} referenceVideoId={detail.referenceVideoId} thumbUrl={detail.thumbUrl} aspectRatio={detail.aspectRatio} />
            {detail.substituteFor ? <Text style={[st.body, { color: c.ink }]}>오늘은 {detail.substituteFor} 대신이에요.</Text> : null}
            {detail.reason ? <Text style={[st.body, { color: c.ink }]}>{detail.reason}</Text> : null}
            <SetTable row={detail} unit={unit} c={c} />
            {detail.warmup ? <Text style={[st.small, { color: c.muted }]}>준비: {detail.warmup}</Text> : null}
            <Text style={[st.small, { color: c.muted }]}>추천 무게는 시작점이에요. 실제 무게와 횟수는 운동 중에 직접 적어요.</Text>
            {!finished && !active ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Press
                  accessibilityRole="button"
                  disabled={pending}
                  onPress={() => {
                    const r = detail;
                    setDetail(null);
                    setSwap(r);
                  }}
                  style={[st.action, { backgroundColor: c.chip }]}
                >
                  <Text style={[st.bodyBold, { color: c.ink }]}>오늘만 바꾸기</Text>
                </Press>
                {detail.swappedFrom ? (
                  <Press accessibilityRole="button" disabled={pending} onPress={() => void restore(detail)} style={[st.action, { backgroundColor: c.chip }]}>
                    <Text style={[st.bodyBold, { color: c.ink }]}>원래대로</Text>
                  </Press>
                ) : null}
              </View>
            ) : null}
            <HowTo key={`how-${detail.id}`} exerciseId={detail.id} method={null} inline c={c} />
          </View>
        ) : null}
      </Sheet>
      {swap ? (
        <SwapSheet
          open
          current={{ id: swap.id, title: swap.title }}
          mode="replace"
          inPlanIds={p.rows.map((r) => r.id)}
          program={{
            variant: swap.variant,
            swappedFromId: swap.swappedFrom?.id ?? null,
            onSwapped: () => {
              setSwap(null);
              toast('오늘만 바꿨어요');
              void reload();
            },
          }}
          onClose={() => setSwap(null)}
          c={c}
        />
      ) : null}
    </View>
  );
}

function todayLabel(key: string | undefined): string {
  if (!key) return '';
  const d = new Date(`${key}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(d);
}

/**
 * 세트별 목표 — 서버가 준 세트 목표 그대로. 세트마다 무게가 있는 날(% 방식)만 세트 줄에 무게를 적고, 추천 하나뿐인 날은 위에 한 번만 적는다
 * (한 줄 무게를 모든 세트에 복제하지 않는다). 무게가 없으면 비운다(0kg 아님).
 */
function SetTable({ row, unit, c }: { row: Row; unit: 'kg' | 'lb'; c: Palette }) {
  if (!row.sets || row.sets.length === 0) return null;
  const perSet = row.sets.some((x) => x.kg != null);
  return (
    <View style={[st.box, { backgroundColor: c.chip, gap: 0 }]}>
      {!perSet ? (
        <Text style={[st.small, { color: c.muted, paddingBottom: 6 }]}>
          {row.kg != null ? `추천 무게 ${formatWeight(row.kg, unit)}${row.perHand ? ' (한 손)' : ''}` : row.first ? '첫 무게는 첫 세트에서 정해요' : '무게 없이 하는 운동이에요'}
        </Text>
      ) : null}
      {row.sets.map((x, i) => (
        <View key={i} style={[st.setRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <Text style={[st.small, { width: 52, color: c.muted }]}>{i + 1}세트</Text>
          <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>
            {x.reps}회{x.plus ? '+' : ''}
            {row.perSide ? ' (좌우 각각)' : ''}
          </Text>
          {perSet ? (
            <Text style={[st.body, { color: x.kg != null ? c.ink : c.muted, fontVariant: ['tabular-nums'] }]}>
              {x.kg != null ? `${formatWeight(x.kg, unit)}${row.perHand ? ' 한 손' : ''}` : '—'}
            </Text>
          ) : null}
        </View>
      ))}
      {row.sets.some((x) => x.plus) ? <Text style={[st.small, { color: c.muted, paddingTop: 6 }]}>+ 는 할 수 있는 만큼 · 처방대로 몇 개 남기고</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 6 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginTop: 6 },
  section: { fontSize: 18, fontWeight: '700' },
  list: { borderRadius: 18, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, minHeight: 60 },
  num: { width: 18, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], paddingTop: 1 },
  tag: { fontSize: 11, fontWeight: '600', borderRadius: 8, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  box: { borderRadius: 14, padding: 12, gap: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  action: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  inline: { minHeight: 44, justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});

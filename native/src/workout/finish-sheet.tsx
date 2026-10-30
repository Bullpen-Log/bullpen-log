import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { summarizeSets } from '@/lib/workout/summarize';
import type { RunExercise } from '@/lib/workout/run-exercises';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { IntensitySlider } from './intensity-slider';
import type { PendingSet, ShownSet } from './outbox';
import { Sheet } from './sheets';

/**
 * 운동 종료 확인(2026-10-30 확정 시안 08) — 실제 요약 → 선택 강도(1~10 슬라이더) → 접힌 메모 → 필요할 때만 여유 횟수 · 전송 상태 → [운동 마치기].
 *
 * 값(강도 · 메모 초안 · 처리 상태)은 운동 화면(workout.tsx)이 들고 있다 — 창을 닫고 운동으로 돌아갔다 다시 열어도 그대로다. 이 창은 그리기만 한다.
 *   - 강도 · 메모 둘 다 비워도 마칠 수 있다. 메모만은 저장하지 못하는 계약이라 강도를 고르라고 그 자리에서 알리고 막는다(메모를 버리지 않는다).
 *   - 그날 이미 남긴 강도 · 메모가 있으면 읽어 보인다. 손대지 않으면 다시 보내지 않는다(빈 메모로 덮지 않음).
 *   - 못 보낸 세트가 있으면 일반 마치기를 잠그고 무엇이 왜 남았는지 · 다시 보내기를 보인다. '이 세트 빼고 마치기'는 자세히 안에.
 *   - 마치는 중 · 결과 확인 중에는 입력을 잠그고 초안은 남긴다.
 */
export type FinishPhase = 'idle' | 'busy' | 'unknown' | 'checking';

export type FinishProgram = {
  planned: number;
  logged: number;
  needed: number;
  reached: boolean;
  day: number;
  /** 마지막 처방 세트의 '몇 개 더?'를 안 답한 운동 */
  unanswered: { exerciseId: string; title: string; setNo: number }[];
} | null;

export function FinishSheet({
  open,
  sets,
  exercises,
  minutes,
  pending,
  offline,
  persistFailed,
  program,
  phase,
  error,
  intensity,
  memo,
  dailyNote,
  unit,
  onIntensity,
  onMemo,
  onRir,
  onRetrySend,
  onExclude,
  onFinish,
  onCheck,
  onClose,
  c,
}: {
  open: boolean;
  sets: ShownSet[];
  exercises: RunExercise[];
  minutes: number;
  pending: readonly PendingSet[];
  offline: boolean;
  persistFailed: boolean;
  program: FinishProgram;
  phase: FinishPhase;
  error: string | null;
  intensity: number | null;
  memo: string;
  dailyNote: { intensity: number; memo: string | null } | null;
  unit: WeightUnit;
  onIntensity: (v: number | null) => void;
  onMemo: (t: string) => void;
  onRir: (exerciseId: string, setNo: number, n: number) => void;
  onRetrySend: () => void;
  onExclude: () => void;
  onFinish: () => void;
  onCheck: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const [memoOpen, setMemoOpen] = useState(memo.trim() !== '');
  const [listOpen, setListOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const locked = phase !== 'idle';
  const memoNeedsIntensity = memo.trim() !== '' && intensity == null;
  const exerciseCount = summarizeSets(sets).length;
  const titleOf = new Map(exercises.map((e) => [e.id, e.title]));
  const canFinish = !locked && pending.length === 0 && !memoNeedsIntensity;

  const footer = (
    <View style={{ gap: 8 }}>
      {error ? <Text style={[st.note, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
      {phase === 'unknown' || phase === 'checking' ? (
        <View style={[st.box, { backgroundColor: c.warnBg }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>종료 결과를 확인하고 있어요</Text>
          <Text style={[st.small, { color: c.muted }]}>
            {phase === 'checking'
              ? '서버에서 이 운동이 마쳐졌는지 보는 중이에요. 적은 강도와 메모는 그대로 있어요.'
              : '응답을 받지 못했어요. 이 운동이 마쳐졌는지 먼저 확인해요. 다시 마치기를 누르지 않아도 돼요.'}
          </Text>
          <Press accessibilityRole="button" disabled={phase === 'checking'} onPress={onCheck} style={st.inlineBtn}>
            {phase === 'checking' ? <ActivityIndicator /> : <Text style={[st.bodyBold, { color: c.link }]}>결과 다시 확인</Text>}
          </Press>
        </View>
      ) : null}
      <Pressable
        onPress={() => canFinish && onFinish()}
        disabled={!canFinish}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canFinish, busy: phase === 'busy' }}
        style={({ pressed }) => [st.big, { backgroundColor: canFinish || phase === 'busy' ? c.action : c.chip, opacity: pressed ? 0.85 : 1 }]}
      >
        {phase === 'busy' ? <ActivityIndicator color={c.onAction} /> : null}
        <Text style={[st.bigText, { color: canFinish || phase === 'busy' ? c.onAction : c.muted }]}>
          {phase === 'busy' ? '마치는 중' : '운동 마치기'}
        </Text>
      </Pressable>
      <Press onPress={onClose} disabled={phase === 'busy' || phase === 'checking'} accessibilityRole="button" style={st.textBtn}>
        <Text style={[st.bodyBold, { color: c.link }]}>운동으로 돌아가기</Text>
      </Press>
    </View>
  );

  return (
    <Sheet open={open} onClose={onClose} title="운동을 마칠까요?" description="기록한 세트로 오늘 운동을 정리해요." footer={footer} c={c}>
      {/* 요약 — 본운동 시간(창을 연 때 기준, 최종 값은 서버가 다시 셈) · 기록한 세트 · 운동 수 */}
      <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={st.stats}>
          <Stat label="본운동" value={`${minutes}`} unit="분" c={c} />
          <Stat label="기록한 세트" value={`${sets.length}`} unit="세트" c={c} />
          <Stat label="운동" value={`${exerciseCount}`} unit="개" c={c} />
        </View>
        {pending.length > 0 ? (
          <Text style={[st.small, { color: c.muted }]}>세트 {pending.length}개는 아직 서버로 가는 중이라 이 수에 포함돼 있어요.</Text>
        ) : null}
        {sets.length > 0 ? (
          <Press accessibilityRole="button" accessibilityState={{ expanded: listOpen }} onPress={() => setListOpen((v) => !v)} style={st.fold}>
            <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>운동별 기록 보기</Text>
            <Icon name={listOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
          </Press>
        ) : (
          <Text style={[st.body, { color: c.muted }]}>기록한 세트가 없어요. 이대로 마치면 오늘 운동 기록은 남지 않아요.</Text>
        )}
        {listOpen
          ? summarizeSets(sets).map((sum) => {
              const mine = sets.filter((x) => x.exerciseId === sum.exerciseId).sort((a, b) => a.setNo - b.setNo);
              return (
                <View key={sum.exerciseId} style={[st.exRow, { borderTopColor: c.line }]}>
                  <Text style={[st.bodyBold, { color: c.ink }]}>{titleOf.get(sum.exerciseId) ?? '목록에서 뺀 운동'}</Text>
                  <Text style={[st.small, { color: c.muted }]}>
                    {mine.map((x) => setText(x, unit)).join(' · ')}
                  </Text>
                </View>
              );
            })
          : null}
      </View>

      {program ? (
        <View style={[st.box, { backgroundColor: c.chip }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>
            {program.reached ? `${program.day}번 세션 기준을 채웠어요` : `${program.day}번 세션 기준 ${program.needed}세트 중 ${program.logged}세트`}
          </Text>
          <Text style={[st.small, { color: c.muted }]}>
            {program.reached
              ? '마치면 다음 세션으로 넘어가요. 최종 결과는 서버가 확인해요.'
              : '기준에 못 미쳐도 오늘 기록은 남아요. 다음에도 이 세션을 이어서 해요.'}
          </Text>
        </View>
      ) : null}

      {/* 체감 강도 — 선택 */}
      <View style={{ gap: 6 }}>
        <Text style={[st.section, { color: c.ink }]}>
          오늘 얼마나 힘들었나요? <Text style={[st.small, { color: c.muted, fontWeight: '400' }]}>선택</Text>
        </Text>
        {dailyNote ? (
          <Text style={[st.small, { color: c.muted }]}>
            오늘 이미 강도({dailyNote.intensity})를 남겼어요. 바꿀 때만 골라요. 고르지 않으면 그대로 둬요.
          </Text>
        ) : (
          <Text style={[st.small, { color: c.muted }]}>오늘 운동 전체를 합쳐서 떠올려 주세요. 나중에 남겨도 돼요.</Text>
        )}
        <IntensitySlider value={intensity} onChange={onIntensity} disabled={locked} />
      </View>

      {/* 메모 — 접혀서 시작 */}
      <View style={{ gap: 6 }}>
        <Press accessibilityRole="button" accessibilityState={{ expanded: memoOpen }} disabled={locked} onPress={() => setMemoOpen((v) => !v)} style={st.fold}>
          <Icon name="sticky-note" size={16} color={c.muted} />
          <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>
            메모 {memo.trim() ? '· 작성 중' : dailyNote?.memo ? '· 이미 남긴 메모 있음' : ''}
          </Text>
          <Text style={[st.small, { color: c.muted }]}>선택</Text>
          <Icon name={memoOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
        </Press>
        {memoOpen ? (
          <>
            {dailyNote?.memo ? (
              <Text style={[st.small, { color: c.muted }]}>이미 남긴 메모: “{dailyNote.memo}” — 새로 적으면 그 메모로 바뀌어요. 비워 두면 그대로 둬요.</Text>
            ) : null}
            <TextInput
              value={memo}
              onChangeText={(t) => onMemo(t.slice(0, 1000))}
              editable={!locked}
              multiline
              maxLength={1000}
              placeholder="무거웠던 곳, 잘 된 동작 같은 것"
              placeholderTextColor={c.muted}
              accessibilityLabel="오늘 운동 메모"
              style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
            />
            <Text style={[st.tiny, { color: c.muted, textAlign: 'right' }]}>{memo.length}/1000</Text>
          </>
        ) : null}
        {memoNeedsIntensity ? (
          <Text accessibilityRole="alert" style={[st.note, { color: c.warn, backgroundColor: c.warnBg }]}>
            메모는 강도와 함께 저장돼요. 위에서 강도를 골라 주세요.
          </Text>
        ) : null}
      </View>

      {/* 여유 횟수 — 안 답한 마지막 세트만, 선택 */}
      {program && program.unanswered.length > 0 ? (
        <View style={[st.box, { backgroundColor: c.chip }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>몇 개 더 할 수 있었나요? <Text style={[st.small, { color: c.muted, fontWeight: '400' }]}>선택</Text></Text>
          <Text style={[st.small, { color: c.muted }]}>답하지 않아도 마칠 수 있어요. 다음 무게를 정하는 데 써요.</Text>
          {program.unanswered.map((u) => (
            <View key={`${u.exerciseId}-${u.setNo}`} style={{ gap: 6 }}>
              <Text style={[st.small, { color: c.ink }]}>
                {u.title} · {u.setNo}세트
              </Text>
              <View style={st.rirRow}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <Press
                    key={n}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`${u.title} ${u.setNo}세트, ${n === 4 ? '4개 이상' : `${n}개`} 더`}
                    onPress={() => onRir(u.exerciseId, u.setNo, n)}
                    style={[st.rirKey, { backgroundColor: c.card }]}
                  >
                    <Text style={[st.bodyBold, { color: c.ink }]}>{n === 4 ? '4+' : n}</Text>
                  </Press>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* 전송 대기 — 있을 때만. 일반 마치기는 잠긴다 */}
      {pending.length > 0 ? (
        <View style={[st.box, { backgroundColor: persistFailed ? c.danger + '14' : c.warnBg }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>
            {persistFailed ? `세트 ${pending.length}개를 이 기기에 저장하지 못했어요` : `세트 ${pending.length}개가 아직 서버로 가지 않았어요`}
          </Text>
          <Text style={[st.small, { color: c.muted }]}>
            {persistFailed
              ? '지금은 앱 메모리에만 있어요. 앱을 닫기 전에 다시 보내 주세요.'
              : offline
                ? '신호가 없어요. 신호가 잡히면 저절로 보내져요. 보내진 뒤에 마칠 수 있어요.'
                : '보내는 중이에요. 끝나면 마칠 수 있어요.'}
          </Text>
          <Press accessibilityRole="button" disabled={locked} onPress={onRetrySend} style={st.inlineBtn}>
            <Text style={[st.bodyBold, { color: c.link }]}>지금 다시 보내기</Text>
          </Press>
          <Press accessibilityRole="button" accessibilityState={{ expanded: pendingOpen }} onPress={() => setPendingOpen((v) => !v)} style={st.fold}>
            <Text style={[st.small, { flex: 1, color: c.muted }]}>자세히</Text>
            <Icon name={pendingOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
          </Press>
          {pendingOpen ? (
            <View style={{ gap: 6 }}>
              {pending.map((p) => (
                <Text key={`${p.exerciseId}-${p.setNo}`} style={[st.small, { color: c.ink }]}>
                  {titleOf.get(p.exerciseId) ?? '운동'} · {p.setNo}번 세트 · {setText(p, unit)}
                </Text>
              ))}
              <Text style={[st.small, { color: c.muted }]}>
                계속 보내지지 않으면 이 세트를 빼고 마칠 수 있어요. 서버에 이미 들어간 세트인지 먼저 확인하고, 없는 것만 빼요.
              </Text>
              <Press accessibilityRole="button" disabled={locked} onPress={onExclude} style={st.inlineBtn}>
                <Text style={[st.bodyBold, { color: c.danger }]}>이 세트 빼고 마치기</Text>
              </Press>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function setText(x: { weightKg: number | null; reps: number | null; holdSeconds: number | null; rir?: number | null }, unit: WeightUnit) {
  const w = x.weightKg != null ? `${formatWeight(x.weightKg, unit)} × ` : '';
  const amount = x.holdSeconds != null ? formatSeconds(x.holdSeconds) : `${x.reps ?? '?'}회`;
  const rir = x.rir != null ? ` · 여유 ${x.rir >= 4 ? '4+' : x.rir}` : '';
  return `${w}${amount}${rir}`;
}

function Stat({ label, value, unit, c }: { label: string; value: string; unit: string; c: Palette }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      <Text style={[st.small, { color: c.muted }]}>{label}</Text>
      <Text style={[st.stat, { color: c.ink }]}>
        {value}
        <Text style={[st.small, { color: c.muted }]}> {unit}</Text>
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, gap: 10 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  box: { borderRadius: 14, padding: 14, gap: 6 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  exRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  section: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 12 },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  input: { minHeight: 88, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  rirRow: { flexDirection: 'row', gap: 6 },
  rirKey: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inlineBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  big: { minHeight: 56, borderRadius: 28, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontSize: 18, fontWeight: '700' },
  textBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

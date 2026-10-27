import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { DRILL_EQUIPMENT } from '@/lib/exercise-meta';
import type { FocusView } from '@/lib/mechanics/program';
import { SKILL_STAGES } from '@/lib/mechanics/progression';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { act } from '~/mechanics/parts';

export function MechanicsEquipment({ equipment, reload, c }: { equipment: string[]; reload: () => Promise<unknown>; c: Palette }) {
  const [chosen, setChosen] = useState(equipment);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const save = async () => {
    setPending(true);
    setError(null);
    const r = await act<{ ok: true }>('mechanics.saveMechanicsEquipment', [
      '맨몸',
      '야구공',
      ...chosen.filter((e) => e !== '맨몸' && e !== '야구공'),
    ]);
    if ('error' in r) setError(r.error);
    else await reload();
    setPending(false);
  };
  return (
    <View style={{ gap: 10, padding: 14, borderWidth: 1, borderColor: c.line, borderRadius: 16 }}>
      <Text style={{ color: c.ink, fontWeight: '600' }}>오늘 메카닉 장비</Text>
      <Text style={{ color: c.muted }}>맨몸·야구공 외에 실제 사용할 장비를 확인해 주세요.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DRILL_EQUIPMENT.filter((e) => e !== '맨몸' && e !== '야구공').map((e) => (
          <Press
            key={e}
            disabled={pending}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: chosen.includes(e) }}
            onPress={() => setChosen((v) => (v.includes(e) ? v.filter((x) => x !== e) : [...v, e]))}
            style={{ padding: 12, borderRadius: 12, backgroundColor: chosen.includes(e) ? c.sky + '22' : c.chip }}
          >
            <Text style={{ color: c.ink }}>{e}</Text>
          </Press>
        ))}
      </View>
      <Press disabled={pending} accessibilityRole="button" onPress={() => void save()} style={{ padding: 12 }}>
        <Text style={{ color: c.link, fontWeight: '600' }}>{pending ? '저장 중' : '사용 장비 저장'}</Text>
      </Press>
      {error ? <Text style={{ color: c.warn }}>{error}</Text> : null}
    </View>
  );
}
export function FocusProgress({ focus, reload, c }: { focus: FocusView; reload: () => Promise<unknown>; c: Palette }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const run = async (action: string, input: unknown) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await act<{ ok: true }>(action, input);
    if ('error' in r) setError(r.error);
    else await reload();
    setPending(false);
  };
  const button = (label: string, action: string, input: unknown, disabled = false) => (
    <Press
      key={label}
      disabled={pending || disabled}
      accessibilityRole="button"
      onPress={() => void run(action, input)}
      style={{ padding: 12, borderRadius: 12, backgroundColor: c.chip, opacity: pending || disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: c.link, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
  const skill = focus.skill;
  if (!skill)
    return focus.canConvert ? (
      <View style={{ gap: 8 }}>
        <Text style={{ color: c.muted }}>누적 수행 기록은 보존하고 새 진행 기준으로 전환해요. 시작할 단계를 확인해 주세요.</Text>
        {button('기초에서 새 기준 적용', 'mechanics.convertMechanicsFocus', { reportId: focus.reportId, mode: 'basic' })}
        {button('이전 연습 단계에서 재확인', 'mechanics.convertMechanicsFocus', { reportId: focus.reportId, mode: 'review' })}
        {error ? <Text style={{ color: c.warn }}>{error}</Text> : null}
      </View>
    ) : null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.muted }}>누적 {focus.done}회 연습 · 횟수로 단계가 바뀌지 않아요.</Text>
      <Text style={{ color: c.muted }}>아래 확인은 자가 평가이며 3D 측정으로 검증된 개선과 구분해요.</Text>
      {skill.blockedReason ? <Text style={{ color: c.warn }}>{skill.blockedReason}</Text> : null}
      {skill.elements.map((e) => (
        <View key={e.fault} style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={{ color: c.ink, fontWeight: '600' }}>
            {e.element} · {e.stage}
            {e.finished ? ' 자가 확인 완료' : ' 연습 중'}
          </Text>
          <Text style={{ color: c.ink }}>동작 목표: {e.cue}</Text>
          <Text style={{ color: c.muted }}>{e.reason}</Text>
          {e.evidenceId && !e.finished ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.muted }}>{e.practiceOn} 수행 후 반응</Text>
              {(['clear', 'pain', 'unknown'] as const).map((response) =>
                button(
                  response === 'clear' ? '다음 날 통증 없었어요' : response === 'pain' ? '다음 날 통증 있었어요' : '아직 확인하지 못했어요',
                  'mechanics.recordMechanicsNextDay',
                  { runId: skill.id, evidenceId: e.evidenceId, response },
                  !e.canRespond
                )
              )}
            </View>
          ) : null}
          {e.ready && !e.finished
            ? button(
                e.stage === '통합'
                  ? '통합 단계 자가 확인 완료'
                  : '자가 확인 후 ' + SKILL_STAGES[SKILL_STAGES.indexOf(e.stage) + 1] + ' 단계로 전환',
                'mechanics.advanceMechanicsStage',
                {
                  runId: skill.id,
                  fault: e.fault,
                  from: e.stage,
                  evidenceId: e.evidenceId,
                  requestId: `${skill.id}:${e.fault}:${e.stage}:${e.evidenceId}`,
                },
                !!skill.blockedReason
              )
            : null}
        </View>
      ))}
      <Press accessibilityRole="button" onPress={() => router.push(`/lab/${focus.reportId}`)} style={{ padding: 12 }}>
        <Text style={{ color: c.link }}>처방의 3D 리포트 보기</Text>
      </Press>
      {focus.finished ? (
        <Press accessibilityRole="button" onPress={() => router.push('/lab')} style={{ padding: 12 }}>
          <Text style={{ color: c.link }}>같은 조건으로 다시 촬영하기</Text>
        </Press>
      ) : null}
      {error ? <Text style={{ color: c.warn }}>{error}</Text> : null}
    </View>
  );
}

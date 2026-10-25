import { Text, TextInput, View } from 'react-native';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';

import type { SkillAnswer } from '@/lib/mechanics/progression';
import { isThrowingDrill } from '@/lib/mechanics/program';

export type PracticeForm = {
  requestId: string;
  count: string;
  effort: string;
  response: 'clear' | 'pain' | null;
  alreadyLogged: boolean;
  quality: SkillAnswer | null;
  transferred: SkillAnswer | null;
};
export const emptyPractice = (): PracticeForm => ({
  requestId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  count: '',
  effort: '',
  response: null,
  alreadyLogged: false,
  quality: null,
  transferred: null,
});

export function PracticeInput({
  value,
  category,
  skill,
  onChange,
  c,
}: {
  value: PracticeForm;
  category: string;
  skill?: { cue: string; requiresTransfer: boolean };
  onChange: (v: PracticeForm) => void;
  c: Palette;
}) {
  const throwing = isThrowingDrill(category);
  const field = {
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: c.ink,
    minHeight: 44,
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.ink, fontWeight: '600' }}>{throwing ? '오늘 이 드릴의 실제 투구' : '오늘 이 드릴의 반복 수행'}</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>
        {throwing
          ? '오늘 이 드릴로 던진 합계를 적어요. 투구 기록에 한 번만 저장돼요.'
          : '오늘 수행한 반복 횟수를 적어요. 투구 수에는 더하지 않아요.'}
      </Text>
      <TextInput
        accessibilityLabel={throwing ? '실제로 던진 횟수' : '실제 반복 횟수'}
        placeholder={throwing ? '실제 투구 횟수' : '실제 반복 횟수'}
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        value={value.count}
        onChangeText={(count) => onChange({ ...value, count })}
        style={field}
      />
      <TextInput
        accessibilityLabel="실제 체감 강도 퍼센트"
        placeholder="실제 체감 강도 0~100%"
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        value={value.effort}
        onChangeText={(effort) => onChange({ ...value, effort })}
        style={field}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            { value: 'clear', label: '통증 없었어요' },
            { value: 'pain', label: '통증이 있었어요' },
          ] as const
        ).map((x) => (
          <Press
            key={x.value}
            onPress={() => onChange({ ...value, response: x.value })}
            accessibilityRole="button"
            accessibilityState={{ selected: value.response === x.value }}
            style={{
              ...field,
              flex: 1,
              backgroundColor: value.response === x.value ? c.sky + '20' : c.card,
            }}
          >
            <Text style={{ color: c.ink }}>{x.label}</Text>
          </Press>
        ))}
      </View>
      {skill ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.ink, fontWeight: '600' }}>필수 교정 · 자가 확인</Text>
          <Text style={{ color: c.muted }}>동작 목표: {skill.cue}</Text>
          {(
            [
              { key: 'quality', label: '동작 목표를 유지했나요?' },
              ...(skill.requiresTransfer ? [{ key: 'transferred', label: '실제 캐치볼에서도 같은 신호를 유지했나요?' }] : []),
            ] as { key: 'quality' | 'transferred'; label: string }[]
          ).map((q) => (
            <View key={q.key} style={{ gap: 6 }}>
              <Text style={{ color: c.ink }}>{q.label}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['yes', 'no', 'unknown'] as const).map((v) => (
                  <Press
                    key={v}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value[q.key] === v }}
                    onPress={() => onChange({ ...value, [q.key]: v })}
                    style={{ ...field, flex: 1, backgroundColor: value[q.key] === v ? c.sky + '20' : c.card }}
                  >
                    <Text style={{ color: c.ink }}>{v === 'yes' ? '유지했어요' : v === 'no' ? '어려웠어요' : '확인 못 했어요'}</Text>
                  </Press>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {throwing ? (
        <Press
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.alreadyLogged }}
          onPress={() => onChange({ ...value, alreadyLogged: !value.alreadyLogged })}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: c.ink }}>{value.alreadyLogged ? '☑' : '☐'} 다른 투구 기록에 이미 포함했어요</Text>
        </Press>
      ) : null}
    </View>
  );
}

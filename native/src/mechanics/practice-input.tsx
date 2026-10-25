import { Text, TextInput, View } from 'react-native';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';

export type PracticeForm = {
  throws: string;
  effort: string;
  response: 'clear' | 'pain' | null;
  alreadyLogged: boolean;
};
export const emptyPractice = (): PracticeForm => ({
  throws: '',
  effort: '',
  response: null,
  alreadyLogged: false,
});

export function PracticeInput({
  value,
  onChange,
  c,
}: {
  value: PracticeForm;
  onChange: (v: PracticeForm) => void;
  c: Palette;
}) {
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
      <Text style={{ color: c.ink, fontWeight: '600' }}>오늘 이 드릴의 실제 투구</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>
        오늘 이 드릴로 던진 합계를 적어요. 투구 기록에 한 번만 저장돼요.
      </Text>
      <TextInput
        accessibilityLabel="실제로 던진 횟수"
        placeholder="실제 횟수"
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        value={value.throws}
        onChangeText={(throws) => onChange({ ...value, throws })}
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
      <Press
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.alreadyLogged }}
        onPress={() => onChange({ ...value, alreadyLogged: !value.alreadyLogged })}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: c.ink }}>
          {value.alreadyLogged ? '☑' : '☐'} 다른 투구 기록에 이미 포함했어요
        </Text>
      </Press>
    </View>
  );
}

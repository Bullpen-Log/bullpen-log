import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { shiftDateKey } from '@/lib/pitch-stats';
import { rpcForm, RpcError } from '~/lib/rpc';
import { TYPE, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 팀 · 레슨장 쓰기 화면(1.5단계 — 일정 · 공지 · 회원 · 일지 · 투구 기록) 공용 조각. 쓰기는 웹 마스터 화면과 같은 폼 동작(app/actions/org-*.ts)을
 * 그대로 부른다 — 칸 이름도 웹 폼과 같다. 검사 · 권한(requireMaster · requireOrg)은 서버가 본다.
 */

export type FormResult = { error?: string; success?: string };

/**
 * 웹 폼 동작 부르기 — (지난 상태, 폼) 꼴이면 그대로, 폼 하나만 받는 동작(지우기)은 single 을 켠다(앞에 null 을 안 붙임).
 * 던지지 않고 { error } 로 — 신호가 끊겨도 적던 것이 그대로 남게.
 */
export async function formCall(action: string, fields: Record<string, string | null | undefined>, single = false): Promise<FormResult> {
  try {
    const r = await rpcForm<FormResult | null>(action, fields, single ? [] : [null]);
    return r ?? {};
  } catch (e) {
    if (e instanceof RpcError && e.code === 'offline') return { error: '신호가 약해 보내지 못했어요. 적은 것은 그대로 있어요.' };
    if (e instanceof RpcError && e.code === 'update') return { error: '앱을 업데이트해 주세요.' };
    return { error: '처리하지 못했어요.' };
  }
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '10월 25일 (토)' */
export function dayWithWeekday(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

/** 이름표 + 칸 한 덩어리 */
export function Field({ label, hint, children, c }: { label: string; hint?: string; children: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.label, { color: c.muted }]}>
        {label}
        {hint ? <Text style={{ fontWeight: '400' }}> · {hint}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

/** 카드 모양 글 칸 */
export function Box({ c, multiline, style, ...rest }: TextInputProps & { c: Palette }) {
  return (
    <TextInput
      placeholderTextColor={c.muted}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[st.box, { backgroundColor: c.card, color: c.ink }, multiline && { minHeight: 120, paddingTop: 12 }, style]}
      {...rest}
    />
  );
}

/** 날짜 ‹ › — 하루씩. max 를 주면 그 날 뒤로는 못 간다(일지 · 투구 기록은 오늘까지) */
export function DateStepper({ value, onChange, max, c }: { value: string; onChange: (key: string) => void; max?: string; c: Palette }) {
  const atMax = max != null && value >= max;
  return (
    <View style={[st.stepper, { backgroundColor: c.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="하루 앞" onPress={() => onChange(shiftDateKey(value, -1))} hitSlop={8} style={st.stepBtn}>
        <Icon name="chevron-left" size={22} color={c.sky} />
      </Pressable>
      <Text style={[TYPE.card, { color: c.ink, flex: 1, textAlign: 'center' }]}>{dayWithWeekday(value)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="하루 뒤"
        onPress={() => !atMax && onChange(shiftDateKey(value, 1))}
        disabled={atMax}
        hitSlop={8}
        style={[st.stepBtn, atMax && { opacity: 0.3 }]}
      >
        <Icon name="chevron-right" size={22} color={c.sky} />
      </Pressable>
    </View>
  );
}

/** 하나 고르기 칩 줄 */
export function ChoiceChips<V extends string>({
  options,
  value,
  onChange,
  c,
}: {
  options: readonly { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
  c: Palette;
}) {
  return (
    <View style={st.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[st.chip, { backgroundColor: on ? c.sky : c.card }]}
          >
            <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 빨간 글 단추(지우기 · 빼기) */
export function DangerLink({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[TYPE.body, { color: c.danger, fontWeight: '600', opacity: disabled ? 0.5 : 1 }]}>{label}</Text>
    </Pressable>
  );
}

export const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', paddingHorizontal: 4 },
  box: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 12, paddingHorizontal: 6 },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
});

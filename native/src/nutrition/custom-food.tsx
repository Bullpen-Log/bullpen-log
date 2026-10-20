import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { FOOD_NAME_MAX, KCAL_MAX, MACRO_MAX, type Food } from '@/lib/nutrition/meta';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';

/**
 * 목록에 없으면 직접 입력 — 웹 음식 창 food-sheet.tsx CustomFood 와 같은 칸 · 같은 검사 · 같은 글: 음식 이름 · 먹은 양(선택) · 칼로리(필수) ·
 * 탄 · 단 · 지(선택), '내 음식에 저장해 다음에도 쓰기'. 담기 · 저장은 부르는 쪽(담기 화면)이 한다.
 */
export function CustomFood({
  initialName,
  submitLabel,
  busy,
  onSubmit,
}: {
  initialName: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (food: Food, save: boolean) => void;
}) {
  const c = usePalette();
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('');
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const clean = (s: string) => s.replace(/,/g, '.').replace(/[^\d.]/g, '');

  const submit = () => {
    const k = num(kcal);
    const macros = [num(carbs), num(protein), num(fat)];
    if (!name.trim()) return setError('음식 이름을 적어 주세요.');
    if (k === null || !Number.isFinite(k) || k < 0 || k > KCAL_MAX)
      return setError('칼로리를 적어 주세요. 모르면 포장지나 메뉴판의 값을 적으면 돼요.');
    if (macros.some((m) => m !== null && (!Number.isFinite(m) || m < 0 || m > MACRO_MAX)))
      return setError(`탄수화물·단백질·지방은 0~${MACRO_MAX}g 사이로 적어 주세요.`);
    setError(null);
    onSubmit(
      {
        source: 'free',
        id: null,
        name: name.trim(),
        servingLabel: serving.trim() || '1인분',
        servingGrams: null,
        kcal: k,
        carbs: macros[0],
        protein: macros[1],
        fat: macros[2],
      },
      save
    );
  };

  const field = (label: string, value: string, set: (v: string) => void, opts: { numeric?: boolean; placeholder?: string; max?: number } = {}) => (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={opts.numeric ? (t) => set(clean(t)) : set}
        keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        placeholderTextColor={c.muted}
        style={[styles.input, { backgroundColor: c.page, color: c.ink, textAlign: opts.numeric ? 'right' : 'left' }]}
      />
    </View>
  );

  return (
    <View style={[styles.box, { backgroundColor: c.card, boxShadow: c.float }]}>
      {field('음식 이름', name, setName, { placeholder: '예) 엄마표 제육볶음', max: FOOD_NAME_MAX })}
      {field('먹은 양 (선택)', serving, setServing, { placeholder: '1인분', max: 40 })}
      <View style={styles.row}>
        {field('칼로리 (kcal)', kcal, setKcal, { numeric: true })}
        {field('탄수화물 (g) · 선택', carbs, setCarbs, { numeric: true })}
      </View>
      <View style={styles.row}>
        {field('단백질 (g) · 선택', protein, setProtein, { numeric: true })}
        {field('지방 (g) · 선택', fat, setFat, { numeric: true })}
      </View>
      <View style={styles.switchRow}>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>내 음식에 저장해 다음에도 쓰기</Text>
        <Switch value={save} onValueChange={setSave} />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 14 }}>
          {error}
        </Text>
      ) : null}
      <Press accessibilityRole="button" onPress={submit} disabled={busy} style={[styles.primary, { backgroundColor: c.sky }, busy && { opacity: 0.5 }]}>
        <Text style={styles.primaryText}>{submitLabel}</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

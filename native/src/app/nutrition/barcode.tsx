import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanBarcode } from '@/lib/nutrition/barcode';
import type { Food } from '@/lib/nutrition/meta';
import { rpc } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { lookupBarcode, toFoodInput } from '~/nutrition/api';
import { putScanned } from '~/nutrition/scanned';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 바코드로 담기(앱 카메라) — 웹 barcode-panel.tsx 와 같은 길: 읽은 숫자 → /api/nutrition/barcode(내 음식 → Open Food Facts) →
 * 찾으면 담기 화면으로 돌려준다. 못 찾으면 포장의 영양 정보를 적게 하고 바코드째 내 음식으로 저장(다음부터 바로 찾음, nutrition.saveUserFood).
 * 웹은 아이폰 사파리에 바코드 읽기(BarcodeDetector)가 없어 숫자를 손으로 쳐야 했다.
 */
type Phase = { kind: 'scan' } | { kind: 'looking'; code: string } | { kind: 'manual'; code: string; name: string } | { kind: 'error'; message: string };

export default function BarcodeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const [typed, setTyped] = useState('');
  const busy = useRef(false);

  const look = async (raw: string) => {
    const code = cleanBarcode(raw);
    if (!code) {
      busy.current = false;
      return setPhase({ kind: 'error', message: '바코드 숫자가 맞지 않아요. 막대 밑의 8 · 12 · 13자리 숫자를 그대로 적어 주세요.' });
    }
    setPhase({ kind: 'looking', code });
    const res = await lookupBarcode(code);
    busy.current = false;
    if (!res.ok) return setPhase({ kind: 'error', message: res.error });
    if (!res.food) return setPhase({ kind: 'manual', code, name: res.name ?? '' });
    putScanned(res.food, res.from);
    router.back();
  };

  const onScan = (r: BarcodeScanningResult) => {
    if (busy.current || phase.kind !== 'scan') return;
    busy.current = true;
    void Haptics.selectionAsync();
    void look(r.data);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#000' }}>
      {phase.kind === 'scan' && perm?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={onScan}
        />
      ) : null}
      <View style={[styles.bar, { paddingTop: inset.top + 8 }]}>
        <Press accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.barAction}>닫기</Text>
        </Press>
        <Text style={styles.barTitle}>바코드로 담기</Text>
        <View style={{ width: 34 }} />
      </View>

      {phase.kind === 'scan' ? (
        <View style={[styles.bottom, { paddingBottom: inset.bottom + 16 }]}>
          {!perm ? null : !perm.granted ? (
            <>
              <Text style={styles.note}>바코드를 읽으려면 카메라를 허락해 주세요.</Text>
              <Press
                accessibilityRole="button"
                onPress={() => (perm.canAskAgain ? void requestPerm() : void Linking.openSettings())}
                style={[styles.primary, { backgroundColor: c.sky }]}
              >
                <Text style={styles.primaryText}>{perm.canAskAgain ? '카메라 허락하기' : '설정 열기'}</Text>
              </Press>
            </>
          ) : (
            <Text style={styles.note}>포장의 바코드를 화면 가운데에 비춰 주세요.</Text>
          )}
          <View style={styles.typeRow}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              keyboardType="number-pad"
              placeholder="숫자로 적기"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.typeInput}
            />
            <Press accessibilityRole="button" disabled={!typed.trim()} onPress={() => void look(typed)} style={[styles.small, { backgroundColor: c.sky }, !typed.trim() && { opacity: 0.4 }]}>
              <Text style={styles.primaryText}>찾기</Text>
            </Press>
          </View>
        </View>
      ) : phase.kind === 'looking' ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.note}>{phase.code} 찾는 중</Text>
        </View>
      ) : phase.kind === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.note}>{phase.message}</Text>
          <Press accessibilityRole="button" onPress={() => setPhase({ kind: 'scan' })} style={[styles.primary, { backgroundColor: c.sky }]}>
            <Text style={styles.primaryText}>다시 읽기</Text>
          </Press>
        </View>
      ) : (
        <ManualFood code={phase.code} name={phase.name} onRescan={() => setPhase({ kind: 'scan' })} />
      )}
    </KeyboardAvoidingView>
  );
}

/** 못 찾은 바코드 — 포장의 영양 정보(1회 제공량 기준)를 적어 내 음식으로 */
function ManualFood({ code, name: initialName, onRescan }: { code: string; name: string; onRescan: () => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('1회');
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() ? Number.parseFloat(s) : null);
  const save = async () => {
    const k = num(kcal);
    if (!name.trim()) return setError('이름을 적어 주세요.');
    if (k == null || !Number.isFinite(k)) return setError('열량(kcal)을 적어 주세요.');
    const food: Food = {
      source: 'barcode',
      id: code,
      name: name.trim(),
      servingLabel: serving.trim() || '1회',
      servingGrams: null,
      kcal: k,
      carbs: num(carbs),
      protein: num(protein),
      fat: num(fat),
    };
    setSaving(true);
    setError(null);
    try {
      /* 바코드 숫자가 sourceId 로 가야 다음에 같은 바코드를 내 음식에서 바로 찾는다(lib/nutrition/barcode-lookup.ts) */
      const res = await rpc<{ ok: true } | { ok: false; error: string }>('nutrition.saveUserFood', toFoodInput(food));
      if (!res.ok) return setError(res.error);
      putScanned(food, 'new');
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, numeric = true) => (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholderTextColor={c.muted}
        style={[styles.input, { backgroundColor: c.page, color: c.ink }]}
      />
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.card, marginTop: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
      contentContainerStyle={[{ padding: 16, gap: 10, paddingBottom: inset.bottom + 24 }, READABLE]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>처음 보는 바코드예요</Text>
      <Text style={{ color: c.muted, fontSize: 14 }}>포장의 영양 정보를 적어 주세요. 다음부터는 바로 찾아요. ({code})</Text>
      {field('이름', name, setName, false)}
      {field('1회 제공량', serving, setServing, false)}
      {field('열량(kcal)', kcal, setKcal)}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>{field('탄수화물(g)', carbs, setCarbs)}</View>
        <View style={{ flex: 1 }}>{field('단백질(g)', protein, setProtein)}</View>
        <View style={{ flex: 1 }}>{field('지방(g)', fat, setFat)}</View>
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}
      <Press accessibilityRole="button" onPress={save} disabled={saving} style={[styles.primary, { backgroundColor: c.sky }, saving && { opacity: 0.5 }]}>
        <Text style={styles.primaryText}>{saving ? '저장하는 중' : '저장하고 담기'}</Text>
      </Press>
      <Press accessibilityRole="button" onPress={onRescan} style={[styles.primary, { backgroundColor: c.chip }]}>
        <Text style={[styles.primaryText, { color: c.ink }]}>다시 읽기</Text>
      </Press>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barAction: { fontSize: 17, color: '#fff' },
  barTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  note: { color: '#fff', fontSize: 15, textAlign: 'center' },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeInput: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, color: '#fff', backgroundColor: 'rgba(255,255,255,0.14)' },
  small: { height: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
});

import { Image } from 'expo-image';
import type * as ImagePicker from 'expo-image-picker';
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PITCH_EFFORT_LEVELS, PITCH_EFFORT_WARN } from '@/lib/pitch-effort';
import { PITCH_CUES, SATISFACTION_ENDS, SATISFACTION_OPTIONS } from '@/lib/pitch-satisfaction';
import { formatSpeed, speedLabel, type SpeedUnit } from '@/lib/units';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { MAX_VIDEOS, speedText, type EntryForm, type MeasuredSource, type SpeedField } from './entry-model';
import { thumbSource, usePathThumbs } from './store';

/**
 * 퀵스텝 마지막 단계의 선택 기록 창 — 영상 · 느낀 점 · 구속, 그리고 측정 내역 · 팔의 피로 기준.
 * 값은 모두 부르는 쪽(quick-step.tsx)이 쥔다 — 창을 닫았다 열어도 그대로고, 창을 닫는 것은 지우기가 아니다.
 */

/** 아래에서 올라오는 창(아이폰 pageSheet) — 머리 제목 + 완료. 닫으면 부르는 쪽이 연 단추로 읽기 초점을 돌려준다 */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, color: c.ink }]}>
            {title}
          </Text>
          <Press accessibilityRole="button" onPress={onClose} hitSlop={6} style={styles.done}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>완료</Text>
          </Press>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 32, gap: 20 }}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type VideoItem =
  | { key: string; path: string; fresh: boolean }
  | { key: string; failed: true; asset: ImagePicker.ImagePickerAsset; error: string };
export const isReady = (v: VideoItem): v is Extract<VideoItem, { path: string }> => 'path' in v;

/** 영상 — 두 개까지. 썸네일이 없으면 영상 그림. 이미 저장된 영상은 빼도 저장할 때 빠진다(부르는 쪽이 묻는다) */
export function VideoSheet({
  items,
  attaching,
  error,
  rest,
  onPick,
  onRetry,
  onRemove,
}: {
  items: VideoItem[];
  attaching: string | null;
  error: string | null;
  rest: boolean;
  onPick: (camera: boolean) => void;
  onRetry: (v: VideoItem) => void;
  onRemove: (v: VideoItem) => void;
}) {
  const c = usePalette();
  const thumbs = usePathThumbs(items.filter(isReady).map((v) => v.path));
  const room = MAX_VIDEOS - items.length;
  return (
    <View style={{ gap: 12 }}>
      {items.map((v, i) => (
        <View key={v.key} style={[styles.videoRow, { backgroundColor: c.card, boxShadow: c.float }]}>
          {isReady(v) && thumbs[v.path] ? (
            <Image source={thumbSource(thumbs[v.path])} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.thumb, styles.center, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Icon name={isReady(v) ? 'video' : 'circle-alert'} size={20} color={isReady(v) ? c.muted : c.danger} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>영상 {i + 1}</Text>
            {isReady(v) ? (
              <Text style={[TYPE.sub, { color: c.muted }]}>{v.fresh ? '이번에 넣음 · 저장하면 붙어요' : '저장된 영상'}</Text>
            ) : (
              <Text style={[TYPE.sub, { color: c.danger }]}>{v.error}</Text>
            )}
          </View>
          {!isReady(v) ? (
            <Press accessibilityRole="button" accessibilityLabel={`영상 ${i + 1} 다시 넣기`} onPress={() => onRetry(v)} disabled={!!attaching} style={styles.iconBtn}>
              <Icon name="rotate-cw" size={18} color={c.link} />
            </Press>
          ) : null}
          <Press accessibilityRole="button" accessibilityLabel={`영상 ${i + 1} 빼기`} onPress={() => onRemove(v)} disabled={!!attaching} style={styles.iconBtn}>
            <Icon name="x" size={18} color={c.muted} />
          </Press>
        </View>
      ))}
      {attaching ? (
        <View accessibilityLiveRegion="polite" style={styles.row}>
          <ActivityIndicator />
          <Text style={[TYPE.body, { color: c.muted }]}>{attaching}</Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
          {error}
        </Text>
      ) : null}
      {rest ? (
        <Text style={[TYPE.sub, { color: c.muted }]}>쉰 날에는 새 영상을 넣지 않아요. 붙어 있던 영상은 그대로 남아요.</Text>
      ) : room > 0 ? (
        <View style={styles.pair}>
          <Press accessibilityRole="button" onPress={() => onPick(true)} disabled={!!attaching} style={[styles.ghost, { backgroundColor: withAlpha(c.ink, 0.06) }, !!attaching && { opacity: 0.5 }]}>
            <Icon name="camera" size={18} color={c.ink} />
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>촬영하기</Text>
          </Press>
          <Press accessibilityRole="button" onPress={() => onPick(false)} disabled={!!attaching} style={[styles.ghost, { backgroundColor: withAlpha(c.ink, 0.06) }, !!attaching && { opacity: 0.5 }]}>
            <Icon name="image-plus" size={18} color={c.ink} />
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>앨범에서</Text>
          </Press>
        </View>
      ) : (
        <Text style={[TYPE.sub, { color: c.muted }]}>영상은 기록 하나에 {MAX_VIDEOS}개까지예요.</Text>
      )}
    </View>
  );
}

/** 느낀 점 — 메모(선택), 불펜 · 라이브 · 경기면 만족도 · 감각. 감각은 펼쳐서 좋았던 것 / 아쉬웠던 것을 바꿔 가며 고른다 */
export function FeelSheet({
  form,
  rated,
  cueSide,
  cuesOpen,
  onMemo,
  onSatisfaction,
  onCue,
  onCueSide,
  onCuesOpen,
}: {
  form: EntryForm;
  rated: boolean;
  cueSide: 'good' | 'bad';
  cuesOpen: boolean;
  onMemo: (s: string) => void;
  onSatisfaction: (n: number | null) => void;
  onCue: (cue: string) => void;
  onCueSide: (s: 'good' | 'bad') => void;
  onCuesOpen: (o: boolean) => void;
}) {
  const c = usePalette();
  const list = cueSide === 'good' ? form.good : form.bad;
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>메모 · 선택</Text>
        <TextInput
          value={form.memo}
          onChangeText={onMemo}
          multiline
          accessibilityLabel="메모"
          placeholder="그날 던지며 느낀 것"
          placeholderTextColor={c.muted}
          style={[styles.input, styles.memo, { color: c.ink, backgroundColor: c.card }]}
        />
      </View>
      {rated ? (
        <>
          <View style={{ gap: 8 }}>
            <View style={styles.row}>
              <Text style={[TYPE.sub, { flex: 1, color: c.muted }]}>투구 만족도 · 선택</Text>
              {form.satisfaction != null ? (
                <Press accessibilityRole="button" onPress={() => onSatisfaction(null)} style={styles.textBtn}>
                  <Text style={[TYPE.sub, { color: c.link }]}>선택 해제</Text>
                </Press>
              ) : null}
            </View>
            <Segmented
              label="투구 만족도"
              size="md"
              options={SATISFACTION_OPTIONS}
              value={form.satisfaction == null ? '' : String(form.satisfaction)}
              onChange={(v) => onSatisfaction(Number(v))}
            />
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[TYPE.sub, { color: c.muted }]}>1 {SATISFACTION_ENDS.low}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{SATISFACTION_ENDS.high} 5</Text>
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <Press accessibilityRole="button" accessibilityState={{ expanded: cuesOpen }} onPress={() => onCuesOpen(!cuesOpen)} style={styles.textBtn}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>
                감각 고르기{form.good.length + form.bad.length ? ` · ${form.good.length + form.bad.length}개` : ''}
              </Text>
              <Icon name={cuesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.link} />
            </Press>
            {cuesOpen ? (
              <>
                <Segmented
                  label="감각 구분"
                  options={[
                    { value: 'good', label: `좋았던 것${form.good.length ? ` ${form.good.length}` : ''}` },
                    { value: 'bad', label: `아쉬웠던 것${form.bad.length ? ` ${form.bad.length}` : ''}` },
                  ]}
                  value={cueSide}
                  onChange={(v) => onCueSide(v)}
                />
                <View style={styles.chips}>
                  {PITCH_CUES.map((cue) => {
                    const on = list.includes(cue);
                    const other = (cueSide === 'good' ? form.bad : form.good).includes(cue);
                    return (
                      <Press
                        key={cue}
                        select
                        selected={on}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityHint={other ? `${cueSide === 'good' ? '아쉬웠던 것' : '좋았던 것'}에서 빠져요` : undefined}
                        onPress={() => onCue(cue)}
                        style={[styles.chip, { borderColor: on ? c.action : 'transparent', backgroundColor: on ? c.skyTint : withAlpha(c.ink, 0.06) }]}
                      >
                        {on ? <Icon name="check" size={14} color={c.link} /> : null}
                        <Text style={[TYPE.body, { color: on ? c.link : c.ink, fontWeight: on ? '600' : '400' }]}>{cue}</Text>
                      </Press>
                    );
                  })}
                </View>
                <Text style={[TYPE.sub, { color: c.muted }]}>같은 감각은 한쪽에만 남아요.</Text>
              </>
            ) : null}
          </View>
        </>
      ) : (
        <Text style={[TYPE.sub, { color: c.muted }]}>만족도 · 감각은 불펜 · 라이브 · 경기에서 남겨요.</Text>
      )}
    </>
  );
}

/** 구속 — 최고 · 평균(선택). 단위는 앱 전체 설정과 같이 바뀌고, 저장은 km/h */
export function SpeedSheet({
  form,
  unit,
  measured,
  error,
  onMax,
  onAvg,
  onUnit,
}: {
  form: EntryForm;
  unit: SpeedUnit;
  measured: MeasuredSource | null;
  error: string | null;
  onMax: (s: string) => void;
  onAvg: (s: string) => void;
  onUnit: (u: SpeedUnit) => void;
}) {
  const c = usePalette();
  const field = (label: string, f: SpeedField, on: (s: string) => void) => (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {label} ({speedLabel(unit)}){f.origin === 'measured' ? ' · 측정값' : f.origin === 'typed' && measured ? ' · 직접 고침' : ''}
      </Text>
      <TextInput
        value={speedText(f, unit)}
        onChangeText={on}
        keyboardType="decimal-pad"
        accessibilityLabel={`${label} ${speedLabel(unit)}`}
        placeholder="선택"
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.ink, backgroundColor: c.card }]}
      />
    </View>
  );
  return (
    <>
      {measured ? <MeasuredNote m={measured} unit={unit} /> : null}
      <View style={styles.pair}>
        {field('최고 구속', form.max, onMax)}
        {field('평균 구속', form.avg, onAvg)}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
          {error}
        </Text>
      ) : null}
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[TYPE.sub, { flex: 1, color: c.muted }]}>스피드건이 mph 면 단위를 바꿔 적어요</Text>
        <Segmented
          label="구속 단위"
          flow
          options={[
            { value: 'kmh', label: 'km/h' },
            { value: 'mph', label: 'mph' },
          ]}
          value={unit}
          onChange={(v) => onUnit(v)}
        />
      </View>
    </>
  );
}

/** 측정에서 가져온 값의 출처 — 평균에 쓴 공 수를 실제 집계대로 적는다 */
export function MeasuredNote({ m, unit }: { m: MeasuredSource; unit: SpeedUnit }) {
  const c = usePalette();
  return (
    <View style={[styles.note, { backgroundColor: c.skyTint }]}>
      <View style={styles.row}>
        <Icon name="radar" size={16} color={c.link} />
        <Text style={[TYPE.sub, { flex: 1, color: c.link, fontWeight: '600' }]}>구속측정에서 가져옴 · 측정한 공 {m.measured}구</Text>
      </View>
      <Text style={[TYPE.body, { color: c.ink }]}>
        최고 <Text style={TYPE.numInline}>{formatSpeed(m.maxKmh, unit)}</Text> · 측정 평균 <Text style={TYPE.numInline}>{formatSpeed(m.avgKmh, unit)}</Text>
      </Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {m.sample === m.measured ? `구속은 측정한 ${m.measured}구 기준이에요.` : `구속은 측정한 공 가운데 믿을 만한 ${m.sample}구 기준이에요.`}
      </Text>
    </View>
  );
}

/** 측정 내역 — 이어 받는 세션마다 한 줄 */
export function SourceSheet({ m, unit }: { m: MeasuredSource; unit: SpeedUnit }) {
  const c = usePalette();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <>
      <MeasuredNote m={m} unit={unit} />
      {m.sessions.map((s) => {
        const at = new Date(s.createdAt);
        return (
          <View key={s.id} style={[styles.sessionRow, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>
              {pad(at.getHours())}:{pad(at.getMinutes())} 측정 · {s.n}구
            </Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              최고 {s.max != null ? formatSpeed(s.max, unit) : '—'} · 평균 {s.avg != null ? formatSpeed(s.avg, unit) : '—'}
            </Text>
          </View>
        );
      })}
      {m.missed > 0 ? (
        <Text style={[TYPE.sub, { color: c.warn }]}>공을 봤지만 못 잰 시도가 {m.missed}번 있었어요. 실제로 던진 수는 전체 투구 수에 적어 주세요.</Text>
      ) : null}
      <Text style={[TYPE.sub, { color: c.muted }]}>측정 기록은 여기서 바뀌지 않아요. 공마다 고치려면 그날 기록의 구속 측정에서 고쳐요.</Text>
    </>
  );
}

/** 팔의 피로 기준 — 다섯 범위(lib/pitch-effort.ts 와 같은 뜻) */
export function FatigueGuide() {
  const c = usePalette();
  return (
    <>
      <Text style={[TYPE.body, { color: c.ink }]}>얼마나 세게 던졌는지가 아니라, 던진 뒤 팔이 얼마나 지쳤는지로 골라요. 통증 점수와는 달라요.</Text>
      {PITCH_EFFORT_LEVELS.map((l) => (
        <View key={l.range} style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={[TYPE.body, { width: 64, color: c.link, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{l.range}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{l.label}</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{l.detail}</Text>
          </View>
        </View>
      ))}
      <Text style={[TYPE.sub, styles.warn, { color: c.warn, backgroundColor: c.warnBg, borderColor: c.warnLine }]}>
        {PITCH_EFFORT_WARN.strong} {PITCH_EFFORT_WARN.rest}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  done: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pair: { flexDirection: 'row', gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 10 },
  thumb: { width: 56, height: 72, borderRadius: 10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, minHeight: 48, borderRadius: 24, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  memo: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
  note: { borderRadius: 16, padding: 14, gap: 6 },
  sessionRow: { borderRadius: 14, padding: 14, gap: 2 },
  warn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
});

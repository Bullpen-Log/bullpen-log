import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { planComposition } from '~/compare/export-plan';
import { FS_MAX } from '~/compare/fit';
import type { RelRange } from '~/compare/timing';
import type { DrawTool } from '~/compare/ui/annotation-layer';
import { TYPE } from '~/lib/ui';
import { useComparePalette } from '~/compare/ui/compare-palette';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 비교 화면의 작은 공용 조각. 도구 창 · 장면 · 메모 · 영상 정보는 한 화면 작은 창(workbench · workspace-parts)이 그린다(2026-11-02 한 화면 개편).
 * 여기는 글 한 줄 받기(이름 · 글 그림 · 길이 · 시각) 시트와 그리기 도구 표 · 내보내기 계획만 남긴다.
 */

/** 아래에서 올라오는 작은 시트 — 내용이 짧아 굴리지 않는다. 닫기 · 주 단추는 자판 위 */
export function Sheet({ title, onClose, children, primary }: { title: string; onClose: () => void; children: React.ReactNode; primary?: { label: string; onPress: () => void; disabled?: boolean } }) {
  const c = useComparePalette();
  const inset = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: c.card, paddingBottom: inset.bottom + 12 }]}>
          <View style={st.sheetHead}>
            <Text accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={FS_MAX} style={[TYPE.section, { color: c.ink, flex: 1 }]}>
              {title}
            </Text>
            <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={st.iconBtn}>
              <Icon name="x" size={20} color={c.muted} />
            </Press>
          </View>
          <View style={{ gap: 12 }}>{children}</View>
          {primary ? (
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: !!primary.disabled }}
              disabled={primary.disabled}
              onPress={primary.onPress}
              style={[st.primary, { backgroundColor: c.action }, primary.disabled && { opacity: 0.4 }]}
            >
              <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.button, { color: c.onAction }]}>
                {primary.label}
              </Text>
            </Press>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 글 한 줄 받기(비교 이름 · 글 그림 · 길이 보정 · 시각) — 메모는 쪽으로 나누는 편집 줄(note-editor.tsx)이 받는다 */
export function TextSheet({
  title,
  initial,
  placeholder,
  numeric,
  max = 60,
  onDone,
  onClose,
}: {
  title: string;
  initial?: string;
  placeholder: string;
  numeric?: boolean;
  max?: number;
  onDone: (text: string) => void;
  onClose: () => void;
}) {
  const c = useComparePalette();
  const [text, setText] = useState(initial ?? '');
  const done = () => text.trim() && onDone(text.trim());
  return (
    <Sheet title={title} onClose={onClose} primary={{ label: '저장', onPress: done, disabled: !text.trim() }}>
      <TextInput
        autoFocus
        value={text}
        onChangeText={(t) => setText(t.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
        returnKeyType="done"
        onSubmitEditing={done}
        accessibilityLabel={title}
        style={[st.input, { color: c.ink, borderColor: c.line, backgroundColor: c.page }]}
      />
    </Sheet>
  );
}

/* ---- 그리기 도구(R12 — 열두 가지 그대로) ---- */

export const DRAW_TOOLS: { kind: DrawTool; label: string; icon: IconName }[] = [
  { kind: 'line', label: '선', icon: 'minus' },
  { kind: 'angle', label: '각도', icon: 'chevron-right' },
  { kind: 'free', label: '자유선', icon: 'pencil' },
  { kind: 'point', label: '점', icon: 'circle-dot' },
  { kind: 'select', label: '고르기', icon: 'move' },
  { kind: 'arrow', label: '화살표', icon: 'arrow-right' },
  { kind: 'rect', label: '사각형', icon: 'square' },
  { kind: 'circle', label: '원', icon: 'circle' },
  { kind: 'label', label: '글', icon: 'sticky-note' },
  { kind: 'href', label: '수평선', icon: 'arrow-left-right' },
  { kind: 'vref', label: '수직선', icon: 'arrow-up-down' },
  { kind: 'tilt', label: '기울기', icon: 'arrow-up-right' },
];
export const DRAW_HINT: Partial<Record<DrawTool, string>> = {
  select: '그림을 눌러 고르고, 끌어 옮겨요. 고른 그림의 동그란 손잡이를 끌면 그 점만 옮겨요.',
  free: '한 손가락으로 그려요. 두 손가락은 확대 · 이동이에요.',
  angle: '세 곳을 차례로 누르세요. 두 번째가 꼭짓점이에요.',
  tilt: '두 점을 이어 수직에서 몇 도 기울었나 재요.',
  label: '글을 놓을 자리를 누르세요.',
};

export type SpanChoice = 'scene' | 'loop' | 'always';
export const SPAN_LABEL: Record<SpanChoice, string> = { scene: '이 장면만', loop: '반복 구간 동안', always: '영상 내내' };

export const PITCH_TYPES = ['직구', '투심', '슬라이더', '커브', '체인지업', '스플리터', '커터'];

/* ---- 내보내기(R16 · R17 — 지금은 장면 모음과 만들 계획까지) ---- */

export const exportPlanFor = (range: RelRange | null, loop: RelRange | null, ma: number | null, mb: number | null, speed: number, layout: 'stack' | 'side' | 'overlay', flags: { normalized: boolean; approx: boolean; start: boolean }) =>
  range && ma != null
    ? planComposition({ range, from: (loop ?? range).min, to: (loop ?? range).max, ma, mb, speed, layout, normalized: flags.normalized, approxSync: flags.approx, startBased: flags.start })
    : null;

const st = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 17, minHeight: 48 },
});

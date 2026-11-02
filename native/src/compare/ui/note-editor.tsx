import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, type TextInputInstance, View, useWindowDimensions } from 'react-native';
import { MAX_NOTE } from '~/compare/doc';
import { paginateText, textCapacity } from '~/compare/workspace-layout';
import { TYPE, usePalette } from '~/lib/ui';
import { IconBtn, Pager, TextBtn } from '~/compare/ui/workspace-parts';

/**
 * 메모 쓰기(UI08) — 재생 줄 · 도구 줄 자리를 잠시 이 편집 줄로 바꾼다(영상은 위에 작게 남는다). 입력칸은 굴리지 않는다.
 * - 긴 글은 쪽으로 나눠 한 쪽씩 고친다. 원문은 쪽을 이어 붙인 것 그대로(빠지는 글자 없음) — 저장하면 한 메모로.
 * - 쪽은 처음 열 때(입력 전) 잰 칸 크기로 한 번만 나눈다. 쓰는 중에는 다시 나누지 않는다(한글 조합 중인 글자를 가르지 않게).
 *   칸이 가득 차면 그 쪽에는 더 안 들어가고 '다음 쪽에 이어 쓰기'로 넘어간다(보이지 않는 곳에 글이 쌓이지 않게).
 * - 쓰는 동안 글은 위(onDraft)가 붙들어, 실수로 닫아도 다시 열면 이어 쓴다. '취소'만 버린다.
 */
export function NoteEditor({ title, initial, lines, onDraft, onSave, onCancel }: { title: string; initial: string; lines: number; onDraft: (t: string) => void; onSave: (t: string) => void; onCancel: () => void }) {
  const c = usePalette();
  const [segs, setSegs] = useState<string[]>([initial]);
  const [k, setK] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [split, setSplit] = useState(false);
  const [full, setFull] = useState(false);
  const caret = useRef(0);
  const input = useRef<TextInputInstance>(null);
  /* 글자 크기 설정을 따른다(입력칸 글자를 줄여 맞추지 않는다) — 칸 높이 · 쪽 크기도 그만큼 */
  const fs = Math.min(2, Math.max(1, useWindowDimensions().fontScale));
  const boxH = Math.ceil(Math.max(1, lines) * 22 * fs + 16);
  /* 처음 잰 칸 크기로 한 번만 쪽을 나눈다(아직 아무것도 안 쓴 때) */
  if (box && !split) {
    setSplit(true);
    const cap = Math.floor(textCapacity(box.w - 24, box.h - 16, 16 * fs, 22 * fs) * 0.8);
    const parts = paginateText(initial, cap).map((r) => initial.slice(r.start, r.end));
    setSegs(parts.length ? parts : ['']);
    setK(Math.max(0, parts.length - 1));
  }
  const text = segs.join('');
  const others = text.length - (segs[k]?.length ?? 0);
  const room = Math.max(0, MAX_NOTE - others);
  /* 쓰는 동안 위에 붙든다 — 닫혀도 다시 열면 이어서 */
  useEffect(() => onDraft(text), [text, onDraft]);
  const setSeg = (t: string) => setSegs((s) => s.map((x, i) => (i === k ? t : x)));
  const goPage = (p: number) => {
    setK(Math.max(0, Math.min(segs.length - 1, p)));
    setFull(false);
  };
  const addPage = () => {
    setSegs((s) => [...s.slice(0, k + 1), '', ...s.slice(k + 1)]);
    setK(k + 1);
    setFull(false);
    requestAnimationFrame(() => input.current?.focus());
  };
  const save = () => {
    Keyboard.dismiss();
    onSave(text.trim());
  };
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.ink, flex: 1 }]} accessibilityRole="header">
          {title}
        </Text>
        <Pager page={k} pages={segs.length} onPage={goPage} label="메모 쪽" />
        <Text maxFontSizeMultiplier={1.3} style={[TYPE.sub, { color: text.length >= MAX_NOTE ? c.danger : c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${MAX_NOTE}자 중 ${text.length}자`}>
          {text.length}/{MAX_NOTE}
        </Text>
      </View>
      <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ height: boxH }}>
        <TextInput
          ref={input}
          autoFocus
          multiline
          scrollEnabled={false}
          value={segs[k] ?? ''}
          maxLength={full ? (segs[k]?.length ?? 0) : (segs[k]?.length ?? 0) + room}
          onChangeText={setSeg}
          onSelectionChange={(e) => (caret.current = e.nativeEvent.selection.end)}
          onContentSizeChange={(e) => setFull(e.nativeEvent.contentSize.height > boxH - 22 * fs)}
          placeholder="이 장면에서 본 것"
          placeholderTextColor={c.muted}
          maxFontSizeMultiplier={2}
          accessibilityLabel={`${title}, ${segs.length}쪽 중 ${k + 1}쪽`}
          style={[st.input, { height: boxH, color: c.ink, borderColor: c.line, backgroundColor: c.page }]}
        />
      </View>
      {full ? (
        <Text maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: c.muted }]} accessibilityLiveRegion="polite">
          이 쪽이 가득 찼어요. 다음 쪽에 이어 써 주세요.
        </Text>
      ) : null}
      <View style={st.row}>
        <TextBtn label="취소" onPress={onCancel} a11y="메모 쓰기 취소, 쓴 글 버리기" />
        <IconBtn icon="plus" label="다음 쪽에 이어 쓰기" onPress={addPage} disabled={text.length >= MAX_NOTE} />
        <View style={{ flex: 1 }} />
        <TextBtn label="저장" primary onPress={save} disabled={!text.trim()} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
});

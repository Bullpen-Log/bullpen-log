import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, Keyboard, StyleSheet, Text, TextInput, type TextInputInstance, View, useWindowDimensions } from 'react-native';
import { MAX_NOTE } from '~/compare/doc';
import { editPage, FS_MAX, fsOf, LINE, pageEndCaret, pageOfCaret, pageOverflows, paginateNote, probablyComposing, textBtnW, textW, type EditorPlan } from '~/compare/fit';
import { pageText } from '~/compare/workspace-layout';
import { ToolBar, type ToolItem } from '~/compare/ui/tool-bar';
import { IconBtn, Pager, TextBtn } from '~/compare/ui/workspace-parts';
import { TYPE } from '~/lib/ui';
import { useComparePalette } from '~/compare/ui/compare-palette';

/**
 * 메모 쓰기(UI08 · SS03 · SS04) — 재생 줄 · 도구 줄 자리를 잠시 이 편집 줄로 바꾼다(영상은 위에 작게 멈춘 채 남는다). 입력칸은 굴리지 않는다.
 * - 원문(text)은 하나, 쪽은 원문의 구간(compare/fit.ts paginateNote — 줄바꿈 · 칸 폭 · 줄 수로 센다). 이어 붙이면 원문 그대로다.
 *   한 쪽을 고치면 그 자리만 원문에 넣고(editPage), 다시 나눠 넘친 글은 다음 쪽으로 간다(붙여넣기 · 줄바꿈 여럿도 숨지 않는다).
 * - 한글을 조합하는 중인 듯하면(probablyComposing) 지금 칸의 글을 바꾸지 않고 기다렸다가, 조합이 끝난 다음 고침 · 커서 이동 · 쪽 넘김 ·
 *   잠깐 멈춤(1.2초) · 저장 때 나눈다. 칸이 실제로 넘쳤다고 재면(onContentSizeChange) 한 줄 글자 수 어림을 줄여 다시 나눈다.
 * - 커서는 원문 자리로 들고 있다가, 다시 나눠 쪽이 바뀌면 그 쪽의 같은 자리로 옮긴다(자판 · 회전으로 칸이 바뀌어도).
 * - 글자 한도(500자)는 원문 전체에 건다. 저장 · 닫기(초안 남김) · 버리기(초안 지움)는 서로 다르다.
 */
export function NoteEditor({
  title,
  initial,
  initialCaret,
  plan,
  width,
  onDraft,
  onSave,
  onClose,
  onDiscard,
}: {
  title: string;
  initial: string;
  initialCaret?: number;
  plan: EditorPlan;
  width: number;
  onDraft: (text: string, caret: number) => void;
  onSave: (text: string) => void;
  onClose: () => void;
  onDiscard: () => void;
}) {
  const c = useComparePalette();
  const fs = fsOf(useWindowDimensions().fontScale);
  /* 칸이 실제로 넘쳤다고 재면 줄인다(어림이 너그러웠을 때) */
  const [fit, setFit] = useState(1);
  /* 입력칸 폭 — 한 줄 모드는 닫기 · 더보기 · 저장 옆에 */
  const inputW = plan.inline ? width - 44 - 44 - textBtnW('저장', fs) - 12 : width;
  const geom = { w: Math.max(40, (inputW - 26) * fit), fontPx: LINE.note.size * fs, lines: plan.lines };
  const geomKey = `${Math.round(geom.w)}|${geom.fontPx}|${geom.lines}`;
  /* 원문 · 쪽 · 지금 쪽 · 커서(원문 자리) · 다시 나눈 뒤 커서를 놓을 자리(sel — 그 쪽 안) 를 한 상태로 */
  type Ed = { text: string; pages: ReturnType<typeof paginateNote>; k: number; caret: number; sel: number | null; geomKey: string; pending: boolean; rev: number };
  const [ed, setEd] = useState<Ed>(() => {
    const caret = Math.min(initial.length, Math.max(0, initialCaret ?? initial.length));
    const pages = paginateNote(initial, geom);
    return { text: initial, pages, k: pageOfCaret(pages, caret), caret, sel: null, geomKey, pending: false, rev: 0 };
  });
  const input = useRef<TextInputInstance>(null);
  const lastEdit = useRef(0);
  const { text, pages, k } = ed;
  const page = pages[Math.min(k, pages.length - 1)] ?? { start: 0, end: text.length };
  const value = text.slice(page.start, page.end);

  /** 원문을 다시 나누고 커서가 든 쪽으로 */
  const resolved = (base: Ed, at: number): Ed => {
    const next = paginateNote(base.text, geom);
    const nk = pageOfCaret(next, at);
    return { ...base, pages: next, k: nk, caret: at, sel: Math.max(0, at - next[nk].start), geomKey, pending: false, rev: base.rev + 1 };
  };
  const resolve = () => setEd((e) => resolved(e, e.caret));
  /* 칸 크기(자판 · 회전 · 글자 크기 · 잰 넘침)가 바뀌면 다시 나눈다 — 조합 중이면 미룬다 */
  if (ed.geomKey !== geomKey && !ed.pending) setEd(resolved(ed, ed.caret));

  const onChange = (v: string) => {
    lastEdit.current = Date.now();
    const composing = probablyComposing(value, v);
    const r = editPage(text, pages, k, v, MAX_NOTE);
    if (r.clipped) AccessibilityInfo.announceForAccessibility(`메모는 ${MAX_NOTE}자까지 쓸 수 있어요.`);
    const base: Ed = { ...ed, text: r.text, pages: r.pages, caret: r.caret };
    if (composing && !r.clipped) {
      /* 조합 중 — 칸 글은 그대로 두고, 넘쳤으면 끝난 뒤 나눈다 */
      setEd({ ...base, pending: base.pending || pageOverflows(r.text, r.pages[k], geom) });
    } else {
      const next = resolved(base, r.caret);
      const shown = next.text.slice(next.pages[next.k].start, next.pages[next.k].end);
      /* 쪽 · 칸 글이 그대로면 커서를 코드로 다시 놓지 않는다(입력 중 자판 · 자동 고침을 건드리지 않게) */
      setEd(next.k === k && shown === v ? { ...next, sel: null } : next);
    }
    onDraft(r.text, r.caret);
  };
  /* 잠깐 멈추면(조합이 끝나지 않았어도) 넘친 글을 나눈다 — 글이 숨은 채 남지 않게 */
  useEffect(() => {
    if (!ed.pending) return;
    const id = setTimeout(resolve, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.pending, ed.text]);
  /* 다시 나눈 뒤 커서 자리 */
  const sel = ed.sel;
  useEffect(() => {
    if (sel == null) return;
    const id = requestAnimationFrame(() => input.current?.setSelection(sel, sel));
    return () => cancelAnimationFrame(id);
  }, [sel, ed.rev]);

  const goPage = (p: number) => {
    const np = Math.max(0, Math.min(pages.length - 1, p));
    /* 쪽 끝(줄바꿈으로 끝나면 그 앞)에 커서 — 다음 쪽 몫인 빈 줄에 두지 않는다 */
    const at = pageEndCaret(text, pages[np]);
    if (ed.pending) return setEd(resolved(ed, at));
    setEd({ ...ed, k: np, caret: at, sel: at - pages[np].start, rev: ed.rev + 1 });
  };
  const save = () => {
    Keyboard.dismiss();
    onSave(text);
  };
  const discard = () => {
    if (!text.trim()) return onDiscard();
    Alert.alert('쓰던 메모를 버릴까요?', '버리면 이 기기에 남긴 초안도 지워져요.', [
      { text: '취소', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onDiscard },
    ]);
  };
  const countText = `${text.length}/${MAX_NOTE}`;
  const countW = Math.ceil(textW(countText, 13, fs) + 8);
  const pagerW = 88 + Math.ceil(textW(pageText({ page: k, pages: pages.length }), 13, fs) + 4);
  const close = <IconBtn icon="x" label="메모 닫기, 쓴 글은 이 기기에 남겨요" onPress={onClose} size={20} color={c.muted} />;
  const saveBtn = <TextBtn label="저장" primary onPress={save} disabled={!text.trim()} a11y="메모 저장" />;
  const pager = <Pager page={k} pages={pages.length} onPage={goPage} label="메모 쪽" />;
  const count = (
    <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: text.length >= MAX_NOTE ? c.danger : c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${MAX_NOTE}자 중 ${text.length}자`}>
      {countText}
    </Text>
  );
  const discardItem: ToolItem = { key: 'discard', w: textBtnW('버리기', fs), priority: 2, overflow: true, node: <TextBtn label="버리기" onPress={discard} a11y="쓰던 메모 버리기" />, more: { label: '쓰던 메모 버리기', run: discard, destructive: true } };
  const pagerItem: ToolItem | null = pages.length > 1 ? { key: 'pager', w: pagerW, essential: true, node: pager } : null;
  const countItem: ToolItem = { key: 'count', w: countW, priority: 5, node: count };
  const bar = (items: (ToolItem | null)[], label: string) => <ToolBar label={label} width={width} maxRows={1} items={items.filter((x): x is ToolItem => !!x)} />;

  const inputNode = (
    <TextInput
      ref={input}
      autoFocus
      multiline
      scrollEnabled={false}
      value={value}
      onChangeText={onChange}
      onSelectionChange={(e) => {
        /* 고침 직후의 알림은 건너뛴다(커서는 고친 자리로 이미 셈했다). 사용자가 옮긴 것이면 그 자리 — 조합 중이었다면 끝난 것 */
        if (Date.now() - lastEdit.current <= 80) return;
        const end = e.nativeEvent.selection.end;
        setEd((x) => {
          const pg = x.pages[Math.min(x.k, x.pages.length - 1)];
          const at = Math.min(x.text.length, pg.start + end);
          return x.pending ? resolved({ ...x, sel: null }, at) : at === x.caret && x.sel == null ? x : { ...x, caret: at, sel: null };
        });
      }}
      onBlur={() => ed.pending && resolve()}
      onContentSizeChange={(e) => {
        if (e.nativeEvent.contentSize.height > plan.inputH + 2 && fit > 0.5) setFit((f) => Math.max(0.5, f * 0.92));
      }}
      placeholder="이 장면에서 본 것"
      placeholderTextColor={c.muted}
      maxFontSizeMultiplier={FS_MAX}
      accessibilityLabel={`${title}, ${pages.length}쪽 중 ${k + 1}쪽`}
      style={[st.input, { height: plan.inputH, color: c.ink, borderColor: c.line, backgroundColor: c.page }, plan.inline && { flex: 1 }]}
    />
  );
  if (plan.inline) {
    /* 아주 짧은 화면 — 닫기 · 한 줄 입력 · 더보기(쪽 넘기기 · 버리기) · 저장을 한 줄에 */
    const moreActs = [
      ...(pages.length > 1 && k > 0 ? [{ label: '이전 쪽', run: () => goPage(k - 1) }] : []),
      ...(pages.length > 1 && k < pages.length - 1 ? [{ label: '다음 쪽', run: () => goPage(k + 1) }] : []),
      { label: '쓰던 메모 버리기', run: discard, destructive: true },
    ];
    const openMore = () => {
      const opts = [...moreActs.map((x) => x.label), '취소'];
      ActionSheetIOS.showActionSheetWithOptions({ title: `${title} · ${pageText({ page: k, pages: pages.length })} · ${countText}`, options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: moreActs.length - 1 }, (i) => moreActs[i]?.run());
    };
    return (
      <View style={[st.head, { height: plan.height, alignItems: 'flex-start' }]}>
        {close}
        {inputNode}
        <IconBtn icon="ellipsis" label={`더보기: ${moreActs.map((x) => x.label).join(', ')}`} onPress={openMore} />
        {saveBtn}
      </View>
    );
  }
  if (plan.merged)
    return (
      <View style={[st.wrap, { height: plan.height }]}>
        {bar([{ key: 'close', w: 44, essential: true, node: close }, pagerItem, countItem, discardItem, { key: 'save', w: textBtnW('저장', fs), essential: true, push: true, node: saveBtn }], `${title} 편집`)}
        {inputNode}
      </View>
    );
  return (
    <View style={[st.wrap, { height: plan.height }]}>
      <View style={st.head}>
        {close}
        <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[TYPE.buttonCompact, { color: c.ink, flex: 1 }]} accessibilityRole="header">
          {title}
        </Text>
        {saveBtn}
      </View>
      {inputNode}
      {bar([discardItem, pagerItem, { ...countItem, push: true }], '메모 쪽 · 버리기')}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
});


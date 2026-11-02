import { Image } from 'expo-image';
import type { VideoPlayer, VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, METRIC_LABEL, METRIC_TOOLS, VIEW_LABEL, WIDTHS, compareMetric, type Annotation, type MetricKey, type ViewKey } from '~/compare/annotations';
import type { NoteRef, SourceRef } from '~/compare/doc';
import { planComposition, type CompositionPlan } from '~/compare/export-plan';
import { DEFAULT_INTERVALS, EVENT_LABEL, EVENT_SHORT, PITCH_EVENTS, compareInterval, intervalOf, orderIssues, sharedEvents, type PitchEvent } from '~/compare/pitch-events';
import { clock, durationText, EMPTY_FACTS, type MediaFacts, type RelRange } from '~/compare/timing';
import type { DrawTool } from '~/compare/ui/annotation-layer';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/* ---- 공용 작은 부품 ---- */

export function Chip({ label, on, onPress, disabled, hint }: { label: string; on?: boolean; onPress: () => void; disabled?: boolean; hint?: string }) {
  const c = usePalette();
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={[st.chip, { backgroundColor: on ? c.action : withAlpha(c.ink, 0.06) }, disabled && { opacity: 0.4 }]}
    >
      <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={[TYPE.buttonCompact, { color: on ? c.onAction : c.link }]}>
        {label}
      </Text>
    </Press>
  );
}

export function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <View style={[st.row, wrap && { flexWrap: 'wrap' }]}>{children}</View>;
}

/** 아래에서 올라오는 시트 — 몸은 굴리고, 닫기 · 주 단추는 늘 보인다(자판 위로) */
export function Sheet({ title, onClose, children, primary }: { title: string; onClose: () => void; children: React.ReactNode; primary?: { label: string; onPress: () => void; disabled?: boolean } }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: c.card, paddingBottom: inset.bottom + 12 }]}>
          <View style={st.sheetHead}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={[TYPE.section, { color: c.ink, flex: 1 }]}>
              {title}
            </Text>
            <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={st.iconBtn}>
              <Icon name="x" size={20} color={c.muted} />
            </Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
            {children}
          </ScrollView>
          {primary ? (
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: !!primary.disabled }}
              disabled={primary.disabled}
              onPress={primary.onPress}
              style={[st.primary, { backgroundColor: c.action }, primary.disabled && { opacity: 0.4 }]}
            >
              <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
                {primary.label}
              </Text>
            </Press>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 글 받기 시트(메모 · 글 그림 · 길이 보정) */
export function TextSheet({
  title,
  initial,
  placeholder,
  numeric,
  max = 500,
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
  const c = usePalette();
  const [text, setText] = useState(initial ?? '');
  return (
    <Sheet title={title} onClose={onClose} primary={{ label: '저장', onPress: () => onDone(text.trim()), disabled: !text.trim() }}>
      <TextInput
        autoFocus
        value={text}
        onChangeText={(t) => setText(t.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={!numeric}
        accessibilityLabel={title}
        style={[st.input, { color: c.ink, borderColor: c.line, backgroundColor: c.page }, !numeric && { minHeight: 96, textAlignVertical: 'top' }]}
      />
    </Sheet>
  );
}

/* ---- 그리기 도구 ---- */

const TOOLS: { kind: DrawTool; label: string; icon: IconName }[] = [
  { kind: 'select', label: '고르기', icon: 'pencil' },
  { kind: 'free', label: '자유선', icon: 'pencil' },
  { kind: 'line', label: '선', icon: 'minus' },
  { kind: 'arrow', label: '화살표', icon: 'chevron-right' },
  { kind: 'rect', label: '사각형', icon: 'square' },
  { kind: 'circle', label: '원', icon: 'circle' },
  { kind: 'label', label: '글', icon: 'pencil' },
  { kind: 'point', label: '점', icon: 'focus' },
  { kind: 'href', label: '수평선', icon: 'arrow-left-right' },
  { kind: 'vref', label: '수직선', icon: 'arrow-up-down' },
  { kind: 'tilt', label: '기울기', icon: 'minus' },
  { kind: 'angle', label: '각도', icon: 'chevron-right' },
];
const HINT: Partial<Record<DrawTool, string>> = {
  select: '그림을 눌러 고르고, 끌어 옮겨요.',
  free: '한 손가락으로 그려요. 두 손가락은 확대 · 이동이에요.',
  angle: '세 곳을 차례로 누르세요. 두 번째가 꼭짓점이에요.',
  tilt: '두 점을 이어 수직에서 몇 도 기울었나 재요.',
  label: '글을 놓을 자리를 누르세요.',
};

export type SpanChoice = 'scene' | 'loop' | 'always';
export const SPAN_LABEL: Record<SpanChoice, string> = { scene: '이 장면만', loop: '반복 구간 동안', always: '영상 내내' };

export function DrawPanel({
  tool,
  onTool,
  color,
  onColor,
  width,
  onWidth,
  span,
  onSpan,
  hasLoop,
  metric,
  onMetric,
  side,
  onSide,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selected,
  onDelete,
  onClear,
  onCalibrate,
  calibrated,
  twoSides,
}: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: string;
  onColor: (c: string) => void;
  width: number;
  onWidth: (w: number) => void;
  span: SpanChoice;
  onSpan: (s: SpanChoice) => void;
  hasLoop: boolean;
  metric: MetricKey | null;
  onMetric: (m: MetricKey | null) => void;
  side: 'a' | 'b';
  onSide: (s: 'a' | 'b') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selected: Annotation | null;
  onDelete: () => void;
  onClear: () => void;
  onCalibrate: () => void;
  calibrated: boolean;
  twoSides: boolean;
}) {
  const c = usePalette();
  const metrics = (Object.keys(METRIC_LABEL) as MetricKey[]).filter((m) => METRIC_TOOLS[m].includes(tool as never));
  return (
    <View style={{ gap: 10 }}>
      {twoSides ? (
        <Row>
          <Text style={[TYPE.sub, { color: c.muted }]}>그릴 영상</Text>
          <Chip label="A" on={side === 'a'} onPress={() => onSide('a')} />
          <Chip label="B" on={side === 'b'} onPress={() => onSide('b')} />
        </Row>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {TOOLS.map((t) => (
          <Press
            key={t.kind}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tool === t.kind }}
            onPress={() => onTool(t.kind)}
            style={[st.tool, { backgroundColor: tool === t.kind ? c.action : withAlpha(c.ink, 0.06) }]}
          >
            <Icon name={t.icon} size={16} color={tool === t.kind ? c.onAction : c.link} />
            <Text maxFontSizeMultiplier={1.3} style={[st.toolText, { color: tool === t.kind ? c.onAction : c.ink }]}>
              {t.label}
            </Text>
          </Press>
        ))}
      </ScrollView>
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        {HINT[tool] ?? '한 손가락으로 그리거나 짚어요. 두 손가락은 확대 · 이동이에요.'}
      </Text>
      <Row wrap>
        {COLORS.map((col) => (
          <Press
            key={col}
            accessibilityRole="button"
            accessibilityLabel={`선 색 ${COLORS.indexOf(col) + 1}`}
            accessibilityState={{ selected: color === col }}
            onPress={() => onColor(col)}
            style={[st.swatchHit, { borderColor: color === col ? c.action : 'transparent' }]}
          >
            <View style={[st.swatch, { backgroundColor: col }]} />
          </Press>
        ))}
        {WIDTHS.map((w) => (
          <Chip key={w} label={`굵기 ${WIDTHS.indexOf(w) + 1}`} on={width === w} onPress={() => onWidth(w)} />
        ))}
      </Row>
      <Row wrap>
        {(['scene', 'loop', 'always'] as SpanChoice[]).map((s) => (
          <Chip key={s} label={SPAN_LABEL[s]} on={span === s} disabled={s === 'loop' && !hasLoop} hint={s === 'loop' && !hasLoop ? '맞추기에서 반복 구간을 먼저 정해요' : undefined} onPress={() => onSpan(s)} />
        ))}
      </Row>
      {metrics.length ? (
        <Row wrap>
          <Text style={[TYPE.sub, { color: c.muted }]}>이름표(A · B 견주기)</Text>
          <Chip label="없음" on={metric == null} onPress={() => onMetric(null)} />
          {metrics.map((m) => (
            <Chip key={m} label={METRIC_LABEL[m]} on={metric === m} onPress={() => onMetric(m)} />
          ))}
        </Row>
      ) : null}
      <Row wrap>
        <Chip label="되돌리기" disabled={!canUndo} onPress={onUndo} />
        <Chip label="다시 하기" disabled={!canRedo} onPress={onRedo} />
        <Chip label="고른 그림 지우기" disabled={!selected} onPress={onDelete} />
        <Chip label="이 장면 그림 지우기" onPress={onClear} />
        <Chip label={calibrated ? '길이 보정 다시' : '길이 보정'} onPress={onCalibrate} hint="같은 평면의 아는 길이로 cm 를 셈해요" />
      </Row>
    </View>
  );
}

/* ---- 투구 장면(R29 · R30 · R32) ---- */

export function EventsPanel({
  sides,
  focus,
  onFocus,
  times,
  onMark,
  onObscure,
  onClear,
  onJump,
  onAnchorHere,
  metricRows,
}: {
  sides: { a: SourceRef | null; b: SourceRef | null };
  focus: 'a' | 'b';
  onFocus: (s: 'a' | 'b') => void;
  times: { a: number; b: number };
  onMark: (e: PitchEvent) => void;
  onObscure: (e: PitchEvent) => void;
  onClear: (e: PitchEvent) => void;
  onJump: (e: PitchEvent) => void;
  onAnchorHere: (e: PitchEvent) => void;
  metricRows: { metric: MetricKey; a: Annotation | null; b: Annotation | null; aspectA: number; aspectB: number }[];
}) {
  const c = usePalette();
  const src = focus === 'a' ? sides.a : sides.b;
  const marks = src?.events ?? {};
  const issues = orderIssues(marks);
  const shared = sides.a && sides.b ? sharedEvents(sides.a.events, sides.b.events) : [];
  const factsOf = (s: SourceRef | null): MediaFacts => s?.facts ?? EMPTY_FACTS;
  return (
    <View style={{ gap: 12 }}>
      {sides.b ? (
        <Row>
          <Text style={[TYPE.sub, { color: c.muted }]}>짚을 영상</Text>
          <Chip label="A" on={focus === 'a'} onPress={() => onFocus('a')} />
          <Chip label="B" on={focus === 'b'} onPress={() => onFocus('b')} />
        </Row>
      ) : null}
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        멈춘 장면에서 &apos;지금 장면&apos;을 누르세요. 잘 안 보이면 &apos;가려짐&apos;으로 두어요 — 짐작해 채우지 않아요. 지금 {focus.toUpperCase()} {clock(times[focus])}
      </Text>
      {PITCH_EVENTS.map((e) => {
        const v = marks[e];
        return (
          <View key={e} style={[st.eventRow, { borderColor: c.line }]} accessible={false}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.buttonCompact, { color: c.ink }]}>
                {EVENT_LABEL[e]}
              </Text>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: v == null ? c.muted : c.ink, fontVariant: ['tabular-nums'] }]}>
                {v == null ? '안 짚음' : v === 'obscured' ? '가려짐' : clock(v)}
              </Text>
            </View>
            <Chip label="지금 장면" onPress={() => onMark(e)} />
            <Chip label="가려짐" on={v === 'obscured'} onPress={() => onObscure(e)} />
            {v != null ? <Chip label="지우기" onPress={() => onClear(e)} /> : null}
          </View>
        );
      })}
      {issues.length ? (
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.danger }]}>
          {issues.map(([x, y]) => `${EVENT_SHORT[y]}이(가) ${EVENT_SHORT[x]}보다 앞이에요`).join(' · ')}. 다시 확인해 주세요.
        </Text>
      ) : null}
      {shared.length ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink }]}>
            두 영상 장면으로 가기
          </Text>
          <Row wrap>
            {shared.map((e) => (
              <Chip key={e} label={EVENT_SHORT[e]} onPress={() => onJump(e)} hint="A 를 그 장면으로 옮기고 B 는 기준대로 따라가요" />
            ))}
          </Row>
          <Row wrap>
            {shared
              .filter((e) => e === 'footContact' || e === 'release')
              .map((e) => (
                <Chip key={e} label={`${EVENT_SHORT[e]}을 기준으로`} onPress={() => onAnchorHere(e)} />
              ))}
          </Row>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink }]}>
          구간 시간
        </Text>
        {DEFAULT_INTERVALS.map(([from, to]) => {
          const ia = sides.a ? intervalOf(sides.a.events, from, to, factsOf(sides.a)) : null;
          const ib = sides.b ? intervalOf(sides.b.events, from, to, factsOf(sides.b)) : null;
          if (!ia && !ib) return null;
          const cmp = compareInterval(ia, ib);
          const one = (iv: typeof ia) =>
            !iv ? '—' : iv.real != null ? durationText(iv.real, iv.plusMinus) : `재생 ${durationText(iv.presentation, null)}${iv.mapping === 'unknown' ? '(실제 시간 모름)' : ''}`;
          return (
            <View key={`${from}-${to}`} style={{ gap: 2 }}>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.buttonCompact, { color: c.ink }]}>
                {EVENT_SHORT[from]} → {EVENT_SHORT[to]}
              </Text>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: c.ink, fontVariant: ['tabular-nums'] }]}>
                A {one(ia)}
                {sides.b ? ` · B ${one(ib)}` : ''}
              </Text>
              {sides.b ? (
                <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: c.muted }]}>
                  {cmp.basis === 'real'
                    ? `차이 ${cmp.diff >= 0 ? '+' : '−'}${durationText(Math.abs(cmp.diff), cmp.plusMinus)} (실제 시간)`
                    : cmp.basis === 'presentation'
                      ? `차이 ${cmp.diff >= 0 ? '+' : '−'}${Math.abs(cmp.diff).toFixed(2)}초 (재생 시간 기준 — 슬로모션 여부 모름)`
                      : cmp.reason === 'timebase'
                        ? '시간 축이 달라(슬로모션 · 일반) 견주지 않아요'
                        : '두 영상 모두 짚으면 견줘요'}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {metricRows.length ? (
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink }]}>
            2D 참고 측정
          </Text>
          {metricRows.map((r) => {
            const cmp = compareMetric(
              r.metric,
              r.a ? { geom: r.a.geom, aspect: r.aspectA, cal: sides.a?.calibration ?? null, view: sides.a?.view ?? null } : null,
              r.b ? { geom: r.b.geom, aspect: r.aspectB, cal: sides.b?.calibration ?? null, view: sides.b?.view ?? null } : null
            );
            const unit = (u: string) => (u === '°' ? '°' : u === 'cm' ? 'cm' : '(화면 비율)');
            return (
              <Text key={r.metric} maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: c.ink }]}>
                {METRIC_LABEL[r.metric]} ·{' '}
                {cmp.ok
                  ? `A ${cmp.a.toFixed(1)}${unit(cmp.unit)} · B ${cmp.b.toFixed(1)}${unit(cmp.unit)} · 차이 ${cmp.diff >= 0 ? '+' : '−'}${Math.abs(cmp.diff).toFixed(1)}`
                  : cmp.reason === 'viewUnknown'
                    ? '촬영 방향을 정하면 견줘요(더보기 › 영상 정보)'
                    : cmp.reason === 'view'
                      ? '촬영 방향이 달라 견주지 않아요'
                      : cmp.reason === 'unit'
                        ? '길이 보정이 한쪽만 있어 견주지 않아요'
                        : '두 영상에 같은 이름표를 그리면 견줘요'}
              </Text>
            );
          })}
          <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
            화면에 투영된 2D 값이에요. 촬영 방향 · 거리가 다르면 같은 자세도 다르게 보여요. 관절 부담 · 부상 위험은 이 값으로 셈하지 않아요.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---- 메모(R15 글) ---- */

export function NotesPanel({ notes, labelOf, onAdd, onOpen, onEdit, onDelete }: { notes: NoteRef[]; labelOf: (n: NoteRef) => string; onAdd: () => void; onOpen: (n: NoteRef) => void; onEdit: (n: NoteRef) => void; onDelete: (n: NoteRef) => void }) {
  const c = usePalette();
  return (
    <View style={{ gap: 10 }}>
      <Chip label="지금 장면에 메모" onPress={onAdd} />
      {notes.length ? (
        notes.map((n) => (
          <View key={n.id} style={[st.noteRow, { borderColor: c.line }]}>
            <Press accessibilityRole="button" accessibilityLabel={`${labelOf(n)} 메모로 가기, ${n.text}`} onPress={() => onOpen(n)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: c.link }]}>
                {labelOf(n)}
              </Text>
              <Text maxFontSizeMultiplier={1.5} style={[TYPE.body, { color: c.ink }]}>
                {n.text}
              </Text>
            </Press>
            <Press accessibilityRole="button" accessibilityLabel="메모 고치기" onPress={() => onEdit(n)} style={st.iconBtn}>
              <Icon name="pencil" size={18} color={c.link} />
            </Press>
            <Press accessibilityRole="button" accessibilityLabel="메모 지우기" onPress={() => onDelete(n)} style={st.iconBtn}>
              <Icon name="trash2" size={18} color={c.danger} />
            </Press>
          </View>
        ))
      ) : (
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
          장면마다 글 메모를 남겨요. 목소리 메모는 새 앱 기능이 필요해 아직 없어요.
        </Text>
      )}
    </View>
  );
}

/* ---- 내보내기(R16 · R17 — 지금은 장면 모음과 만들 계획까지) ---- */

/** 장면 모음 — 두 영상의 실제 장면(디코더가 뽑은 그림)을 투구 장면마다. 파일로 저장하는 일은 아직 없다 */
export function Storyboard({ pa, pb, rows }: { pa: VideoPlayer | null; pb: VideoPlayer | null; rows: { event: PitchEvent; a: number | null; b: number | null }[] }) {
  const c = usePalette();
  const [shots, setShots] = useState<{ key: string; a: (VideoThumbnail | null)[]; b: (VideoThumbnail | null)[] } | null>(null);
  const key = rows.map((r) => `${r.event}:${r.a ?? ''}:${r.b ?? ''}`).join('|');
  useEffect(() => {
    let alive = true;
    const grab = async (p: VideoPlayer | null, ts: (number | null)[]) => {
      if (!p) return ts.map(() => null);
      const want = ts.filter((t): t is number => t != null);
      const got = want.length ? await p.generateThumbnailsAsync(want, { maxWidth: 240 }).catch(() => [] as VideoThumbnail[]) : [];
      let i = 0;
      return ts.map((t) => (t == null ? null : (got[i++] ?? null)));
    };
    void Promise.all([grab(pa, rows.map((r) => r.a)), grab(pb, rows.map((r) => r.b))]).then(([a, b]) => alive && setShots({ key, a, b }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb, key]);
  if (!rows.length)
    return (
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        투구 장면을 짚으면 장면 모음이 생겨요.
      </Text>
    );
  const cur = shots?.key === key ? shots : null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} accessibilityLabel="장면 모음">
      {rows.map((r, i) => (
        <View key={r.event} style={{ gap: 4, width: 132 }}>
          <Text maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>
            {EVENT_SHORT[r.event]}
          </Text>
          {(['a', 'b'] as const).map((s) =>
            (s === 'b' && !pb) ? null : (
              <View key={s} style={[st.shot, { backgroundColor: '#0e1a26' }]}>
                {cur?.[s][i] ? <Image source={cur[s][i]} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`${s.toUpperCase()} ${EVENT_SHORT[r.event]} 장면`} /> : null}
                <Text style={st.shotTag}>{s.toUpperCase()}</Text>
              </View>
            )
          )}
        </View>
      ))}
    </ScrollView>
  );
}

export function ExportPanel({ plan, children }: { plan: CompositionPlan | null; children?: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ gap: 10 }}>
      {children}
      {plan ? (
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.ink }]}>
          {`만들 영상 ${plan.durationSec.toFixed(1)}초 · 약 ${Math.max(1, Math.round(plan.estimateBytes / 1e6))}MB${plan.disclosures.length ? ` · ${plan.disclosures.join(' · ')}` : ''}`}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        두 영상을 한 파일로 엮는 내보내기 · 목소리 해설 녹화는 영상 합성 기능이 든 새 앱이 필요해 아직 못 해요. 장면 모음은 실제 영상 장면이에요.
      </Text>
    </View>
  );
}

export const exportPlanFor = (range: RelRange | null, loop: RelRange | null, ma: number | null, mb: number | null, speed: number, layout: 'stack' | 'side' | 'overlay', flags: { normalized: boolean; approx: boolean; start: boolean }) =>
  range && ma != null
    ? planComposition({ range, from: (loop ?? range).min, to: (loop ?? range).max, ma, mb, speed, layout, normalized: flags.normalized, approxSync: flags.approx, startBased: flags.start })
    : null;

/* ---- 영상 정보(R31 — 사람이 정하는 조건) ---- */

const PITCH_TYPES = ['직구', '투심', '슬라이더', '커브', '체인지업', '스플리터', '커터'];
export function SourceInfoSheet({ src, onChange, onClose }: { src: SourceRef; onChange: (p: Partial<SourceRef>) => void; onClose: () => void }) {
  const c = usePalette();
  return (
    <Sheet title="영상 정보" onClose={onClose}>
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        견주기 · 거르기에 써요. 모르면 비워 두세요 — 비운 값은 짐작하지 않아요.
      </Text>
      <Text style={[TYPE.card, { color: c.ink }]}>던지는 손</Text>
      <Row wrap>
        <Chip label="모름" on={src.hand == null} onPress={() => onChange({ hand: null })} />
        <Chip label="오른손" on={src.hand === 'R'} onPress={() => onChange({ hand: 'R' })} />
        <Chip label="왼손" on={src.hand === 'L'} onPress={() => onChange({ hand: 'L' })} />
      </Row>
      <Text style={[TYPE.card, { color: c.ink }]}>촬영 방향</Text>
      <Row wrap>
        <Chip label="모름" on={src.view == null} onPress={() => onChange({ view: null })} />
        {(Object.keys(VIEW_LABEL) as ViewKey[]).map((v) => (
          <Chip key={v} label={VIEW_LABEL[v]} on={src.view === v} onPress={() => onChange({ view: v })} />
        ))}
      </Row>
      <Text style={[TYPE.card, { color: c.ink }]}>구종</Text>
      <Row wrap>
        <Chip label="모름" on={src.pitchType == null} onPress={() => onChange({ pitchType: null })} />
        {PITCH_TYPES.map((p) => (
          <Chip key={p} label={p} on={src.pitchType === p} onPress={() => onChange({ pitchType: p })} />
        ))}
      </Row>
      <Text style={[TYPE.card, { color: c.ink }]}>이 투구</Text>
      <Row wrap>
        <Chip label="정하지 않음" on={src.verdict == null} onPress={() => onChange({ verdict: null })} />
        <Chip label="잘 됨" on={src.verdict === 'good'} onPress={() => onChange({ verdict: 'good' })} />
        <Chip label="아쉬움" on={src.verdict === 'work'} onPress={() => onChange({ verdict: 'work' })} />
      </Row>
    </Sheet>
  );
}

const st = StyleSheet.create({
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, gap: 10, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 17, minHeight: 48 },
  tool: { minHeight: 44, minWidth: 56, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  toolText: { fontSize: 11, fontWeight: '600' },
  swatchHit: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 22, height: 22, borderRadius: 6 },
  eventRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  shot: { width: 132, height: 132, borderRadius: 10, overflow: 'hidden' },
  shotTag: { position: 'absolute', left: 6, top: 6, color: '#fff', fontSize: 11, fontWeight: '800' },
});

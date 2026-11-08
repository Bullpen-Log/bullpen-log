import { Image } from 'expo-image';
import type { VideoPlayer, VideoThumbnail } from 'expo-video';
import { type ReactNode, useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ctlH as fitCtlH, expandRows, FS_MAX, fsOf, headH, inspChrome, packPages, segBlockH, segItemW, segMode, textBtnW, type InspItem, type InspRow } from '~/compare/fit';
import { pageText } from '~/compare/workspace-layout';
import { TYPE, withAlpha } from '~/lib/ui';
import { useComparePalette } from '~/compare/ui/compare-palette';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 영상 비교 한 화면의 작은 부품(UI02 · UI05~UI09). 굴리는 판은 없다 — 넘치는 것은 쪽(이전 · 다음 단추)으로.
 * 작은 창(Inspector)은 하나만 뜬다. 줄을 단추 하나 · 글 조각 하나 단위의 덩어리로 나눠(compare/fit.ts expandRows) 쪽에 담는다 —
 * 한 덩어리가 쪽보다 크면 더 잘게 나누고(글), 잘라 숨기지 않는다(SS02).
 * 핵심 글자(단추 · 제목 · 고르기 · 쪽 번호)는 기기 글자 크기를 2배까지 그대로 따른다(SS07 — 1.3 · 1.4배 상한을 걷었다). 높이 · 폭 어림도 같은 배율로 셈한다.
 */

/** 단추 줄 높이 어림 — 단추 글자는 2배까지 커진다 */
export const ctlH = (fs: number) => fitCtlH(fs);
/** 단추 여럿이 감길 때 높이 어림(작은 창 밖에서 쓰던 이름 — 남겨 둔다) */
export function chipRowsH(labels: readonly string[], w: number, fs: number): number {
  let lines = 1;
  let x = 0;
  for (const l of labels) {
    const cw = Math.min(w, textBtnW(l, fs));
    if (x > 0 && x + 6 + cw > w) {
      lines += 1;
      x = cw;
    } else x += (x > 0 ? 6 : 0) + cw;
  }
  return lines * ctlH(fs) + (lines - 1) * 6;
}

export type IRow = InspRow<ReactNode>;
export type IItem = InspItem<ReactNode>;

/* ---- 단추 ---- */

export function IconBtn({ icon, label, onPress, disabled, on, size = 22, busy, color }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; on?: boolean; size?: number; busy?: boolean; color?: string }) {
  const c = useComparePalette();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!on, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={[st.icon, on && { backgroundColor: c.action }, disabled && { opacity: 0.35 }]}
    >
      {busy ? <ActivityIndicator color={on ? c.onAction : c.link} /> : <Icon name={icon} size={size} color={on ? c.onAction : (color ?? c.link)} />}
    </Press>
  );
}

export function TextBtn({ label, onPress, disabled, on, primary, a11y, hint, grow, icon }: { label: string; onPress: () => void; disabled?: boolean; on?: boolean; primary?: boolean; a11y?: string; hint?: string; grow?: boolean; icon?: IconName }) {
  const c = useComparePalette();
  const fill = primary || on;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected: !!on }}
      disabled={disabled}
      onPress={onPress}
      style={[st.text, { backgroundColor: fill ? c.action : withAlpha(c.ink, 0.07) }, grow && { flexGrow: 1 }, disabled && { opacity: 0.35 }]}
    >
      {icon ? <Icon name={icon} size={18} color={fill ? c.onAction : c.link} /> : null}
      {/* 자리가 좁으면 두 줄로 감긴다(자르지 않는다) — 줄 계획(fit.ts)은 한 줄 폭으로 놓고, 잰 높이로 다시 나눈다 */}
      <Text numberOfLines={2} maxFontSizeMultiplier={FS_MAX} style={[TYPE.buttonCompact, { color: fill ? c.onAction : c.link, textAlign: 'center', flexShrink: 1 }]}>
        {label}
      </Text>
    </Press>
  );
}

/**
 * 고르기(라디오 묶음) — 고른 칸이 늘 보인다. 폭(maxW)에 안 들어가면 두 줄까지 감기고(글자를 줄이거나 자르지 않는다),
 * 그보다 길거나 쪽 높이(maxH)를 넘으면 '지금 값' 단추가 되어 누르면 동작 시트에서 고른다(compare/fit.ts segMode).
 */
export function Seg<T extends string | number>({ options, value, onChange, label, compact, maxW, maxH }: { options: readonly { value: T; label: string; a11y?: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label: string; compact?: boolean; maxW?: number; maxH?: number }) {
  const c = useComparePalette();
  const fs = fsOf(useWindowDimensions().fontScale);
  const mode = maxW != null ? segMode(options.map((o) => o.label), maxW, fs, maxH).mode : 'row';
  if (mode === 'pick') {
    const cur = options.find((o) => o.value === value);
    const open = () => {
      const can = options.filter((o) => !o.disabled);
      const labels = [...can.map((o) => (o.value === value ? `${o.label} ✓` : o.label)), '취소'];
      ActionSheetIOS.showActionSheetWithOptions({ title: label, options: labels, cancelButtonIndex: labels.length - 1 }, (i) => can[i] && onChange(can[i].value));
    };
    return <TextBtn icon="chevron-down" label={cur?.label ?? label} a11y={`${label}, 지금 ${cur?.a11y ?? cur?.label ?? '없음'}, 바꾸기`} onPress={open} />;
  }
  const wrap = mode === 'wrap';
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[st.seg, { backgroundColor: withAlpha(c.ink, 0.07) }, wrap && { flexWrap: 'wrap', maxWidth: maxW }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.a11y ?? o.label}
            accessibilityState={{ selected: on, disabled: !!o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={[st.segItem, compact && { paddingHorizontal: 6, minWidth: 44 }, wrap && { flexShrink: 0, minWidth: segItemW(o.label, fs) }, on && { backgroundColor: c.card }, o.disabled && { opacity: 0.35 }]}
          >
            <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[TYPE.buttonCompact, { color: on ? c.ink : c.muted }]}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

export function Pager({ page, pages, onPage, label }: { page: number; pages: number; onPage: (p: number) => void; label: string }) {
  const c = useComparePalette();
  if (pages <= 1) return null;
  return (
    <View style={st.pager}>
      <IconBtn icon="chevron-left" label={`${label} 이전 쪽`} disabled={page <= 0} onPress={() => onPage(page - 1)} size={20} />
      <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${label} ${pages}쪽 중 ${page + 1}쪽`}>
        {pageText({ page, pages })}
      </Text>
      <IconBtn icon="chevron-right" label={`${label} 다음 쪽`} disabled={page >= pages - 1} onPress={() => onPage(page + 1)} size={20} />
    </View>
  );
}

/**
 * 작은 창 — 굴리지 않고 쪽으로. 하나만 뜬다(위가 정한다). 영상 · 타임라인 · 재생 줄은 그대로 쓸 수 있는 창이라(modal 아님)
 * VoiceOver 도 창 밖을 막지 않는다. 문지르기(escape)로 닫는다.
 * avail = 창이 받은 높이(위가 영상 가림 예산 compare/fit.ts inspectorBudget 으로 정한다).
 */
export function Inspector({ title, rows, avail, width, onClose, startRow }: { title: string; rows: readonly IRow[]; avail: number; width: number; onClose: () => void; startRow?: string | null }) {
  const c = useComparePalette();
  const fs = fsOf(useWindowDimensions().fontScale);
  const ch = inspChrome(fs);
  const bodyH = Math.max(44, avail - ch.head - ch.pad);
  const bodyW = Math.max(44, width - 20);
  /* 덩어리 높이 · 단추 폭은 어림으로 시작해, 그려진 것은 실제로 잰 값으로 다시 나눈다 */
  const [measuredH, setMeasuredH] = useState<Record<string, number>>({});
  const [measuredW, setMeasuredW] = useState<Record<string, number>>({});
  const [textFit, setTextFit] = useState<Record<string, number>>({});
  const blocks = expandRows(rows, { width: bodyW, bodyH, fs, measuredW, textFit });
  const plan = packPages(
    blocks.map((b) => ({ h: measuredH[b.key] ?? b.h, keepWithNext: b.head })),
    bodyH,
    8
  );
  if (__DEV__ && plan.oversize.length) console.warn(`[compare] 작은 창 '${title}' 쪽보다 큰 덩어리: ${plan.oversize.map((i) => blocks[i].key).join(', ')}`);
  /* 처음 열 쪽 — 그 줄이 든 쪽(예: 재생 › 반복 구간 고치기는 반복 줄이 든 쪽) */
  const [page, setPage] = useState(() => Math.max(0, plan.pages.findIndex((pg) => pg.some((i) => blocks[i]?.rowKey === startRow))));
  const p = Math.min(page, plan.pages.length - 1);
  const onBlock = (b: (typeof blocks)[number], h: number) => {
    if (Math.abs((measuredH[b.key] ?? -1) - h) > 1) setMeasuredH((m) => ({ ...m, [b.key]: h }));
    /* 글 조각이 어림보다 커 쪽을 넘으면 그 글을 더 잘게(다음 그림부터) */
    if (b.kind === 'text' && h > bodyH + 1) setTextFit((f) => ({ ...f, [b.rowKey]: Math.max(0.2, (f[b.rowKey] ?? 1) * (bodyH / h) * 0.95) }));
  };
  return (
    <View style={[st.insp, { backgroundColor: c.card, maxHeight: avail, width, borderColor: c.line }]} accessibilityViewIsModal={false} onAccessibilityEscape={onClose}>
      <View style={[st.inspHead, { minHeight: ch.head }]}>
        <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[TYPE.card, { color: c.ink, flex: 1 }]}>
          {title}
        </Text>
        <Pager page={p} pages={plan.pages.length} onPage={setPage} label={title} />
        <IconBtn icon="x" label={`${title} 닫기`} onPress={onClose} size={20} color={c.muted} />
      </View>
      <View style={st.inspBody}>
        {plan.pages[p].map((i) => {
          const b = blocks[i];
          return (
            <View key={b.key} onLayout={(e) => onBlock(b, Math.ceil(e.nativeEvent.layout.height))}>
              {b.kind === 'node' ? (
                b.node
              ) : b.kind === 'text' ? (
                <SubText text={b.s} danger={b.danger} body={b.style === 'body'} />
              ) : (
                <View style={st.wrap}>
                  {b.items.map((it) => (
                    <View
                      key={it.key}
                      style={{ maxWidth: bodyW }}
                      onLayout={(e) => {
                        const w = Math.ceil(e.nativeEvent.layout.width);
                        if (Math.abs((measuredW[it.key] ?? -1) - w) > 1) setMeasuredW((m) => ({ ...m, [it.key]: w }));
                      }}
                    >
                      {it.node}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ---- 줄 만들기 도우미 ---- */
export const rowOf = (key: string, h: number, node: ReactNode, head = false): IRow => ({ key, h, node, head });
export function HeadText({ text }: { text: string }) {
  const c = useComparePalette();
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={FS_MAX} style={[TYPE.buttonCompact, { color: c.ink }]}>
      {text}
    </Text>
  );
}
export function SubText({ text, danger, body }: { text: string; danger?: boolean; body?: boolean }) {
  const c = useComparePalette();
  return (
    <Text maxFontSizeMultiplier={FS_MAX} style={[body ? TYPE.body : TYPE.sub, { color: danger ? c.danger : body ? c.ink : c.muted }]}>
      {text}
    </Text>
  );
}
export function Wrap({ children }: { children: ReactNode }) {
  return <View style={st.wrap}>{children}</View>;
}
export const headRow = (key: string, text: string, fs: number) => rowOf(key, headH(fs), <HeadText text={text} />, true);
/** 보조 글 — 길면 쪽 높이에 맞춰 조각으로 나뉜다(잘리지 않는다) */
export const subRow = (key: string, text: string, _w?: number, _fs?: number, danger?: boolean): IRow => ({ key, h: 0, text: { s: text, danger, style: 'sub' } });
/** 단추 여럿 — 폭에 맞춰 줄로, 줄마다 쪽에 담는다(큰 Wrap 한 덩어리가 아니다) */
export const flowRow = (key: string, items: IItem[], lineH = 0): IRow => ({ key, h: lineH, items });
/** 글 단추 한 칸(폭 어림 = 글자 폭) · 그림 단추 한 칸(44) */
export const btnItem = (key: string, label: string, fs: number, node: ReactNode): IItem => ({ key, w: textBtnW(label, fs), node });
export const iconItem = (key: string, node: ReactNode, w = 44): IItem => ({ key, w, node });
/** 고르기 묶음 한 줄 — 폭에 안 들어가면 두 줄 높이, 그보다 크면 '지금 값' 단추 높이(Seg 에도 같은 maxW · maxH 를 준다) */
export const segRowOf = (key: string, labels: readonly string[], width: number, fs: number, node: ReactNode, maxH = Infinity) => rowOf(key, segBlockH(labels, width, fs, maxH), node);

/* ---- 장면 모음(R16 — 쪽마다 몇 장면씩) ---- */

/** A · B 장면 그림 한 칸 — row 면 A · B 를 나란히(짧은 가로 화면에서 B 그림이 잘리지 않게) */
export function ShotPair({ pa, pb, ta, tb, label, size, row }: { pa: VideoPlayer | null; pb: VideoPlayer | null; ta: number | null; tb: number | null; label: string; size: number; row?: boolean }) {
  const c = useComparePalette();
  const [shots, setShots] = useState<{ key: string; a: VideoThumbnail | null; b: VideoThumbnail | null } | null>(null);
  const key = `${ta ?? ''}|${tb ?? ''}`;
  useEffect(() => {
    let alive = true;
    const grab = async (p: VideoPlayer | null, t: number | null) => (p && t != null ? ((await p.generateThumbnailsAsync([t], { maxWidth: 240 }).catch(() => [] as VideoThumbnail[]))[0] ?? null) : null);
    void Promise.all([grab(pa, ta), grab(pb, tb)]).then(([a, b]) => alive && setShots({ key, a, b }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb, key]);
  const cur = shots?.key === key ? shots : null;
  return (
    <View style={{ width: row && pb ? size * 2 + 4 : size, gap: 4 }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>
        {label}
      </Text>
      <View style={{ flexDirection: row ? 'row' : 'column', gap: 4 }}>
        {(['a', 'b'] as const).map((s) =>
          s === 'b' && !pb ? null : (
            <View key={s} style={[st.shot, { width: size, height: size * 0.9 }]}>
              {cur?.[s] ? <Image source={cur[s]} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`${s.toUpperCase()} ${label} 장면`} /> : (s === 'a' ? ta : tb) == null ? <Text style={st.shotNone}>안 짚음</Text> : null}
              <Text style={st.shotTag}>{s.toUpperCase()}</Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 2, gap: 2 },
  segItem: { minHeight: 40, minWidth: 44, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center' },
  insp: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingBottom: 10, overflow: 'hidden' },
  inspHead: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inspBody: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  shot: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#0e1a26', alignItems: 'center', justifyContent: 'center' },
  shotTag: { position: 'absolute', left: 5, top: 4, color: '#fff', fontSize: 11, fontWeight: '800' },
  shotNone: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
});

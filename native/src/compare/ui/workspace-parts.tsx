import { Image } from 'expo-image';
import type { VideoPlayer, VideoThumbnail } from 'expo-video';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { packRows, pageText, textRowHeight } from '~/compare/workspace-layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 영상 비교 한 화면의 작은 부품(UI02 · UI05~UI09). 굴리는 판은 없다 — 넘치는 것은 쪽(이전 · 다음 단추)으로.
 * 작은 창(Inspector)은 무대(영상 자리) 위 아래쪽에 하나만 뜬다. 줄들의 높이를 어림해 들어가는 만큼 한 쪽에 담는다(packRows).
 */

/** 단추 줄 높이 어림 — 단추 글자는 1.4배까지 커진다(TYPE.buttonCompact 21 줄 높이 + 여백) */
export const ctlH = (fs: number) => Math.max(44, Math.ceil(21 * Math.min(fs, 1.4) + 18));
/** 칩이 여러 줄로 감길 때 높이 어림 */
export function chipRowsH(labels: readonly string[], w: number, fs: number): number {
  const k = Math.min(fs, 1.4);
  let lines = 1;
  let x = 0;
  for (const l of labels) {
    const cw = Math.max(44, l.length * 15 * k + 28);
    if (x > 0 && x + 6 + cw > w) {
      lines += 1;
      x = cw;
    } else x += (x > 0 ? 6 : 0) + cw;
  }
  return lines * ctlH(fs) + (lines - 1) * 6;
}
export const subH = (text: string, w: number, fs: number) => textRowHeight(text, w, 13, 19, Math.min(fs, 1.6));

export type IRow = { key: string; h: number; node: ReactNode; head?: boolean };

/* ---- 단추 ---- */

export function IconBtn({ icon, label, onPress, disabled, on, size = 22, busy, color }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; on?: boolean; size?: number; busy?: boolean; color?: string }) {
  const c = usePalette();
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

export function TextBtn({ label, onPress, disabled, on, primary, a11y, hint, grow }: { label: string; onPress: () => void; disabled?: boolean; on?: boolean; primary?: boolean; a11y?: string; hint?: string; grow?: boolean }) {
  const c = usePalette();
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
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: fill ? c.onAction : c.link }]}>
        {label}
      </Text>
    </Press>
  );
}

/** 고르기(라디오 묶음) — 고른 칸이 늘 보인다 */
export function Seg<T extends string | number>({ options, value, onChange, label, compact }: { options: readonly { value: T; label: string; a11y?: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label: string; compact?: boolean }) {
  const c = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[st.seg, { backgroundColor: withAlpha(c.ink, 0.07) }]}>
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
            style={[st.segItem, compact && { paddingHorizontal: 4, minWidth: 44 }, on && { backgroundColor: c.card }, o.disabled && { opacity: 0.35 }]}
          >
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: on ? c.ink : c.muted }]}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

export function Pager({ page, pages, onPage, label }: { page: number; pages: number; onPage: (p: number) => void; label: string }) {
  const c = usePalette();
  if (pages <= 1) return null;
  return (
    <View style={st.pager}>
      <IconBtn icon="chevron-left" label={`${label} 이전 쪽`} disabled={page <= 0} onPress={() => onPage(page - 1)} size={20} />
      <Text maxFontSizeMultiplier={1.3} style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${label} ${pages}쪽 중 ${page + 1}쪽`}>
        {pageText({ page, pages })}
      </Text>
      <IconBtn icon="chevron-right" label={`${label} 다음 쪽`} disabled={page >= pages - 1} onPress={() => onPage(page + 1)} size={20} />
    </View>
  );
}

/** 무대 위 작은 창 — 굴리지 않고 쪽으로. 하나만 뜬다(위가 정한다) */
export function Inspector({ title, rows, avail, width, onClose, startRow }: { title: string; rows: readonly IRow[]; avail: number; width: number; onClose: () => void; startRow?: string | null }) {
  const c = usePalette();
  const bodyH = Math.max(44, avail - 44 - 20);
  /* 줄 높이는 어림으로 시작해, 그려진 줄은 실제로 잰 높이로 다시 나눈다(어림이 작아 쪽 밖으로 잘리는 일이 없게) */
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const pages = packRows(
    rows.map((r) => measured[r.key] ?? r.h),
    bodyH,
    8,
    rows.map((r) => !!r.head)
  );
  /* 처음 열 쪽 — 그 줄이 든 쪽(예: 재생 › 반복 구간 고치기는 반복 줄이 든 쪽) */
  const [page, setPage] = useState(() => Math.max(0, pages.findIndex((pg) => pg.some((i) => rows[i].key === startRow))));
  const p = Math.min(page, pages.length - 1);
  return (
    <View style={[st.insp, { backgroundColor: c.card, maxHeight: avail, width, borderColor: c.line }]} accessibilityViewIsModal={false}>
      <View style={st.inspHead}>
        <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.card, { color: c.ink, flex: 1 }]}>
          {title}
        </Text>
        <Pager page={p} pages={pages.length} onPage={setPage} label={title} />
        <IconBtn icon="x" label={`${title} 닫기`} onPress={onClose} size={20} color={c.muted} />
      </View>
      <View style={st.inspBody}>
        {pages[p].map((i) => (
          <View
            key={rows[i].key}
            onLayout={(e) => {
              const h = Math.ceil(e.nativeEvent.layout.height);
              const k = rows[i].key;
              setMeasured((m) => (Math.abs((m[k] ?? -1) - h) > 1 ? { ...m, [k]: h } : m));
            }}
          >
            {rows[i].node}
          </View>
        ))}
      </View>
    </View>
  );
}

/** 줄 만들기 도우미 */
export const rowOf = (key: string, h: number, node: ReactNode, head = false): IRow => ({ key, h, node, head });
export function HeadText({ text }: { text: string }) {
  const c = usePalette();
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.ink }]}>
      {text}
    </Text>
  );
}
export function SubText({ text, danger }: { text: string; danger?: boolean }) {
  const c = usePalette();
  return (
    <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: danger ? c.danger : c.muted }]}>
      {text}
    </Text>
  );
}
export function Wrap({ children }: { children: ReactNode }) {
  return <View style={st.wrap}>{children}</View>;
}
export const headRow = (key: string, text: string, fs: number) => rowOf(key, Math.ceil(21 * Math.min(fs, 1.4)), <HeadText text={text} />, true);
export const subRow = (key: string, text: string, w: number, fs: number, danger?: boolean) => rowOf(key, subH(text, w, fs), <SubText text={text} danger={danger} />);

/* ---- 장면 모음(R16 — 쪽마다 몇 장면씩) ---- */

export function ShotPair({ pa, pb, ta, tb, label, size }: { pa: VideoPlayer | null; pb: VideoPlayer | null; ta: number | null; tb: number | null; label: string; size: number }) {
  const c = usePalette();
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
    <View style={{ width: size, gap: 4 }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>
        {label}
      </Text>
      {(['a', 'b'] as const).map((s) =>
        s === 'b' && !pb ? null : (
          <View key={s} style={[st.shot, { width: size, height: size * 0.9 }]}>
            {cur?.[s] ? <Image source={cur[s]} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`${s.toUpperCase()} ${label} 장면`} /> : (s === 'a' ? ta : tb) == null ? <Text style={st.shotNone}>안 짚음</Text> : null}
            <Text style={st.shotTag}>{s.toUpperCase()}</Text>
          </View>
        )
      )}
    </View>
  );
}


const st = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 2, gap: 2 },
  segItem: { minHeight: 40, minWidth: 44, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center' },
  insp: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingBottom: 10, overflow: 'hidden' },
  inspHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 2 },
  inspBody: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  shot: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#0e1a26', alignItems: 'center', justifyContent: 'center' },
  shotTag: { position: 'absolute', left: 5, top: 4, color: '#fff', fontSize: 11, fontWeight: '800' },
  shotNone: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
});

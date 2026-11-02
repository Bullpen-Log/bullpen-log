import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MyVideoItem } from '@/lib/my-videos';
import { sourceOf, type ComparisonDocument, type NewSource } from '~/compare/doc';
import { candidatesFor, type PickChoice, type PickSlot } from '~/compare/source-pick';
import { discardImported, filesPickSupported, importForCompare, IMPORT_FAIL_TEXT, releaseHold, type ImportKind } from '~/compare/store';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { VideoGallery, type PickAction } from '~/videos/gallery';

/**
 * 비교할 영상 고르기 한 화면(F07) — B 더하기 · A 바꾸기 · B 바꾸기 · 없는 영상 다시 잇기가 모두 이것이다.
 * 고를 수 있는 것: 이 비교에 이미 있는 영상 · 같은 영상 한 칸 더 · 내 영상(투구 기록 영상 포함) · 사진 앱 · 바로 촬영 · 파일 앱.
 * 고르는 동안 비교 문서는 바뀌지 않는다 — '취소'면 그대로 돌아간다(onCancel). 사진 앱 · 촬영 · 파일은 고르면 바로 그 영상으로(onPick).
 * 가져온 앱 안 복사본은 holdKey 로 붙들고, 화면이 문서에 넘기지 못하고 닫히면 정리한다.
 */
type Sel = { kind: 'gallery'; path: string } | { kind: 'existing'; id: string } | { kind: 'same' } | null;

export function SourcePicker({
  doc,
  slot,
  relink,
  missing,
  itemOf,
  labelOf,
  holdKey,
  onPick,
  onCancel,
}: {
  doc: ComparisonDocument;
  slot: PickSlot;
  relink: string | null;
  missing: ReadonlySet<string>;
  itemOf: (path: string | null) => MyVideoItem | null;
  labelOf: (sourceId: string) => string;
  holdKey: string;
  onPick: (c: PickChoice, sourceFrom?: NewSource) => void;
  onCancel: () => void;
}) {
  const c = usePalette();
  const fixedId = slot === 'a' ? doc.active.b : doc.active.a;
  const fixed = sourceOf(doc, fixedId);
  const currentId = relink ?? (slot === 'a' ? doc.active.a : doc.active.b);
  const [sel, setSel] = useState<Sel>(() => (currentId && !relink ? { kind: 'existing', id: currentId } : null));
  const [busy, setBusy] = useState<ImportKind | null>(null);
  /* 닫힌 뒤 늦게 끝난 가져오기는 문서에 넣지 않고 정리한다 */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const imp = async (kind: ImportKind) => {
    if (busy) return;
    setBusy(kind);
    try {
      const r = await importForCompare(kind, false, holdKey);
      if (!alive.current) {
        await discardImported(r.sources.map((s) => s.path));
        releaseHold(holdKey);
        return;
      }
      if (r.error && !r.sources.length) toast(IMPORT_FAIL_TEXT[r.error], 'error');
      const got = r.sources[0];
      if (got) onPick({ kind: 'new', source: got });
    } finally {
      if (alive.current) setBusy(null);
    }
  };
  const actions: PickAction[] = [
    { label: '사진 앱에서', icon: 'image-plus', onPress: () => void imp('photos'), busy: busy === 'photos' },
    { label: '바로 촬영', icon: 'video', onPress: () => void imp('camera'), busy: busy === 'camera' },
    ...(filesPickSupported() ? [{ label: '파일에서', icon: 'folder' as const, onPress: () => void imp('files'), busy: busy === 'files' }] : []),
  ];

  /* 이 비교에 이미 있는 영상(고정한 쪽은 빼고) */
  const inDoc = candidatesFor(doc, slot).filter((s) => !relink || s.id !== relink);
  const selPath = sel?.kind === 'gallery' ? sel.path : sel?.kind === 'existing' ? (sourceOf(doc, sel.id)?.path ?? null) : null;
  const unchanged = sel?.kind === 'existing' && sel.id === currentId && !relink;
  const selText =
    sel == null
      ? relink
        ? '다시 이을 영상을 골라 주세요.'
        : slot === 'a'
          ? '새 A 영상을 골라 주세요.'
          : '비교할 영상 B를 골라 주세요.'
      : sel.kind === 'same'
        ? `${slot.toUpperCase()} · 같은 영상을 한 칸 더(보기 · 그림은 따로)`
        : sel.kind === 'existing'
          ? `${slot.toUpperCase()} · ${labelOf(sel.id)}${unchanged ? ' · 지금 영상' : ''}`
          : `${slot.toUpperCase()} · ${itemOf(sel.path) ? '내 영상' : '영상'} 골랐어요`;
  const confirm = () => {
    if (!sel || unchanged) return onCancel();
    if (sel.kind === 'existing') return onPick({ kind: 'existing', sourceId: sel.id });
    if (sel.kind === 'same') return onPick({ kind: 'same' });
    return onPick({ kind: 'new', source: { path: sel.path, origin: 'myVideos', owned: false, label: null, date: null } });
  };

  const extra =
    inDoc.length || (slot === 'b' && fixed && !relink) ? (
      <View style={{ gap: 6 }}>
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]} accessibilityRole="header">
          이 비교의 영상
        </Text>
        {inDoc.map((s) => {
          const on = sel?.kind === 'existing' && sel.id === s.id;
          const gone = missing.has(s.path);
          return (
            <Press
              key={s.id}
              select
              selected={on}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: gone }}
              accessibilityLabel={`${labelOf(s.id)}${s.id === currentId ? ', 지금 영상' : ''}${gone ? ', 이 기기에 없음' : ''}`}
              disabled={gone}
              onPress={() => setSel(on ? null : { kind: 'existing', id: s.id })}
              style={[st.row, { backgroundColor: on ? withAlpha(c.action, 0.12) : c.card }, gone && { opacity: 0.45 }]}
            >
              <Icon name={on ? 'check' : 'film'} size={18} color={on ? c.link : c.muted} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.body, { color: c.ink, flex: 1 }]}>
                {labelOf(s.id)}
              </Text>
              <Text maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: c.muted }]}>
                {gone ? '이 기기에 없음' : s.id === currentId ? '지금' : ''}
              </Text>
            </Press>
          );
        })}
        {slot === 'b' && fixed && !relink ? (
          <Press
            select
            selected={sel?.kind === 'same'}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel?.kind === 'same' }}
            accessibilityLabel="A 와 같은 영상을 B 로 한 번 더, 보기와 그림은 따로"
            onPress={() => setSel(sel?.kind === 'same' ? null : { kind: 'same' })}
            style={[st.row, { backgroundColor: sel?.kind === 'same' ? withAlpha(c.action, 0.12) : c.card }]}
          >
            <Icon name={sel?.kind === 'same' ? 'check' : 'copy'} size={18} color={sel?.kind === 'same' ? c.link : c.muted} />
            <Text numberOfLines={2} maxFontSizeMultiplier={1.6} style={[TYPE.body, { color: c.ink, flex: 1 }]}>
              A 와 같은 영상을 한 칸 더
            </Text>
          </Press>
        ) : null}
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted, marginTop: 4 }]}>
          내 영상
        </Text>
      </View>
    ) : null;

  return (
    <VideoGallery
      pick={{
        a: fixed ? itemOf(fixed.path) : null,
        aPath: fixed?.path ?? '',
        fixed: fixed ? { side: slot === 'a' ? 'B' : 'A', title: labelOf(fixed.id) } : undefined,
        selected: selPath,
        onSelect: (v) => setSel((s) => (s?.kind === 'gallery' && s.path === v.path ? null : { kind: 'gallery', path: v.path })),
        onBack: onCancel,
        title: relink ? '영상 다시 잇기' : slot === 'a' ? 'A 영상 바꾸기' : doc.active.b ? 'B 영상 바꾸기' : '비교할 영상',
        actions,
        extra,
        foot: { text: selText, enabled: !!sel || (!!currentId && !relink) },
        next: { label: !sel || unchanged ? '비교로 돌아가기' : relink ? '이 영상으로 다시 잇기' : '기준 장면 맞추기', onPress: confirm },
        knownMissing: missing,
      }}
    />
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 14, paddingHorizontal: 14 },
});

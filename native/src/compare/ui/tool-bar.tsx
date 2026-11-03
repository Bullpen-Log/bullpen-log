import { type ReactNode, useState } from 'react';
import { ActionSheetIOS, StyleSheet, View } from 'react-native';
import { MORE_KEY, planBarAdaptive, type BarItem } from '~/compare/fit';
import { IconBtn } from '~/compare/ui/workspace-parts';

/**
 * 도구 줄(SS01) — 잰 폭에 맞춰 단추를 줄에 놓는다(compare/fit.ts planBar). 꼭 있어야 할 단추(지금 도구 · 되돌리기 · 완료 등)는 늘 같은 자리에 보이고,
 * 자리가 모자라면 덜 중요한 것부터 '더보기' 동작 시트로 옮긴다. 가로로 굴리지 않고, 단추(44)를 줄이지 않는다.
 * 줄 폭 · 단추 폭은 어림으로 시작해 그려진 것을 실제로 잰 값으로 다시 놓는다.
 */
export type ToolItem = BarItem & {
  node: ReactNode;
  /** 좁을 때 그릴 모양(compactW 와 짝) */
  compactNode?: ReactNode;
  /** '더보기'로 옮겼을 때의 동작 */
  more?: { label: string; run: () => void; destructive?: boolean; disabled?: boolean };
};

export function ToolBar({ items, width, maxRows, label, preferCompact }: { items: readonly ToolItem[]; width: number; maxRows: number; label: string; preferCompact?: boolean }) {
  const [box, setBox] = useState<number | null>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const plan = planBarAdaptive(
    items.map((it) => ({ ...it, w: measured[it.key] ?? it.w })),
    { width: box ?? width, maxRows, preferCompact }
  );
  const byKey = new Map(items.map((it) => [it.key, it]));
  const overflow = plan.overflow.map((k) => byKey.get(k)).filter((x): x is ToolItem => !!x?.more && !x.more.disabled);
  const openMore = () => {
    const opts = [...overflow.map((x) => x.more!.label), '취소'];
    const destructive = overflow.findIndex((x) => x.more!.destructive);
    ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: destructive >= 0 ? destructive : undefined, title: label }, (i) => overflow[i]?.more!.run());
  };
  const compact = new Set(plan.compact);
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={label}
      style={st.wrap}
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs((box ?? -1) - w) > 1) setBox(w);
      }}
    >
      {plan.lines.map((line, li) => (
        <View key={li} style={st.line}>
          {line.map((k) => {
            if (k === MORE_KEY)
              return overflow.length ? (
                <IconBtn key={k} icon="ellipsis" label={`더보기: ${overflow.map((x) => x.more!.label).join(', ')}`} onPress={openMore} />
              ) : null;
            const it = byKey.get(k);
            if (!it) return null;
            const node = compact.has(k) && it.compactNode ? it.compactNode : it.node;
            return (
              <View key={k} style={it.push ? st.push : undefined}>
                {it.push ? <View style={{ flex: 1 }} /> : null}
                <View
                  onLayout={(e) => {
                    if (compact.has(k)) return;
                    const w = Math.ceil(e.nativeEvent.layout.width);
                    if (Math.abs((measured[k] ?? -1) - w) > 1) setMeasured((m) => ({ ...m, [k]: w }));
                  }}
                >
                  {node}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  push: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
});

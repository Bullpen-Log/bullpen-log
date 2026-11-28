import { StyleSheet, Text, View } from 'react-native';
import { REPORT_STATUS_TEXT, type PitchReport, type ReportItem } from '@/lib/pitch-3d/v2/report';
import { resultCriteria, resultRating, resultValue } from '@/lib/pitch-3d/v2/report-readout';
import { TYPE, type Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';

export function ReportRangeSheet({ item, title, ground, c, onClose }: {
  item: ReportItem;
  title: string;
  ground: PitchReport['ground'];
  c: Palette;
  onClose: () => void;
}) {
  const { meaning, rows, appliedRange, note } = resultCriteria(item, ground);
  const value = resultValue(item);
  const rating = resultRating(item.status);
  return (
    <Sheet fit open title={title} c={c} onClose={onClose}>
      <View testID="lab-measurement-sheet" style={s.content}>
        <View style={[s.row, s.result, { backgroundColor: c.card }]}>
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{value == null ? REPORT_STATUS_TEXT[rating] : '이번 투구'}</Text>
          {value != null && (
            <Text style={[TYPE.card, s.number, { color: c.ink }]}>{value} · {REPORT_STATUS_TEXT[rating]}</Text>
          )}
        </View>
        <Text style={[TYPE.body, { color: c.muted }]}>{meaning}</Text>
        {rows.length > 0 && (
          <View style={[s.ranges, { borderColor: c.line }]}>
            {rows.map((row, index) => (
              <View
                key={row.rating}
                testID={`lab-range-${row.rating}`}
                style={[
                  s.row, s.range,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line },
                  row.rating === appliedRange && { backgroundColor: c.chip },
                ]}
              >
                <Text style={[TYPE.buttonCompact, { color: row.rating === appliedRange ? c.link : c.ink }]}>{REPORT_STATUS_TEXT[row.rating]}</Text>
                <Text style={[TYPE.body, s.number, s.rangeText, { color: c.ink }]}>{row.range}</Text>
              </View>
            ))}
          </View>
        )}
        {note ? <Text style={[TYPE.sub, { color: c.muted }]}>{note}</Text> : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  content: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  result: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  ranges: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  range: { minHeight: 42, paddingHorizontal: 12, paddingVertical: 9 },
  rangeText: { flexShrink: 1, textAlign: 'right' },
  number: { fontVariant: ['tabular-nums'] },
});

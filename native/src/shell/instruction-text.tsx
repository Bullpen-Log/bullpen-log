import { StyleSheet, Text, View } from 'react-native';
import { instructionSections } from '~/lib/instruction-blocks';
import { TYPE, type Palette } from '~/lib/ui';

/** 운동·드릴 원문을 펼쳐 읽는 공통 본문. 주의사항을 포함한 모든 구역을 표시한다. */
export function InstructionText({ text, c }: { text: string; c: Palette }) {
  return (
    <View style={styles.sections}>
      {instructionSections(text).map((section, index) => (
        <View key={index} style={[styles.section, section.caution && { backgroundColor: c.warnBg, borderColor: c.warnLine, borderWidth: 1, borderRadius: 14, padding: 14 }]}>
          {section.title ? <Text accessibilityRole="header" selectable style={[TYPE.card, styles.title, { color: section.caution ? c.warn : c.ink }]}>{section.title}</Text> : null}
          {section.lines.map((line, n) => (
            <Text key={n} selectable style={[TYPE.reading, { color: c.ink }]}>
              {line.marker ? <Text style={{ color: section.caution ? c.warn : c.link, fontWeight: '600' }}>{line.marker} </Text> : null}
              {line.text}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 22 },
  section: { gap: 10 },
  title: { lineHeight: 24 },
});

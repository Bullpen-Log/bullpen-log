import { ActivityIndicator, Alert, Linking, Text, View } from 'react-native';
import { LATER_CATEGORY } from '@/lib/categories';
import { familyTitle } from '@/lib/mechanics/drills';
import { focusPriority } from '@/lib/mechanics/focus-priority';
import { instagramReferenceLabel, splitInstagramReference } from '@/lib/mechanics/reference-draft';
import type { ElementRx } from '@/lib/pitch-3d/v2/report';
import { useLoad } from '~/community/parts';
import { DetailMedia } from '~/library/detail';
import { DRILL_LIST, type Drill } from '~/library/parts';
import { TYPE, type Palette } from '~/lib/ui';
import { InstructionText } from '~/shell/instruction-text';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';

export type DrillSelection = { title: string; element: ElementRx['element']; stage: ElementRx['weeks'][number]['stage'] };
type DrillList = { ok: true; drills: Drill[] } | { ok: false; to: string };

export function LabDrillSheet({ drill, onClose, c }: { drill: DrillSelection; onClose: () => void; c: Palette }) {
  const { data, error, reload } = useLoad<DrillList>(DRILL_LIST);
  const item = data?.drills
    .filter((g) => g.category !== LATER_CATEGORY && familyTitle(g.title) === drill.title &&
      g.stage === drill.stage && g.focusPoints.includes(drill.element))
    .sort((a, b) => focusPriority(a.focusPoints, [drill.element]) - focusPriority(b.focusPoints, [drill.element]) ||
      Number(Boolean(b.videoPath || b.referenceVideoId)) - Number(Boolean(a.videoPath || a.referenceVideoId)) ||
      a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0];
  const details = item ? splitInstagramReference(item.description) : null;
  const external = item && !item.videoPath && !item.referenceVideoId ? details?.url : null;
  return (
    <Sheet fit open title={drill.title} c={c} onClose={onClose}>
      {!data && !error ? <ActivityIndicator accessibilityLabel="드릴 불러오는 중" color={c.link} /> : item && details ? (
        <View testID="lab-drill-sheet" style={{ gap: 14 }}>
          {external ? (
            <Press accessibilityRole="link" onPress={() => void Linking.openURL(external).catch(() => Alert.alert('참고 영상을 열 수 없어요.'))}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>{instagramReferenceLabel(details.segment)}</Text>
            </Press>
          ) : <DetailMedia key={item.id} item={item} c={c} />}
          {details.text.trim() ? <InstructionText text={details.text} c={c} /> : (
            <Text style={[TYPE.body, { color: c.muted }]}>등록된 설명이 없어요.</Text>
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={[TYPE.body, { color: c.muted }]}>{error ?? '라이브러리에서 이 드릴을 찾을 수 없어요.'}</Text>
          <Press accessibilityRole="button" onPress={() => void reload()} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>다시 불러오기</Text>
          </Press>
        </View>
      )}
    </Sheet>
  );
}

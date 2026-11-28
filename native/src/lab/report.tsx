import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REPORT_CRITERIA, REPORT_STATUS_TEXT, prescriptionMessage, rxAction,
  type FocusProgress, type PitchReport, type ReportItem,
} from '@/lib/pitch-3d/v2/report';
import { itemObs, nextStepsOf, reportLead } from '@/lib/pitch-3d/v2/report-view';
import { compareDeltaText, compareRangeText, prevDateText, PREV_CONFIRM, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import { TYPE, type Palette } from '~/lib/ui';
import { type Href, router } from 'expo-router';
import { canOpen, noticeLocked, pushOpen } from '~/shell/release';
import { leaveTo } from '~/shell/web-nav';
import { Icon } from '~/shell/icon';
import type { DrillSelection } from './drill-sheet';

export const STAGE_BG = '#151722';

export function ResultCard({ c, report, onScene, canShowScene }: {
  c: Palette;
  report: PitchReport;
  onScene: (item: ReportItem) => void;
  canShowScene: (item: ReportItem) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lead = reportLead(report);
  const headline = (lead.kind === 'finding' ? itemObs(lead.item) : lead.title).split(/\r?\n/, 1)[0];
  return (
    <View style={[s.list, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Pressable
        testID="lab-key-result"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint="여섯 동작 요소의 분석 결과"
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [s.card, s.row, pressed && s.pressed]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[TYPE.sub, { color: c.muted }]}>핵심 결과</Text>
          <Text style={[TYPE.card, { color: c.ink }]}>{headline}</Text>
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.link} />
      </Pressable>
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          {report.items.map((item) => {
            const enabled = canShowScene(item);
            const statusColor = item.status === 'improve' || item.status === 'edge' ? c.warn : item.status === 'good' ? c.ok : c.muted;
            return (
              <View key={item.key} style={[s.row, s.phase, { borderTopColor: c.line }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
                    <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{item.element}</Text>
                    <Text style={[TYPE.sub, { color: statusColor }]}>{REPORT_STATUS_TEXT[item.status]}</Text>
                  </View>
                  <Text style={[TYPE.sub, { color: c.muted }]}>{itemObs(item)}</Text>
                </View>
                <Pressable
                  testID={`lab-scene-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.element} 장면 보기`}
                  accessibilityState={{ disabled: !enabled }}
                  disabled={!enabled}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onScene(item);
                  }}
                  style={({ pressed }) => [s.scene, { backgroundColor: c.chip }, (!enabled || pressed) && s.pressed]}
                >
                  <Text style={[TYPE.sub, { color: enabled ? c.link : c.muted }]}>장면 보기</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function openElement(elementKey: string) {
  const href = `/training?view=mechanics&tab=elements&el=${elementKey}`;
  if (!canOpen(href)) return noticeLocked();
  leaveTo(href);
}

export function TrainingAction({ c, report, mine, focus }: { c: Palette; report: PitchReport; mine: boolean; focus: FocusProgress }) {
  const first = report.criteria === REPORT_CRITERIA ? report.rx[0] : undefined;
  if (!first) return null;
  const action = rxAction(mine, focus);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (action.kind === 'progress') return pushOpen('/training-mechanics' as Href);
        if (action.kind === 'retake') return pushOpen('/lab/new' as Href);
        openElement(first.key);
      }}
      style={({ pressed }) => [s.step, { backgroundColor: c.card }, pressed && s.pressed]}
    >
      <Text style={[TYPE.buttonCompact, { color: c.link }]}>{action.label}</Text>
      <Icon name="chevron-right" size={18} color={c.link} />
    </Pressable>
  );
}

export function RxCard({ c, report, onDrill }: {
  c: Palette;
  report: PitchReport;
  onDrill: (drill: DrillSelection) => void;
}) {
  const current = report.criteria === REPORT_CRITERIA;
  if (!current || report.rx.length === 0) {
    const steps = current && report.coverage ? nextStepsOf(report) : [];
    const measured = report.items.some((item) => item.status !== 'note' && item.status !== 'unsure');
    const needsDrill = report.items.some((item) => item.prescriptionEligible);
    if (current && measured && !steps.length && !needsDrill) return null;
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 8 }]}>
        <Text style={[TYPE.sub, { color: c.muted }]}>
          {current && !measured ? '동작을 평가할 수 있는 영상이 필요해요.' : prescriptionMessage(report)}
        </Text>
        {steps.map((step) => (
          <Pressable
            key={step.kind}
            accessibilityRole="link"
            onPress={() => step.kind === 'guide' ? pushOpen('/lab/guide?s=frame' as Href) : step.elementKey && openElement(step.elementKey)}
            style={s.step}
          >
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>{step.label}</Text>
          </Pressable>
        ))}
        {current && !measured && (
          <Pressable accessibilityRole="button" onPress={() => pushOpen('/lab/new' as Href)} style={s.step}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>영상 다시 골라 분석</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[TYPE.section, s.secLabel, { color: c.ink }]}>드릴 처방 및 피드백</Text>
      {report.rx.map((rx) => {
        const picks = rx.weeks.flatMap((week) =>
          week.drills.map((drill) => ({ title: drill.title, stage: week.stage, element: rx.element }))
        );
        // 두 문제가 있으면 각각 첫 드릴을 보여 준다. 한 문제가 있으면 원래 우선순위의 두 드릴까지 보여 준다.
        const drills = picks.filter((drill, i) => picks.findIndex((d) => d.title === drill.title) === i)
          .slice(0, report.rx.length > 1 ? 1 : 2);
        return (
          <View key={rx.key} style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 6 }]}>
            <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>{rx.element}</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{rx.cue}</Text>
            {drills.map((drill) => (
              <Pressable
                testID={`lab-drill-${rx.key}-${drill.stage}`}
                key={drill.title}
                accessibilityRole="button"
                accessibilityLabel={drill.title}
                accessibilityHint={`${rx.element} 드릴 영상과 방법 열기`}
                onPress={() => onDrill(drill)}
                style={({ pressed }) => [s.row, s.drill, { borderTopColor: c.line }, pressed && s.pressed]}
              >
                <Text style={[TYPE.buttonCompact, { color: c.link, flex: 1 }]}>{drill.title}</Text>
                <Icon name="chevron-right" size={18} color={c.link} />
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function CompareCard({ c, prev }: { c: Palette; prev: PreviousComparison }) {
  const [same, setSame] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, s.secLabel]}>
        <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
          지난번과 견주기
        </Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{prevDateText(prev.requestedAt)}</Text>
      </View>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 12 }]}>
        {!prev.compared ? (
          <Text style={[TYPE.body, { color: c.muted }]}>{prev.reason ?? '양쪽에서 견줄 수 있는 지표가 없어요.'}</Text>
        ) : !same ? (
          <>
            <Text style={[TYPE.body, { color: c.ink }]}>숫자는 촬영 조건이 같을 때만 견줄 수 있어요.</Text>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setSame(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [s.cta, { backgroundColor: c.page, opacity: pressed ? 0.7 : 1, paddingHorizontal: 16 }]}
            >
              <Text style={[TYPE.body, { color: c.ink, fontWeight: '600', textAlign: 'center' }]}>{PREV_CONFIRM}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {prev.rows.map((r) => (
              <View key={r.key} style={[s.row, { alignItems: 'flex-start', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.body, { color: c.ink }]}>{r.element}</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>{r.label}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[TYPE.body, { color: c.ink, fontVariant: ['tabular-nums'] }]}>
                    {compareRangeText(r.element, r.unit, r.before, r.after)}
                  </Text>
                  <Text style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]}>{compareDeltaText(r.unit, r.delta)}</Text>
                </View>
              </View>
            ))}
            <Text style={[TYPE.sub, { color: c.muted }]}>{prev.note}</Text>
          </>
        )}
        <Pressable onPress={() => router.push(`/lab/${prev.reportId}` as Href)} accessibilityRole="link" hitSlop={8}>
          <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>지난번 리포트 보기 ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  secLabel: { paddingHorizontal: 4 },
  card: { borderRadius: 16, padding: 14 },
  list: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  phase: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  scene: { minHeight: 44, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  step: { flexDirection: 'row', minHeight: 44, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderRadius: 12 },
  drill: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  cta: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REPORT_STATUS_TEXT,
  REPORT_CRITERIA,
  measurementText,
  coverageText,
  prescriptionMessage,
  rxAction,
  type ElementRx,
  type FocusProgress,
  type PitchReport,
  type ReportGauge,
  type ReportItem,
  type ReportStatus,
} from '@/lib/pitch-3d/v2/report';
import { itemObs, itemSub, nextStepsOf, reportLead, sceneLabel, showsGauge, type ReportNextStep } from '@/lib/pitch-3d/v2/report-view';
import { compareDeltaText, compareRangeText, prevDateText, PREV_CONFIRM, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import { TYPE, type Palette } from '~/lib/ui';
import { type Href, router } from 'expo-router';
import { leaveTo } from '~/shell/web-nav';

/**
 * 투구 진단 리포트 조각(앱, 2026-10-27 개편 — 장면 → 근거 → 해석 → 다음 선택) — 웹 app/(app)/videos/lab/[id]/report-parts.tsx 와 같은 차례 · 같은 글
 * (고르기는 lib/pitch-3d/v2/report-view.ts). 이번 투구의 핵심 · 여섯 요소 판독 · 개선 드릴 · 지난번과 견주기. 3D 무대 · 원본 영상은 app/lab/[id].tsx.
 * 색은 sky · warn · ok 셋, 상태는 색 · 모양 · 글 셋으로 가른다.
 */

/** 3D 무대 판 — embed 화면 바탕과 같다 */
export const STAGE_BG = '#151722';

/* ───────────────────────────── 상태 표시 ───────────────────────────── */

function dotStyle(c: Palette, st: ReportStatus) {
  switch (st) {
    case 'improve':
      return { backgroundColor: c.warn };
    case 'edge':
      return { borderWidth: 2.5, borderColor: c.warn, backgroundColor: c.card };
    case 'fair':
      return { backgroundColor: c.lineStrong };
    case 'good':
      return { backgroundColor: c.ok };
    /* 참고 = 수치를 잰 지표(실선 고리 + 가운데 점), 확인 못 함 = 점선 빈 고리 — 색만으로 가르지 않는다 */
    case 'note':
      return { borderWidth: 2, borderColor: c.muted, backgroundColor: c.card };
    default:
      return { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.lineStrong, backgroundColor: c.card };
  }
}

function Dot({ c, status }: { c: Palette; status: ReportStatus }) {
  return (
    <View style={[s.dot, dotStyle(c, status)]}>{status === 'note' ? <View style={[s.dotCore, { backgroundColor: c.muted }]} /> : null}</View>
  );
}

function StatusTag({ c, status }: { c: Palette; status: ReportStatus }) {
  const box =
    status === 'improve'
      ? { backgroundColor: c.warnBg }
      : status === 'edge'
        ? { borderWidth: 1, borderColor: c.warn }
        : status === 'good'
          ? { backgroundColor: `${c.ok}22` }
          : status === 'fair'
            ? { backgroundColor: c.chip }
            : status === 'note'
              ? { borderWidth: 1, borderColor: c.muted }
              : { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.lineStrong };
  const fg = status === 'improve' || status === 'edge' ? c.warn : status === 'good' ? c.ok : c.muted;
  return (
    <View style={[s.pill, box]}>
      <Text style={[TYPE.sub, { color: fg }]}>{REPORT_STATUS_TEXT[status]}</Text>
    </View>
  );
}

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점 + 문턱. 평가한 칸에만 그린다(report-view showsGauge) */
function Gauge({ c, g }: { c: Palette; g: ReportGauge }) {
  const x = (v: number) => Math.max(0, Math.min(100, ((v - g.lo) / (g.hi - g.lo)) * 100));
  const a = x(g.cut);
  const b = x(g.edgeEnd);
  const cc = x(g.fairEnd);
  const seg = (from: number, to: number, color: string) => (
    <View
      style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%`, backgroundColor: color }}
    />
  );
  const bad = `${c.warn}70`;
  const edge = `${c.warn}26`;
  const good = `${c.ok}4d`;
  return (
    <View style={{ height: 36 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[s.track, { backgroundColor: c.page }]}>
        {g.up ? (
          <>
            {seg(0, a, bad)}
            {seg(a, b, edge)}
            {seg(b, cc, c.line)}
            {seg(cc, 100, good)}
          </>
        ) : (
          <>
            {seg(a, 100, bad)}
            {seg(b, a, edge)}
            {seg(cc, b, c.line)}
            {seg(0, cc, good)}
          </>
        )}
      </View>
      <View style={[s.marker, { left: `${x(g.value)}%`, backgroundColor: c.ink, borderColor: c.card }]} />
      <Text style={[s.cut, { left: `${a}%`, color: c.warn }]}>문턱</Text>
    </View>
  );
}

/** '착지 장면 보기' · '앞무릎이 가장 굽은 장면 보기' — 3D 와 원본 영상을 그 장면에 세우고 무대로 간다(app/lab/[id].tsx onScene) */
function SceneButton({ c, item, onScene }: { c: Palette; item: ReportItem; onScene: (item: ReportItem) => void }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onScene(item);
      }}
      accessibilityRole="button"
      style={({ pressed }) => [s.scene, { backgroundColor: c.page, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[TYPE.sub, { color: c.ink }]} accessibilityElementsHidden importantForAccessibility="no">
        ▶
      </Text>
      <Text style={[TYPE.buttonCompact, { color: c.ink, flexShrink: 1 }]}>{sceneLabel(item)}</Text>
    </Pressable>
  );
}

/* ───────────────────────────── 이번 투구의 핵심 ───────────────────────────── */

/**
 * 맨 위 한 가지 — 처방할 주 문제면 그 수치 · 관찰 · 근거 · 장면, 없으면 확인 범위(report-view reportLead). 고칠 점을 만들어 내지 않는다.
 * 요소의 일반 설명(headline.why)은 이 투구에서 확인한 사실이 아니라 쓰지 않는다.
 */
export function KeyFinding({ c, report, onScene }: { c: Palette; report: PitchReport; onScene: (item: ReportItem) => void }) {
  const lead = reportLead(report);
  if (lead.kind === 'scope')
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 8 }]}>
        <Text style={[TYPE.sub, { color: c.muted }]}>이번 투구에서 확인한 범위</Text>
        <Text style={[TYPE.card, { color: c.ink, lineHeight: 24 }]}>{lead.title}</Text>
        {lead.note ? <Text style={[TYPE.body, { color: c.muted }]}>{lead.note}</Text> : null}
        <Text style={[TYPE.sub, { color: c.muted }]}>{coverageText(report.coverage)}</Text>
      </View>
    );
  const it = lead.item;
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 12 }]}>
      <View style={[s.row, { justifyContent: 'flex-start', flexWrap: 'wrap' }]}>
        <StatusTag c={c} status={it.status} />
        <Text style={[TYPE.sub, { color: c.muted }]}>먼저 볼 것 · {it.element}</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>{it.valueLabel}</Text>
        <Text style={[TYPE.num, { fontSize: 34, color: c.ink }]}>{it.value}</Text>
      </View>
      <Text style={[TYPE.body, { color: c.ink, fontSize: 16, lineHeight: 23 }]}>{itemObs(it)}</Text>
      {it.foot ? <Text style={[TYPE.sub, { color: c.muted }]}>{it.foot}</Text> : null}
      {it.frame != null ? <SceneButton c={c} item={it} onScene={onScene} /> : null}
    </View>
  );
}

/* ───────────────────────────── 여섯 요소 판독 ───────────────────────────── */

/**
 * 여섯 요소를 한 장에서 훑는다(상태 · 잰 것 · 값) — 줄을 누르면 그 자리에서 펴진다: 관찰 → 띠(평가한 칸만) → 읽는 법 · 해석 범위 → 장면.
 * 처음엔 주 문제 줄만 펴 둔다. 줄을 펴는 것만으로는 3D 를 옮기지 않는다(읽던 자리를 잃지 않게) — 장면 단추가 옮긴다.
 */
export function FlowCard({ c, report, onPick }: { c: Palette; report: PitchReport; onPick: (item: ReportItem) => void }) {
  const [open, setOpen] = useState<string | null>(report.primary);
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, s.secLabel, { flexWrap: 'wrap' }]}>
        <Text accessibilityRole="header" style={[TYPE.sub, { color: c.muted }]}>
          여섯 요소 판독
        </Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{coverageText(report.coverage)}</Text>
      </View>
      <View style={[s.list, { backgroundColor: c.card, boxShadow: c.float }]}>
        {report.items.map((i, n) => {
          const on = open === i.element;
          return (
            <View key={i.element} style={n > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setOpen(on ? null : i.element);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                accessibilityHint={on ? '접어요' : '펴서 관찰 · 읽는 법 · 장면을 봐요'}
                style={({ pressed }) => [s.elRow, pressed && { opacity: 0.6 }]}
              >
                <Dot c={c} status={i.status} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{i.element}</Text>
                  <Text numberOfLines={2} style={[TYPE.sub, { color: c.muted }]}>
                    {itemSub(i)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[TYPE.body, TYPE.numInline, { color: c.ink, fontSize: 17 }]}>{i.value ?? '—'}</Text>
                  <StatusTag c={c} status={i.status} />
                </View>
                <Text style={[s.chev, { color: c.muted, transform: [{ rotate: on ? '90deg' : '0deg' }] }]}>›</Text>
              </Pressable>
              {on ? (
                <View style={s.elDetail}>
                  <Text style={[TYPE.body, { color: c.ink }]}>{itemObs(i)}</Text>
                  {showsGauge(i) ? <Gauge c={c} g={i.gauge!} /> : null}
                  {i.foot ? <Text style={[TYPE.sub, { color: c.muted }]}>{i.foot}</Text> : null}
                  {i.metricNote ? <Text style={[TYPE.sub, { color: c.muted }]}>{i.metricNote}</Text> : null}
                  <Text style={[TYPE.sub, { color: c.muted }]}>{measurementText(i)}</Text>
                  {i.frame != null ? <SceneButton c={c} item={i} onScene={onPick} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ───────────────────────────── 처방 ───────────────────────────── */

function RxBlock({ c, rx }: { c: Palette; rx: ElementRx }) {
  const improve = rx.level === 'improve';
  return (
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        <Text style={[TYPE.card, { color: c.ink }]}>{rx.element}</Text>
        <View style={[s.pill, improve ? { backgroundColor: c.warnBg } : { borderWidth: 1, borderColor: c.warn }]}>
          <Text style={[TYPE.sub, { color: c.warn }]}>{improve ? '고칠 점' : '경계'}</Text>
        </View>
      </View>
      <View style={[s.cue, { borderLeftColor: improve ? c.warn : c.lineStrong }]}>
        <Text style={[TYPE.body, { color: c.ink, fontSize: 16, lineHeight: 22 }]}>{rx.cue}</Text>
      </View>
      {rx.weeks.flatMap((w) =>
        w.drills.map((d) => (
          <View key={`${w.week}-${d.title}`} style={[s.drill, { borderTopColor: c.line }]}>
            {d.thumbUrl ? (
              <Image source={{ uri: d.thumbUrl }} style={[s.thumb, { backgroundColor: c.page }]} contentFit="cover" />
            ) : (
              <View style={[s.thumb, { backgroundColor: c.page }]} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.body, { color: c.ink }]}>{d.title}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {w.stage} · {d.dose}
              </Text>
            </View>
          </View>
        ))
      )}
      {rx.target ? (
        <View style={[s.target, { backgroundColor: c.page }]}>
          <Text style={[TYPE.sub, { color: c.muted }]}>다음에 볼 숫자 · {rx.target.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
            <Text style={[TYPE.numInline, { color: c.muted, fontSize: 16 }]}>{rx.target.now}</Text>
            <Text style={{ color: c.muted }}>→</Text>
            <Text style={[TYPE.numInline, { color: c.ok, fontSize: 16 }]}>{rx.target.goal}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 개선 드릴 카드 단추가 갈 곳(앱) — 무엇을 할지는 lib/pitch-3d/v2/report.ts rxAction(웹과 같은 판단). 메카닉은 앱 화면(training-mechanics) */
function goRx(kind: ReturnType<typeof rxAction>['kind'], elementKey: string) {
  if (kind === 'progress') return router.push('/training-mechanics' as Href);
  if (kind === 'retake') return router.push('/lab/new' as Href);
  leaveTo(`/training?view=mechanics&tab=elements&el=${elementKey}`);
}

/** 처방이 없을 때 이어 갈 길(앱) — 촬영 안내는 앱 화면, 요소 설명은 요소별 드릴과 같은 곳(goRx 'drills') */
function goStep(st: ReportNextStep) {
  if (st.kind === 'guide') return router.push('/lab/guide?s=frame' as Href);
  leaveTo(`/training?view=mechanics&tab=elements&el=${st.elementKey}`);
}

export function RxCard({
  c,
  report,
  mine,
  focus,
}: {
  c: Palette;
  report: PitchReport;
  mine: boolean;
  focus: FocusProgress;
}) {
  if (report.criteria !== REPORT_CRITERIA || report.rx.length === 0) {
    const steps = report.criteria === REPORT_CRITERIA && report.coverage ? nextStepsOf(report) : [];
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 10 }]}>
        <Text style={[TYPE.card, { color: c.ink }]}>개선 드릴</Text>
        <Text style={[TYPE.body, { color: c.muted }]}>{prescriptionMessage(report)}</Text>
        {steps.map((st) => (
          <Pressable
            key={st.kind}
            onPress={() => {
              void Haptics.selectionAsync();
              goStep(st);
            }}
            accessibilityRole="link"
            style={({ pressed }) => [s.step, { backgroundColor: c.page, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{st.label}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{st.note}</Text>
            </View>
            <Text style={[s.chev, { color: c.muted }]}>›</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  const main = report.rx[0];
  const cta = rxAction(mine, focus);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>개선 드릴 · 쉬운 것부터</Text>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 18 }]}>
        {report.rx.map((rx) => (
          <RxBlock key={rx.element} c={c} rx={rx} />
        ))}
        {report.later.length > 0 ? <Text style={[TYPE.sub, { color: c.muted }]}>다음 차례 · {report.later.join(' · ')}</Text> : null}
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              goRx(cta.kind, main.key);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [s.cta, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={s.ctaText}>{cta.label}</Text>
          </Pressable>
          {cta.note ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{cta.note}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────────── 지난번 리포트와 견주기 ───────────────────────────── */

/** 바로 앞 내 리포트와 숫자 견주기 — 촬영 조건이 같다고 확인해야 펴진다(웹 CompareCard 와 같은 글) */
export function CompareCard({ c, prev }: { c: Palette; prev: PreviousComparison }) {
  const [same, setSame] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>지난번 리포트와 견주기 · {prevDateText(prev.requestedAt)}</Text>
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
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  secLabel: { paddingHorizontal: 4 },
  card: { borderRadius: 20, padding: 18 },
  list: { borderRadius: 20, overflow: 'hidden' },
  elRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 18, paddingVertical: 10 },
  elDetail: { paddingHorizontal: 18, paddingBottom: 16, gap: 10 },
  chev: { fontSize: 20, width: 12, textAlign: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dotCore: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scene: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, paddingHorizontal: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  track: { position: 'absolute', left: 0, right: 0, top: 10, height: 6, borderRadius: 3, overflow: 'hidden' },
  marker: { position: 'absolute', top: 5, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 3 },
  cut: { position: 'absolute', top: 20, fontSize: 11, transform: [{ translateX: -12 }] },
  cue: { borderLeftWidth: 2, paddingLeft: 12 },
  drill: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  target: { gap: 4, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  cta: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REPORT_STATUS_TEXT,
  rxAction,
  type ElementRx,
  type FocusProgress,
  type PitchReport,
  type ReportGauge,
  type ReportItem,
  type ReportStatus,
} from '@/lib/pitch-3d/v2/report';
import { TYPE, type Palette } from '~/lib/ui';
import { type Href, router } from 'expo-router';
import { leaveTo } from '~/shell/web-nav';

/**
 * 투구 진단 리포트 조각(앱) — 웹 app/(app)/videos/lab/[id]/report-parts.tsx 와 같은 차례 · 같은 글(설계 docs/designs/pitch-3d-report.md 5-4절 '모양').
 * 결론은 3D 무대와 같은 어두운 판 위(테마와 상관없이), 흐름 · 처방은 카드. 색은 sky · warn · ok 셋만.
 */

/** 3D 무대 판 — embed 화면 바탕과 같다 */
export const STAGE_BG = '#151722';
const ON_STAGE = { ink: '#f5f5f7', muted: '#9aa3b8', warn: '#fcd34d', sky: '#4aa8ff' };

export function ReportHero({ report, stage, videos }: { report: PitchReport; stage: ReactNode; videos: ReactNode }) {
  const [open, setOpen] = useState(false);
  const h = report.headline;
  return (
    <View style={[s.hero, { backgroundColor: STAGE_BG }]}>
      <View>
        {stage}
        {h.moment ? <Text style={[s.moment, { color: ON_STAGE.muted }]}>{h.moment}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 18, paddingTop: 4, gap: 10 }}>
        {h.tag ? (
          <View
            style={[
              s.pill,
              h.tone === 'improve'
                ? { backgroundColor: 'rgba(252,211,77,0.18)' }
                : { borderWidth: 1, borderColor: 'rgba(252,211,77,0.6)' },
            ]}
          >
            <Text style={[TYPE.sub, { color: ON_STAGE.warn }]}>{h.tag}</Text>
          </View>
        ) : null}
        <Text style={[s.verdict, { color: ON_STAGE.ink }]}>{h.title}</Text>
        {h.why ? <Text style={[TYPE.body, { color: ON_STAGE.muted, lineHeight: 21 }]}>{h.why}</Text> : null}
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.link}>
          <Text style={[s.linkText, { color: ON_STAGE.sky }]}>{open ? '원본 영상 접기' : '원본 영상 보기'}</Text>
        </Pressable>
        {open ? videos : null}
      </View>
    </View>
  );
}

/* ───────────────────────────── 투구의 흐름 ───────────────────────────── */

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
    default:
      return { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.muted, backgroundColor: c.card };
  }
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
            : { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.muted };
  const fg = status === 'improve' || status === 'edge' ? c.warn : status === 'good' ? c.ok : c.muted;
  return (
    <View style={[s.pill, box]}>
      <Text style={[TYPE.sub, { color: fg }]}>{REPORT_STATUS_TEXT[status]}</Text>
    </View>
  );
}

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점 + 문턱 */
function Gauge({ c, g, muted }: { c: Palette; g: ReportGauge; muted: boolean }) {
  const x = (v: number) => Math.max(0, Math.min(100, ((v - g.lo) / (g.hi - g.lo)) * 100));
  const a = x(g.cut);
  const b = x(g.edgeEnd);
  const cc = x(g.fairEnd);
  const seg = (from: number, to: number, color: string) => (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%`, backgroundColor: color }} />
  );
  const bad = `${c.warn}70`;
  const edge = `${c.warn}26`;
  const good = `${c.ok}4d`;
  return (
    <View style={{ height: 36, opacity: muted ? 0.5 : 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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

export function FlowCard({ c, report, onPick }: { c: Palette; report: PitchReport; onPick: (item: ReportItem) => void }) {
  const first = report.items.find((i) => i.element === report.primary) ?? report.items[0];
  const [sel, setSel] = useState(first.element);
  const it = report.items.find((i) => i.element === sel) ?? first;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>투구의 흐름</Text>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View>
          <View style={[s.chainLine, { backgroundColor: c.line }]} />
          <View style={s.chain} accessibilityRole="tablist">
            {report.items.map((i) => {
              const on = i.element === sel;
              return (
                <Pressable
                  key={i.element}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${i.element} ${REPORT_STATUS_TEXT[i.status]}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSel(i.element);
                    onPick(i);
                  }}
                  style={s.node}
                >
                  <View style={[s.dot, dotStyle(c, i.status)]} />
                  <Text numberOfLines={1} style={[s.nodeText, { color: on ? c.ink : c.muted, fontWeight: on ? '600' : '400' }]}>
                    {i.element}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[s.detail, { borderTopColor: c.line }]}>
          <View style={s.row}>
            <Text style={[TYPE.card, { color: c.ink }]}>{it.element}</Text>
            <StatusTag c={c} status={it.status} />
          </View>
          <Text style={[TYPE.body, { color: c.ink, lineHeight: 21 }]}>{it.line}</Text>
          {it.value ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[TYPE.num, { fontSize: 32, color: c.ink }]}>{it.value}</Text>
              <Text style={[TYPE.sub, { color: c.muted, flexShrink: 1 }]}>{it.valueLabel}</Text>
            </View>
          ) : null}
          {it.gauge ? <Gauge c={c} g={it.gauge} muted={it.status === 'note' || it.status === 'unsure'} /> : null}
          {it.foot ? <Text style={[TYPE.sub, { color: c.muted }]}>{it.foot}</Text> : null}
        </View>
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
          <Text style={[TYPE.sub, { color: c.warn }]}>{improve ? '집중 · 2칸' : '보조 · 1칸'}</Text>
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
                {w.label} {w.stage} · {d.dose}
              </Text>
            </View>
          </View>
        ))
      )}
      {rx.target ? (
        <View style={[s.target, { backgroundColor: c.page }]}>
          <Text style={[TYPE.sub, { color: c.muted, flex: 1 }]}>다음에 볼 숫자 · {rx.target.label}</Text>
          <Text style={[TYPE.numInline, { color: c.muted, fontSize: 16 }]}>{rx.target.now}</Text>
          <Text style={{ color: c.muted }}>→</Text>
          <Text style={[TYPE.numInline, { color: c.ok, fontSize: 16 }]}>{rx.target.goal}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 처방 카드 단추가 갈 곳(앱) — 무엇을 할지는 lib/pitch-3d/v2/report.ts rxAction(웹과 같은 판단). 메커니즘은 앱 화면(training-mechanics) */
function goRx(kind: ReturnType<typeof rxAction>['kind'], reportId: string, elementKey: string) {
  if (kind === 'start') return router.push(`/training-mechanics?focus=${reportId}` as Href);
  if (kind === 'progress') return router.push('/training-mechanics' as Href);
  if (kind === 'retake') return router.push('/lab/new' as Href);
  leaveTo(`/training?view=mechanics&tab=elements&el=${elementKey}`);
}

export function RxCard({
  c,
  report,
  reportId,
  mine,
  focus,
}: {
  c: Palette;
  report: PitchReport;
  reportId: string;
  mine: boolean;
  focus: FocusProgress;
}) {
  if (report.rx.length === 0) return null;
  const main = report.rx[0];
  const cta = rxAction(mine, focus);
  const weeks: [string, string][] =
    main.level === 'improve'
      ? [
          ['1주', '기초'],
          ['2주', '연결'],
          ['3주', '통합'],
        ]
      : [
          ['1주', '연결'],
          ['2~3주', '통합'],
        ];
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>처방 · 3주 · 주 3번</Text>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 18 }]}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {weeks.map(([wk, st], i) => (
            <View key={wk} style={[s.week, { backgroundColor: i === 0 ? c.sky : c.page }]}>
              <Text style={[TYPE.sub, { color: i === 0 ? 'rgba(255,255,255,0.8)' : c.muted, fontSize: 12 }]}>{wk}</Text>
              <Text style={[TYPE.sub, { color: i === 0 ? '#fff' : c.ink, fontWeight: '600' }]}>{st}</Text>
            </View>
          ))}
        </View>
        {report.rx.map((rx) => (
          <RxBlock key={rx.element} c={c} rx={rx} />
        ))}
        {report.later.length > 0 ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>다음 차례 · {report.later.join(' · ')}</Text>
        ) : null}
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              goRx(cta.kind, reportId, main.key);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [s.cta, { backgroundColor: c.sky, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={s.ctaText}>{cta.label}</Text>
          </Pressable>
          <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{cta.note}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 24, overflow: 'hidden' },
  moment: { position: 'absolute', right: 16, top: 12, fontSize: 12 },
  verdict: { fontSize: 21, fontWeight: '700', lineHeight: 29, letterSpacing: -0.3 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  link: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 14, fontWeight: '600' },
  secLabel: { paddingHorizontal: 4 },
  card: { borderRadius: 20, padding: 18 },
  chainLine: { position: 'absolute', left: 22, right: 22, top: 8, height: StyleSheet.hairlineWidth * 2 },
  chain: { flexDirection: 'row', justifyContent: 'space-between' },
  node: { width: 52, alignItems: 'center', gap: 6, minHeight: 44 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  nodeText: { fontSize: 11 },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { position: 'absolute', left: 0, right: 0, top: 10, height: 6, borderRadius: 3, overflow: 'hidden' },
  marker: { position: 'absolute', top: 5, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 3 },
  cut: { position: 'absolute', top: 20, fontSize: 11, transform: [{ translateX: -12 }] },
  cue: { borderLeftWidth: 2, paddingLeft: 12 },
  drill: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  target: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  week: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  cta: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

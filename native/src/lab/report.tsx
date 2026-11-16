import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REPORT_STATUS_TEXT,
  REPORT_CRITERIA,
  WHY_SHORT,
  prescriptionMessage,
  rxAction,
  type ElementRx,
  type FocusProgress,
  type PitchReport,
  type ReportGauge,
  type ReportItem,
  type ReportStatus,
} from '@/lib/pitch-3d/v2/report';
import { ELEMENT_PLAIN, itemGood, itemSay, nextStepsOf, reportLead, reportTally, sceneLabel, showsGauge, type ReportNextStep } from '@/lib/pitch-3d/v2/report-view';
import { compareDeltaText, compareRangeText, prevDateText, PREV_CONFIRM, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import { TYPE, type Palette } from '~/lib/ui';
import { type Href, router } from 'expo-router';
import { leaveTo } from '~/shell/web-nav';
import { canOpen, noticeLocked, pushOpen } from '~/shell/release';

/**
 * 투구 진단 리포트 조각(앱) — 한눈 요약(좋아요 · 보통 · 고칠 점 수 + 먼저 고칠 것 하나) · 동작 여섯 줄(눌러 펴기) · 추천 훈련 · 지난번과 견주기.
 * 2026-11-16 김민: "문구가 AI 같고 조잡해 정보가 안 들어온다" → 한 칸에 말 하나 · 숫자 하나, 범위 · 제한 설명은 편 칸 안으로.
 * 고르기 · 쉬운 말은 lib/pitch-3d/v2/report-view.ts. 3D 무대 · 원본 영상은 app/lab/[id].tsx.
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

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점, 양 끝에 어느 쪽이 좋은지. 평가한 칸에만 그린다(report-view showsGauge) */
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
  const good = `${c.ok}66`;
  return (
    <View style={{ gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: 20, justifyContent: 'center' }}>
        <View style={[s.track, { backgroundColor: c.line }]}>
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
      </View>
      <View style={s.row}>
        <Text style={[s.cap, { color: g.up ? c.warn : c.ok }]}>{g.up ? '고칠 점' : '좋아요'}</Text>
        <Text style={[s.cap, { color: g.up ? c.ok : c.warn }]}>{g.up ? '좋아요' : '고칠 점'}</Text>
      </View>
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

/* ───────────────────────────── 한눈 요약 ───────────────────────────── */

const toneOf = (c: Palette, st: ReportStatus) => (st === 'improve' || st === 'edge' ? c.warn : st === 'good' ? c.ok : c.muted);

function Stat({ c, n, label, color }: { c: Palette; n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label} ${n}개`}>
      <Text style={[TYPE.num, { fontSize: 32, color: n > 0 ? color : c.lineStrong }]}>{n}</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

/** 지금 값 → 좋아요 기준 */
function NowGoal({ c, now, good }: { c: Palette; now: string; good: string | null }) {
  return (
    <View style={[s.measure, { backgroundColor: c.page }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>지금</Text>
        <Text style={[TYPE.num, { fontSize: 24, color: c.ink }]}>{now}</Text>
      </View>
      {good ? (
        <>
          <Text style={{ color: c.lineStrong, fontSize: 18 }} accessibilityElementsHidden importantForAccessibility="no">
            →
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.sub, { color: c.muted }]}>좋아요 기준</Text>
            <Text style={[TYPE.num, { fontSize: 24, color: c.ok }]}>{good}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * 맨 위 한 장 — 숫자 셋(좋아요 · 보통 · 고칠 점)과 먼저 고칠 것 하나(말 한 줄 · 지금 → 좋아요 기준 · 장면). 고칠 점이 없으면 그 사실만.
 * 고칠 점을 만들어 내지 않는다(report-view reportLead). 평가한 동작이 하나도 없으면 까닭 한 줄.
 */
export function Summary({ c, report, onScene }: { c: Palette; report: PitchReport; onScene: (item: ReportItem) => void }) {
  const lead = reportLead(report);
  const t = reportTally(report);
  const judged = t.good + t.fair + t.bad;
  const it = lead.kind === 'finding' ? lead.item : null;
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 16 }]}>
      {judged > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat c={c} n={t.good} label="좋아요" color={c.ok} />
          <Stat c={c} n={t.fair} label="보통" color={c.ink} />
          <Stat c={c} n={t.bad} label="고칠 점" color={c.warn} />
          {t.unseen > 0 ? <Stat c={c} n={t.unseen} label="확인 못 함" color={c.muted} /> : null}
        </View>
      ) : null}
      {it ? (
        <View style={[{ gap: 10 }, judged > 0 && { paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <View style={[s.row, { justifyContent: 'flex-start', flexWrap: 'wrap' }]}>
            <Text style={[TYPE.section, { color: c.ink }]}>{it.element}</Text>
            <StatusTag c={c} status={it.status} />
          </View>
          <Text style={[TYPE.reading, { color: c.ink }]}>{itemSay(it)}</Text>
          {it.value != null ? <NowGoal c={c} now={it.value} good={itemGood(it)} /> : null}
          {it.frame != null ? <SceneButton c={c} item={it} onScene={onScene} /> : null}
        </View>
      ) : judged > 0 ? (
        <Text style={[TYPE.card, { color: c.ink }]}>{t.bad === 0 ? '고칠 점이 없어요.' : lead.kind === 'scope' ? lead.title : ''}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={[TYPE.card, { color: c.ink, lineHeight: 24 }]}>{lead.kind === 'scope' ? lead.title : ''}</Text>
          {lead.kind === 'scope' && lead.note ? <Text style={[TYPE.body, { color: c.muted }]}>{lead.note}</Text> : null}
        </View>
      )}
    </View>
  );
}

/* ───────────────────────────── 동작 여섯 가지 ───────────────────────────── */

/**
 * 여섯 줄 — 이름 · 쉬운 말 · 내 숫자 · 상태가 한 줄에 다 보인다(누르지 않아도 여섯 개를 훑는다). 누르면 그 줄이 펴져 말 한 줄 · 기준 띠 ·
 * 좋아요 기준 · 왜 중요한지 · 장면 단추. 한 번에 하나만 편다. 처음엔 다 접혀 있다(먼저 고칠 것은 위 요약 장에 이미 있다).
 * 누르면 3D 를 그 장면에 세운다(onPick — 스크롤은 하지 않는다, 장면 단추가 무대로 간다). 값이 없으면 0 이 아니라 '–'.
 */
export function ElementList({
  c,
  report,
  onPick,
  onScene,
}: {
  c: Palette;
  report: PitchReport;
  onPick: (item: ReportItem) => void;
  onScene: (item: ReportItem) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (report.items.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[TYPE.card, s.secLabel, { color: c.ink }]}>
        동작 여섯 가지
      </Text>
      <View style={[s.list, { backgroundColor: c.card, boxShadow: c.float }]}>
        {report.items.map((it, n) => {
          const on = it.element === open;
          const tone = toneOf(c, it.status);
          const good = itemGood(it);
          return (
            <View key={it.element} style={n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                accessibilityLabel={`${it.element}, ${ELEMENT_PLAIN[it.element] ?? ''}, ${it.value ?? '측정값 없음'}, ${REPORT_STATUS_TEXT[it.status]}`}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setOpen(on ? null : it.element);
                  if (!on) onPick(it);
                }}
                style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
              >
                <Dot c={c} status={it.status} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>{it.element}</Text>
                  <Text numberOfLines={1} style={[TYPE.sub, { color: c.muted }]}>
                    {ELEMENT_PLAIN[it.element] ?? ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  <Text style={[TYPE.num, { fontSize: 20, color: it.value != null ? c.ink : c.lineStrong }]}>{it.value ?? '–'}</Text>
                  <Text style={[TYPE.sub, { color: tone, fontWeight: '600' }]}>{REPORT_STATUS_TEXT[it.status]}</Text>
                </View>
              </Pressable>
              {on ? (
                <View style={s.itemBody} accessibilityLiveRegion="polite">
                  <Text style={[TYPE.body, { color: c.ink, fontSize: 16, lineHeight: 23 }]}>{itemSay(it)}</Text>
                  {showsGauge(it) ? <Gauge c={c} g={it.gauge!} /> : null}
                  {good && it.status !== 'good' ? (
                    <Text style={[TYPE.body, { color: c.ink }]}>
                      좋아요 기준 <Text style={[TYPE.numInline, { color: c.ok }]}>{good}</Text>
                    </Text>
                  ) : null}
                  {it.status !== 'unsure' ? <Text style={[TYPE.sub, { color: c.muted }]}>{WHY_SHORT[it.element]}</Text> : null}
                  {it.status === 'note' && it.foot ? <Text style={[TYPE.sub, { color: c.muted }]}>{it.foot}</Text> : null}
                  {it.valueLabel || it.metricNote ? (
                    <Text style={[TYPE.sub, { color: c.muted }]}>
                      {[it.valueLabel ? `잰 것 · ${it.valueLabel}` : null, it.metricNote].filter(Boolean).join('\n')}
                    </Text>
                  ) : null}
                  {it.frame != null ? <SceneButton c={c} item={it} onScene={onScene} /> : null}
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

/** 추천 훈련 한 요소 — 목적(코칭 한 줄)과 대표 드릴(전체에서 많아야 2개) */
function RxBlock({
  c,
  rx,
  drills,
  find,
}: {
  c: Palette;
  rx: ElementRx;
  drills: (ElementRx['weeks'][number]['drills'][number] & { stage: string })[];
  /** 이 요소로 투구 드릴 찾기(2026-10-31) — 같은 결과로 돌아올 수 있게 결과 번호를 싣는다. 라이브러리가 잠겼으면 없음 */
  find: (() => void) | null;
}) {
  const improve = rx.level === 'improve';
  return (
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        <Text style={[TYPE.card, { color: c.ink }]}>{rx.element}</Text>
        <View style={[s.pill, improve ? { backgroundColor: c.warnBg } : { borderWidth: 1, borderColor: c.warn }]}>
          <Text style={[TYPE.sub, { color: c.warn }]}>{improve ? '고칠 점' : '경계'}</Text>
        </View>
      </View>
      <Text style={[TYPE.reading, { color: c.ink, fontWeight: '600' }]}>{rx.cue}</Text>
      {drills.map((d) => (
        <View key={d.title} style={[s.drill, { borderTopColor: c.line }]}>
          {d.thumbUrl ? (
            <Image source={{ uri: d.thumbUrl }} style={[s.thumb, { backgroundColor: c.page }]} contentFit="cover" />
          ) : (
            <View style={[s.thumb, { backgroundColor: c.page }]} />
          )}
          <Text style={[TYPE.body, { color: c.ink, flex: 1 }]}>{d.title}</Text>
        </View>
      ))}
      {find ? (
        <Pressable onPress={find} accessibilityRole="link" style={({ pressed }) => [s.step, { backgroundColor: c.page, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[TYPE.buttonCompact, { color: c.ink, flex: 1 }]}>투구 드릴에서 ‘{rx.element}’ 드릴 찾기</Text>
          <Text style={[s.chev, { color: c.muted }]}>›</Text>
        </Pressable>
      ) : null}
      {rx.target ? (
        <View style={[s.target, { backgroundColor: c.page }]}>
          <Text style={[TYPE.sub, { color: c.muted }]}>목표 · {rx.target.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
            <Text style={[TYPE.num, { color: c.ink, fontSize: 20 }]}>{rx.target.now}</Text>
            <Text style={{ color: c.lineStrong }}>→</Text>
            <Text style={[TYPE.num, { color: c.ok, fontSize: 20 }]}>{rx.target.goal}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 개선 드릴 카드 단추가 갈 곳(앱) — 무엇을 할지는 lib/pitch-3d/v2/report.ts rxAction(웹과 같은 판단). 메카닉은 앱 화면(training-mechanics) */
function goRx(kind: ReturnType<typeof rxAction>['kind'], elementKey: string) {
  if (kind === 'progress') return pushOpen('/training-mechanics' as Href);
  if (kind === 'retake') return pushOpen('/lab/new' as Href);
  const href = `/training?view=mechanics&tab=elements&el=${elementKey}`;
  if (!canOpen(href)) return noticeLocked();
  leaveTo(href);
}

/** 처방이 없을 때 이어 갈 길(앱) — 촬영 안내는 앱 화면, 요소 설명은 요소별 드릴과 같은 곳(goRx 'drills') */
function goStep(st: ReportNextStep) {
  if (st.kind === 'guide') return pushOpen('/lab/guide?s=frame' as Href);
  const href = `/training?view=mechanics&tab=elements&el=${st.elementKey}`;
  if (!canOpen(href)) return noticeLocked();
  leaveTo(href);
}

export function RxCard({
  c,
  report,
  mine,
  focus,
  resultId,
}: {
  c: Palette;
  report: PitchReport;
  mine: boolean;
  focus: FocusProgress;
  /** 이 결과 화면의 번호 — 투구 드릴에서 찾은 뒤 같은 결과로 돌아온다 */
  resultId: string;
}) {
  /*
   * 출시 전 베타에도 훈련으로 가는 길(요소별 드릴 · 프로그램 · 드릴 찾기)은 그대로 보인다 — 잠겼으면 누를 때 안내만(2026-11-01 금윤호: "문이 잠긴 것처럼")
   */
  const trainingOpen = true;
  const libraryOpen = true;
  if (report.criteria !== REPORT_CRITERIA || report.rx.length === 0) {
    const steps = (report.criteria === REPORT_CRITERIA && report.coverage ? nextStepsOf(report) : []).filter((st) => trainingOpen || st.kind === 'guide');
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 10 }]}>
        <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
          추천 훈련
        </Text>
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
        {/* 판정 어려움(평가한 요소가 하나도 없음) — 측정 · 처방을 만들지 않고 다시 찍을 길만(촬영 안내는 위 steps 또는 여기) */}
        {!report.items.some((i) => i.status === 'improve' || i.status === 'edge' || i.status === 'fair' || i.status === 'good') ? (
          <>
            {!steps.some((st) => st.kind === 'guide') ? (
              <Pressable onPress={() => router.push('/lab/guide?s=frame' as Href)} accessibilityRole="link" style={({ pressed }) => [s.step, { backgroundColor: c.page, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.buttonCompact, { color: c.ink }]}>촬영 안내 보기</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>두 영상에 몸 전체가 잘 보이게 찍는 법이에요.</Text>
                </View>
                <Text style={[s.chev, { color: c.muted }]}>›</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push('/lab/new' as Href)} accessibilityRole="button" style={({ pressed }) => [s.cta, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={s.ctaText}>영상 다시 골라 분석</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }
  const main = report.rx[0];
  const cta = rxAction(mine, focus);
  const ctaOpen = trainingOpen || cta.kind === 'retake';
  /* 대표 드릴은 처방 전체에서 많아야 2개 — 보고서가 고른 드릴만(시안의 예시 드릴 · 횟수는 쓰지 않는다) */
  const blocks = report.rx.reduce<{ rx: ElementRx; drills: (ElementRx['weeks'][number]['drills'][number] & { stage: string })[] }[]>((acc, rx) => {
    const used = acc.reduce((n, b) => n + b.drills.length, 0);
    const all = rx.weeks.flatMap((w) => w.drills.map((d) => ({ ...d, stage: w.stage })));
    const drills = all.filter((d, n) => all.findIndex((x) => x.title === d.title) === n).slice(0, Math.max(0, 2 - used));
    return [...acc, { rx, drills }];
  }, []);
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[TYPE.card, s.secLabel, { color: c.ink }]}>
        추천 훈련
      </Text>
      {/* 요소마다 카드 한 장(2026-11-16 김민: "같은 칸 안에 있으니 하나 같다") */}
      {blocks.map((b) => (
        <View key={b.rx.element} style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          <RxBlock
            c={c}
            rx={b.rx}
            drills={b.drills}
            find={
              libraryOpen
                ? () => {
                    void Haptics.selectionAsync();
                    pushOpen({ pathname: '/library/mechanics', params: { from: 'analysis', result: resultId, el: b.rx.element } });
                  }
                : null
            }
          />
        </View>
      ))}
      {report.later.length > 0 ? <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>다음 차례 · {report.later.join(' · ')}</Text> : null}
      {ctaOpen ? (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            goRx(cta.kind, main.key);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [s.cta, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1, marginTop: 4 }]}
        >
          <Text style={s.ctaText}>{cta.label}</Text>
        </Pressable>
      ) : (
        <Text style={[TYPE.sub, s.secLabel, { color: c.muted }]}>추천 훈련 화면은 준비 중이에요. 위 드릴을 참고해 연습해 보세요.</Text>
      )}
    </View>
  );
}

/* ───────────────────────────── 지난번 리포트와 견주기 ───────────────────────────── */

/** 바로 앞 내 리포트와 숫자 견주기 — 촬영 조건이 같다고 확인해야 펴진다(웹 CompareCard 와 같은 글) */
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
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  secLabel: { paddingHorizontal: 4 },
  card: { borderRadius: 20, padding: 18 },
  list: { borderRadius: 20, overflow: 'hidden' },
  chev: { fontSize: 20, width: 12, textAlign: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dotCore: { width: 6, height: 6, borderRadius: 3 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 18, paddingVertical: 12 },
  itemBody: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 2, gap: 12 },
  cap: { fontSize: 12, fontWeight: '600' },
  measure: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scene: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, paddingHorizontal: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  marker: { position: 'absolute', top: 1, width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3 },
  drill: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  target: { gap: 4, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  cta: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

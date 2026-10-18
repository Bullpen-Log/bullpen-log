import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACWR_ZONES, CHRONIC_WINDOW_DAYS, describeRatio, shiftDateKey } from '@/lib/pitch-stats';
import { formatSpeed, type SpeedUnit } from '@/lib/units';
import {
  ANALYSIS_METRICS,
  METRIC_SPECS,
  agoText,
  daysBetween,
  daysOf,
  formatMetric,
  slotsOf,
  spokenDay,
  trendCardOf,
  type MetricKey,
} from '@/lib/report/trends';
import type { AppAnalysis } from '@/lib/report/analysis-data';
import type { AnalysisOverview, DeltaView, LoadView, StatNote } from '@/lib/report/analysis-overview';
import type { GoodDayResult } from '@/lib/report/good-days';
import type { Highlight } from '@/lib/report/highlights';
import type { TrainingReview } from '@/lib/report/training-review';
import { LoadTrend, TrendCardView, toneColor } from '~/analysis/charts';
import { MiniChart } from '~/home/feed';
import { leave } from '~/mechanics/parts';
import { usePrefs } from '~/lib/prefs';
import { loadJson, saveJson } from '~/lib/store';
import { useWeightUnit } from '~/lib/weight-unit';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { DateNavButton } from '~/shell/mini-calendar';

/**
 * 투구 분석 · 트레이닝 분석(앱 화면) — 웹 /coach?view=…&date=…(app/(app)/coach/page.tsx)를 옮겼다. 사이트의 분석 화면이 앱(BullpenNative/5 부터)이면
 * 이 화면을 띄우고(page.tsx → OpenNative), 카드 · 그래프 재료는 웹과 같은 곳에서 읽는다(app/actions/app-analysis.ts → lib/report/analysis-data.ts).
 *
 * 웹과 같은 차례: 하이라이트(오늘만) → 부하 지수 → (투구) 이번 주 · 마지막 투구 · 최고 구속 → 잘 던진 날 / (트레이닝) 최근 4주 → 그래프.
 * 그래프의 날을 톡 치면 그날까지의 기록으로 분석을 다시 연다(웹은 마우스로 누를 때만). 그래프 기간은 웹처럼 4주 · 12주 · 기간 설정,
 * 구속 · 무게는 설정의 단위(웹 useSpeedUnit · 무게 단위와 같다).
 */
type LoadResult = ({ ok: true } & AppAnalysis) | { ok: false; to: string };
type Kind = 'pitch' | 'training';

const TITLE: Record<Kind, string> = { pitch: '투구 분석', training: '트레이닝 분석' };
const BACK: Record<Kind, string> = { pitch: '투구 기록', training: '트레이닝' };

export default function AnalysisScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ view?: string; date?: string }>();
  const view: Kind = params.view === 'training' ? 'training' : 'pitch';
  /* 보는 날 — 없으면 오늘(서버가 정한다). 그래프의 날을 톡 치면 바뀐다 */
  const [date, setDate] = useState<string | null>(typeof params.date === 'string' ? params.date : null);
  const [data, setData] = useState<AppAnalysis | null>(null);
  /* data 가 어느 요청(date)의 답인가 — 서버가 앞날을 오늘로 바꿔 돌려줘도 기다림이 안 끝나는 일이 없게 날짜가 아니라 요청으로 견준다 */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    let alive = true;
    rpc<LoadResult>('app-analysis.loadAppAnalysis', view, date).then(
      (r) => {
        if (!alive) return;
        setRefreshing(false);
        if (!r.ok) return leave(r.to);
        setData(r);
        setLoadedFor(date);
        setFailed(null);
      },
      (e: unknown) => {
        if (!alive) return;
        setRefreshing(false);
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 분석을 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [view, date, tries]);

  const retry = () => {
    setFailed(null);
    setTries((n) => n + 1);
  };
  /* 받는 중 — 보던 분석을 그대로 두고 머리에 돌개만(칸이 비었다 채워지면 아래가 통째로 들썩인다) */
  const waiting = data != null && !failed && loadedFor !== date;

  const jump = (day: string) => {
    if (!data || day === (date ?? data.today)) return;
    void Haptics.selectionAsync();
    setDate(day === data.today ? null : day);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 4, backgroundColor: c.page, borderBottomColor: c.line }]}>
      {/* 웹처럼 돌아갈 곳 이름(coach/page.tsx '‹ 투구 기록' · '‹ 트레이닝') */}
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={`뒤로 · ${BACK[view]}`} style={[s.iconBtn, s.backBtn]}>
        <SymbolView name="chevron.left" size={20} weight="semibold" tintColor={c.sky} />
        <Text numberOfLines={1} style={[s.backText, { color: c.sky }]}>{BACK[view]}</Text>
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
        {TITLE[view]}
      </Text>
      <View style={[s.iconBtn, s.backBtn, { justifyContent: 'flex-end' }]}>{waiting ? <ActivityIndicator /> : null}</View>
    </View>
  );

  if (!data) {
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        {header}
        <View style={[s.fill, s.centerBox]}>
          {failed ? (
            <>
              <Text style={[s.body, s.center, { color: c.ink }]}>{failed}</Text>
              <Pressable onPress={retry} accessibilityRole="button" style={[s.pill, { backgroundColor: c.sky }]}>
                <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );
  }

  const shownDate = data.date;
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {header}
      <ScrollView
        ref={scroll}
        style={s.fill}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(24, inset.bottom + 16) }, READABLE]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTries((n) => n + 1);
            }}
          />
        }
      >
        {failed ? (
          <View style={[s.notice, { backgroundColor: c.danger + '14' }]}>
            <Text style={[s.small, { color: c.danger, flex: 1 }]}>{failed}</Text>
            <Pressable onPress={retry} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.sky }]}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 오늘이 아닐 때만 한 줄(웹과 같다) — 앱은 오늘로 돌아가는 단추를 붙인다 */}
        {shownDate !== data.today ? (
          <View style={s.dateRow}>
            <Text style={[s.body, { color: c.muted, flex: 1 }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>{`${spokenDay(shownDate)} · ${agoText(shownDate, data.today)}`}</Text> 기준
            </Text>
            <Pressable onPress={() => jump(data.today)} accessibilityRole="button" style={[s.chip, { backgroundColor: c.chip }]}>
              <Text style={[s.smallBold, { color: c.ink }]}>오늘로</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ opacity: waiting ? 0.5 : 1, gap: 16 }}>
          {data.highlights.length > 0 ? <Highlights items={data.highlights} c={c} /> : null}
          {view === 'pitch' ? (
            <>
              <LoadCard v={data.overview.pitching} notices={data.overview.notices} c={c} />
              <Stats overview={data.overview} c={c} />
              {data.goodDays ? <GoodDays result={data.goodDays} c={c} /> : null}
            </>
          ) : (
            <>
              <LoadCard v={data.overview.training} c={c} />
              {data.review ? <Review review={data.review} armCareMissing={data.armCareMissing} c={c} /> : null}
            </>
          )}
          <Text style={[s.small, s.center, { color: c.muted }]}>
            부하 지수는 훈련량 관리를 돕는 참고 지표예요. 통증이 있다면 수치와 관계없이 전문의와 상담하세요.
          </Text>
        </View>

        <Trends data={data} onJump={jump} c={c} />
      </ScrollView>
    </View>
  );
}

/* ----------------------------- 하이라이트(웹 app/(app)/today/highlights.tsx) ----------------------------- */

function fill(h: Highlight, unit: SpeedUnit) {
  return h.text.replace('{speed}', formatSpeed(h.speed, unit) ?? '').replace('{diff}', formatSpeed(h.diff, unit) ?? '');
}

/** 카드를 누르면 그 자세한 화면 — 그날 투구는 앱 화면, 나머지는 화면을 닫고 웹으로 */
function openHref(href: string) {
  const day = /^\/pitch-log\/(\d{4}-\d{2}-\d{2})/.exec(href)?.[1];
  if (day) return router.push(`/pitch/${day}` as Href);
  leave(href);
}

function Highlights({ items, c }: { items: Highlight[]; c: Palette }) {
  /* 구속은 설정의 단위로(웹 useSpeedUnit 과 같다) */
  const speed = usePrefs().speed;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[s.section, { color: c.ink }]}>
        하이라이트
      </Text>
      {items.map((h) => (
        <Pressable
          key={h.key + h.label}
          disabled={!h.href}
          onPress={() => h.href && openHref(h.href)}
          accessibilityRole={h.href ? 'button' : 'text'}
          style={({ pressed }) => [s.card, s.row, { backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.smallBold, { color: h.warn ? c.warn : c.muted }]}>{h.label}</Text>
            <Text style={[s.body, { color: c.ink }]}>{fill(h, speed)}</Text>
          </View>
          {h.chart ? <MiniChart chart={h.chart} warn={h.warn} /> : null}
          {h.href ? <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={c.muted} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------- 부하 지수(웹 app/(app)/coach/load-panel.tsx) ----------------------------- */

function StatusChip({ tone, label, c }: { tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral'; label: string; c: Palette }) {
  const color = toneColor(tone, c);
  return (
    <View style={[s.status, { borderColor: color + '55', backgroundColor: color + '1a' }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.smallBold, { color }]}>{label}</Text>
    </View>
  );
}

function LoadCard({ v, notices, c }: { v: LoadView; notices?: AnalysisOverview['notices']; c: Palette }) {
  const zone = v.zone ? ACWR_ZONES[v.zone] : null;
  return (
    <View style={[s.cardFlat, { backgroundColor: c.card }]}>
      <View style={{ padding: 16, gap: 14 }}>
        <View style={s.between}>
          <Text style={[s.smallBold, { color: c.muted }]}>{v.name} 부하 지수</Text>
          {v.signal ? (
            <StatusChip tone={v.signal.tone} label={v.signal.label} c={c} />
          ) : zone ? (
            <StatusChip tone={zone.tone} label={zone.label} c={c} />
          ) : (
            <StatusChip tone="neutral" label="쌓는 중" c={c} />
          )}
        </View>

        {v.ratio != null && zone ? (
          <>
            <View style={{ gap: 6 }}>
              {/* 큰 숫자는 검정 — 상태 색은 위 배지 · 밑 한 줄이 말한다(웹과 같다) */}
              <Text style={[s.ratio, { color: c.ink }]}>{v.ratio.toFixed(2)}</Text>
              {/* 투구는 홈 · 팔 상태와 같은 한 줄(v.signal — 서버가 loadSignalOf 로), 운동은 지수 구간 그대로 */}
              {v.signal ? (
                <Text style={[s.bodyBold, { color: toneColor(v.signal.tone, c) }]}>{v.signal.line}</Text>
              ) : (
                <Text style={[s.bodyBold, { color: toneColor(zone.tone, c) }]}>
                  {describeRatio(v.ratio)}
                  <Text style={[s.body, { color: c.muted }]}> · {v.meaning}</Text>
                </Text>
              )}
              {v.estimated ? (
                <Text style={[s.small, { color: c.muted }]}>아직 기록이 적어 숫자가 크게 흔들려요. 한 달쯤 기록이 쌓이면 자리를 잡아요.</Text>
              ) : null}
            </View>
            <LoadTrend trend={v.trend} c={c} />
          </>
        ) : (
          <View style={[s.well, { backgroundColor: c.chip + '80' }]}>
            <Text style={[s.bodyBold, { color: c.ink }]}>{v.hasRecords ? '아직 지수를 낼 수 없어요' : '기록을 남기면 표시돼요'}</Text>
            {v.hasRecords && v.daysNeeded > 0 ? (
              <View style={{ gap: 6 }}>
                <Bar value={v.historyDays / CHRONIC_WINDOW_DAYS} color={c.sky + '99'} c={c} />
                <Text style={[s.tiny, { color: c.muted }]}>
                  기록 {v.historyDays}일 / {CHRONIC_WINDOW_DAYS}일 · {v.daysNeeded}일 더 필요
                </Text>
              </View>
            ) : null}
            <Text style={[s.small, { color: c.muted }]}>{v.emptyHint}</Text>
          </View>
        )}
      </View>

      {/* 기록이 빠진 날이 많으면 지수가 실제보다 낮게 나온다 — 낮은 숫자는 '더 던져도 된다'로 읽힌다 */}
      {notices?.missingDays != null ? (
        <Pressable onPress={() => leave('/today')} accessibilityRole="link" style={[s.warnRow, { backgroundColor: c.warnBg, borderTopColor: c.warn + '40' }]}>
          <Text style={[s.small, { color: c.warn }]}>
            기록 없는 날이 {notices.missingDays}일이라 지수가 낮게 나올 수 있어요. <Text style={[s.smallBold, { color: c.sky }]}>투구 일지</Text>에 남겨 주세요.
          </Text>
        </Pressable>
      ) : null}
      {notices?.throwStreak != null ? (
        <View style={[s.warnRow, { backgroundColor: c.warnBg, borderTopColor: c.warn + '40' }]}>
          <Text style={[s.small, { color: c.warn }]}>
            최근 4주에 {notices.throwStreak}일 연속으로 던진 구간이 있어요. 지수가 높지 않아도 쉬는 날을 넣어 주세요.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Bar({ value, color, c }: { value: number; color: string; c: Palette }) {
  return (
    <View style={[s.bar, { backgroundColor: c.chip }]}>
      <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

/* ----------------------------- 이번 주 · 마지막 투구 · 최고 구속(웹 app/(app)/coach/overview.tsx) ----------------------------- */

function noteColor(note: StatNote, c: Palette) {
  return note.tone === 'warn' ? c.warn : note.tone === 'muted' ? c.muted : c.muted + '99';
}

const DELTA_ARROW: Record<-1 | 0 | 1, SFSymbol> = { 1: 'arrow.up.right', 0: 'minus', [-1]: 'arrow.down.right' };

function DeltaLine({ delta, c }: { delta: DeltaView | null; c: Palette }) {
  if (!delta) return <Text style={[s.tiny, { color: c.muted + '99' }]}>비교할 이전 기록 없음</Text>;
  const color = toneColor(delta.tone, c);
  return (
    <View style={s.deltaRow}>
      <SymbolView name={DELTA_ARROW[delta.dir]} size={11} weight="semibold" tintColor={color} />
      <Text style={[s.tiny, { color, fontVariant: ['tabular-nums'] }]}>{delta.text}</Text>
    </View>
  );
}

function StatCell({
  label,
  value,
  unit,
  tone,
  footer,
  c,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral';
  footer: ReactNode;
  c: Palette;
}) {
  return (
    <View style={[s.statCell, { backgroundColor: c.card }]}>
      {/* 상태를 알리는 얇은 상단 선 */}
      {tone !== 'neutral' ? <View style={[s.statLine, { backgroundColor: toneColor(tone, c) }]} /> : null}
      <Text numberOfLines={1} style={[s.tiny, { color: c.muted, fontWeight: '600' }]}>
        {label}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[s.statValue, { color: c.ink }]}>
        {value}
        {unit ? <Text style={[s.tiny, { color: c.muted }]}> {unit}</Text> : null}
      </Text>
      {footer}
    </View>
  );
}

function Stats({ overview, c }: { overview: AnalysisOverview; c: Palette }) {
  const { week, last, best } = overview;
  const speed = usePrefs().speed;
  const bestNote = best ? best.note : overview.bestEmpty;
  return (
    <View style={[s.statRow, { backgroundColor: c.line }]}>
      <StatCell label="이번 주 투구" value={String(week.total)} unit="구" tone={week.tone} footer={<DeltaLine delta={week.delta} c={c} />} c={c} />
      <StatCell
        label="마지막 투구"
        value={last.restDays == null ? '—' : last.restDays === 0 ? '오늘' : String(last.restDays)}
        unit={last.restDays == null || last.restDays === 0 ? '' : '일 전'}
        tone={last.tone}
        footer={<Text style={[s.tiny, { color: noteColor(last.note, c) }]}>{last.note.text}</Text>}
        c={c}
      />
      <StatCell
        label="개인 최고 구속"
        value={best ? (formatSpeed(best.value, speed) ?? '—') : '—'}
        tone="neutral"
        footer={<Text style={[s.tiny, { color: noteColor(bestNote, c) }]}>{bestNote.text}</Text>}
        c={c}
      />
    </View>
  );
}

/* ----------------------------- 잘 던진 날(웹 app/(app)/coach/good-days.tsx) ----------------------------- */

function GoodDays({ result, c }: { result: GoodDayResult; c: Palette }) {
  const { rated, needed, patterns, all } = result;
  const [open, setOpen] = useState(false);
  const before = patterns.filter((p) => p.kind === 'before');
  const feel = patterns.filter((p) => p.kind === 'feel');
  const rows = all.slice(0, 8);
  return (
    <View style={[s.card, { backgroundColor: c.card }]}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={[s.cardTitle, { color: c.ink }]}>
          잘 던진 날
        </Text>
        <Text style={[s.small, { color: c.muted }]}>불펜 · 라이브 · 경기 뒤 매긴 만족도로 찾아요</Text>
      </View>

      {rated < needed ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.body, { color: c.ink }]}>
            만족도 매긴 날 {rated}/{needed}일 · 다 차면 찾아 드려요.
          </Text>
          <Bar value={rated / needed} color={c.sky + '73'} c={c} />
        </View>
      ) : patterns.length === 0 ? (
        <Text style={[s.body, s.center, s.well, { color: c.muted, backgroundColor: c.chip + '80' }]}>
          {rated}일을 맞대 봤는데 아직 뚜렷한 것이 없어요.{'\n'}더 쌓이면 다시 봐요.
        </Text>
      ) : (
        <View style={{ gap: 14 }}>
          {before.length > 0 ? <Patterns title="던지기 전" items={before.map((p) => p.text)} c={c} /> : null}
          {feel.length > 0 ? <Patterns title="그날 느낌" items={feel.map((p) => p.text)} c={c} /> : null}
        </View>
      )}

      {/* 찾는 법 · 견줘 본 항목은 '자세히' 하나 안으로(웹과 같다) */}
      <View style={[s.divider, { borderTopColor: c.line }]}>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={s.foldBtn}
        >
          <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} weight="semibold" tintColor={c.muted} />
          <Text style={[s.small, { color: c.muted }]}>{all.length > 0 ? '자세히 · 견줘 본 항목' : '어떻게 찾나요'}</Text>
        </Pressable>
        {open ? (
          <View style={{ gap: 10 }}>
            <Text style={[s.tiny, { color: c.muted }]}>
              최근 180일, 매긴 날 {rated}일. 하루에 여러 번 매기면 평균 하나로 보고, 시즌 내내 같이 오르내린 흐름은 빼고 견줘요. 우연으로 생기기 어려운
              차이만 말해요.
            </Text>
            {rows.map((r) => (
              <View key={r.key} style={s.between}>
                <Text style={[s.small, { color: c.ink, flex: 1 }]}>{r.label}</Text>
                <Text style={[s.tiny, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
                  {r.meanHigh.toFixed(1)} vs {r.meanLow.toFixed(1)} · {r.nHigh}일 / {r.nLow}일
                </Text>
              </View>
            ))}
            {rows.length > 0 ? (
              <Text style={[s.tiny, { color: c.muted + 'b3' }]}>
                만족도 평균(1~5) 높은 쪽 vs 낮은 쪽, 그 날 수. 날 수가 적거나 차이가 0.7점 안이면 위에는 안 올려요.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Patterns({ title, items, c }: { title: string; items: string[]; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.tiny, { color: c.muted, fontWeight: '700' }]}>{title}</Text>
      {items.map((text) => (
        <Text key={text} style={[s.bodyBold, s.box, { color: c.sky, backgroundColor: c.sky + '14' }]}>
          {text}
        </Text>
      ))}
    </View>
  );
}

/* ----------------------------- 최근 4주(웹 app/(app)/coach/training-review.tsx) ----------------------------- */

/** 막대 끝 — 닷새면 꽉 찬다(웹 FULL_DAYS) */
const FULL_DAYS = 5;

function Review({ review, armCareMissing, c }: { review: TrainingReview; armCareMissing: boolean; c: Palette }) {
  const { weeks, totals } = review;
  const busiest = Math.max(...weeks.map((w) => w.days), 0);
  const counts = [
    { label: '운동한 날', value: totals.trainedDays, alert: false },
    { label: '암케어 한 날', value: totals.armCareDays, alert: armCareMissing },
  ];
  return (
    <View style={[s.card, { backgroundColor: c.card }]}>
      <Text accessibilityRole="header" style={[s.cardTitle, { color: c.ink }]}>
        최근 {weeks.length}주
      </Text>
      <View style={s.row}>
        {counts.map((n) => (
          <View key={n.label} style={[s.countBox, { backgroundColor: n.alert ? c.warnBg : c.chip + '80' }]}>
            <Text style={[s.tiny, { color: c.muted }]}>{n.label}</Text>
            <Text style={[s.countValue, { color: n.alert ? c.warn : c.ink }]}>
              {n.value}
              <Text style={[s.tiny, { color: c.muted }]}> 일</Text>
            </Text>
          </View>
        ))}
      </View>
      {armCareMissing ? <Text style={[s.small, { color: c.warn }]}>{totals.pitchedDays}일 던지는 동안 암케어 기록이 없어요.</Text> : null}
      {weeks.some((w) => w.days > 0) ? (
        <View style={{ gap: 14 }}>
          {weeks.map((w) => {
            const empty = w.days === 0;
            return (
              <View key={w.ago} style={{ gap: 6 }}>
                <View style={s.between}>
                  <Text style={[s.bodyBold, { color: w.ago === 0 ? c.sky : c.ink }]}>{w.label}</Text>
                  {empty ? (
                    <Text style={[s.tiny, { color: c.muted + '99' }]}>쉬었어요</Text>
                  ) : (
                    <Text style={[s.small, { color: c.muted }]}>
                      <Text style={[s.countValue, { color: c.ink }]}>{w.days}</Text> 일 · {w.minutes}분
                    </Text>
                  )}
                </View>
                <Bar value={w.days / Math.max(FULL_DAYS, busiest)} color={empty ? 'transparent' : w.ago === 0 ? c.sky : c.sky + '73'} c={c} />
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[s.body, s.center, s.well, { color: c.muted, backgroundColor: c.chip + '80' }]}>
          최근 {weeks.length}주 동안 마친 운동이 없어요.
        </Text>
      )}
    </View>
  );
}

/* ----------------------------- 그래프(웹 app/(app)/today/home-trends.tsx) ----------------------------- */

const ICON: Record<MetricKey, SFSymbol> = {
  pitches: 'baseball',
  velocity: 'speedometer',
  condition: 'heart.text.square',
  weight: 'scalemass',
  kcal: 'flame',
  training: 'dumbbell',
};

const PERIODS = [
  { value: '4w', label: '4주', days: 28 },
  { value: '12w', label: '12주', days: 84 },
  { value: 'custom', label: '기간 설정', days: 0 },
] as const;
type Period = (typeof PERIODS)[number]['value'];
const RANGE_KEY = 'bullpen-trends-range';
const shortDate = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`;

function Trends({ data, onJump, c }: { data: AppAnalysis; onJump: (day: string) => void; c: Palette }) {
  const [period, setPeriodState] = useState<Period>('4w');
  const today = data.today;
  /* '기간 설정' — 시작 · 끝을 작은 달력에서 고른다(받아 온 기록 범위 안, 기록 있는 날에 점). 45일까지는 날짜별, 넘으면 주별 */
  const earliest = data.series.from;
  const [custom, setCustom] = useState({ from: shiftDateKey(today, -27), to: today });
  const speed = usePrefs().speed;
  const weight = useWeightUnit();
  /* 고른 기간은 이 폰에 기억한다 — 웹 그래프와 같은 열쇠 · 모양(today/home-trends.tsx RANGE_KEY readRange) */
  useEffect(() => {
    let alive = true;
    void loadJson(RANGE_KEY).then((v) => {
      const saved = v as { period?: string; from?: string; to?: string } | null;
      if (!alive || !saved) return;
      if (PERIODS.some((x) => x.value === saved.period)) setPeriodState(saved.period as Period);
      if (saved.from && saved.to && saved.from >= earliest && saved.from <= saved.to && saved.to <= today) setCustom({ from: saved.from, to: saved.to });
    });
    return () => {
      alive = false;
    };
  }, [earliest, today]);
  const p = PERIODS.find((x) => x.value === period)!;
  const range = period === 'custom' ? custom : { from: shiftDateKey(today, -(p.days - 1)), to: today };
  const span = daysBetween(range.from, range.to) + 1;
  const periodName = period === 'custom' ? `${span}일` : p.label;
  const pickRange = (next: { from: string; to: string }) => {
    setCustom(next);
    void saveJson(RANGE_KEY, { period: 'custom', ...next });
  };
  const { slots, daily } = slotsOf(range);
  const days = daysOf(range);
  /* 견줄 바로 앞 기간(같은 길이) — 받아 온 기록보다 앞으로 넘어가면 견주지 않는다(웹과 같다) */
  const beforeFrom = shiftDateKey(range.from, -span);
  const before = beforeFrom < data.series.from ? null : daysOf({ from: beforeFrom, to: shiftDateKey(range.from, -1) });
  const valueOf = (key: MetricKey, day: string) => data.series.values[key]?.[day] ?? null;
  const specs = METRIC_SPECS.filter((m) => ANALYSIS_METRICS[data.view].includes(m.key));
  const hasRecord = (day: string) => specs.some((m) => valueOf(m.key, day) != null);

  return (
    <View style={{ gap: 12 }}>
      <View style={s.between}>
        <View>
          <Text accessibilityRole="header" style={[s.section, { color: c.ink }]}>
            그래프
          </Text>
          <Text style={[s.small, { color: c.muted }]}>
            <Text style={[s.smallBold, { color: c.ink }]}>{period === 'custom' ? '고른 기간' : `최근 ${p.label}`}</Text>
            {daily ? ' · 날짜별' : ' · 주별'}
          </Text>
        </View>
        <View accessibilityRole="tablist" style={[s.segment, { backgroundColor: c.chip }]}>
          {PERIODS.map((x) => {
            const on = x.value === period;
            return (
              <Pressable
                key={x.value}
                onPress={() => {
                  if (on) return;
                  void Haptics.selectionAsync();
                  setPeriodState(x.value);
                  void saveJson(RANGE_KEY, { period: x.value, ...custom });
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.segItem, on && { backgroundColor: c.card }]}
              >
                <Text style={[s.smallBold, { color: on ? c.ink : c.muted }]}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {period === 'custom' ? (
        <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
          <DateNavButton label={shortDate(custom.from)} date={custom.from} today={custom.to} min={earliest} marked={hasRecord} onPick={(from) => pickRange({ ...custom, from })} />
          <Text style={{ color: c.muted, fontSize: 15 }}>~</Text>
          <DateNavButton label={shortDate(custom.to)} date={custom.to} today={today} min={custom.from} marked={hasRecord} onPick={(to) => pickRange({ ...custom, to })} />
          <Text style={[s.tiny, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
            {span}일 · {daily ? '날짜별' : '주별'}
          </Text>
        </View>
      ) : null}
      {/* 기간을 바꾸면 새로 그린다(key) */}
      <View key={`${range.from}~${range.to}`} style={s.row}>
        {specs.map((m) => {
          const fmt = (v: number) => formatMetric(m.key, v, speed, weight);
          return (
            <TrendCardView
              key={m.key}
              spec={m}
              icon={ICON[m.key]}
              card={trendCardOf(m, valueOf, days, before, slots, fmt, periodName)}
              slots={slots}
              daily={daily}
              endsToday={range.to === today}
              format={fmt}
              onJump={onJump}
              c={c}
            />
          );
        })}
      </View>
      {daily ? <Text style={[s.tiny, s.center, { color: c.muted }]}>날을 톡 치면 그날 분석을 봐요.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backBtn: { width: 104, flexDirection: 'row', justifyContent: 'flex-start', gap: 2, paddingLeft: 4 },
  backText: { fontSize: 17 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 14, paddingRight: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -4 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  section: { fontSize: 20, fontWeight: '700' },
  card: { borderRadius: 20, padding: 16, gap: 12 },
  cardFlat: { borderRadius: 20, overflow: 'hidden' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ratio: { fontSize: 48, fontWeight: '700', lineHeight: 52, fontVariant: ['tabular-nums'] },
  well: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, gap: 10, overflow: 'hidden' },
  warnRow: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  statRow: { flexDirection: 'row', gap: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden' },
  statCell: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 14, gap: 6 },
  statLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  statValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4, gap: 4 },
  foldBtn: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  countBox: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  countValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  segment: { flexDirection: 'row', borderRadius: 18, padding: 2 },
  segItem: { minHeight: 36, minWidth: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  pill: { minHeight: 48, borderRadius: 24, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  textBtn: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  tiny: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  center: { textAlign: 'center' },
});

import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { MECHANICS_FOLD_TEXT, type DrillRecordSnapshot, type MechanicsFinishSummary } from '@/lib/mechanics/program';
import { SKILL_STAGES } from '@/lib/mechanics/progression';
import { FEEL_LABEL, SKILL_TEXT } from '~/mechanics/practice-input';
import { FilmVerdictButtons, LevelOffer, ThrowNoteCard } from '~/mechanics/parts';
import { READABLE, useBarSide } from '~/lib/layout';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';

/**
 * 메카닉 완료(2026-10-31 확정 시안 03) — 실행 화면이 마무리 뒤에 바로 그리고(fresh), 첫 화면의 '수행 기록 보기'가 지난 완료를 연다(view).
 * 그리는 것은 서버가 마친 때 묶은 요약(MechanicsFinishSummary)뿐 — 오늘 합계를 더해 세션 총량을 만들거나 처방을 실적으로 채우지 않는다.
 * 드릴 저장 · 세션 완료 · 학습 단계는 따로 보인다. 완료 효과(0.42초)는 처음 마친 그 화면에서만, 다시 보기 · 일부 · 확인 응답에는 없다.
 */
export type DoneReason = 'manual' | 'restricted' | 'pain';

/** 새로 마친 세션 — 이 앱을 켠 동안 한 번만 효과를 보인다(다시 그려져도 반복하지 않게) */
const stamped = new Set<string>();

const dayText = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
};
const unitOf = (r: DrillRecordSnapshot) => (r.kind === 'throws' ? '구' : '회');

export function MechanicsDone({
  summary,
  mode,
  replay = false,
  resumedFrom = null,
  reason = 'manual',
  onClose,
  onResume,
  c,
}: {
  summary: MechanicsFinishSummary;
  /** fresh: 방금 마친 화면 · view: 지난 완료 열람(새 행동 · 효과 없음) */
  mode: 'fresh' | 'view';
  /** 같은 세션 마무리를 다시 확인한 응답(응답 유실 뒤) — 완료는 맞지만 새 효과는 없다 */
  replay?: boolean;
  /** 이 화면을 열 때 이미 저장돼 있던 칸 수 — 없으면 '앞서 · 이번에'를 가르지 않는다 */
  resumedFrom?: number | null;
  /** 일부 수행으로 마친 까닭 */
  reason?: DoneReason;
  onClose: () => void;
  /** 일부 수행에서 같은 세션의 남은 드릴로 — 이어서 할 수 없으면 주지 않는다 */
  onResume?: () => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const barSide = useBarSide(16);
  const completed = summary.status === 'completed';
  const saved = summary.savedSlots.length;
  const total = summary.items.length;
  const levelName = summary.progress?.kind === 'level' ? mechanicsLevel(summary.progress.level).name : null;
  const linked = summary.kind !== 'level';
  const fresh = mode === 'fresh';
  const effect = fresh && completed && !replay && saved > 0;
  const before = fresh && resumedFrom != null && resumedFrom > 0 && resumedFrom < saved ? resumedFrom : null;
  const remaining = summary.items.filter((i) => i.required && !summary.savedSlots.includes(i.slot));
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<DrillRecordSnapshot | null>(null);

  const eyebrow = linked ? '3D 분석 기반 훈련' : `${levelName ?? '메카닉'} 연습`;
  const title = !fresh ? '지난 완료 기록' : completed ? (linked ? '이번 훈련 저장됨' : '오늘 훈련 끝') : '오늘은 여기까지';
  const status = completed ? '세션 완료 확인됨' : '드릴 기록 저장됨';
  const levelDone = completed && summary.progress?.kind === 'level' && summary.progress.after >= summary.progress.total;

  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      <View style={[s.top, { paddingTop: inset.top + 8, backgroundColor: c.page }]}>
        <Text accessibilityRole="header" style={[s.topTitle, { color: c.ink }]}>
          {!fresh ? '메카닉 기록' : completed ? '메카닉 완료' : '메카닉'}
        </Text>
      </View>
      <ScrollView style={s.fill} contentContainerStyle={[s.content, READABLE]}>
        {/* 머리 — 무엇을 · 언제 · 저장한 드릴 n/N · 세션 완료 여부. 숫자는 바로 읽힌다(올라가는 숫자 없음) */}
        <View style={[s.hero, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <View style={s.heroTop}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.eyebrow, { color: c.link }]}>{eyebrow}</Text>
              <Text style={[s.heroTitle, { color: c.ink }]}>{title}</Text>
              <Text style={[s.small, { color: c.muted }]}>
                {summary.label}
                {'\n'}
                {dayText(summary.on)}
              </Text>
            </View>
            <DoneMark id={summary.attemptId} play={effect} completed={completed} c={c} />
          </View>
          <View accessible accessibilityLabel={`저장한 드릴 ${total}개 중 ${saved}개`} style={{ gap: 2 }}>
            <Text style={[s.big, { color: c.ink }]}>
              {saved}
              <Text style={[s.small, { color: c.muted, fontWeight: '500' }]}> / {total}개 드릴</Text>
            </Text>
            <Text style={[s.small, { color: c.muted }]}>저장한 드릴</Text>
          </View>
          {before != null ? (
            <Text style={[s.smallBold, { color: c.ink }]}>
              앞서 {before}개 · 이번에 {saved - before}개 저장
            </Text>
          ) : null}
          <View style={[s.statusRow, { borderTopColor: c.line }]}>
            <SymbolView name={completed ? 'checkmark.circle.fill' : 'tray.and.arrow.down.fill'} size={16} tintColor={completed ? c.ok : c.link} />
            <Text style={[s.smallBold, { color: completed ? c.ok : c.link }]}>{status}</Text>
          </View>
        </View>

        {/* 필요한 안내 — 일부 · 3D 연계 · 12회 · 영상 비교 · 난이도 검토 · 남은 투구 기록. 해당할 때만 */}
        {!completed ? (
          <Notice
            title="세션 진도는 유지해요"
            body={
              reason === 'pain'
                ? '통증을 기록해 멈췄어요. 이어서 하기 전 메카닉 화면에서 오늘 가능한 상태를 다시 확인해요.'
                : reason === 'restricted'
                  ? MECHANICS_FOLD_TEXT.partialFinish
                  : '남은 필수 드릴이 있어 같은 차례를 유지해요.'
            }
            c={c}
          >
            {remaining.length > 0 ? (
              <Text style={[s.small, { color: c.muted }]}>남은 필수 드릴 {remaining.length}개 · {remaining.map((r) => r.title).join(' · ')}</Text>
            ) : null}
            {onResume ? <Action label="남은 드릴 이어서 하기" onPress={onResume} primary={false} c={c} /> : null}
          </Notice>
        ) : null}

        {completed && linked && summary.progress?.kind === 'skill' ? (
          <Notice
            title={`${summary.progress.elements.map((e) => e.stage).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} 단계 유지`}
            body={summary.message ?? '다음 날 반응은 아직 확인 전이에요. 학습 단계는 자동으로 바뀌지 않아요.'}
            c={c}
          />
        ) : null}

        {levelDone && levelName ? (
          <Notice title={`${levelName} 12회 연습을 마쳤어요`} body="다음 훈련은 내용을 확인하고 직접 선택해요." c={c}>
            {fresh ? <Action label="다음 훈련 살펴보기" onPress={onClose} primary={false} c={c} /> : null}
          </Notice>
        ) : null}

        {fresh && completed && summary.film === 'compare' ? (
          <Notice title="영상 비교할 차례" body="같은 조건의 영상으로 동작을 비교해 볼 수 있어요." c={c}>
            <Action label="영상 비교 열기" onPress={() => router.push('/pitch/compare' as Href)} primary={false} c={c} />
            <View style={[s.divider, { borderTopColor: c.line }]}>
              <FilmVerdictButtons session={summary.session} c={c} />
            </View>
          </Notice>
        ) : null}

        {fresh && completed && !levelDone && summary.advice?.to ? (
          <LevelOffer kind={summary.advice.kind} to={summary.advice.to} c={c} />
        ) : null}

        {fresh && summary.throwNote ? <ThrowNoteCard note={summary.throwNote} c={c} /> : null}

        {/* 저장한 드릴 — 접어 두고, 펼치면 드릴마다 저장한 그대로를 연다 */}
        {saved > 0 ? (
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Press
              onPress={() => setListOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: listOpen }}
              style={s.listHead}
            >
              <Text style={[s.bodyBold, { color: c.ink, flex: 1 }]}>저장한 드릴</Text>
              <Text style={[s.small, { color: c.muted }]}>{saved}개</Text>
              <SymbolView name={listOpen ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
            </Press>
            {listOpen
              ? summary.items
                  .filter((i) => summary.savedSlots.includes(i.slot))
                  .map((i) => {
                    const r = summary.records.find((x) => x.slot === i.slot) ?? null;
                    return (
                      <Press
                        key={i.slot}
                        onPress={() => r && setDetail(r)}
                        disabled={!r}
                        accessibilityRole="button"
                        accessibilityHint={r ? '저장한 기록을 열어요' : undefined}
                        style={[s.row, { borderTopColor: c.line }]}
                      >
                        <View style={[s.rowDot, { backgroundColor: c.skyTint }]}>
                          <SymbolView name="checkmark" size={11} weight="bold" tintColor={c.link} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[s.bodyBold, { color: c.ink }]}>{r?.title ?? i.title}</Text>
                          <Text style={[s.small, { color: c.muted }]}>
                            {r
                              ? `동작 느낌 · ${FEEL_LABEL[r.feel]}${r.response === 'pain' ? ' · 통증 있었음' : ''}`
                              : '저장됨 · 기록 세부는 이 세션에 남아 있지 않아요'}
                          </Text>
                        </View>
                        {r ? <SymbolView name="chevron.right" size={12} tintColor={c.muted} /> : null}
                      </Press>
                    );
                  })
              : null}
          </View>
        ) : null}

        <ProgressCard summary={summary} c={c} />
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), paddingHorizontal: barSide, backgroundColor: c.card, borderTopColor: c.line }]}>
        <Action label="완료" onPress={onClose} c={c} />
      </View>

      {detail ? <RecordSheet record={detail} onClose={() => setDetail(null)} c={c} /> : null}
    </View>
  );
}

/** 진도 — 수준 연습 순서(12회)와 3D 학습 단계(기초 · 연결 · 통합)는 다른 칸이다 */
function ProgressCard({ summary, c }: { summary: MechanicsFinishSummary; c: Palette }) {
  const p = summary.progress;
  if (!p) return null;
  if (p.kind === 'skill')
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        {p.elements.map((e) => (
          <View key={e.element} style={{ gap: 8 }}>
            <Text style={[s.bodyBold, { color: c.ink }]}>{e.element} 학습 단계</Text>
            <View style={s.stages} accessibilityLabel={`${e.element} 지금 ${e.stage} 단계`}>
              {SKILL_STAGES.map((st) => {
                const on = st === e.stage;
                return (
                  <View key={st} style={[s.stage, { backgroundColor: on ? c.skyTint : c.chip, borderColor: on ? c.sky : 'transparent' }]}>
                    <Text style={[s.smallBold, { color: on ? c.link : c.muted }]}>{st}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <Text style={[s.small, { color: c.muted }]}>자가 확인과 3D 측정 결과는 구분해요.</Text>
      </View>
    );
  const name = p.kind === 'level' ? `${mechanicsLevel(p.level).name} 연습 순서` : '3D 처방';
  const completed = summary.status === 'completed';
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={s.between}>
        <Text style={[s.bodyBold, { color: c.ink }]}>{name}</Text>
        <Text style={[s.small, { color: c.muted }]} accessibilityLabel={`${p.total}회 중 ${p.after}회`}>
          <Text style={{ color: c.ink, fontWeight: '700' }}>{p.after}</Text> / {p.total}회
        </Text>
      </View>
      <View style={s.segments}>
        {Array.from({ length: p.total }, (_, i) => (
          <View key={i} style={[s.segment, { backgroundColor: i < p.after ? c.sky : i === p.after && !completed ? c.sky + '66' : c.chip }]} />
        ))}
      </View>
      {completed ? (
        p.after < p.total ? (
          <View style={[s.between, { borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 }]}>
            <Text style={[s.body, { color: c.ink }]}>다음 차례</Text>
            <Text style={[s.bodyBold, { color: c.link }]}>{p.after + 1}번째 훈련</Text>
          </View>
        ) : null
      ) : (
        <Text style={[s.small, { color: c.muted }]}>이번 세션은 아직 완료 전이에요.</Text>
      )}
    </View>
  );
}

/** 드릴 하나 — 기록 당시 날짜 · 오늘 이 드릴의 합계 · 강도 · 느낌 · 통증 · 자가 확인. 처방(목표량)은 넣지 않는다 */
function RecordSheet({ record: r, onClose, c }: { record: DrillRecordSnapshot; onClose: () => void; c: Palette }) {
  const rows: [string, string][] = [
    [r.kind === 'throws' ? '오늘 이 드릴로 던진 공 합계' : '오늘 이 드릴의 반복 합계', `${r.count}${unitOf(r)}`],
    ['체감 강도', `${r.effortPct}%`],
    ['동작 느낌', FEEL_LABEL[r.feel]],
    ['수행 중 통증', r.response === 'pain' ? '있었어요' : '없었어요'],
    ...(r.skill
      ? ([
          ['동작 목표 유지(자가 확인)', SKILL_TEXT[r.skill.quality]],
          ['실제 투구 전이(자가 확인)', SKILL_TEXT[r.skill.transferred]],
        ] as [string, string][])
      : []),
    ...(r.kind === 'throws'
      ? ([['투구 기록', r.alreadyLogged ? '다른 기록에 포함했다고 표시함' : '이 드릴의 합계로 반영']] as [string, string][])
      : []),
    ['드릴 기록', '저장됨'],
  ];
  return (
    <Sheet fit open onClose={onClose} title={r.title} description={`${Number(r.on.slice(5, 7))}월 ${Number(r.on.slice(8, 10))}일 · 저장한 수행 기록`} c={c}>
      <View style={{ gap: 0 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={[s.kv, { borderBottomColor: c.line }]}>
            <Text style={[s.body, { color: c.muted, flex: 1 }]}>{k}</Text>
            <Text style={[s.bodyBold, { color: c.ink }]}>{v}</Text>
          </View>
        ))}
        <Text style={[s.small, { color: c.muted, paddingTop: 12 }]}>
          {r.tool} · 오늘 합계는 이번 세션에서 새로 수행한 양과 다를 수 있어요.
        </Text>
      </View>
    </Sheet>
  );
}

/** 소프트 솔리드 체크 — 새로 마친 순간에만 0.42초 들어앉는다. 동작 줄이기 · 다시 보기는 처음부터 제자리 */
function DoneMark({ id, play, completed, c }: { id: string; play: boolean; completed: boolean; c: Palette }) {
  const reduced = useReducedMotion();
  const first = play && !stamped.has(id);
  const scale = useSharedValue(first && !reduced ? 0.7 : 1);
  const lift = useSharedValue(first && !reduced ? 8 : 0);
  useEffect(() => {
    if (!first) return;
    stamped.add(id);
    if (reduced) return;
    scale.set(withSequence(withTiming(1.06, { duration: 280 }), withTiming(1, { duration: 140 })));
    lift.set(withTiming(0, { duration: 420 }));
  }, [first, reduced, id, scale, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }, { scale: scale.get() }] }));
  return (
    <Animated.View
      accessible
      accessibilityLabel={completed ? '세션 완료' : '드릴 기록 저장됨'}
      style={[
        s.mark,
        { backgroundColor: completed ? c.sky : c.skyTint, boxShadow: completed ? '0 10px 22px -8px rgba(0,112,201,0.55), inset 0 2px 0 rgba(255,255,255,0.35)' : c.float },
        style,
      ]}
    >
      <SymbolView name={completed ? 'checkmark' : 'tray.and.arrow.down'} size={26} weight="bold" tintColor={completed ? '#fff' : c.link} />
    </Animated.View>
  );
}

function Notice({ title, body, children, c }: { title: string; body: string; children?: ReactNode; c: Palette }) {
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.bodyBold, { color: c.ink }]}>{title}</Text>
      <Text style={[s.body, { color: c.muted }]}>{body}</Text>
      {children}
    </View>
  );
}

export function Action({ label, onPress, primary = true, disabled, c }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; c: Palette }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.pill, { backgroundColor: primary ? c.action : c.chip, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={[s.bodyBold, { color: primary ? c.onAction : c.ink }]}>{label}</Text>
    </Press>
  );
}

/** 지난 완료를 받는 중 · 못 받음 — 읽기만 다시 한다(새 세션 · 다시 마치기 없음) */
export function DoneLoading({
  failed,
  message,
  onRetry,
  onClose,
  c,
}: {
  failed: boolean;
  message: string;
  onRetry?: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.fill, s.center, { backgroundColor: c.page, paddingTop: inset.top, gap: 14 }]}>
      {failed ? (
        <>
          <Text accessibilityRole="header" style={[s.heroTitle, { color: c.ink, textAlign: 'center' }]}>
            완료 내용을{'\n'}불러오지 못했어요
          </Text>
          <Text style={[s.body, { color: c.muted, textAlign: 'center' }]}>{message}</Text>
          {onRetry ? <Action label="다시 불러오기" onPress={onRetry} c={c} /> : null}
          <Action label="메카닉으로 돌아가기" onPress={onClose} primary={false} c={c} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  top: { alignItems: 'center', paddingBottom: 8 },
  topTitle: { fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  hero: { borderRadius: 24, padding: 20, gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontSize: 13, fontWeight: '700' },
  heroTitle: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  big: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 50 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  mark: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  listHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  rowDot: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  stages: { flexDirection: 'row', gap: 6 },
  stage: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  kv: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bottom: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  pill: { minHeight: 52, borderRadius: 26, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 19 },
  smallBold: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
});

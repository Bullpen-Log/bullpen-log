import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { withJosa } from '@/lib/korean';
import type { ProgramCardProps, ProgramResult } from '@/lib/program/load';
import { sessionTitle } from '@/lib/program/program';
import { ExerciseMedia, HowTo } from '~/armcare/parts';
import { act } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { BigButton, Card, LinkRow, s, type TodayActions } from './parts';
import { RepinSheet } from './program-start';
import { Sheet } from '~/workout/sheets';

/**
 * 근력 · 파워 프로그램 카드(앱 화면) — 웹 app/(app)/training/program-card.tsx 를 옮겼다. 차례도 같다: 오늘 상태 + 일차 → 주의 한 줄 → [운동 시작]
 * → 운동 줄(누르면 그 무게의 까닭 시트) → 진행 → 앞으로 할 세션 → 자세히. 건너뛰기 · 그만두기 · '그래도 오늘 할래요' · 고정 운동 바꾸기(./program-start
 * RepinSheet)는 같은 서버 동작(program.*).
 */
type Row = ProgramCardProps['rows'][number];

const kgText = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1));

export function ProgramCardView({ p, c, a }: { p: ProgramCardProps; c: Palette; a: TodayActions }) {
  const [more, setMore] = useState(false);
  const [ahead, setAhead] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repin, setRepin] = useState(false);
  /** 운동 줄을 누르면 그 무게의 까닭 — 웹처럼 시트(예전 앱은 Alert 글 한 덩이) */
  const [why, setWhy] = useState<Row | null>(null);

  const going = p.kind === 'go';
  const finishedToday = p.todayState === 'finished';
  const resting = p.kind === 'rest' || p.kind === 'painWait';
  const preview = !going || finishedToday;

  const programName = p.basics ? '기본기 프로그램' : '근력 · 파워 프로그램';
  const session = sessionTitle(p.dayLabel);
  /* 하는 날은 한 줄로 '근력 · 파워 프로그램 · 2번째 세션(B)' — 위 작은 글과 겹쳐 '오늘 해요 · 2번 세션 · B 날'로 읽히던 것(2026-10-20 김민) */
  const oneLine = going && !finishedToday;
  const title = finishedToday
    ? `오늘 했어요 · ${session}`
    : going
      ? `${programName} · ${session}`
      : resting
        ? '오늘은 쉬어요'
        : p.kind === 'otherMode'
          ? '오늘은 다른 운동을 했어요'
          : p.kind === 'needCheckin'
            ? `오늘 할 일 · ${session}`
            : '다 마쳤어요';
  const sub =
    p.kind === 'rest'
      ? p.restText
      : p.kind === 'painWait'
        ? `통증 기록이 있어 ${withJosa(p.dayLabel, '은/는')} 기다려요.`
        : p.kind === 'otherMode'
          ? `${withJosa(p.dayLabel, '은/는')} 다음에 해요.`
          : p.kind === 'needCheckin'
            ? '체크인을 남기면 오늘 몸 상태에 맞춰 정해요.'
            : null;

  /** 확인 창을 띄우고 서버 동작 — 끝나면 화면을 다시 읽는다(웹 ConfirmDialog → run) */
  const confirm = (head: string, detail: string, label: string, action: string, arg?: unknown, destructive = false) =>
    Alert.alert(head, detail, [
      { text: '취소', style: 'cancel' },
      {
        text: label,
        style: destructive ? 'destructive' : 'default',
        onPress: () => {
          void (async () => {
            setPending(true);
            setError(null);
            const r = await act<{ ok: true }>(action, ...(arg === undefined ? [] : [arg]));
            setPending(false);
            if ('error' in r) return setError(r.error);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await a.reload();
          })();
        },
      },
    ]);

  return (
    <Card c={c}>
      <View style={{ gap: 4 }}>
        {oneLine ? null : <Text style={[s.smallBold, { color: c.muted }]}>{programName}</Text>}
        <Text style={[s.title, { color: c.ink }]}>{title}</Text>
        {sub ? <Text style={[s.body, { color: c.muted }]}>{sub}</Text> : null}
        {(resting || finishedToday || p.kind === 'otherMode') && (p.nextLabel || resting) ? (
          <Text style={[s.body, { color: c.muted }]}>다음: {sessionTitle((finishedToday ? p.nextLabel : p.dayLabel) ?? '')}</Text>
        ) : null}
      </View>

      {going && !finishedToday && p.caution ? (
        <View style={[s.row, { alignItems: 'flex-start', gap: 6 }]}>
          <SymbolView name="exclamationmark.circle" size={15} tintColor={c.warn} />
          <Text style={[s.body, { flex: 1, color: c.ink }]}>{p.caution}</Text>
        </View>
      ) : null}

      {going && !finishedToday && !p.canStart ? (
        <Text style={[s.body, { color: c.muted }]}>오늘은 할 수 있는 운동이 없어요. 뺀 까닭은 아래에 있어요.</Text>
      ) : null}
      {going && !finishedToday && p.canStart ? (
        <BigButton
          c={c}
          icon="play.fill"
          label={p.todayState === 'active' ? '운동 이어서 하기' : '운동 시작'}
          busy={a.starting}
          onPress={() => a.start(true)}
        />
      ) : null}
      {p.kind === 'needCheckin' ? <BigButton c={c} label="체크인 하기" onPress={a.checkin} /> : null}

      {p.rows.length > 0 ? (
        <View style={preview ? { opacity: 0.55 } : null}>
          {p.rows.map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityHint="운동 영상 · 설명 보기"
              onPress={() => setWhy(r)}
              style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* 웹과 같은 회색 알약 '선택' · 회색 꼬리표 칩 */}
                  {r.optional ? <Text style={[st.badge, { color: c.muted, backgroundColor: c.chip }]}>선택</Text> : null}
                  <Text numberOfLines={1} style={[s.bodyBold, { color: c.ink, flexShrink: 1 }]}>{r.title}</Text>
                </View>
                {r.contrast ? <Text style={[s.tiny, { color: c.muted }]}>{r.contrast}</Text> : null}
                {r.tag ? <Text style={[st.tag, { color: c.muted, backgroundColor: c.chip }]}>{r.tag}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {r.kg != null ? (
                  <Text style={[s.bodyBold, s.num, { color: c.sky }]}>
                    {kgText(r.kg)}kg{r.perHand ? <Text style={[s.tiny, { color: c.muted }]}> 한 손</Text> : null}
                  </Text>
                ) : r.first ? (
                  <Text style={[s.tiny, { color: c.muted }]}>처음</Text>
                ) : null}
                <Text style={[s.tiny, { color: c.muted }]}>{r.amount}</Text>
              </View>
            </Pressable>
          ))}
          {p.dropped.map((d) => (
            <Text key={`drop-${d.title}`} style={[s.small, { color: c.muted, paddingVertical: 8 }]}>
              오늘 뺌: {d.title} · {d.reason}
            </Text>
          ))}
        </View>
      ) : null}

      {p.kind === 'rest' ? (
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() =>
            confirm(p.restText ? `${p.restText}. 그래도 할까요?` : '그래도 할까요?', '가볍게 하고, 아프면 바로 멈춰요.', '할래요', 'program.overrideProgramRest')
          }
          style={[s.pill, { borderWidth: 1, borderColor: c.line }]}
        >
          <Text style={[s.bodyBold, { color: c.ink }]}>그래도 오늘 할래요</Text>
        </Pressable>
      ) : null}

      <View style={{ gap: 4 }}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="프로그램 진행"
          accessibilityValue={{ min: 0, max: p.total, now: p.completed + p.skipped }}
          style={[s.bar, { backgroundColor: c.line }]}
        >
          <View style={{ width: `${(p.completed / p.total) * 100}%`, backgroundColor: c.sky }} />
          <View style={{ width: `${(p.skipped / p.total) * 100}%`, backgroundColor: `${c.sky}59` }} />
        </View>
        <Text style={[s.tiny, { color: c.muted }]}>
          완료 {p.completed} · 건너뜀 {p.skipped} / {p.total}
        </Text>
      </View>

      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}

      {/* 자주 찾는 셋은 '자세히' 밖에(2026-10-20 김민: "자세히를 눌러야 나와서 못 찾는다") */}
      <View>
        <LinkRow c={c} label="고정 운동 바꾸기" onPress={() => setRepin(true)} />
        <LinkRow c={c} label="몸 상태가 바뀌었으면 체크인 고치기" onPress={a.checkin} />
        <LinkRow
          c={c}
          danger
          label="그만두기"
          onPress={() =>
            confirm(
              '프로그램을 그만둘까요?',
              '이 판은 여기서 끝나요. 기록은 남고, 나중에 새로 시작할 수 있어요.',
              '그만두기',
              'program.stopProgram',
              undefined,
              true
            )
          }
        />
      </View>

      {p.upcoming.length > 0 ? (
        <View style={[s.divider, { borderTopColor: c.line }]}>
          <Fold c={c} open={ahead} onPress={() => setAhead((v) => !v)} label={`앞으로 할 세션 · ${p.upcoming.length}회`} />
          {ahead ? <Upcoming sessions={p.upcoming} c={c} /> : null}
        </View>
      ) : null}

      <View style={[s.divider, { borderTopColor: c.line }]}>
        <Fold c={c} open={more} onPress={() => setMore((v) => !v)} label="자세히" />
        {more ? (
          <View>
            <Text style={[s.small, { color: c.muted }]}>
              {p.name} · {p.subtitle}
            </Text>
            {going && !finishedToday && p.todayState !== 'active' ? (
              <LinkRow
                c={c}
                label="이 날 건너뛰기"
                onPress={() =>
                  confirm(
                    `${withJosa(p.dayLabel, '을/를')} 건너뛸까요?`,
                    `건너뛴 날은 완료로 세지 않아요. 지금 완료 ${p.completed} · 건너뜀 ${p.skipped}.`,
                    '건너뛰기',
                    'program.skipProgramDay',
                    { day: p.day }
                  )
                }
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {repin ? <RepinSheet pinned={p.pinned} onClose={() => setRepin(false)} c={c} a={a} /> : null}
      {/* 운동 줄 — 내용만큼 올라오는 시트에 영상 · 처방 · 무게 까닭 · 설명(웹 운동 상세와 같은 설명 글). 예전엔 화면을 다 덮는 창에 글 몇 줄이었다(2026-10-20 김민) */}
      <Sheet fit open={why != null} onClose={() => setWhy(null)} title={why?.title ?? ''} description={why?.category} c={c}>
        {why ? (
          <View style={{ gap: 12 }}>
            <ExerciseMedia key={why.id} path={why.videoPath} referenceVideoId={why.referenceVideoId} thumbUrl={why.thumbUrl} aspectRatio={why.aspectRatio} />
            <Text style={[s.bodyBold, { color: c.ink }]}>
              {why.slotLabel} · {why.line}
            </Text>
            {why.substituteFor ? <Text style={[s.body, { color: c.ink }]}>오늘은 {why.substituteFor} 대신이에요.</Text> : null}
            <Text style={[s.body, { color: c.ink }]}>{why.reason ?? '무게 없이 하는 운동이에요.'}</Text>
            {why.kg != null ? (
              <Text style={[s.body, { color: c.ink }]}>
                추천 <Text style={[s.bodyBold, s.num]}>{kgText(why.kg)}kg</Text>
                {why.perHand ? ' (한 손)' : ''}. 실제 무게는 들어 보고 정해요.
              </Text>
            ) : null}
            {why.warmup ? <Text style={[s.body, { color: c.muted }]}>준비: {why.warmup}</Text> : null}
            <HowTo key={`how-${why.id}`} exerciseId={why.id} method={null} inline c={c} />
          </View>
        ) : null}
      </Sheet>
    </Card>
  );
}

function Fold({ c, open, onPress, label }: { c: Palette; open: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={s.linkRow}>
      <Text style={[s.bodyBold, { flex: 1, color: c.ink }]}>{label}</Text>
      <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
    </Pressable>
  );
}

/** 앞으로 할 세션 — 세션을 눌러 펴면 운동마다 썸네일 · 이름 · 양(웹 UpcomingSessions, 바로 다음 세션만 펴서 시작) */
function Upcoming({ sessions, c }: { sessions: ProgramCardProps['upcoming']; c: Palette }) {
  const [open, setOpen] = useState<number | null>(sessions[0]?.day ?? null);
  return (
    <View>
      {sessions.map((u) => {
        const shown = open === u.day;
        const names = u.items.map((it) => it.title);
        return (
          <View key={u.day} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => setOpen(shown ? null : u.day)} style={st.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.bodyBold, { color: c.ink }]}>{u.label}</Text>
                {!shown ? (
                  <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                    {names.slice(0, 3).join(' · ')}
                    {names.length > 3 ? ` 외 ${names.length - 3}` : ''}
                  </Text>
                ) : null}
              </View>
              <Text style={[s.tiny, { color: c.muted }]}>{u.items.length}개</Text>
              {/* 펼침 화살표(웹 UpcomingSessions 의 ▾) */}
              <SymbolView name={shown ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
            </Pressable>
            {shown
              ? u.items.map((it, i) => (
                  <View key={`${u.day}-${i}`} style={[s.row, { paddingBottom: 8 }]}>
                    {it.thumbUrl ? (
                      <Image source={{ uri: it.thumbUrl }} style={[st.thumb, { backgroundColor: c.line }]} />
                    ) : (
                      <View style={[st.thumb, { backgroundColor: c.chip }]} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[s.body, { color: c.ink }]}>
                        {it.title}
                      </Text>
                      <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                        {it.title !== it.slotLabel ? `${it.slotLabel} · ` : ''}
                        {it.line}
                      </Text>
                    </View>
                    <Text style={[s.smallBold, s.num, { color: c.ink }]}>{it.amount}</Text>
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

/** 프로그램을 다 마쳤을 때(웹 program-done.tsx) — 큰 운동의 추정 최대, 기본기는 다음 길 */
export function ProgramDoneView({ result, c }: { result: ProgramResult; c: Palette }) {
  return (
    <Card c={c}>
      <View style={{ gap: 4 }}>
        <Text style={[s.smallBold, { color: c.muted }]}>{result.basics ? '기본기 프로그램' : '근력 · 파워 프로그램'}</Text>
        <Text style={[s.title, { color: c.ink }]}>다 마쳤어요</Text>
        <Text style={[s.body, { color: c.muted }]}>
          {result.name} · 완료 {result.completed} · 건너뜀 {result.skipped} · {result.weeks}주 걸렸어요
        </Text>
      </View>
      {result.basics ? (
        <Text style={[s.body, { color: c.ink }]}>
          자세가 익숙해졌으면 무게를 더할 때예요. 이제 근력 · 파워 프로그램을 고를 수 있어요. 만 16세 전이면 가장 무거운 운동은 빼고, 세트마다 3개씩
          남기고 해요.
        </Text>
      ) : null}
      {result.lifts.map((l, i) => {
        const up = l.from != null && l.to != null && l.to > l.from;
        return (
          <View key={l.label} style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.tiny, { color: c.muted }]}>{l.label} · 추정 최대</Text>
              <Text numberOfLines={1} style={[s.bodyBold, { color: c.ink }]}>
                {l.title}
              </Text>
            </View>
            {l.from != null && l.to != null ? (
              up ? (
                <Text style={[s.bodyBold, s.num, { color: c.sky }]}>
                  {Math.round(l.from)} → {Math.round(l.to)}kg
                </Text>
              ) : (
                <Text style={[s.small, { color: c.muted }]}>이번엔 그대로예요</Text>
              )
            ) : (
              <Text style={[s.small, { color: c.muted }]}>기록이 모자라요</Text>
            )}
          </View>
        );
      })}
      {/* 웹 program-done.tsx 의 끝 줄 — 고르기 입구가 바로 밑에 있다 */}
      <Text style={[s.small, { color: c.muted }]}>다음 프로그램은 바로 밑에서 골라요.</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  thumb: { width: 56, height: 42, borderRadius: 10 },
  badge: { fontSize: 12, fontWeight: '600', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  tag: { alignSelf: 'flex-start', fontSize: 11, borderRadius: 7, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 },
});

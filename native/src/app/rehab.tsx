import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RED_FLAGS, RED_FLAGS_LINE } from '@/lib/armcare/pain-guide';
import { REHAB_STAGES, type RehabStage } from '@/lib/armcare/rehab-regions';
import type { AppArmcareGuideTab, AppArmcareTodayTab, AppRehabSummary } from '@/lib/armcare/today-load';
import { Bar } from '~/community/parts';
import { act, leave } from '~/mechanics/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { openPlay } from '~/training/armcare-parts';
import { s, useScreenData } from '~/training/screen';

/**
 * 재활 자세히(앱 화면) — 웹 rehab-card.tsx 의 [자세히]: 이 단계의 목표 · 오늘 운동 · 피할 것 · 위험 신호 · 다음 단계로 가는 조건 ·
 * 매주 확인 · [진단 받았어요] · [단계 직접 바꾸기] · [그만두기 / 재활 끝내기]. 자료는 암케어 화면과 같은 받기(같은 열쇠라 받아 둔 값이 바로 뜬다).
 * 단계 시험 · 매주 확인 · 투구 복귀표는 아직 웹(질문이 길고 결과가 단계를 바꾼다 — 다음에 옮긴다).
 */
export default function RehabScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'today', 'training-armcare:today');
  const data = state.data?.tab === 'today' ? state.data : null;
  const rehab = data?.custom.kind === 'rehab' ? data.custom.rehab : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="암케어" title="재활 프로그램" c={c} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: inset.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
      >
        {rehab?.detail && data ? (
          <Detail rehab={rehab} dateKey={data.dateKey} reload={() => void state.load()} c={c} />
        ) : state.data && !rehab ? (
          <Text style={[s.body, { color: c.muted }]}>진행 중인 재활이 없어요.</Text>
        ) : (
          <Text style={[s.body, { color: c.muted }]}>{state.failed ?? '불러오는 중…'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Detail({ rehab, dateKey, reload, c }: { rehab: AppRehabSummary; dateKey: string; reload: () => void; c: Palette }) {
  const d = rehab.detail!;
  const [pick, setPick] = useState<{ kind: 'diagnosis' | 'stage'; value: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toWeb = () => leave('/training?view=armcare');

  const run = async (action: string, ...args: unknown[]) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const r = await act<{ ok: true }>(action, ...args);
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return false;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reload();
    return true;
  };

  const end = (reason: 'stopped' | 'done') =>
    Alert.alert(
      reason === 'done' ? '재활을 끝낼까요?' : '재활을 그만둘까요?',
      reason === 'done'
        ? '웨이트 · 투구 계획 · 암케어가 평소대로 돌아가요. 지금까지 기록은 남아요.'
        : '지금까지 기록은 남아요. 웨이트 · 투구 계획 · 암케어가 평소대로 돌아가요. 다시 아프면 새로 시작할 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: reason === 'done' ? '끝내기' : '그만두기',
          style: 'destructive',
          onPress: async () => {
            if (await run('rehab.endRehab', reason)) router.back();
          },
        },
      ]
    );

  const choices =
    pick?.kind === 'diagnosis'
      ? d.conditionChoices.map((x) => ({ value: x.key, label: x.label }))
      : ([1, 2, 3, 4] as RehabStage[]).filter((n) => n !== d.stage).map((n) => ({ value: String(n), label: `${n}단계 ${REHAB_STAGES[n].name}` }));
  const submitPick = async () => {
    if (!pick?.value) return;
    const ok =
      pick.kind === 'diagnosis'
        ? await run('rehab.setRehabCondition', pick.value)
        : await run('rehab.changeRehabStage', { to: Number(pick.value), via: 'direct' });
    if (ok) setPick(null);
  };

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text style={[s.smallBold, { color: c.muted }]}>재활 프로그램 · {rehab.day}일째</Text>
        <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', lineHeight: 29 }}>{rehab.title}</Text>
        <Text style={[s.small, { color: c.muted }]}>{rehab.progress}</Text>
      </View>
      {rehab.line ? (
        <Text style={[s.body, s.box, rehab.line.kind === 'refer' ? { color: c.warn, backgroundColor: c.warnBg } : { color: c.ink, backgroundColor: c.card }]}>
          {rehab.line.text}
        </Text>
      ) : null}
      {!rehab.rest || rehab.today ? (
        <Pressable onPress={() => openPlay('rehab', `d=${dateKey}`)} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.sky, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18 }]}>
          <SymbolView name={rehab.today ? 'arrow.counterclockwise' : 'play.fill'} size={13} tintColor="#fff" />
          <Text style={[s.bodyBold, { color: '#fff' }]}>{rehab.today ? '다시 답하기' : `오늘 재활 시작 · 약 ${rehab.estimatedMinutes}분`}</Text>
        </Pressable>
      ) : null}

      <Part title="이 단계의 목표" c={c}>
        <Text style={[s.body, { color: c.ink }]}>{d.goal}</Text>
        {d.notes.map((n) => (
          <Text key={n} style={[s.small, { color: c.muted }]}>
            · {n}
          </Text>
        ))}
      </Part>

      {rehab.items.length > 0 ? (
        <Part title="오늘 운동" c={c}>
          {rehab.items.map((it) => (
            <View key={it.exercise.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <SymbolView name={it.done ? 'checkmark.circle.fill' : 'circle'} size={18} tintColor={it.done ? c.sky : c.muted} />
              <Text style={[s.body, { color: c.ink, flex: 1 }]}>
                {it.exercise.title}
                {it.note ? <Text style={{ color: c.muted }}> · {it.note}</Text> : null}
              </Text>
            </View>
          ))}
        </Part>
      ) : null}

      <Part title="피할 것" c={c}>
        {d.avoid.map((a) => (
          <Text key={a} style={[s.body, { color: c.ink }]}>
            · {a}
          </Text>
        ))}
      </Part>

      <View style={{ borderRadius: 14, padding: 14, gap: 4, backgroundColor: c.danger + '14' }}>
        <Text style={[s.bodyBold, { color: c.danger }]}>이런 게 있으면 바로 진료받으세요</Text>
        <Text style={[s.small, { color: c.danger }]}>{RED_FLAGS_LINE}</Text>
        {RED_FLAGS.map((f) => (
          <Text key={f} style={[s.small, { color: c.danger }]}>
            · {f}
          </Text>
        ))}
      </View>

      {d.stage < 4 || !d.throwing ? (
        <Part title="다음 단계로 가는 조건" c={c}>
          {d.gate.checks.map((g) => (
            <Check key={g.label} ok={g.ok} label={g.label} c={c} />
          ))}
          <Check ok={false} label="단계 시험 통과" c={c} />
          {d.hasStageTest ? <WebButton label={d.gate.ready ? '단계 시험 하기 (웹)' : '조건이 차면 단계 시험'} disabled={!d.gate.ready} onPress={toWeb} c={c} /> : null}
        </Part>
      ) : (
        <Part title={d.throwing.opened ? '투구 복귀표' : '투구 복귀표를 여는 조건'} c={c}>
          {d.throwing.opened ? (
            <Text style={[s.body, { color: c.ink }]}>투구 복귀표를 열었어요. 던진 날 남기기 · 다음 칸은 웹에서 봐요.</Text>
          ) : (
            <>
              <Check ok={d.throwing.painFreeBallDays >= d.throwing.needed} label={`공 운동을 통증 없이 ${d.throwing.needed}일 (지금 ${Math.min(d.throwing.painFreeBallDays, d.throwing.needed)}일)`} c={c} />
              <Check ok={false} label="밀기 · 공 던지기 힘 비교 · 팔 상태 90% 이상 · 던질 자신감 7 이상" c={c} />
            </>
          )}
          <Text style={[s.small, { color: c.muted }]}>가능하면 진료 때 투구 복귀를 물어보세요.</Text>
          <WebButton label={d.throwing.opened ? '투구 복귀표 보기 (웹)' : '투구 복귀표 열기 (웹)'} onPress={toWeb} c={c} />
        </Part>
      )}

      <Part title="매주 확인" c={c}>
        <Text style={[s.body, { color: c.ink }]}>
          {d.weekly.last ? `지난 확인 ${shortDate(d.weekly.last.date)} · 다치기 전의 ${d.weekly.last.normalPct}%` : '일주일마다 팔 상태 · 통증 · 내 활동을 1분 동안 확인해요.'}
        </Text>
        {d.weekly.nextOn ? <Text style={[s.small, { color: c.muted }]}>다음 확인 {shortDate(d.weekly.nextOn)}</Text> : null}
        {d.weekly.allowed ? <WebButton label="이번 주 확인 (웹)" onPress={toWeb} c={c} /> : null}
      </Part>

      <Text style={[s.small, { color: c.muted }]}>담당 의사 · 치료사의 지시가 먼저예요.</Text>

      {pick ? (
        <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.card }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>{pick.kind === 'diagnosis' ? '진단 받았어요' : `단계 직접 바꾸기 · 지금 ${d.stage}단계`}</Text>
          {choices.map((o) => {
            const on = pick.value === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setPick({ ...pick, value: o.value })}
                style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: on ? c.sky : c.line, backgroundColor: on ? c.sky + '14' : c.page }}
              >
                <Text style={[s.body, { color: c.ink, fontWeight: on ? '700' : '400' }]}>{o.label}</Text>
              </Pressable>
            );
          })}
          <Text style={[s.small, { color: c.muted }]}>
            {pick.kind === 'diagnosis'
              ? '단계와 날짜는 그대로예요. 병명에 따라 최소 기간과 허용 통증이 바뀌어요.'
              : '바꾸면 그 단계의 날짜와 세션을 새로 세요. 아프면 낮추고, 시험 없이 올리는 것은 권하지 않아요.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setPick(null)} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.chip, minHeight: 44, paddingHorizontal: 18 }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>취소</Text>
            </Pressable>
            <Pressable
              onPress={() => void submitPick()}
              disabled={!pick.value || busy}
              accessibilityRole="button"
              style={[s.smallPill, { backgroundColor: c.sky, minHeight: 44, paddingHorizontal: 18, opacity: !pick.value || busy ? 0.5 : 1 }]}
            >
              <Text style={[s.bodyBold, { color: '#fff' }]}>{busy ? '저장하는 중…' : '바꾸기'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {d.conditionChoices.length > 0 ? <Small label="진단 받았어요" onPress={() => setPick({ kind: 'diagnosis', value: null })} c={c} /> : null}
          <Small label="단계 직접 바꾸기" onPress={() => setPick({ kind: 'stage', value: null })} c={c} />
          {d.stage === 4 && !d.throwing?.opened ? <Small label="재활 끝내기" onPress={() => end('done')} c={c} /> : null}
          {d.throwing?.opened ? <Small label="재활 끝내기" onPress={() => end('done')} c={c} /> : null}
          <Small label="그만두기" muted onPress={() => end('stopped')} c={c} />
        </View>
      )}
      {error ? <Text style={[s.bodyBold, { color: c.danger }]}>{error}</Text> : null}
    </>
  );
}

function Part({ title, children, c }: { title: string; children: React.ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 8, padding: 14, borderRadius: 14, backgroundColor: c.card }}>
      <Text style={[s.smallBold, { color: c.sky }]}>{title}</Text>
      {children}
    </View>
  );
}

function Check({ ok, label, c }: { ok: boolean; label: string; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} accessibilityLabel={`${label}, ${ok ? '됨' : '아직'}`}>
      <SymbolView name={ok ? 'checkmark.circle.fill' : 'circle'} size={18} tintColor={ok ? c.sky : c.muted} />
      <Text style={[s.body, { color: ok ? c.ink : c.muted, flex: 1 }]}>{label}</Text>
    </View>
  );
}

function WebButton({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="link" style={[s.smallPill, { backgroundColor: c.sky + '1a', alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[s.bodyBold, { color: c.sky }]}>{label}</Text>
      <SymbolView name="arrow.up.right" size={12} tintColor={c.sky} />
    </Pressable>
  );
}

function Small({ label, onPress, muted, c }: { label: string; onPress: () => void; muted?: boolean; c: Palette }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.chip, minHeight: 44, paddingHorizontal: 16 }]}>
      <Text style={[s.bodyBold, { color: muted ? c.muted : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

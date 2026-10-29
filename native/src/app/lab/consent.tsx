import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppAnalysisConsent } from '@/app/actions/analysis-consent';
import type { AnalysisConsentDoc } from '@/lib/analysis-consent';
import { Bar, call, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { SITE_URL } from '~/lib/site';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { PitcherMark } from '~/pitch/dock-art';
import { Icon } from '~/shell/icon';
import { toast } from '~/shell/toast';

/**
 * 3D 분석 국외 이전 동의(2026-10-29 확정 시안 analysis-final-review '첫 이용 · 동의 전') — 두 쓰임:
 *   - from=new: 새 분석의 최종 확인에서 유효한 동의가 없을 때 한 번. 동의가 서버에 저장된 뒤에만 돌아간다(낙관 표시 없음). 안 하면 '나중에'로 그냥 돌아간다.
 *   - 그 밖(설정 · 최종 확인의 '내역 보기'): 지금 상태 · 내역 · 철회.
 * 근거는 서버 기록(app/actions/analysis-consent.ts)뿐 — 이 화면의 체크는 저장 요청을 보내는 단추일 뿐이다.
 */
type Loaded = AppAnalysisConsent | { ok: false; to: string };

const DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const when = (iso: string) => DATE.format(new Date(iso));

export default function LabConsentScreen() {
  const c = usePalette();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const first = from === 'new';
  const { data, error, reload } = useLoad<Loaded>('analysis-consent.loadAppAnalysisConsent');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back={first ? '새 분석' : '뒤로'} title={first ? '3D 동작 분석' : '국외 이전 동의'} c={c} />
      {!data || !data.ok ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : first && !data.state.valid ? (
        <FirstUse d={data} c={c} />
      ) : (
        <Manage d={data} onChanged={() => void reload()} c={c} />
      )}
    </View>
  );
}

/** 알릴 것 일곱(개인정보 보호법 제28조의8) — 확인 전 칸은 '확인 중'으로(지어내지 않는다) */
function DocRows({ doc, c }: { doc: AnalysisConsentDoc; c: Palette }) {
  const rows: [string, string | null][] = [
    ['이전 항목', doc.items],
    ['이전 국가', doc.country],
    ['받는 곳', doc.recipient],
    ['연락처', doc.contact],
    ['시기 · 방법', doc.when],
    ['이용 목적', doc.purpose],
    ['보유 · 이용 기간', doc.retention],
    ['거부할 권리', doc.refusal],
  ];
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={k} style={[s.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <Text style={[TYPE.sub, { color: c.muted, width: 92 }]}>{k}</Text>
          <Text style={[TYPE.body, { flex: 1, color: v ? c.ink : c.warn }]}>{v ?? '확인 중'}</Text>
        </View>
      ))}
    </View>
  );
}

function FirstUse({ d, c }: { d: AppAnalysisConsent; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canAgree = d.ready && !d.blocked && checked && !busy;
  const agree = async () => {
    if (!canAgree) return;
    setBusy(true);
    setErr(null);
    const r = await call<{ ok: true }>('analysis-consent.giveAnalysisConsent', { version: d.doc.version, source: 'first_use' });
    setBusy(false);
    if (!r.ok) return setErr(('error' in r && r.error) || '동의를 저장하지 못했어요. 다시 해 주세요.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast('동의를 저장했어요');
    router.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 16, paddingBottom: 24 }, READABLE]}>
        <View style={[s.mark, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <PitcherMark size={88} />
          <View style={[s.markBadge, { backgroundColor: c.action }]}>
            <Icon name="shield" size={16} color="#fff" />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink, fontSize: 26 }]}>
            시작하기 전에
          </Text>
          <Text style={[TYPE.body, { color: c.muted }]}>
            영상 분석을 위해 원본 영상을 {d.doc.country} 분석 서버로 전송해요.
          </Text>
        </View>
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Line icon="focus" title="투구 동작 분석에 사용해요." sub="옆 · 뒤 영상을 함께 분석해요." c={c} />
          <Line icon="circle-check" title="처음 이용할 때 한 번 확인해요." sub="이후에는 최종 확인에 동의 완료로 보여요." c={c} border />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={[s.linkRow, { borderTopColor: c.line }]}
          >
            <Text style={[TYPE.buttonCompact, { color: c.link, flex: 1 }]}>국외 이전 동의 내용 {open ? '접기' : '보기'}</Text>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.link} />
          </Pressable>
          {open ? <DocRows doc={d.doc} c={c} /> : null}
        </View>
        {!d.ready ? (
          <Text style={[TYPE.sub, { color: c.warn }]}>동의 내용을 아직 확정하지 못했어요. 확정 전에는 분석을 요청할 때 확인해요.</Text>
        ) : d.blocked ? (
          <Text style={[TYPE.sub, { color: c.warn }]}>{d.blocked}</Text>
        ) : (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => setChecked((v) => !v)}
            style={[s.card, { backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row', gap: 12, alignItems: 'center' }]}
          >
            <View style={[s.box, { borderColor: checked ? c.sky : c.lineStrong, backgroundColor: checked ? c.sky : 'transparent' }]}>
              {checked ? <Icon name="check" size={12} color="#fff" /> : null}
            </View>
            <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{d.doc.title.replace(/ 동의$/, '')}에 동의해요.</Text>
          </Pressable>
        )}
        <Text style={[TYPE.sub, { color: c.muted }]}>{d.doc.refusal}</Text>
      </ScrollView>
      <View style={[{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: inset.bottom + 12, gap: 6 }, READABLE]}>
        {err ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.sub, { color: c.danger, textAlign: 'center' }]}>
            {err}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAgree }}
          disabled={!canAgree}
          onPress={() => void agree()}
          style={({ pressed }) => [s.cta, { backgroundColor: canAgree ? c.action : c.chip, opacity: pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={[TYPE.button, { color: canAgree ? '#fff' : c.muted }]}>동의하고 계속</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.later}>
          <Text style={[TYPE.buttonCompact, { color: c.link }]}>나중에</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Line({ icon, title, sub, c, border }: { icon: 'focus' | 'circle-check'; title: string; sub: string; c: Palette; border?: boolean }) {
  return (
    <View style={[s.line, border && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Icon name={icon} size={18} color={c.sky} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{title}</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{sub}</Text>
      </View>
    </View>
  );
}

/** 상태 · 내역 · 철회(설정 · 내역 보기) */
function Manage({ d, onChanged, c }: { d: AppAnalysisConsent; onChanged: () => void; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const revoke = () =>
    Alert.alert('국외 이전 동의를 철회할까요?', '새 3D 분석은 다시 동의해야 시작할 수 있어요. 이미 분석 서버가 받은 분석은 멈추지 않고 끝까지 진행돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '철회',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setErr(null);
          const r = await call<{ ok: true }>('analysis-consent.revokeAnalysisConsent');
          setBusy(false);
          if (!r.ok) return setErr(('error' in r && r.error) || '철회를 저장하지 못했어요.');
          toast('동의를 철회했어요');
          onChanged();
        },
      },
    ]);
  const give = async () => {
    setBusy(true);
    setErr(null);
    const r = await call<{ ok: true }>('analysis-consent.giveAnalysisConsent', { version: d.doc.version, source: 'settings' });
    setBusy(false);
    if (!r.ok) return setErr(('error' in r && r.error) || '동의를 저장하지 못했어요.');
    toast('동의를 저장했어요');
    onChanged();
  };
  const st = d.state;
  return (
    <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.icon, { backgroundColor: st.valid ? c.skyTint : c.chip }]}>
            <Icon name="shield" size={18} color={st.valid ? c.sky : c.muted} />
          </View>
          <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>
            {!d.ready ? '요청할 때마다 확인' : st.valid ? '동의 완료' : st.outdated ? '다시 동의가 필요해요' : '동의하지 않음'}
          </Text>
        </View>
        <Text style={[TYPE.sub, { color: c.muted }]}>
          {!d.ready
            ? '동의 내용을 확정하는 중이에요. 그동안은 분석을 요청할 때마다 확인해요.'
            : st.current
              ? `${when(st.current.agreedAt)} · ${st.current.source === 'signup' ? '가입할 때' : st.current.source === 'settings' ? '설정에서' : '첫 분석 전'} 동의`
              : st.outdated
                ? '동의 내용이 바뀌었어요. 새 분석 전에 다시 확인해요.'
                : '3D 분석을 시작하려면 동의가 필요해요. 다른 기능은 그대로 쓸 수 있어요.'}
        </Text>
        {d.staff ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>관리자가 다른 선수의 투구를 분석할 때는 요청마다 그 선수(미성년이면 보호자)의 동의를 확인해요.</Text>
        ) : null}
        {d.ready && !st.valid && !d.blocked ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void give()} style={[s.cta, { backgroundColor: c.action, marginTop: 8, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[TYPE.button, { color: '#fff' }]}>동의하기</Text>
          </Pressable>
        ) : null}
        {d.blocked ? <Text style={[TYPE.sub, { color: c.warn }]}>{d.blocked}</Text> : null}
        {st.valid ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={revoke} style={[s.cta, { backgroundColor: c.page, marginTop: 8, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[TYPE.button, { color: c.danger }]}>동의 철회</Text>
          </Pressable>
        ) : null}
        {err ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}
      </View>

      <Text accessibilityRole="header" style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
        동의 내용
      </Text>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Text style={[TYPE.card, { color: c.ink, marginBottom: 4 }]}>{d.doc.title}</Text>
        <DocRows doc={d.doc} c={c} />
      </View>

      {d.history.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
            내역
          </Text>
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4 }]}>
            {d.history.map((h, i) => (
              <View key={h.id} style={[s.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.body, { color: c.ink }]}>
                    {when(h.agreedAt)} · {h.sourceText || '동의'}
                  </Text>
                  <Text style={[TYPE.sub, { color: h.current ? c.sky : c.muted }]}>
                    {h.revokedAt ? `${when(h.revokedAt)} 철회` : h.outdated ? '옛 내용에 동의' : h.current ? '지금 유효' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {d.staff && d.pending.length > 0 ? (
        <View style={[s.card, { backgroundColor: c.warnBg, gap: 4 }]}>
          <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>확정 전 확인할 것(관리자에게만 보여요)</Text>
          {d.pending.map((p) => (
            <Text key={p} style={[TYPE.sub, { color: c.ink }]}>
              · {p}
            </Text>
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/privacy`).catch(() => undefined)} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>개인정보 처리방침 ›</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, padding: 16 },
  mark: { width: 112, height: 112, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  markBadge: { position: 'absolute', right: -6, bottom: -6, width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  docRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cta: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

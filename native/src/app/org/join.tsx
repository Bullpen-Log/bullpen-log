import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { joinOrgApp } from '@/app/actions/app-org';
import { consentDefaults, normalizeInviteCode } from '@/lib/org/rules';
import { Bar, call, useBusy } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { ConsentList, GroupTitle, Primary, rememberSpace, spaceKey } from '~/org/parts';

/**
 * 초대 코드로 팀 · 레슨장에 들어가기(앱 화면) — 코드 여섯 글자 + 코치에게 보여 줄 기록(웹 /join 과 같은 lib/org/join.ts).
 * 공유 범위 기본값은 lib/org/rules.ts consentDefaults(투구 · 트레이닝 · 체크인 · 영상 켬, 영양 · 체중 끔). 들어가면 그 공간을 연다.
 */
type Res = Awaited<ReturnType<typeof joinOrgApp>>;

export default function JoinOrgScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalizeInviteCode(params.code ?? '') ?? '');
  const [consent, setConsent] = useState(consentDefaults);
  const { busy, error, run } = useBusy();
  const ok = normalizeInviteCode(code) != null;
  const submit = () =>
    run(async () => {
      const r = await call<Res>('app-org.joinOrgApp', code, consent);
      if (!r.ok) return r.error;
      rememberSpace(spaceKey({ orgId: r.orgId, role: 'PLAYER' }));
      toast('들어갔어요');
      router.replace('/org' as Href);
      return null;
    });
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="초대 코드" c={c} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <View style={{ gap: 6 }}>
          <GroupTitle title="코치에게 받은 코드 여섯 글자" c={c} />
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={!code}
            maxLength={6}
            placeholder="ABC234"
            placeholderTextColor={c.muted}
            accessibilityLabel="초대 코드"
            style={[TYPE.num, { fontSize: 28, letterSpacing: 6, color: c.ink, backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 16, minHeight: 56 }]}
          />
        </View>
        <View style={{ gap: 6 }}>
          <GroupTitle title="코치에게 보여 줄 기록" c={c} />
          <ConsentList value={consent} onChange={setConsent} c={c} />
          <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>언제든 바꿀 수 있어요. 끈 기록은 코치가 볼 수 없어요.</Text>
        </View>
        {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
        <Primary label={busy ? '들어가는 중…' : '들어가기'} onPress={() => void submit()} disabled={!ok || busy} c={c} />
      </ScrollView>
    </View>
  );
}

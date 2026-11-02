import { ActionButton } from '~/shell/action-button';
import { Image } from 'expo-image';
import { type Href, router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppProfile } from '@/app/actions/profile';
import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { MAX_NICKNAME, SEX_OPTIONS } from '@/lib/profile';
import { fromLength, fromWeight, round1, toLength, toWeight } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { Bar, LoadState, useLoad } from '~/community/parts';
import { rpc, RpcError, syncSession } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { useKeyboardUp } from '~/lib/use-keyboard-up';
import { setMenuNickname } from '~/shell/menu-store';
import { leaveTo } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';

/**
 * 내 정보(앱 화면) — 웹 내 정보 창(components/profile-panel.tsx)의 사진 · 기본 정보 · 몸을 옮겼다. 저장은 같은 검사의 profile.updateAppProfile,
 * 사진은 웹과 같은 길(/api/profile/avatar-url 서명 주소로 PUT → profile.saveAvatar). 비밀번호 · 로그아웃 · 탈퇴는 앱 계정 화면(account.tsx).
 * 키 · 몸무게는 설정의 길이 · 무게 단위대로(웹 profile-form.tsx 와 같다, 저장은 cm · kg).
 */
type Loaded = ({ ok: true } & AppProfile) | { ok: false; to: string };

export default function ProfileScreen() {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('profile.loadAppProfile');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {data ? <Body key={data.email + data.today} p={data} reload={reload} c={c} /> : <><Bar modal back="더보기" title="내 정보" c={c} /><LoadState error={error} onRetry={reload} c={c} /></>}
    </View>
  );
}

function Body({ p, reload, c }: { p: AppProfile; reload: () => void; c: Palette }) {
  const inset = useSafeAreaInsets();
  const keyboardUp = useKeyboardUp();
  const unit = useWeightUnit();
  const lengthUnit = usePrefs().length;
  const [override, setOverride] = useState<{ base: AppProfile; next: AppProfile } | null>(null);
  const saved = override?.base === p ? override.next : p;
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(p.nickname);
  const [y0, m0, d0] = p.birthDate ? p.birthDate.split('-') : ['', '', ''];
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : '');
  const [day, setDay] = useState(d0 ? String(Number(d0)) : '');
  const [sex, setSex] = useState<AppProfile['sex']>(p.sex);
  const [height, setHeight] = useState<string | null>(null);
  const [weight, setWeight] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const baseHeight = saved.heightCm == null ? '' : String(round1(toLength(saved.heightCm, lengthUnit)));
  const baseWeight = saved.weightKg == null ? '' : String(round1(toWeight(saved.weightKg, unit)));
  const shownHeight = height ?? baseHeight;
  const shownWeight = weight ?? baseWeight;
  const birthDate = year && month && day ? [year.padStart(4, '0'), month.padStart(2, '0'), day.padStart(2, '0')].join('-') : '';
  const dirty = nickname !== saved.nickname || birthDate !== saved.birthDate || sex !== saved.sex || shownHeight !== baseHeight || shownWeight !== baseWeight;

  const resetDraft = useCallback(() => {
    const [y, m, d] = saved.birthDate ? saved.birthDate.split('-') : ['', '', ''];
    setNickname(saved.nickname);
    setYear(y);
    setMonth(m ? String(Number(m)) : '');
    setDay(d ? String(Number(d)) : '');
    setSex(saved.sex);
    setHeight(null);
    setWeight(null);
  }, [saved]);

  const closeEdit = useCallback(() => {
    if (saving) return;
    if (!dirty) {
      setEditing(false);
      setMsg(null);
      return;
    }
    Alert.alert('수정한 내용을 버릴까요?', '저장하지 않은 내용은 사라져요.', [
      { text: '계속 수정', style: 'cancel' },
      { text: '변경 내용 버리기', style: 'destructive', onPress: () => { resetDraft(); setEditing(false); setMsg(null); } },
    ]);
  }, [dirty, resetDraft, saving]);

  const back = useCallback(() => {
    if (editing) closeEdit();
    else router.back();
  }, [closeEdit, editing]);

  useEffect(() => {
    if (!editing) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      closeEdit();
      return true;
    });
    return () => listener.remove();
  }, [closeEdit, editing]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const cm = shownHeight.trim() === '' ? null : Math.round(fromLength(Number(shownHeight), lengthUnit));
    const kg = shownWeight.trim() === '' ? null : round1(fromWeight(Number(shownWeight), unit));
    try {
      const r = await rpc<{ error?: string; success?: string } | undefined>('profile.updateAppProfile', {
        nickname: nickname.trim(),
        birthDate,
        sex: sex ?? '',
        heightCm: cm == null ? '' : String(cm),
        weightKg: kg == null ? '' : String(kg),
      });
      if (r?.error) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMenuNickname(nickname.trim());
      setOverride({ base: p, next: { ...saved, nickname: nickname.trim(), birthDate, sex, heightCm: cm, weightKg: kg } });
      setHeight(null);
      setWeight(null);
      setEditing(false);
      setMsg({ ok: true, text: '저장했어요' });
      reload();
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setMsg({ ok: false, text: '신호가 약해 저장하지 못했어요. 입력한 내용은 그대로 있어요.' });
    } finally {
      setSaving(false);
    }
  };

  const setBirthPart = (part: 'y' | 'm' | 'd', text: string) => {
    const next = text.replace(/\D/g, '').slice(0, part === 'y' ? 4 : 2);
    if (part === 'y') setYear(next);
    else if (part === 'm') setMonth(next);
    else setDay(next);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: !editing }} />
      <Bar modal back={editing ? '내 정보' : '더보기'} title={editing ? '정보 수정' : '내 정보'} onBack={back} c={c} />
      {editing ? (
        <>
          <ScrollView contentContainerStyle={[{ padding: 16, gap: 22, paddingBottom: 24 }, READABLE]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <View style={{ gap: 6 }}>
              <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 26, fontWeight: '800' }}>정보 수정</Text>
              <Text style={{ color: c.muted, fontSize: 14 }}>변경한 내용은 저장을 눌러야 적용돼요.</Text>
            </View>
            <View style={{ gap: 10 }}>
              <Text style={[st.editSection, { color: c.ink }]}>기본 정보</Text>
              <EditField label="닉네임" c={c}>
                <TextInput value={nickname} onChangeText={setNickname} maxLength={MAX_NICKNAME} accessibilityLabel="닉네임" placeholder="앱에서 부를 이름" placeholderTextColor={c.muted} style={[st.editInput, { color: c.ink }]} textContentType="nickname" />
              </EditField>
              <EditField label="생년월일 · 필수" c={c}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <TextInput value={year} onChangeText={(t) => setBirthPart('y', t)} keyboardType="number-pad" placeholder="2008" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 62 }]} accessibilityLabel="태어난 해" />
                  <Text style={{ color: c.muted }}>년</Text>
                  <TextInput value={month} onChangeText={(t) => setBirthPart('m', t)} keyboardType="number-pad" placeholder="3" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 38 }]} accessibilityLabel="태어난 달" />
                  <Text style={{ color: c.muted }}>월</Text>
                  <TextInput value={day} onChangeText={(t) => setBirthPart('d', t)} keyboardType="number-pad" placeholder="1" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 38 }]} accessibilityLabel="태어난 날" />
                  <Text style={{ color: c.muted }}>일</Text>
                </View>
              </EditField>
              <EditField label="성별" c={c}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {SEX_OPTIONS.map((o) => {
                    const on = sex === o.value;
                    return (
                      <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setSex(o.value)} style={[st.seg, { backgroundColor: on ? c.skyTint : c.chip, borderColor: on ? c.link : 'transparent' }]}>
                        <Text style={{ color: on ? c.link : c.ink, fontSize: 15, fontWeight: '600' }}>{o.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </EditField>
              <Text style={[st.editNote, { color: c.muted }]}>생년월일은 나이에 맞는 투구수 한도를 정할 때 사용해요.</Text>
            </View>
            <View style={{ gap: 10 }}>
              <Text style={[st.editSection, { color: c.ink }]}>신체 정보</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <EditField label={`키 · ${lengthUnit}`} c={c} style={{ flex: 1 }}>
                  <TextInput value={shownHeight} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="선택" placeholderTextColor={c.muted} accessibilityLabel="키" style={[st.editInput, { color: c.ink }]} />
                </EditField>
                <EditField label={`몸무게 · ${unit}`} c={c} style={{ flex: 1 }}>
                  <TextInput value={shownWeight} onChangeText={(t) => setWeight(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="선택" placeholderTextColor={c.muted} accessibilityLabel="몸무게" style={[st.editInput, { color: c.ink }]} />
                </EditField>
              </View>
              <Text style={[st.editNote, { color: c.muted }]}>키와 몸무게는 비워 둘 수 있어요.</Text>
            </View>
            {msg && !msg.ok ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>{msg.text}</Text> : null}
          </ScrollView>
          <View style={[st.footer, READABLE, { paddingBottom: keyboardUp ? 12 : inset.bottom + 12 }]}>
            <ActionButton onPress={() => void save()} busy={saving} label={saving ? '저장 중…' : '저장'} />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Avatar nickname={saved.nickname} email={saved.email} url={saved.avatarUrl} reload={reload} c={c} />
          <Group title="기본 정보" c={c}>
            <DisplayRow label="닉네임" value={saved.nickname} c={c} />
            <DisplayRow label="생년월일" value={saved.birthDate || '미입력'} c={c} />
            <DisplayRow label="성별" value={SEX_OPTIONS.find((o) => o.value === saved.sex)?.name ?? '미입력'} last c={c} />
          </Group>
          <Group title="신체 정보" c={c}>
            <DisplayRow label="키" value={saved.heightCm == null ? '미입력' : String(round1(toLength(saved.heightCm, lengthUnit))) + ' ' + lengthUnit} c={c} />
            <DisplayRow label="몸무게" value={saved.weightKg == null ? '미입력' : String(round1(toWeight(saved.weightKg, unit))) + ' ' + unit} last c={c} />
          </Group>
          {msg?.ok ? <Text accessibilityRole="alert" style={{ color: c.ok, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>{msg.text}</Text> : null}
          <ActionButton onPress={() => { resetDraft(); setMsg(null); setEditing(true); }} label="정보 수정" />
          <Group title="계정" footer={saved.isAdmin ? '관리자 계정이에요. 트레이닝 영상과 메카닉 가이드를 올리고 지울 수 있어요.' : undefined} c={c}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/account' as Href)} style={({ pressed }) => [st.accountRow, { opacity: pressed ? 0.65 : 1 }]}>
              <Text style={{ color: c.ink, fontSize: 17 }}>계정 관리</Text>
              <Text style={{ color: c.link, fontSize: 20 }}>›</Text>
            </Pressable>
          </Group>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function DisplayRow({ label, value, last, c }: { label: string; value: string; last?: boolean; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: c.muted, fontSize: 17, flex: 1 }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600', textAlign: 'right', flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

/** 사진 — 고르면(정사각으로 자르기) 웹과 같은 길로 올리고 저장, 지우기는 한 번 묻고 */
function Avatar({ nickname, email, url, reload, c }: { nickname: string; email: string; url: string | null; reload: () => void; c: Palette }) {
  const [local, setLocal] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = cleared ? null : (local ?? url);

  const pick = async () => {
    setError(null);
    setNotice(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = r.canceled ? null : r.assets[0];
    if (!asset) return;
    setLocal(asset.uri);
    setCleared(false);
    setBusy(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
      await syncSession();
      const res = await fetch(`${SITE_URL}/api/profile/avatar-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', [APP_API_HEADER]: String(APP_API_LEVEL) },
        body: JSON.stringify({ fileSize: blob.size, fileType: type }),
      });
      const target = (await res.json().catch(() => ({}))) as { signedUrl?: string; path?: string; error?: string };
      if (!res.ok || !target.signedUrl || !target.path) throw new Error(target.error ?? '업로드 주소를 받지 못했어요.');
      const put = await fetch(target.signedUrl, { method: 'PUT', headers: { 'content-type': type }, body: blob });
      if (!put.ok) throw new Error(`사진을 올리지 못했어요 (${put.status}).`);
      const saved = await rpc<{ error?: string } | undefined>('profile.saveAvatar', target.path);
      if (saved?.error) throw new Error(saved.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice('사진을 저장했어요');
      reload();
    } catch (e) {
      setLocal(null);
      setError(e instanceof RpcError && e.code === 'offline' ? '신호가 약해 올리지 못했어요.' : e instanceof Error ? e.message : '사진을 바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const photoMenu = () => Alert.alert('프로필 사진', '사진은 선택하면 바로 저장돼요. 정보 수정의 저장 버튼과는 별개예요.', [
    { text: shown ? '사진 바꾸기' : '사진 올리기', onPress: () => void pick() },
    ...(shown ? [{ text: '사진 지우기', style: 'destructive' as const, onPress: () => remove() }] : []),
    { text: '취소', style: 'cancel' },
  ]);

  const remove = () =>
    Alert.alert('사진을 지울까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setNotice(null);
          setCleared(true);
          setBusy(true);
          try {
            const r = await rpc<{ error?: string } | undefined>('profile.saveAvatar', null);
            if (r?.error) throw new Error(r.error);
            setLocal(null);
            setNotice('사진을 지웠어요');
            reload();
          } catch (e) {
            setCleared(false);
            setError(e instanceof Error ? e.message : '사진을 지우지 못했어요.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={{ gap: 10 }}>
      <View style={st.profileHeader}>
        <View style={[st.avatar, { backgroundColor: c.chip }]}>
          {shown ? <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ color: c.muted, fontSize: 28, fontWeight: '700' }}>{nickname.slice(0, 1)}</Text>}
          {busy ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" /> : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.ink, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{nickname}</Text>
          <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>{email}</Text>
          <Pressable accessibilityRole="button" onPress={photoMenu} disabled={busy} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <Text style={{ color: c.link, fontSize: 14, fontWeight: '700' }}>사진 편집 ›</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={{ color: c.ok, fontSize: 14 }}>{notice}</Text> : null}
    </View>
  );
}

function Group({ title, footer, children, c }: { title: string; footer?: string; children: React.ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400', paddingHorizontal: 16 }}>{title}</Text>
      <View style={{ backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' }}>{children}</View>
      {footer ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 16 }}>{footer}</Text> : null}
    </View>
  );
}

function EditField({ label, children, c, style }: { label: string; children: React.ReactNode; c: Palette; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[st.editField, { backgroundColor: c.card, borderColor: c.line }, style]}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50 },
  editSection: { fontSize: 16, fontWeight: '800', paddingHorizontal: 4 },
  editField: { gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  editInput: { fontSize: 17, paddingVertical: 4 },
  editNote: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  num: { fontSize: 17, paddingVertical: 6 },
  seg: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 8 },
  accountRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { width: '100%', paddingHorizontal: 16, paddingTop: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

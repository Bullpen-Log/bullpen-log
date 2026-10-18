import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
      <Bar modal back="더보기" title="내 정보" c={c} />
      {data ? <Body key={data.today + data.nickname} p={data} reload={reload} c={c} /> : <LoadState error={error} onRetry={reload} c={c} />}
    </View>
  );
}

function Body({ p, reload, c }: { p: AppProfile; reload: () => void; c: Palette }) {
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const [nickname, setNickname] = useState(p.nickname);
  const [y0, m0, d0] = p.birthDate ? p.birthDate.split('-') : ['', '', ''];
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : '');
  const [day, setDay] = useState(d0 ? String(Number(d0)) : '');
  const [sex, setSex] = useState<string>(p.sex ?? '');
  const lengthUnit = usePrefs().length;
  /* 키도 적는 그대로 쥐고(단위대로), 보낼 때 cm 로 */
  const [height, setHeight] = useState<string | null>(null);
  const shownHeight = height ?? (p.heightCm == null ? '' : String(round1(toLength(p.heightCm, lengthUnit))));
  /* 몸무게는 적는 그대로 쥐고(단위대로), 보낼 때 kg 로 */
  const [weight, setWeight] = useState<string | null>(null);
  const shownWeight = weight ?? (p.weightKg == null ? '' : String(round1(toWeight(p.weightKg, unit))));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const birthDate = year && month && day ? `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
    const kg = shownWeight.trim() === '' ? '' : String(round1(fromWeight(Number(shownWeight), unit)));
    try {
      const r = await rpc<{ error?: string; success?: string } | undefined>('profile.updateAppProfile', {
        nickname: nickname.trim(),
        birthDate,
        sex,
        heightCm: shownHeight.trim() === '' ? '' : String(Math.round(fromLength(Number(shownHeight), lengthUnit))),
        weightKg: kg,
      });
      if (r?.error) setMsg({ ok: false, text: r.error });
      else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMenuNickname(nickname.trim());
        setMsg({ ok: true, text: '저장했어요' });
      }
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setMsg({ ok: false, text: '신호가 약해 저장하지 못했어요. 적은 것은 그대로 있어요.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Avatar nickname={p.nickname} url={p.avatarUrl} reload={reload} c={c} />

      <Group title="기본 정보" footer="생년월일로 안전한 투구수 한도와 영양 기준을, 성별로 영양 목표를 정해요." c={c}>
        <Row label="닉네임" c={c}>
          <TextInput value={nickname} onChangeText={setNickname} maxLength={MAX_NICKNAME} style={[st.input, { color: c.ink }]} textContentType="nickname" />
        </Row>
        <Row label="생년월일" c={c}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput value={year} onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="2008" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 52 }]} accessibilityLabel="태어난 해" />
            <Text style={{ color: c.muted }}>년</Text>
            <TextInput value={month} onChangeText={(t) => setMonth(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="3" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 28 }]} accessibilityLabel="태어난 달" />
            <Text style={{ color: c.muted }}>월</Text>
            <TextInput value={day} onChangeText={(t) => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="1" placeholderTextColor={c.muted} style={[st.num, { color: c.ink, width: 28 }]} accessibilityLabel="태어난 날" />
            <Text style={{ color: c.muted }}>일</Text>
          </View>
        </Row>
        <Row label="성별" last c={c}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {SEX_OPTIONS.map((o) => {
              const on = sex === o.value;
              return (
                <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setSex(o.value)} style={[st.seg, { backgroundColor: on ? c.sky : c.chip }]}>
                  <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{o.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Row>
      </Group>

      <Group title="몸" footer="키는 영상에서 잰 보폭을 견줄 때 써요." c={c}>
        <Row label="키" c={c}>
          <TextInput value={shownHeight} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="입력" placeholderTextColor={c.muted} style={[st.input, { color: c.ink }]} />
          <Text style={{ color: c.muted, fontSize: 16 }}>{lengthUnit}</Text>
        </Row>
        <Row label="몸무게" last c={c}>
          <TextInput value={shownWeight} onChangeText={(t) => setWeight(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="입력" placeholderTextColor={c.muted} style={[st.input, { color: c.ink }]} />
          <Text style={{ color: c.muted, fontSize: 16 }}>{unit}</Text>
        </Row>
      </Group>

      {msg ? <Text style={{ color: msg.ok ? c.ok : c.danger, fontSize: 15, fontWeight: '600', paddingHorizontal: 4 }}>{msg.text}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => void save()} disabled={saving} style={({ pressed }) => [st.save, { backgroundColor: c.sky, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{saving ? '저장 중…' : '저장'}</Text>
      </Pressable>

      <Group title="계정" footer={p.isAdmin ? '관리자 계정이에요. 트레이닝 영상과 메커니즘 가이드를 올리고 지울 수 있어요.' : undefined} c={c}>
        <Row label={p.email} c={c} last>
          <Pressable accessibilityRole="link" onPress={() => router.push('/account' as Href)} hitSlop={8}>
            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>비밀번호 · 로그아웃 ›</Text>
          </Pressable>
        </Row>
      </Group>
    </ScrollView>
  );
}

/** 사진 — 고르면(정사각으로 자르기) 웹과 같은 길로 올리고 저장, 지우기는 한 번 묻고 */
function Avatar({ nickname, url, reload, c }: { nickname: string; url: string | null; reload: () => void; c: Palette }) {
  const [local, setLocal] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = cleared ? null : (local ?? url);

  const pick = async () => {
    setError(null);
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
      reload();
    } catch (e) {
      setLocal(null);
      setError(e instanceof RpcError && e.code === 'offline' ? '신호가 약해 올리지 못했어요.' : e instanceof Error ? e.message : '사진을 바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('사진을 지울까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setCleared(true);
          setBusy(true);
          try {
            const r = await rpc<{ error?: string } | undefined>('profile.saveAvatar', null);
            if (r?.error) throw new Error(r.error);
            setLocal(null);
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
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={[st.avatar, { backgroundColor: c.chip }]}>
        {shown ? (
          <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={{ color: c.muted, fontSize: 36, fontWeight: '700' }}>{nickname.slice(0, 1)}</Text>
        )}
        {busy ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Pressable accessibilityRole="button" onPress={() => void pick()} disabled={busy} hitSlop={8}>
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{shown ? '사진 바꾸기' : '사진 올리기'}</Text>
        </Pressable>
        {shown ? (
          <Pressable accessibilityRole="button" onPress={remove} disabled={busy} hitSlop={8}>
            <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>지우기</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}
      {/* 웹 avatar-picker 밑 한 줄 */}
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>사진은 작게 줄여서 올리고, 나만 볼 수 있게 저장해요.</Text>
    </View>
  );
}

function Group({ title, footer, children, c }: { title: string; footer?: string; children: React.ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 16 }}>{title}</Text>
      <View style={{ backgroundColor: c.card, boxShadow: c.float, borderRadius: 14, overflow: 'hidden' }}>{children}</View>
      {footer ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 16 }}>{footer}</Text> : null}
    </View>
  );
}

function Row({ label, last, children, c }: { label: string; last?: boolean; children: React.ReactNode; c: Palette }) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: c.ink, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50 },
  input: { flex: 1, textAlign: 'right', fontSize: 16, paddingVertical: 12 },
  num: { textAlign: 'right', fontSize: 16, paddingVertical: 12 },
  seg: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  save: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

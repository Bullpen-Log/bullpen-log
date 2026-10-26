import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ArmLine } from '@/app/actions/app-org';
import { ARM_WORD, CONSENT_SCOPES, type Consent } from '@/lib/org/rules';
import { TYPE, type Palette } from '~/lib/ui';

/**
 * 팀 · 레슨장 공간(앱 화면, native/src/app/org/*) 공용 — 1단계(docs/designs/sinker-team-lesson-contract.md 2-2).
 * 자료는 app/actions/app-org.ts(/api/rpc/app-org.*). 고른 공간은 ~/org/space-store 가 사람마다 폰에 둔다(서버 쿠키 bp-org 는 웹 /manage 만 쓴다).
 */

export const KIND_WORD = { LESSON: '레슨장', TEAM: '팀' } as const;
export const ROLE_WORD = { MASTER: '대표', STAFF: '코치', PLAYER: '회원' } as const;

/** 팔 상태 색 · 글 — 못 읽은 것이 있는 '안전'은 '정보 부족'(lib/org/arm-view.ts armUnknown) */
export function armLook(a: ArmLine, c: Palette): { word: string; color: string } {
  if (a.unknown) return { word: '정보 부족', color: c.muted };
  return { word: ARM_WORD[a.level], color: a.level === 'danger' ? c.danger : a.level === 'caution' ? c.warn : c.ok };
}

export function Card({ children, c, style }: { children: ReactNode; c: Palette; style?: object }) {
  return <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }, style]}>{children}</View>;
}

export function GroupTitle({ title, c }: { title: string; c: Palette }) {
  return <Text style={[st.groupTitle, { color: c.muted }]}>{title}</Text>;
}

export function Empty({ text, c }: { text: string; c: Palette }) {
  return <Text style={[TYPE.body, { color: c.muted, paddingVertical: 4 }]}>{text}</Text>;
}

/** 큰 파란 단추 */
export function Primary({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.primary, { backgroundColor: c.sky, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <Text style={st.primaryText}>{label}</Text>
    </Pressable>
  );
}

/** 공유 범위 켜고 끄기 — 웹 참여 화면(app/(app)/join)과 같은 칸 · 같은 설명(lib/org/rules.ts CONSENT_SCOPES) */
export function ConsentList({ value, onChange, c }: { value: Consent; onChange: (v: Consent) => void; c: Palette }) {
  return (
    <Card c={c} style={{ paddingVertical: 4 }}>
      {CONSENT_SCOPES.map((s, i) => (
        <View
          key={s.key}
          style={[st.consentRow, i < CONSENT_SCOPES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.card, { color: c.ink }]}>{s.label}</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>{s.hint}</Text>
          </View>
          <Switch accessibilityLabel={s.label} value={value[s.key]} onValueChange={(on) => onChange({ ...value, [s.key]: on })} />
        </View>
      ))}
    </Card>
  );
}

/** '보여 주는 것: 투구 기록 · 구속 · 체크인' 한 줄 */
export function scopeText(scope: Consent): string {
  const on = CONSENT_SCOPES.filter((s) => scope[s.key]).map((s) => s.label);
  return on.length ? on.join(' · ') : '아무것도 보여 주지 않아요';
}

/** 'YYYY-MM-DD' → '10월 25일' */
export const dayLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
};

export const st = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 4 },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
});

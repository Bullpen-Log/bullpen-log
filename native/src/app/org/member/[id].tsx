import { type Href, router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMemberCard, makeInvite } from '@/app/actions/app-org';
import type { loadMemberHomework } from '@/app/actions/app-lesson';
import { HomeworkList } from '~/org/homework';
import { TalkToggle } from '~/org/thread';
import { Bar, call, LoadState, useLoad } from '~/community/parts';
import { toast } from '~/shell/toast';
import { DangerLink, formCall } from '~/org/forms';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Card, Empty, GroupTitle, dayLabel, scopeText } from '~/org/parts';
import { ARM_WORD } from '@/lib/org/rules';

/**
 * 코치가 보는 회원 카드(앱 화면) — 선수가 공유한 항목만(서버가 공유 안 한 칸은 아예 안 읽는다, lib/org/player-data.ts memberCardOf).
 * 팔 상태 · 투구 · 구속 · 오늘 체크인 · 재활 · 일지. 1.5단계에 일지 쓰기 · 회원 고치기 · 가입 전 자리 초대 코드 · 빼기를 붙였다(쓰기는 웹과 같은 폼 동작).
 * 2단계: 일지 고치기 · 던진 공이 선수 기록에 어떻게 들어갔나 · 숙제 내기 · 숙제 칸.
 */
type Loaded = Awaited<ReturnType<typeof loadMemberCard>>;
type Ok = Extract<Loaded, { ok: true }>;
type Made = Awaited<ReturnType<typeof makeInvite>>;

export default function MemberCardScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id, org } = useLocalSearchParams<{ id: string; org: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadMemberCard', org ?? '', id ?? '');
  const invite = async () => {
    const r = await call<Made>('app-org.makeInvite', org, 'PLAYER', id);
    if (!r.ok) return toast(r.error, 'error');
    void Share.share({
      message: `${data?.member.nickname ?? ''}님 초대 코드 ${r.code} — 싱커에 가입한 뒤 더보기 › 팀 · 레슨장 › 코드 넣기에 넣어 주세요. 한 번만 쓸 수 있어요.`,
    });
  };
  const remove = () =>
    Alert.alert(`${data?.member.nickname ?? ''}을 뺄까요?`, '조직 화면에서만 빠지고, 선수의 기록은 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '빼기',
        style: 'destructive',
        onPress: async () => {
          const r = await formCall('org.removeMember', { id }, true);
          if (r.error) return toast(r.error, 'error');
          toast('뺐어요');
          router.back();
        },
      },
    ]);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={data?.member.nickname ?? ''} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <View style={{ gap: 2, paddingHorizontal: 4 }}>
            <Text style={[TYPE.hero, { color: c.ink }]}>{data.member.nickname}</Text>
            {data.member.tags.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{data.member.tags.join(' · ')}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="일지 쓰기" onPress={() => router.push(`/org/note?org=${org}&member=${id}` as Href)} c={c} />
            <Chip label="숙제 내기" onPress={() => router.push(`/org/homework?org=${org}&member=${id}` as Href)} c={c} />
            <Chip label="고치기" onPress={() => router.push(`/org/member-edit?org=${org}&id=${id}` as Href)} c={c} />
            {!data.member.hasUser ? <Chip label="이 자리 초대 코드" onPress={() => void invite()} c={c} /> : null}
          </View>
          <Body data={data} org={org ?? ''} c={c} onChanged={() => void reload()} />
          <MemberHomework org={org ?? ''} memberId={id ?? ''} c={c} />
          <DangerLink label="조직에서 빼기" onPress={remove} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

/** 숙제(2단계) — 선수가 트레이닝에서 하면 저절로 완료 */
function MemberHomework({ org, memberId, c }: { org: string; memberId: string; c: Palette }) {
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadMemberHomework>>>('app-lesson.loadMemberHomework', org, memberId);
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title="숙제" c={c} />
      {data ? (
        <HomeworkList items={data.homework} who={{ role: 'coach', orgId: org }} onChanged={() => void reload()} c={c} />
      ) : (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      )}
    </View>
  );
}

function Chip({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.7 }]}
    >
      <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Body({ data, org, c, onChanged }: { data: Ok; org: string; c: Palette; onChanged: () => void }) {
  const { member, card, scope, notes } = data;
  const removeNote = (noteId: string) =>
    Alert.alert('이 일지를 지울까요?', '이 일지로 선수 투구 기록에 남긴 공도 함께 지워져요. 선수가 직접 남긴 기록은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const r = await formCall('org-notes.deleteLessonNote', { id: noteId }, true);
          if (r.error) return toast(r.error, 'error');
          toast('지웠어요');
          onChanged();
        },
      },
    ]);
  return (
    <>
      {!member.hasUser ? (
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>아직 싱커에 가입하지 않은 자리예요. 일지만 남길 수 있어요.</Text>
        </Card>
      ) : member.consentPending ? (
        <Card c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>보여 줄 기록을 아직 고르지 않았어요. 고르면 여기에 보여요.</Text>
        </Card>
      ) : (
        <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>공유: {scopeText(scope)}</Text>
      )}

      {card?.arm ? (
        <Section title="지금 팔 상태" c={c}>
          <ArmBlock arm={card.arm} c={c} />
        </Section>
      ) : null}

      {card?.pitch ? (
        <Section title="투구" c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            최근 7일 {card.pitch.last7}구 · 28일 {card.pitch.last28}구
          </Text>
          {card.pitch.lastOuting ? (
            <Text style={[TYPE.sub, { color: c.muted }]}>
              마지막 {dayLabel(card.pitch.lastOuting.key)} {card.pitch.lastOuting.sessionType} {card.pitch.lastOuting.pitches}구
            </Text>
          ) : null}
          {card.pitch.logs.slice(0, 4).map((l) => (
            <Text key={l.id} style={[TYPE.sub, { color: c.muted }]}>
              {dayLabel(l.key)} · {l.sessionType} {l.pitchCount}구{l.byCoach ? ' · 코치가 적음' : ''}
            </Text>
          ))}
        </Section>
      ) : null}

      {card?.velocity && card.velocity.total > 0 ? (
        <Section title="구속" c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            최고 {card.velocity.best?.toFixed(1)}km/h
            {card.velocity.latest ? ` · 최근 ${dayLabel(card.velocity.latest.key)} 최고 ${card.velocity.latest.max.toFixed(1)}` : ''}
          </Text>
        </Section>
      ) : null}

      {card && scope.checkin ? (
        <Section title="오늘 체크인" c={c}>
          {card.checkin ? (
            <>
              <Text style={[TYPE.body, { color: c.ink }]}>
                컨디션 {card.checkin.condition}/10{card.checkin.shortSleep ? ' · 잠 부족' : ''}
              </Text>
              {card.checkin.painParts.length ? (
                <Text style={[TYPE.sub, { color: c.danger }]}>통증 {card.checkin.painParts.join(' · ')}</Text>
              ) : null}
              {card.checkin.stiffParts.length ? (
                <Text style={[TYPE.sub, { color: c.muted }]}>뻐근 {card.checkin.stiffParts.join(' · ')}</Text>
              ) : null}
            </>
          ) : (
            <Empty text="오늘 체크인 전이에요." c={c} />
          )}
        </Section>
      ) : null}

      {card?.rehab ? (
        <Section title="재활" c={c}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {card.rehab.area} · {card.rehab.stage}단계
          </Text>
        </Section>
      ) : null}

      <Section title="일지" c={c}>
        {notes.length === 0 ? (
          <Empty text="아직 남긴 일지가 없어요. 위의 '일지 쓰기'로 남겨요." c={c} />
        ) : (
          notes.map((n) => (
            <View key={n.id} style={{ gap: 2, paddingVertical: 4 }}>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {dayLabel(n.key)}
                {n.author ? ` · ${n.author}` : ''}
              </Text>
              <Text style={[TYPE.body, { color: c.ink }]}>{n.body}</Text>
              {n.homework ? <Text style={[TYPE.sub, { color: c.ink }]}>숙제 {n.homework}</Text> : null}
              {n.pitchCount ? (
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  던진 공 {n.pitchCount}구 · {n.pitchLog === 'own' ? '선수 투구 기록에 남김' : n.pitchLog === 'link' ? '선수 기록에 이음' : '일지에만'}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 20 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/org/note?org=${org}&note=${n.id}` as Href)}
                  hitSlop={6}
                  style={{ minHeight: 32, justifyContent: 'center' }}
                >
                  <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>고치기</Text>
                </Pressable>
                {n.mine ? (
                  <Pressable accessibilityRole="button" onPress={() => removeNote(n.id)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
                    <Text style={[TYPE.sub, { color: c.danger }]}>지우기</Text>
                  </Pressable>
                ) : null}
              </View>
              <TalkToggle kind="note" id={n.id} talk={n.talk} who={{ role: 'coach', orgId: org }} c={c} />
            </View>
          ))
        )}
      </Section>
    </>
  );
}

const missingWord = (m: string) => (m === 'checkin' ? '체크인' : m === 'training' ? '재활 · 트레이닝' : '최근 투구 기록');

/** 못 읽은 것이 있는 '안전'은 '정보 부족'(lib/org/arm-view.ts armUnknown — 앱이 엔진 파일을 안 싣게 같은 식을 여기서) */
function ArmBlock({ arm, c }: { arm: NonNullable<NonNullable<Ok['card']>['arm']>; c: Palette }) {
  const unknown = arm.level === 'safe' && arm.missing.length > 0;
  const color = unknown ? c.muted : arm.level === 'danger' ? c.danger : arm.level === 'caution' ? c.warn : c.ok;
  return (
    <>
      <Text style={[TYPE.card, { color }]}>{unknown ? '정보 부족' : ARM_WORD[arm.level]}</Text>
      {!unknown ? <Text style={[TYPE.body, { color: c.ink }]}>{arm.headline}</Text> : null}
      {arm.details.map((d) => (
        <Text key={d} style={[TYPE.sub, { color: c.muted }]}>
          {d}
        </Text>
      ))}
      {arm.missing.length ? <Text style={[TYPE.sub, { color: c.muted }]}>못 읽은 것: {arm.missing.map(missingWord).join(' · ')}</Text> : null}
    </>
  );
}

function Section({ title, children, c }: { title: string; children: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <GroupTitle title={title} c={c} />
      <Card c={c}>{children}</Card>
    </View>
  );
}

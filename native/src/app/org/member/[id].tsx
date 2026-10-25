import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMemberCard } from '@/app/actions/app-org';
import { Bar, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Card, Empty, GroupTitle, dayLabel, scopeText } from '~/org/parts';
import { ARM_WORD } from '@/lib/org/rules';

/**
 * 코치가 보는 회원 카드(앱 화면) — 선수가 공유한 항목만(서버가 공유 안 한 칸은 아예 안 읽는다, lib/org/player-data.ts memberCardOf).
 * 1단계는 보기만: 팔 상태 · 투구 · 구속 · 오늘 체크인 · 재활 · 일지. 일지 쓰기 · 숙제는 2단계.
 */
type Loaded = Awaited<ReturnType<typeof loadMemberCard>>;
type Ok = Extract<Loaded, { ok: true }>;

export default function MemberCardScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id, org } = useLocalSearchParams<{ id: string; org: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadMemberCard', org ?? '', id ?? '');
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
          <Body data={data} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

function Body({ data, c }: { data: Ok; c: Palette }) {
  const { member, card, scope, notes } = data;
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
          <Empty text="아직 남긴 일지가 없어요. 일지 쓰기는 다음 판에 앱에 들어와요(지금은 PC 웹)." c={c} />
        ) : (
          notes.map((n) => (
            <View key={n.id} style={{ gap: 2, paddingVertical: 4 }}>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {dayLabel(n.key)}
                {n.author ? ` · ${n.author}` : ''}
              </Text>
              <Text style={[TYPE.body, { color: c.ink }]}>{n.body}</Text>
              {n.homework ? <Text style={[TYPE.sub, { color: c.ink }]}>숙제 {n.homework}</Text> : null}
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

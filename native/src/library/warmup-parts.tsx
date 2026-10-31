import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '~/lib/ui';
import { Thumb } from '~/lib/thumb';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';
import { validKind, type WarmupRow } from './warmup-model';
import type { Exercise } from './parts';

/**
 * 워밍업 루틴 목록 · 상세가 같이 쓰는 조각(2026-10-31 워밍업 시안 01 · 02) — 루틴 그림 · 하는 날 글 · 안내 창 · 운동 준비 맥락 · 운동 줄.
 * 이 화면들은 읽기만 한다 — 세션 · 체크 · 계획을 건드리는 실행용 읽기(app-workout.loadAppWarmup)를 부르지 않는다.
 */

/** 루틴 종류 → 그림. 모르는 새 종류는 기본 그림(이름은 등록된 이름 그대로) */
const ICON: Record<string, IconName> = {
  COMMON: 'flame',
  LOWER: 'footprints',
  UPPER_PUSH: 'arrow-up-right',
  UPPER_PULL: 'arrow-down-right',
  FULL: 'move',
};
export const routineIcon = (kind: string): IconName => ICON[kind] ?? 'activity';

/** 하는 날 — 웹 warmup-client.tsx WHEN 과 같은 글. 모르는 종류면 없음(지어내지 않는다) */
const WHEN: Record<string, string> = {
  COMMON: '어느 날이든 먼저',
  LOWER: '하체 운동을 하는 날',
  UPPER_PUSH: '미는 운동을 하는 날',
  UPPER_PULL: '당기는 운동을 하는 날',
  FULL: '하체 · 상체를 같이 하는 날',
};
export const whenOf = (kind: string) => WHEN[kind] ?? null;

/** 들어온 곳 — 운동 준비(오늘 운동 준비 화면)에서 왔으면 그 날의 루틴 종류. 그 밖의 값은 받지 않는다 */
export type WarmupEntry = { prep: boolean; today: string | null };
export const warmupEntryOf = (p: { from?: string; today?: string }): WarmupEntry =>
  p.from === 'prep' ? { prep: true, today: validKind(p.today) } : { prep: false, today: null };
export const entryParams = (e: WarmupEntry): Record<string, string> => (e.prep ? { from: 'prep', ...(e.today ? { today: e.today } : {}) } : {});

/** 운동 준비로 — 쌓인 목록 · 상세를 걷고 같은 준비 화면으로(없으면 그 화면을 다시 연다 — 읽기만 하는 화면이라 세션을 만들지 않는다) */
export const backToPrep = () => router.dismissTo('/training/program-today' as Href);

export function InfoSheet({ open, onClose, c }: { open: boolean; onClose: () => void; c: Palette }) {
  return (
    <Sheet fit open={open} onClose={onClose} title="워밍업 루틴" c={c}>
      <View style={{ gap: 10 }}>
        <Text style={[st.body, { color: c.ink }]}>운동을 시작하면 본운동 전에 공통 워밍업을 먼저 하고, 그날 운동에 맞는 루틴 하나를 이어서 해요.</Text>
        <Text style={[st.body, { color: c.muted }]}>날마다 새로 뽑지 않는 고정 루틴이에요. 체크만 하고, 운동 시간과 운동량에는 안 들어가요.</Text>
        <Text style={[st.body, { color: c.muted }]}>회복하는 날에는 워밍업이 나오지 않아요. 여기서는 언제든 볼 수 있어요.</Text>
      </View>
    </Sheet>
  );
}

/** 운동 준비에서 왔다는 표시 — 오늘 루틴은 준비 화면이 셈한 실제 종류가 목록에 있을 때만 */
export function PrepBanner({ todayName, c }: { todayName: string | null; c: Palette }) {
  return (
    <View style={[st.banner, { backgroundColor: c.skyTint }]}>
      <Icon name="clipboard-list" size={18} color={c.link} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[st.bold, { color: c.link }]}>운동 준비에서 확인 중</Text>
        {todayName ? <Text style={[st.small, { color: c.ink }]}>오늘 운동 · {todayName}</Text> : null}
      </View>
    </View>
  );
}

export function LinkRow({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={st.link}>
      <Text style={[st.bold, { color: c.link, flex: 1 }]}>{label}</Text>
      <Icon name="chevron-right" size={16} color={c.link} />
    </Press>
  );
}

/**
 * 운동 한 줄 — 구간 안 차례 · 이름 · 이 루틴의 수행 안내 · 등록 미리보기. 누르면 기존 운동 상세(루틴 · 구간 · 루틴 안내를 함께 넘긴다 — 세션 값처럼 꾸미지 않는다).
 * 볼 수 없는 운동은 자리만 지키고 제목 · 안내를 채우지 않는다: 숨김(서버가 확정) · 잠깐 확인 못 함(다시 확인).
 */
export function WarmupRowItem({
  row,
  routine,
  section,
  onRetry,
  retrying,
  c,
}: {
  row: WarmupRow<Exercise>;
  routine: { kind: string; name: string };
  section: 'common' | 'extra';
  onRetry: () => void;
  retrying: boolean;
  c: Palette;
}) {
  const no = String(row.order).padStart(2, '0');
  if (!row.exercise) {
    return (
      <View style={[st.row, { backgroundColor: c.chip }]} accessibilityLabel={`${row.order}번, ${row.state === 'hidden' ? '볼 수 없는 운동' : '운동 정보를 확인할 수 없어요'}`}>
        <Text style={[st.no, { color: c.muted }]}>{no}</Text>
        <Text style={[st.small, { color: c.muted, flex: 1 }]}>{row.state === 'hidden' ? '지금은 볼 수 없는 운동이에요' : '운동 정보를 확인할 수 없어요'}</Text>
        {row.state === 'missing' ? (
          <Press onPress={onRetry} disabled={retrying} accessibilityRole="button" accessibilityLabel={`${row.order}번 운동 다시 확인`} style={st.retry}>
            <Text style={[st.bold, { color: retrying ? c.muted : c.link }]}>{retrying ? '확인 중' : '다시 확인'}</Text>
          </Press>
        ) : null}
      </View>
    );
  }
  const ex = row.exercise;
  return (
    <Press
      onPress={() =>
        router.push({
          pathname: '/library/exercise/[id]',
          params: { id: ex.id, warmup: routine.kind, rname: routine.name, section, ...(row.routineNote ? { rnote: row.routineNote } : {}) },
        } as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${row.order}번, ${ex.title}${row.guide ? `, ${row.guide}` : ''}, 운동 상세 보기`}
      style={[st.row, { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <Text style={[st.no, { color: c.muted }]}>{no}</Text>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[st.name, { color: c.ink }]}>{ex.title}</Text>
        {row.guide ? <Text style={[st.small, { color: c.muted }]}>{row.guide}</Text> : null}
        {row.alsoNote ? <Text style={[st.small, { color: c.link }]}>이 루틴 안내 · {row.alsoNote}</Text> : null}
      </View>
      <View style={[st.thumb, { backgroundColor: c.chip }]}>{ex.thumbUrl ? <Thumb uri={ex.thumbUrl} style={StyleSheet.absoluteFill} /> : null}</View>
      <Icon name="chevron-right" size={16} color={c.muted} />
    </Press>
  );
}

export const st = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22 },
  bold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 19 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  no: { width: 24, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  name: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  thumb: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden' },
  retry: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
});

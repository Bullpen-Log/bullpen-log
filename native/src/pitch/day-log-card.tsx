import { Image } from 'expo-image';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import { readEffort } from '@/lib/pitch-effort';
import { isRatedSession } from '@/lib/pitch-satisfaction';
import { isRestSession } from '@/lib/session-type';
import { formatSpeed, type SpeedUnit } from '@/lib/units';
import { TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { VideoNoteLine } from '~/videos/note-line';
import type { PitchLog } from './api';
import { fatigueLabel } from './entry-model';
import { setFeatured, thumbSource, type Thumb } from './store';
import { PitchVideo } from './video';

/**
 * 그날 화면의 기록 한 장(2026-10-29 퀵스텝 확정안) — 가운데 큰 숫자는 늘 투구 수(구속이 있어도 바뀌지 않는다).
 * 팔의 피로 · 만족도 · 구속은 줄을 나눠 읽게, 메모 · 감각은 적은 것만. 휴식은 큰 0구 카드가 아니라 작은 한 줄.
 * 영상은 썸네일부터 — 누른 것 하나만 재생기를 연다(부르는 쪽이 하나만 쥔다).
 */
export function DayLogCard({
  log,
  date,
  unit,
  thumbs,
  dayVideoCount,
  rep,
  playing,
  linkedPitches,
  onPlay,
  onEdit,
  onRemove,
}: {
  log: PitchLog;
  date: string;
  unit: SpeedUnit;
  thumbs: Record<string, Thumb>;
  /** 그날 영상 수(쉬는 날 빼고) — 둘 넘으면 대표 고르기 */
  dayVideoCount: number;
  rep: string | null;
  playing: string | null;
  /** 이 기록에 이은 구속 측정의 공 수(없으면 0) */
  linkedPitches: number;
  onPlay: (path: string | null) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const c = usePalette();
  const rest = isRestSession(log.sessionType);
  const title = rest ? '휴식' : `${log.sessionType} ${log.pitchCount}구`;
  const menu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: ['기록 고치기', '기록 지우기', '취소'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) onEdit();
        if (i === 1) onRemove();
      }
    );
  const more = (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} 기록 고치기 · 지우기`} onPress={menu} hitSlop={6} style={({ pressed }) => [styles.more, pressed && { backgroundColor: c.chip }]}>
      <Icon name="ellipsis" size={20} color={c.muted} />
    </Pressable>
  );

  if (rest)
    return (
      <View style={[styles.restRow, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={[styles.restIcon, { backgroundColor: c.skyTint }]}>
          <Icon name="moon" size={18} color={c.link} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[TYPE.card, { color: c.ink }]}>던지지 않았어요</Text>
          {log.memo ? <Text style={[TYPE.body, { color: c.muted }]}>{log.memo}</Text> : <Text style={[TYPE.sub, { color: c.muted }]}>휴식</Text>}
        </View>
        {more}
      </View>
    );

  const effort = readEffort({ intensity: log.intensity ?? 0, effortPct: log.effortPct });
  const cues = (
    [
      ['좋았던 것', log.cuesGood],
      ['아쉬웠던 것', log.cuesBad],
    ] as const
  ).filter(([, list]) => list.length > 0);
  const hasSpeed = log.maxVelocity != null || log.avgVelocity != null;

  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.skyTint }]}>
          <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>{log.sessionType}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {more}
      </View>
      <View accessible accessibilityLabel={`투구 수 ${log.pitchCount}구`} style={styles.count}>
        <Text style={[TYPE.num, { fontSize: 44, color: c.ink }]}>{log.pitchCount}</Text>
        <Text style={[TYPE.body, { color: c.muted }]}>구</Text>
      </View>
      {effort || (isRatedSession(log.sessionType) && log.satisfaction != null) ? (
        <View style={styles.facts}>
          {effort ? <Fact c={c} label="팔의 피로" value={fatigueLabel(effort.pct)} /> : null}
          {isRatedSession(log.sessionType) && log.satisfaction != null ? <Fact c={c} label="만족도" value={`${log.satisfaction}/5`} /> : null}
        </View>
      ) : null}
      {hasSpeed ? (
        <View style={[styles.speeds, { backgroundColor: withAlpha(c.ink, 0.04) }]}>
          {log.maxVelocity != null ? <Fact c={c} label="최고 구속" value={formatSpeed(log.maxVelocity, unit) ?? '—'} /> : null}
          {log.avgVelocity != null ? <Fact c={c} label="평균 구속" value={formatSpeed(log.avgVelocity, unit) ?? '—'} /> : null}
        </View>
      ) : null}
      {linkedPitches > 0 ? (
        <View style={styles.linked}>
          <Icon name="radar" size={14} color={c.link} />
          <Text style={[TYPE.sub, { color: c.link }]}>구속측정 {linkedPitches}구 연결됨</Text>
        </View>
      ) : null}
      {log.memo || cues.length ? (
        <View style={[styles.feel, { backgroundColor: c.skyTint }]}>
          {log.memo ? <Text style={[TYPE.body, { color: c.ink }]}>{log.memo}</Text> : null}
          {cues.map(([t, list]) => (
            <Text key={t} style={[TYPE.sub, { color: c.muted }]}>
              {t} <Text style={{ color: c.ink }}>{list.join(' · ')}</Text>
            </Text>
          ))}
        </View>
      ) : null}
      {log.videoPaths.length ? (
        <View style={{ gap: 10 }}>
          <View style={styles.thumbs}>
            {log.videoPaths.map((p, i) => {
              const t = thumbs[p];
              const on = playing === p;
              return (
                <Press
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: on }}
                  accessibilityLabel={`영상 ${i + 1} ${on ? '닫기' : '재생'}${p === rep && dayVideoCount > 1 ? ', 대표' : ''}`}
                  onPress={() => onPlay(on ? null : p)}
                  style={[styles.thumb, { backgroundColor: withAlpha(c.ink, 0.06), borderColor: on ? c.action : 'transparent' }]}
                >
                  {t ? <Image source={thumbSource(t)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <Icon name="video" size={22} color={c.muted} />}
                  <View style={styles.play}>
                    <Icon name={on ? 'x' : 'play'} size={14} color="#fff" fill={on ? 'none' : '#fff'} />
                  </View>
                  {p === rep && dayVideoCount > 1 ? (
                    <View style={[styles.repTag, { backgroundColor: c.card }]}>
                      <Icon name="star" size={11} color={c.link} fill={c.link} />
                    </View>
                  ) : null}
                </Press>
              );
            })}
          </View>
          {playing && log.videoPaths.includes(playing) ? (
            <View style={{ gap: 8 }}>
              <PitchVideo path={playing} tools />
              <VideoNoteLine path={playing} />
              {dayVideoCount > 1 && playing !== rep ? (
                <Press accessibilityRole="button" onPress={() => void setFeatured(date, playing)} style={[styles.repBtn, { backgroundColor: c.chip }]}>
                  <Icon name="star" size={14} color={c.muted} />
                  <Text style={[TYPE.sub, { color: c.ink }]}>이 영상을 대표로</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ c, label, value }: { c: Palette; label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', gap: 2 }}>
      <Text style={[TYPE.sub, { color: c.muted }]}>{label}</Text>
      <Text style={[TYPE.body, TYPE.numInline, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 18, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginVertical: -8 },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  speeds: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderRadius: 14, padding: 12 },
  linked: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feel: { borderRadius: 14, padding: 14, gap: 6 },
  thumbs: { flexDirection: 'row', gap: 10 },
  thumb: { width: 96, height: 128, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  play: { position: 'absolute', bottom: 8, left: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  repTag: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  repBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignSelf: 'flex-start' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 10, paddingLeft: 14, paddingRight: 12 },
  restIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

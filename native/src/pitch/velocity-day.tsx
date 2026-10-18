import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LogPrefill, VelocitySessionView } from '@/lib/velocity-meta';
import { PITCH_TYPES, summarize } from '@/lib/velocity-meta';
import { rpc } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { isPhoneVideoPath } from './api';
import { PitchVideo, UrlVideo } from './video';

/**
 * 그날 화면의 구속 측정 칸(앱) — 웹 그날 화면의 구속 칸과 같은 세션 · 공(app.loadAppVelocityDay). 공을 누르면 그 공 영상(서버 클립은 서명 주소,
 * 폰 클립은 앱 안 파일). 아직 투구 기록으로 안 남긴 측정이 있으면 '측정한 N구 기록 남기기' → 기록 폼을 측정값으로 채워 연다(저장하면 그 세션을 잇는다).
 */
type Loaded = { sessions: VelocitySessionView[]; prefill: LogPrefill | null };
const days = new Map<string, Loaded>();
export const resetVelocityDayCache = () => days.clear();

/** 그날 구속 측정(세션 · 공 · 클립 주소) — 그날 화면 구속 칸 · 홈 그날 칸 영상(웹 velocity-clips)이 같이 쓴다. key 가 바뀌면 다시 받는다 */
export function useVelocityDay(date: string, key: unknown = 0): Loaded | null {
  const [state, setState] = useState<{ date: string; data: Loaded | null }>(() => ({ date, data: days.get(date) ?? null }));
  useEffect(() => {
    let alive = true;
    rpc<({ ok: true } & Loaded) | { ok: false; error: string }>('app.loadAppVelocityDay', date).then(
      (r) => {
        if (!r.ok || !alive) return;
        days.set(date, r);
        setState({ date, data: r });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [date, key]);
  return state.date === date ? (state.data ?? days.get(date) ?? null) : (days.get(date) ?? null);
}

export function VelocityDay({ date, logCount }: { date: string; logCount: number }) {
  const c = usePalette();
  const [open, setOpen] = useState<string | null>(null);

  /* 기록 수가 바뀌면(측정값으로 남겼으면) 다시 받는다 — '남기기' 줄이 걷히게 */
  const data = useVelocityDay(date, logCount);
  if (!data || data.sessions.length === 0) return null;
  const pf = data.prefill;

  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[styles.title, { color: c.ink }]}>구속 측정</Text>
      {data.sessions.map((s) => {
        const sum = summarize(s.pitches);
        const at = new Date(s.createdAt);
        return (
          <View key={s.id} style={{ gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>
              {String(at.getHours()).padStart(2, '0')}:{String(at.getMinutes()).padStart(2, '0')}
              {s.sessionType ? ` · ${s.sessionType}` : ''} · {s.pitches.length}구
              {sum ? ` · 최고 ${sum.max.toFixed(1)} · 평균 ${sum.avg.toFixed(1)}` : ''}
            </Text>
            {s.pitches.map((p) => {
              const clip = p.clip?.url ?? null;
              const type = PITCH_TYPES.find((t) => t.key === p.pitchType)?.label;
              const shown = open === p.id;
              return (
                <View key={p.id}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!clip}
                    onPress={() => setOpen(shown ? null : p.id)}
                    style={styles.row}
                  >
                    <Text style={{ width: 28, color: c.muted, fontSize: 14 }}>{p.seq}</Text>
                    <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>
                      {p.kmh.toFixed(1)} km/h{type ? ` · ${type}` : ''}
                    </Text>
                    {clip ? <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>{shown ? '접기' : '▶ 영상'}</Text> : null}
                  </Pressable>
                  {shown && clip ? isPhoneVideoPath(clip) ? <PitchVideo path={clip} /> : <UrlVideo uri={clip} /> : null}
                </View>
              );
            })}
          </View>
        );
      })}
      {pf ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/pitch/edit' as Href as never,
              params: {
                date,
                vsids: JSON.stringify(pf.sessionIds),
                vtype: pf.sessionType ?? '',
                vcount: String(pf.pitchCount),
                vmax: pf.maxVelocity != null ? String(pf.maxVelocity) : '',
                vavg: pf.avgVelocity != null ? String(pf.avgVelocity) : '',
                veffort: pf.effortPct != null ? String(pf.effortPct) : '',
              },
            })
          }
          style={[styles.prefill, { backgroundColor: c.sky }]}
        >
          <Text style={styles.prefillText}>측정한 {pf.pitchCount}구 기록 남기기</Text>
        </Pressable>
      ) : null}
      {pf?.missed ? (
        <Text style={{ color: c.warn, fontSize: 13 }}>
          못 잰 공 {pf.missed}개는 빠졌어요. 실제로 던진 수가 다르면 기록에서 고쳐 주세요.
        </Text>
      ) : null}
      {pf ? <Text style={{ color: c.muted, fontSize: 13 }}>기록으로 남기기 전에는 이 공이 팔 부하 · 휴식에 안 들어가요.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  prefill: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  prefillText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

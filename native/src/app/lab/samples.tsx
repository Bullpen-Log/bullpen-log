import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppLabList } from '@/app/actions/pitch-lab';
import {
  LAB_GROUND_OPTIONS,
  LAB_OTHER_SUBJECT,
  LAB_SUBJECT_FOLDERS,
  groupLabSamples,
  LAB_MAX_VIDEO_MB,
  LAB_VIEWS,
  labSideBase,
  labViewLabel,
  type LabGround,
  type LabHand,
  type LabView,
} from '@/lib/pitch-lab-meta';
import { Badge, Bar, Chip, LoadState, s, useLoad } from '~/community/parts';
import { GuideLink, NumberInput, SampleGroup, SampleRow, SubjectChips } from '~/lab/parts';
import { useLabUpload, type LabSlowmo } from '~/lab/use-lab-upload';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 동작 분석 샘플 · 마커 샘플(관리자 화면) — 사용자 화면(app/lab/index.tsx) 머리의 '샘플' 단추로 들어온다(2026-10-21 김민: "샘플 · 마커 샘플이 있는
 * 페이지는 관리자 전용"). 위는 옆 · 뒤 영상 짝 올리기(촬영 정보를 다 적는 실험용), 아래는 관리자끼리 본 샘플(누르면 결과 화면 /lab/<id>, 지우기).
 * 웹 app/(app)/videos/lab/lab-client.tsx 를 옮긴 것. 마커 샘플은 보기만(올리기는 스크립트). 관리자가 아니면 사용자 화면으로 돌려보낸다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;

const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;
const HAND_OPTIONS = [
  { value: 'R', label: '오른손' },
  { value: 'L', label: '왼손' },
] as const;

export default function LabListScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList');
  const [tab, setTab] = useState<'sample' | 'marker'>('sample');
  const normal = data?.samples.filter((x) => !x.marker) ?? [];
  const markers = data?.samples.filter((x) => x.marker) ?? [];
  const shown = tab === 'marker' ? markers : normal;
  const isAdmin = data?.isAdmin;
  useEffect(() => {
    if (isAdmin === false) router.replace('/lab' as Href);
  }, [isAdmin]);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="3D 동작 분석" title="샘플 · 마커 샘플" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          {/* 웹 머리처럼 '베타' 표시 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 }}>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 1, backgroundColor: c.skyTint }}>
              <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '600' }}>베타</Text>
            </View>
            <Text style={{ flex: 1, color: c.muted, fontSize: 15, lineHeight: 21 }}>같은 공을 옆과 뒤에서 함께 찍어 올리면 몸의 움직임을 3D 로 보여 줘요.</Text>
          </View>
          {/* 마커 샘플(스티커를 붙여 3~4대로 찍은 정답지용)은 따로 — 2026-10-12 사용자: "기존 샘플과 다른 곳에" */}
          {markers.length > 0 ? (
            <View accessibilityRole="radiogroup" style={s.chips}>
              <Chip label={`샘플 ${normal.length}`} on={tab === 'sample'} onPress={() => setTab('sample')} c={c} />
              <Chip label={`마커 샘플 ${markers.length}`} on={tab === 'marker'} onPress={() => setTab('marker')} c={c} />
            </View>
          ) : null}
          {tab === 'sample' ? <UploadCard heightCm={data.heightCm} defaultHand={data.hand} onDone={() => void reload()} c={c} /> : null}
          {shown.length === 0 ? (
            <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>아직 올린 영상이 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                같은 공을 옆({labSideBase(data.hand)} 쪽)과 뒤(2루 쪽)에서 찍은 영상을 짝으로 올려 주세요.
              </Text>
            </View>
          ) : (
            /*
              사람별로 접어 묶는다(2026-10-22 김민: "샘플이 너무 많이 나열돼 보기 어렵다") — 마커 샘플은 모두 한 사람이라 촬영 날까지 나눈다.
              번호는 묶기 전 전체 차례 그대로(오래된 것이 1).
            */
            (tab === 'marker'
              ? groupLabSamples(shown, (x) => `${x.subject ?? LAB_OTHER_SUBJECT} · ${x.when?.split(' ').slice(0, 2).join(' ') ?? '날짜 모름'}`)
              : groupLabSamples(shown, (x) => x.subject, LAB_SUBJECT_FOLDERS)
            ).map((g) => (
              <SampleGroup key={`${tab}:${g.name}`} name={g.name} count={g.items.length} c={c}>
                {g.items.map((x, i) => (
                  <SampleRow
                    key={x.id}
                    item={x}
                    name={`${x.marker ? '마커 샘플' : '투구'} ${shown.length - shown.indexOf(x)}`}
                    last={i === g.items.length - 1}
                    onRemoved={() => void reload()}
                    c={c}
                  />
                ))}
              </SampleGroup>
            ))
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/* ─────────────────────────── 올리기 ─────────────────────────── */

function UploadCard({ heightCm, defaultHand, onDone, c }: { heightCm: number | null; defaultHand: LabHand; onDone: () => void; c: Palette }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [fps, setFps] = useState<LabSlowmo>('unknown');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  const [ground, setGround] = useState<LabGround>('mound');
  const [height, setHeight] = useState(heightCm ? String(heightCm) : '');
  /* 폰마다 투수까지(m) — 1배여도 폰마다 화각이 달라 두 대를 따로 적는다 */
  const [distance, setDistance] = useState<Record<LabView, string>>({ side: '', back: '' });
  const [memo, setMemo] = useState('');
  /* 누구 투구 — 목록이 사람별로 묶는다(비면 '기타'). 올린 뒤에도 남긴다(같은 사람을 이어 찍는다) */
  const [subject, setSubject] = useState('');
  const { picked, checking, progress, busy, error, blocked, pairBlock, ready, fpsWarn, autoSlowmo, pick, upload: send } = useLabUpload(hand);
  /* 두 영상 다 고속이면 슬로모 배수를 저절로(고른 순간 한 번 — 그 뒤 손으로 바꿀 수 있다) */
  const [seenAuto, setSeenAuto] = useState<LabSlowmo | null>(null);
  if (autoSlowmo !== seenAuto) {
    setSeenAuto(autoSlowmo);
    if (autoSlowmo) setFps(autoSlowmo);
  }

  const upload = async () => {
    const id = await send({
      slowmo: fps,
      hand,
      ground,
      heightCm: height ? Number(height) : null,
      distances: Object.fromEntries(LAB_VIEWS.filter((v) => distance[v]).map((v) => [v, Number(distance[v])])),
      memo: memo.trim() || null,
      subject: subject.trim() || null,
    });
    if (!id) return;
    setMemo('');
    onDone();
  };

  return (
    <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>영상 올리기</Text>
        <Text style={[s.meta, { color: c.muted }]}>두 폰으로 같은 공을 동시에 찍은 원본만 올릴 수 있어요. 영상 하나에 {LAB_MAX_VIDEO_MB}MB까지예요.</Text>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/lab/guide?hand=${hand}` as Href)}
        style={({ pressed }) => [{ borderRadius: 12, padding: 12, gap: 2, backgroundColor: pressed ? c.line : c.page }]}
      >
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>촬영 안내 ›</Text>
        <Text style={[s.meta, { color: c.muted }]}>두 대 동시에 · 240fps 슬로 모션 · 1배 · 삼각대 · 원본 그대로</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LAB_VIEWS.map((view) => {
          const p = picked[view];
          const pct = progress?.view === view ? progress.percent : null;
          return (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityLabel={`${labViewLabel(view, hand)} 영상 고르기`}
              disabled={busy || checking != null}
              onPress={() => void pick(view)}
              style={{ flex: 1, minHeight: 96, borderRadius: 14, padding: 10, gap: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: p ? c.chip : c.page }}
            >
              <Text style={{ color: p ? c.sky : c.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{labViewLabel(view, hand)}</Text>
              <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
                {checking === view ? '확인하는 중…' : p ? `${((p.asset.fileSize ?? 0) / 1024 / 1024).toFixed(1)}MB` : '눌러서 고르기'}
              </Text>
              {p?.fps != null ? <Badge text={`${Math.round(p.fps)}fps`} color={p.fps >= 100 ? c.ok : c.warn} c={c} /> : null}
              {pct != null ? <View style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${pct}%`, backgroundColor: c.sky }} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: infoOpen }} onPress={() => setInfoOpen((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>촬영 정보 {infoOpen ? '접기' : '펴기'}</Text>
      </Pressable>
      {infoOpen ? (
        <View style={{ gap: 4 }}>
          <Text style={[s.label, { color: c.muted }]}>던진 곳</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {LAB_GROUND_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={ground === o.value} onPress={() => setGround(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>슬로모(초당 장수)</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {FPS_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={fps === o.value} onPress={() => setFps(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>던지는 손</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {HAND_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={hand === o.value} onPress={() => setHand(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>키(cm)</Text>
          <NumberInput value={height} onChange={setHeight} placeholder="175" c={c} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {LAB_VIEWS.map((v) => (
              <View key={v} style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.muted }]}>{v === 'side' ? '옆 폰' : '뒤 폰'}까지 거리(m)</Text>
                <NumberInput value={distance[v]} onChange={(x) => setDistance((d) => ({ ...d, [v]: x }))} placeholder="모름" c={c} />
              </View>
            ))}
          </View>
          <Text style={[s.meta, { color: c.muted }]}>폰마다 투수까지 따로 재서 적어 주세요. 같은 1배여도 폰마다 찍히는 크기가 달라요.</Text>
          <Text style={[s.label, { color: c.muted }]}>누구 투구</Text>
          <SubjectChips value={subject} onChange={setSubject} c={c} />
          <TextInput
            value={subject}
            onChangeText={setSubject}
            maxLength={20}
            placeholder="다른 사람이면 이름 · 비우면 기타"
            placeholderTextColor={c.muted}
            style={[s.input, { backgroundColor: c.page, color: c.ink }]}
          />
          <Text style={[s.label, { color: c.muted }]}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            maxLength={500}
            placeholder="예: 직구, 세게"
            placeholderTextColor={c.muted}
            style={[s.input, { backgroundColor: c.page, color: c.ink }]}
          />
        </View>
      ) : null}

      {fpsWarn ? (
        <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.page }}>
          <Text style={{ color: c.warn, fontSize: 15, lineHeight: 20 }}>{fpsWarn}</Text>
          <GuideLink label="원본 그대로 옮기는 법 ›" section="move" hand={hand} c={c} />
        </View>
      ) : null}
      {error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
      {pairBlock ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{pairBlock}</Text> : null}
      {pairBlock ? <GuideLink label="두 폰으로 동시에 찍는 법 보기 ›" section="steps" hand={hand} c={c} /> : null}
      {error && blocked ? <GuideLink label="어떻게 찍으면 되는지 촬영 안내 보기 ›" section="checklist" hand={hand} c={c} /> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        onPress={() => void upload()}
        style={[s.primary, { marginTop: 0, backgroundColor: c.sky, opacity: ready || busy ? 1 : 0.4 }]}
      >
        <Text style={s.primaryText}>{progress ? `${progress.view === 'side' ? '옆' : '뒤'} 영상 올리는 중 ${progress.percent}%` : '짝으로 올리기'}</Text>
      </Pressable>
    </View>
  );
}


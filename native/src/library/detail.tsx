import { InstructionText } from '~/shell/instruction-text';
import { Icon } from '~/shell/icon';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { formatPrescription } from '@/lib/exercise-meta';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { ExerciseVideo, NoteBox } from '~/workout/parts';
import { Thumb } from '~/lib/thumb';
import { Segmented } from '~/shell/heading';
import { shortCategory } from './browse';
import { MuscleChips } from '~/armcare/muscle-info';
import { HistoryPanel } from '~/training/history';
import { s } from '~/training/screen';
import { Press } from '~/shell/press';
import { Tags, type Exercise } from './parts';

/** 운동 상세에 어디서 왔나 — 운동 진행에서 왔으면 그 판 · 그때 배정된 구성(라이브러리 기본값으로 덮지 않는다) */
export type DetailEntry = { sessionId: string | null; today: string | null };

/**
 * 운동 영상 상세 본문(2026-10-31 시안 02) — 이름 · 분류/장비 → 영상(누르기 전에는 미리보기만) → [운동 방법 | 내 기록].
 * 운동 방법: 기본 수행량(또는 오늘 구성) → 설명(열 때 받음) → 주요 근육(기존 3D 설명) → 내 메모 → 운동 정보.
 * 내 기록은 탭을 처음 열 때 받는다. 영상은 탭 위에 있어 탭 · 별 · 메모가 바뀌어도 재생기가 그대로다.
 */
export function ExerciseDetail({ item, entry, c }: { item: Exercise; entry: DetailEntry; c: Palette }) {
  const unit = useWeightUnit();
  const [tab, setTab] = useState<'how' | 'history'>('how');
  /* 내 기록은 처음 열 때 붙이고, 그 뒤로는 탭을 오가도 다시 받지 않게 둔다 */
  const [historyOpened, setHistoryOpened] = useState(false);
  const meta = [shortCategory(item.category), ...item.equipment].join(' · ');
  const base = formatPrescription(item);
  const extra = [...item.bodyParts, item.intensity, ...(item.difficulty ? [item.difficulty] : []), ...item.equipment];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text selectable accessibilityRole="header" style={[st.name, { color: c.ink }]}>
          {item.title}
        </Text>
        {meta ? <Text style={[s.small, { color: c.muted }]}>{meta}</Text> : null}
      </View>
      <DetailMedia key={item.id} item={item} c={c} />
      <Segmented
        label="운동 상세 보기"
        options={[
          { value: 'how', label: '운동 방법' },
          { value: 'history', label: '내 기록' },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          if (v === 'history') setHistoryOpened(true);
        }}
      />
      <View style={{ gap: 20, display: tab === 'how' ? 'flex' : 'none' }}>
        {/* 오늘 구성(운동 진행에서 옴) — 그 판에 배정 · 교체된 그대로. 기본 수행량은 라이브러리 값이라 출처를 따로 적는다 */}
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 6 }]}>
          {entry.today ? (
            <>
              <Text style={[s.smallBold, { color: c.link }]}>오늘 구성 · 지금 하는 운동에 배정된 양</Text>
              <Text style={[s.bodyBold, { color: c.ink }]}>{entry.today}</Text>
              <Text style={[s.small, { color: c.muted }]}>라이브러리 기본 수행량 · {base ?? '정해 둔 값 없음'}</Text>
            </>
          ) : (
            <>
              <Text style={[s.smallBold, { color: c.muted }]}>기본 수행량 · 라이브러리 기준</Text>
              <Text style={[s.bodyBold, { color: c.ink }]}>{base ?? '정해 둔 기본 수행량이 없어요'}</Text>
            </>
          )}
        </View>
        <Description id={item.id} c={c} />
        {item.targetMuscles.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.smallBold, { color: c.muted }]}>주요 근육 · 누르면 위치와 설명</Text>
            <MuscleChips muscles={item.targetMuscles} c={c} />
          </View>
        ) : null}
        {/* 내 메모 — 운동마다 하나, 운동 진행 화면과 같은 상자 · 같은 값(~/library/sync) */}
        <NoteBox exerciseId={item.id} note={item.note} c={c} />
        {extra.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.smallBold, { color: c.muted }]}>운동 정보</Text>
            <Tags items={extra} c={c} />
          </View>
        ) : null}
      </View>
      {historyOpened ? (
        <View style={{ display: tab === 'history' ? 'flex' : 'none' }}>
          <HistoryPanel exerciseId={item.id} excludeSessionId={entry.sessionId ?? undefined} unit={unit} c={c} hideNote recentFirst />
        </View>
      ) : null}
    </View>
  );
}

/** 설명 — 열 때 받는다. 받는 중 · 못 받음(다시 받기) · 적힌 설명 없음을 가른다. 운동이 바뀌면 앞 운동의 답은 버린다 */
function Description({ id, c }: { id: string; c: Palette }) {
  const [got, setGot] = useState<{ id: string; tries: number; text: string | null; failed: boolean } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<string | null>('content.exerciseDescription', id).then(
      (text) => alive && setGot({ id, tries, text, failed: text == null }),
      () => alive && setGot({ id, tries, text: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [id, tries]);
  const now = got?.id === id && got.tries === tries ? got : null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.smallBold, { color: c.muted }]}>운동 설명</Text>
      {!now ? (
        <Text style={[s.small, { color: c.muted }]}>설명을 불러오는 중…</Text>
      ) : now.failed ? (
        <Press accessibilityRole="button" onPress={() => setTries((n) => n + 1)} style={s.textBtn}>
          <Text style={[s.small, { color: c.muted }]}>
            설명을 불러오지 못했어요. <Text style={{ color: c.link, fontWeight: '700' }}>다시 불러오기</Text>
          </Text>
        </Press>
      ) : now.text ? (
        <InstructionText text={now.text} c={c} />
      ) : (
        <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
      )}
    </View>
  );
}

/**
 * 시범 영상 자리 — 누르기 전에는 미리보기 그림만(영상 주소 · 받기 · 재생기 없음). 높이는 휴대폰 218 · 넓은 화면 320, 원래 비율 그대로 다 보이게.
 * 영상 경로도 참고 영상도 없으면 '영상 준비 중'(분류가 나중에 촬영이어도 영상이 있으면 튼다).
 */
type MediaItem = Pick<Exercise, 'title' | 'videoPath' | 'referenceVideoId' | 'thumbUrl' | 'aspectRatio'>;
export function DetailMedia({ item, c }: { item: MediaItem; c: Palette }) {
  const { width } = useWindowDimensions();
  const height = width >= 700 ? 320 : 218;
  const [play, setPlay] = useState(false);
  const hasVideo = Boolean(item.videoPath || item.referenceVideoId);
  if (play && hasVideo) return <ExerciseVideo path={item.videoPath} referenceVideoId={item.referenceVideoId} aspectRatio={item.aspectRatio} height={height} />;
  const thumb = item.thumbUrl ? <Thumb uri={item.thumbUrl} style={StyleSheet.absoluteFill} contentFit="contain" /> : null;
  if (!hasVideo)
    return (
      <View style={[st.media, { height, backgroundColor: c.chip }]}>
        {thumb ? <View style={[StyleSheet.absoluteFill, { opacity: 0.2 }]}>{thumb}</View> : null}
        <View style={st.mediaNote}>
          <Icon name="film" size={20} color={c.muted} />
          <Text style={[s.smallBold, { color: c.ink }]}>영상 준비 중</Text>
          <Text style={[s.small, { color: c.muted, textAlign: 'center' }]}>아직 재생할 영상이 없어요. 아래 내용은 그대로 볼 수 있어요.</Text>
        </View>
      </View>
    );
  return (
    <Press onPress={() => setPlay(true)} accessibilityRole="button" accessibilityLabel={`${item.title} 시범 영상 재생`} style={[st.media, { height, backgroundColor: '#000' }]}>
      {/* 미리보기만 없음 — 영상은 있어 재생된다. 글은 재생 표시와 겹치지 않게 아래에 */}
      {thumb ?? <Text style={[s.small, st.noThumb, { color: 'rgba(255,255,255,0.7)' }]}>미리보기 없음</Text>}
      <View style={st.mediaPlay}>
        <Icon name="play" size={22} color="#fff" fill="#fff" />
      </View>
    </Press>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '700', lineHeight: 31 },
  media: { width: '100%', borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mediaNote: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  noThumb: { position: 'absolute', bottom: 12 },
  mediaPlay: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
});


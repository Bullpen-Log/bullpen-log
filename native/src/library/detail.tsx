import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatPrescription } from '@/lib/exercise-meta';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { ExerciseMedia } from '~/armcare/parts';
import { MuscleChips } from '~/armcare/muscle-info';
import { HistoryPanel } from '~/training/history';
import { s } from '~/training/screen';
import { Press } from '~/shell/press';
import { FavoriteFull, Tags, useStar, type Drill, type Exercise } from './parts';

/**
 * 운동 하나의 내용 — 상세 화면과 목록의 그 자리 펼침(웹 ExerciseDetail)이 같이 쓴다: 영상 · 이름(· 닫기) · 꼬리표 · 키우는 근육 · 처방 · 설명 ·
 * [즐겨찾기에 담기] · 내 기록. onClose 가 있으면 카드로(목록 안 펼침), 없으면 화면 본문으로 그린다.
 */
export function ExerciseDetail({ item, c, onClose }: { item: Exercise; c: Palette; onClose?: () => void }) {
  const unit = useWeightUnit();
  const star = useStar(item, 'exercise');
  /* null 은 아직 안 옴, 빈 글은 설명이 없는 운동, failed 는 못 받음(누르면 다시) */
  const [desc, setDesc] = useState<{ text: string | null; failed: boolean } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<string | null>('content.exerciseDescription', item.id).then(
      (text) => alive && setDesc({ text, failed: text == null }),
      () => alive && setDesc({ text: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [item.id, tries]);
  const rx = formatPrescription(item);

  return (
    <View style={[{ gap: 16 }, onClose && [s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: c.sky + '40' }]]}>
      <ExerciseMedia path={item.videoPath} referenceVideoId={item.referenceVideoId} thumbUrl={item.thumbUrl} aspectRatio={item.aspectRatio} />
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text selectable style={[s.title, { color: c.ink }]}>
            {item.title}
          </Text>
          <Text style={[s.small, { color: c.muted }]}>{item.category}</Text>
        </View>
        {onClose ? (
          <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8} style={s.iconBtn}>
            <SymbolView name="xmark" size={18} tintColor={c.muted} />
          </Press>
        ) : null}
      </View>
      <Tags items={[...item.bodyParts, item.intensity, ...(item.difficulty ? [item.difficulty] : []), ...item.equipment]} c={c} />
      {item.targetMuscles.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={[s.small, { color: c.muted }]}>키우는 근육</Text>
          <MuscleChips muscles={item.targetMuscles} c={c} />
        </View>
      ) : null}
      {rx ? <Text style={[s.bodyBold, { color: c.ink }]}>{rx}</Text> : null}

      <View>
        {!desc ? (
          <Text style={[s.small, { color: c.muted, opacity: 0.5 }]}>설명을 불러오는 중…</Text>
        ) : desc.failed ? (
          <Press accessibilityRole="button" onPress={() => setTries((n) => n + 1)} style={s.textBtn}>
            <Text style={[s.small, { color: c.muted }]}>
              설명을 불러오지 못했어요. <Text style={{ color: c.skyStrong, fontWeight: '700' }}>다시 불러오기</Text>
            </Text>
          </Press>
        ) : desc.text ? (
          <Text selectable style={[s.body, { color: c.muted }]}>
            {desc.text}
          </Text>
        ) : (
          <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
        )}
      </View>

      {/* 별을 다는 자리 — 담아 두면 '운동 추가' 창 맨 위에 모인다(웹 FavoriteButton full) */}
      <FavoriteFull on={star.on} onPress={() => void star.toggle()} note={star.note} c={c} />

      <View style={[{ gap: 10, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
        <Text style={[s.section, { color: c.ink }]}>내 기록</Text>
        {/* 내 메모도 기록 칸이 같이 보인다(웹은 메모를 위에 따로 두고 기록에서 뺐다 — 앱은 한 칸) */}
        <HistoryPanel exerciseId={item.id} unit={unit} c={c} />
      </View>
    </View>
  );
}

/**
 * 드릴 하나의 내용 — 상세 화면과 목록의 그 자리 펼침(웹 GuideDetail)이 같이 쓴다: 영상 · 이름(· 닫기) · 종류 · 요소(맨 앞이 주 요소) · 단계 · 장비 ·
 * 설명 · [즐겨찾기에 담기]. 설명은 목록에 같이 온다.
 */
export function DrillDetail({ item, c, onClose }: { item: Drill; c: Palette; onClose?: () => void }) {
  const star = useStar(item, 'drill');
  const [main, ...more] = item.focusPoints;
  return (
    /* 별을 단 드릴은 펼친 카드 테두리가 주황(웹 GuideDetail border-warn-line) */
    <View style={[{ gap: 16 }, onClose && [s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: star.on ? c.warn + '66' : c.sky + '40' }]]}>
      <ExerciseMedia path={item.videoPath} referenceVideoId={item.referenceVideoId} thumbUrl={item.thumbUrl} aspectRatio={item.aspectRatio} />
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text selectable style={[s.title, { color: c.ink }]}>
            {item.title}
          </Text>
          <Text style={[s.small, { color: c.muted }]}>{item.category}</Text>
        </View>
        {onClose ? (
          <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8} style={s.iconBtn}>
            <SymbolView name="xmark" size={18} tintColor={c.muted} />
          </Press>
        ) : null}
      </View>
      {main ? (
        <Text style={[s.small, { color: c.muted }]}>
          주 요소 <Text style={{ color: c.sky, fontWeight: '700' }}>{main}</Text>
          {more.length > 0 ? ` · 함께 쓰는 요소 ${more.join(' · ')}` : ''}
        </Text>
      ) : null}
      <Tags items={[...(item.stage ? [item.stage] : []), ...item.equipment]} c={c} />
      {item.description ? (
        <Text selectable style={[s.body, { color: c.muted }]}>
          {item.description}
        </Text>
      ) : (
        <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
      )}
      {/* 예전엔 '학습 완료로 표시'였다 — 오늘 할 것을 고를 때 이 드릴을 다시 찾기 쉽게 별로(웹과 같다) */}
      <FavoriteFull on={star.on} onPress={() => void star.toggle()} note={star.note} c={c} />
    </View>
  );
}

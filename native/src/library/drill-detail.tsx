import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DRILL_STAGES, FOCUS_POINT_DESC } from '@/lib/exercise-meta';
import { mechanicsElement } from '@/lib/mechanics/elements';
import type { Palette } from '~/lib/ui';
import { InstructionText } from '~/shell/instruction-text';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { s } from '~/training/screen';
import { Sheet } from '~/workout/sheets';
import { DetailMedia } from './detail';
import { shortDrillCategory, type DrillEntry } from './drill-browse';
import { ELEMENT_ICON, type Drill } from './parts';

/**
 * 드릴 상세 본문(2026-10-31 드릴 시안 02) — 이름 · 단계/종류 → 들어온 맥락(훈련 · 3D 분석) → 영상(누르기 전엔 미리보기만) → 연습하는 움직임(주 요소 ·
 * 함께 쓰는 요소) → 준비물 → 드릴 방법(원문 그대로 InstructionText) → 드릴 정보 · 원래 화면으로.
 * 읽기만 한다 — 세트 · 횟수 · 강도 · 내 기록 · 메모 · 학습 완료는 넣지 않는다(드릴에는 그런 값이 없다). 단계는 콘텐츠 분류라 내 진도와 상관없다.
 * focusPoints 맨 앞이 주 요소, 나머지가 함께 쓰는 요소 — 3D 분석이 보조 요소로 이어 줬어도 주 요소는 그대로다. 비어 있는 값은 추정해 채우지 않는다.
 */
type Open = { kind: 'element'; name: string } | { kind: 'stage' } | { kind: 'info' } | null;

/** 요소 설명의 방향 자리('{삼루}' 쪽) — 이 화면은 던지는 손을 모른다. 오른손 · 왼손 모두 맞는 말(글러브 쪽 · 던지는 팔 쪽)로 */
const neutralSide = (text: string) => text.replaceAll('{삼루}', '글러브').replaceAll('{팔쪽}', '던지는 팔');

export function DrillDetail({ item, entry, onReturn, c }: { item: Drill; entry: DrillEntry; onReturn: (() => void) | null; c: Palette }) {
  const [open, setOpen] = useState<Open>(null);
  const [main, ...more] = item.focusPoints;
  /* 3D 분석이 넘긴 요소가 이 드릴의 보조 요소면 그 관계를 보인다(주 요소는 바꾸지 않는다) */
  const linkedAlong = entry.from === 'analysis' && entry.el && entry.el !== main && more.includes(entry.el) ? entry.el : null;
  const source = item.videoPath ? '직접 촬영한 영상' : item.referenceVideoId ? '참고 영상' : '영상 준비 중';
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text selectable accessibilityRole="header" style={[st.name, { color: c.ink }]}>
          {item.title}
        </Text>
        <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
          {item.stage ? (
            <Press
              onPress={() => setOpen({ kind: 'stage' })}
              accessibilityRole="button"
              accessibilityLabel={`드릴 단계 ${item.stage}, 단계 설명 보기`}
              style={[st.stage, { backgroundColor: c.skyTint }]}
            >
              <Text style={[s.smallBold, { color: c.link }]}>{item.stage}</Text>
              <Icon name="info" size={13} color={c.link} />
            </Press>
          ) : (
            <Text style={[s.small, { color: c.muted }]}>단계 정보 없음</Text>
          )}
          <Text style={[s.small, { color: c.muted }]}>{shortDrillCategory(item.category)}</Text>
        </View>
      </View>

      {entry.from !== 'library' ? (
        <View style={[st.context, { backgroundColor: c.skyTint }]}>
          <Icon name={entry.from === 'mechanics' ? 'activity' : 'focus'} size={18} color={c.link} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.smallBold, { color: c.link }]}>{entry.from === 'mechanics' ? '메커니즘 훈련에서 확인 중' : '3D 분석에서 연결'}</Text>
            {entry.from === 'mechanics' ? (
              entry.pos || entry.phase ? (
                <Text style={[s.small, { color: c.ink }]}>
                  {[entry.pos ? `드릴 ${entry.pos}` : null, entry.phase === 'input' ? '기록 입력 중' : entry.phase === 'perform' ? '수행 중' : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null
            ) : entry.el ? (
              <Text style={[s.small, { color: c.ink }]}>연결된 요소 · {entry.el}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* 영상 — 이 드릴(id)마다 새 자리. 별 · 설명 · 시트가 바뀌어도 재생기는 그대로 */}
      <DetailMedia key={item.id} item={item} c={c} />

      {main ? (
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          {linkedAlong ? (
            <View style={[st.along, { backgroundColor: c.skyTint }]}>
              <Text style={[s.smallBold, { color: c.link }]}>{linkedAlong}</Text>
              <Text style={[s.small, { color: c.link }]}>· 함께 쓰는 요소로 연결</Text>
            </View>
          ) : null}
          <View style={[s.row, { alignItems: 'flex-start' }]}>
            <View style={[st.elIcon, { backgroundColor: c.skyTint }]}>
              <Icon name={ELEMENT_ICON[main] ?? 'target'} size={20} color={c.link} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.small, { color: c.muted }]}>연습하는 움직임 · 주 요소</Text>
              <Press onPress={() => setOpen({ kind: 'element', name: main })} accessibilityRole="button" accessibilityLabel={`주 요소 ${main}, 설명 보기`} style={st.elName}>
                <Text style={[st.elText, { color: c.link }]}>{main}</Text>
                <Icon name="chevron-right" size={16} color={c.link} />
              </Press>
            </View>
          </View>
          {FOCUS_POINT_DESC[main as keyof typeof FOCUS_POINT_DESC] ? <Text style={[s.body, { color: c.ink }]}>{FOCUS_POINT_DESC[main as keyof typeof FOCUS_POINT_DESC]}</Text> : null}
          {more.length > 0 ? (
            <View style={[st.alongRow, { borderTopColor: c.line }]}>
              <Text style={[s.small, { color: c.muted }]}>함께 쓰는 요소</Text>
              <View style={[s.row, { gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }]}>
                {more.map((x) => (
                  <Press key={x} onPress={() => setOpen({ kind: 'element', name: x })} accessibilityRole="button" accessibilityLabel={`함께 쓰는 요소 ${x}, 설명 보기`} style={st.elName}>
                    <Text style={[s.smallBold, { color: c.link }]}>{x}</Text>
                    <Icon name="chevron-right" size={14} color={c.link} />
                  </Press>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={[s.bodyBold, { color: c.ink }]}>
            연습하는 움직임
          </Text>
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[s.small, { color: c.muted }]}>등록된 투구 요소가 없어요.</Text>
          </View>
        </View>
      )}

      {/* 준비물 — 실제 등록 값. 비어 있으면 '맨몸'으로 채우지 않는다 */}
      <View style={[s.card, s.row, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 14 }]}>
        <Icon name="layers" size={17} color={c.muted} />
        <Text style={[s.small, { color: c.muted }]}>준비물</Text>
        <Text style={[s.bodyBold, { color: item.equipment.length > 0 ? c.ink : c.muted, flex: 1, textAlign: 'right', fontSize: item.equipment.length > 0 ? 17 : 15 }]}>
          {item.equipment.length > 0 ? item.equipment.join(' · ') : '등록 안 됨'}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={[s.bodyBold, { color: c.ink }]}>
          드릴 방법
        </Text>
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          {item.description.trim() ? <InstructionText text={item.description} c={c} /> : <Text style={[s.small, { color: c.muted }]}>등록된 설명이 없어요.</Text>}
        </View>
      </View>

      <View>
        <LinkRow label="드릴 정보" onPress={() => setOpen({ kind: 'info' })} c={c} />
        {onReturn ? <LinkRow label={entry.from === 'mechanics' ? '하던 훈련으로' : '분석 결과로'} onPress={onReturn} c={c} /> : null}
      </View>

      <Sheet fit open={open?.kind === 'element'} onClose={() => setOpen(null)} title={open?.kind === 'element' ? open.name : '투구 요소'} c={c}>
        {open?.kind === 'element' ? <ElementInfo name={open.name} role={open.name === main ? '이 드릴의 주 요소예요.' : '이 드릴에서 함께 쓰는 요소예요.'} c={c} /> : null}
      </Sheet>
      <Sheet fit open={open?.kind === 'stage'} onClose={() => setOpen(null)} title="드릴 단계" description="드릴의 난이도 분류예요. 내 학습 단계 · 진도와는 따로예요." c={c}>
        <View style={{ gap: 8 }}>
          {DRILL_STAGES.map((x) => {
            const on = x.name === item.stage;
            return (
              <View key={x.name} accessibilityState={{ selected: on }} style={[st.stageRow, { backgroundColor: on ? c.skyTint : c.chip }]}>
                <Text style={[s.bodyBold, { color: on ? c.link : c.ink }]}>
                  {x.name}
                  {on ? ' · 이 드릴' : ''}
                </Text>
                <Text style={[s.small, { color: c.muted }]}>{x.desc}</Text>
              </View>
            );
          })}
        </View>
      </Sheet>
      <Sheet fit open={open?.kind === 'info'} onClose={() => setOpen(null)} title="드릴 정보" c={c}>
        <View style={{ gap: 2 }}>
          <InfoRow label="종류" value={item.category} c={c} />
          <InfoRow label="드릴 단계" value={item.stage ?? '등록 안 됨'} c={c} />
          <InfoRow label="주 요소" value={main ?? '등록 안 됨'} c={c} />
          <InfoRow label="함께 쓰는 요소" value={more.length > 0 ? more.join(' · ') : '없음'} c={c} />
          <InfoRow label="준비물" value={item.equipment.length > 0 ? item.equipment.join(' · ') : '등록 안 됨'} c={c} />
          <InfoRow label="영상" value={source} c={c} />
        </View>
      </Sheet>
    </View>
  );
}

/** 요소 설명 — 기존 요소 글(lib/mechanics/elements.ts) 그대로. 진단 · 교정 효과를 덧붙이지 않는다 */
function ElementInfo({ name, role, c }: { name: string; role: string; c: Palette }) {
  const el = mechanicsElement(name);
  return (
    <View style={{ gap: 10 }}>
      <Text style={[s.smallBold, { color: c.link }]}>{role}</Text>
      {el ? (
        <>
          <Text style={[s.bodyBold, { color: c.ink }]}>{el.line}</Text>
          <Text style={[s.body, { color: c.ink }]}>{neutralSide(el.what)}</Text>
        </>
      ) : (
        <Text style={[s.body, { color: c.muted }]}>이 요소의 설명이 아직 없어요.</Text>
      )}
    </View>
  );
}

function LinkRow({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={st.link}>
      <Text style={[s.smallBold, { color: c.link, flex: 1 }]}>{label}</Text>
      <Icon name="chevron-right" size={16} color={c.link} />
    </Press>
  );
}

function InfoRow({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <View style={[st.info, { borderBottomColor: c.line }]}>
      <Text style={[s.small, { color: c.muted, width: 104 }]}>{label}</Text>
      <Text selectable style={[s.small, { color: c.ink, flex: 1 }]}>
        {value}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 26, fontWeight: '700', lineHeight: 33 },
  stage: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  along: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  elIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  elName: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  elText: { fontSize: 22, fontWeight: '700' },
  alongRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  stageRow: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  info: { flexDirection: 'row', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});

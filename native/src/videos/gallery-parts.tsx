import { Image } from 'expo-image';
import { memo, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EMPTY_VIDEO_FILTER,
  MATCH_LABEL,
  PERIOD_LABEL,
  filterVideos,
  recordTypes,
  type FilteredRow,
  type LinkedFilter,
  type MyVideoItem,
  type PeriodKind,
  type VideoFilter,
  type VideoOrder,
  type VideoSport,
} from '@/lib/my-videos';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { thumbSource, type Thumb } from '~/pitch/store';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { DateNavButton } from '~/shell/mini-calendar';
import { Press } from '~/shell/press';
import { durationText, videoCaption, videoDateText } from './text';

/**
 * 내 영상 목록의 칸 · 시트(화면은 app/my-videos/index.tsx). 칸 높이는 화면이 정해 넘긴다 — 목록이 줄 자리를 미리 셈해(getItemLayout)
 * 월 바로 가기 · 보기 바꿈 · 돌아오기에서 멀리 있는 줄로도 바로 간다. 그래서 칸 안 글은 줄 수를 묶고(numberOfLines) 큰 글씨는 2배까지만.
 */
export const MAX_FONT = 2;
export type CellState = { pending: boolean; missing: boolean };

/** 즐겨찾기 별 — 칸을 여는 누름과 따로(겹쳐 놓은 형제라 누름이 영상 열기로 안 번진다) */
export function StarButton({ on, onPress, light }: { on: boolean; onPress: () => void; light?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? '즐겨찾기에서 해제' : '즐겨찾기에 추가'}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.star, light && { backgroundColor: 'rgba(0,0,0,0.35)' }, pressed && { opacity: 0.6 }]}
    >
      <Icon name="star" size={18} color={on ? c.warn : light ? '#fff' : c.muted} fill={on ? c.warn : undefined} />
    </Pressable>
  );
}

function metaOf(row: FilteredRow, cell: CellState, showWhere: boolean) {
  const v = row.item;
  return [
    cell.pending ? '동기화 대기' : null,
    cell.missing ? '이 폰에 없음' : null,
    showWhere && row.where ? MATCH_LABEL[row.where] : null,
    v.sport === 'hit' ? '타격' : '투구',
    v.dateSource === 'log' ? '기록 날짜' : null,
  ].filter(Boolean) as string[];
}
/** 첫 줄 글 — 검색이면 걸린 글 조각, 아니면 영상 메모, 없으면 실제 정보(종류 · 공 수) */
function lineOf(row: FilteredRow, showWhere: boolean) {
  if (showWhere && row.snippet && row.where !== 'note') return { text: row.snippet, muted: false };
  if (row.item.note) return { text: row.item.note, muted: false };
  return { text: videoCaption(row.item), muted: true };
}

/** 그리드 칸 — 3:4 장면(가운데를 잘라 채움 · 세로 · 가로 영상 같은 규칙), 오른쪽 위 별, 오른쪽 아래 길이(알 때만), 밑 두 줄 */
export const GridTile = memo(function GridTile({
  row,
  width,
  thumbH,
  thumb,
  cell,
  showWhere,
  onOpen,
  onStar,
}: {
  row: FilteredRow;
  width: number;
  thumbH: number;
  thumb: Thumb | undefined;
  cell: CellState;
  showWhere: boolean;
  onOpen: (v: MyVideoItem) => void;
  onStar: (v: MyVideoItem) => void;
}) {
  const c = usePalette();
  const v = row.item;
  const line = lineOf(row, showWhere);
  const meta = metaOf(row, cell, showWhere);
  const dur = durationText(v.durationSec);
  return (
    <View style={{ width }}>
      <View>
        <Press
          card
          accessibilityRole="button"
          accessibilityLabel={`${videoDateText(v.date)} ${line.text} ${meta.join(' ')}`}
          onPress={() => onOpen(v)}
          style={[styles.thumb, { width, height: thumbH, backgroundColor: withAlpha(c.ink, 0.08) }]}
        >
          {thumb ? (
            <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" recyclingKey={v.path} />
          ) : (
            <Icon name="film" size={24} color={c.muted} />
          )}
          {dur ? (
            <View style={styles.dur}>
              <Text maxFontSizeMultiplier={1.4} style={styles.durText}>
                {dur}
              </Text>
            </View>
          ) : null}
          {cell.pending || cell.missing ? (
            <View style={[styles.flag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Text maxFontSizeMultiplier={1.4} style={styles.durText}>
                {cell.pending ? '동기화 대기' : '이 폰에 없음'}
              </Text>
            </View>
          ) : null}
        </Press>
        {!cell.pending ? (
          <View style={styles.starAt}>
            <StarButton on={v.revisit} onPress={() => onStar(v)} light />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[styles.cap, { color: line.muted ? c.muted : c.ink }]}>
        {line.text}
      </Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[styles.meta, { color: c.muted }]}>
        {meta.join(' · ')}
      </Text>
    </View>
  );
});

/** 목록 칸 — 메모를 읽으며 고르는 보기. 별은 오른쪽(칸 누름과 따로) */
export const ListCard = memo(function ListCard({
  row,
  height,
  thumb,
  cell,
  showWhere,
  onOpen,
  onStar,
}: {
  row: FilteredRow;
  height: number;
  thumb: Thumb | undefined;
  cell: CellState;
  showWhere: boolean;
  onOpen: (v: MyVideoItem) => void;
  onStar: (v: MyVideoItem) => void;
}) {
  const c = usePalette();
  const v = row.item;
  const line = lineOf(row, showWhere);
  const kind = v.logs[0]?.type;
  const dur = durationText(v.durationSec);
  const tags = [...metaOf(row, cell, showWhere), v.logs.length ? `기록 ${v.logs.length}개` : '기록 연결 없음', dur].filter(Boolean) as string[];
  return (
    <View style={{ height, paddingBottom: 8 }}>
      <Press
        card
        accessibilityRole="button"
        accessibilityLabel={`${videoDateText(v.date)} ${kind ?? ''} ${line.text} ${tags.join(' ')}`}
        onPress={() => onOpen(v)}
        style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}
      >
        <View style={[styles.listThumb, { backgroundColor: withAlpha(c.ink, 0.08) }]}>
          {thumb ? (
            <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={v.path} />
          ) : (
            <Icon name="film" size={22} color={c.muted} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4, paddingRight: 40 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>
            {[videoDateText(v.date), kind].filter(Boolean).join(' · ')}
          </Text>
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.body, { color: line.muted ? c.muted : c.ink }]}>
            {line.text}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT} style={[TYPE.sub, { color: c.muted }]}>
            {tags.join(' · ')}
          </Text>
        </View>
      </Press>
      {!cell.pending ? (
        <View style={styles.listStar}>
          <StarButton on={v.revisit} onPress={() => onStar(v)} />
        </View>
      ) : null}
    </View>
  );
});

/* ───────────────────────── 시트 ───────────────────────── */

const PERIODS: PeriodKind[] = ['all', '7d', 'thisMonth', 'lastMonth', 'custom', 'unknown'];
const SPORTS: { value: 'all' | VideoSport; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pitch', label: '투구' },
  { value: 'hit', label: '타격' },
];
const LINKED: { value: LinkedFilter; label: string }[] = [
  { value: 'any', label: '전체' },
  { value: 'linked', label: '연결됨' },
  { value: 'unlinked', label: '연결 없음' },
];
const ORDERS: { value: VideoOrder; label: string }[] = [
  { value: 'new', label: '최신순' },
  { value: 'old', label: '오래된순' },
];

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press
      select
      selected={on}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? c.action : withAlpha(c.ink, 0.06) }]}
    >
      <Text maxFontSizeMultiplier={1.6} style={[styles.chipText, { color: on ? '#fff' : withAlpha(c.ink, 0.85) }]}>
        {label}
      </Text>
    </Press>
  );
}

function SheetFrame({ title, onCancel, right, children, footer }: { title: string; onCancel: () => void; right?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const c = usePalette();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.sheetBar}>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8}>
            <Text style={[TYPE.body, { color: c.link }]}>취소</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
            {title}
          </Text>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}>{children}</ScrollView>
        {footer ? <View style={[styles.sheetFoot, { borderTopColor: c.line }]}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>{title}</Text>
      {children}
    </View>
  );
}

function PeriodPicker({ value, onChange, today }: { value: VideoFilter['period']; onChange: (p: VideoFilter['period']) => void; today: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.chipWrap}>
        {PERIODS.map((k) => (
          <Chip key={k} on={value.kind === k} label={PERIOD_LABEL[k]} onPress={() => onChange(k === 'custom' ? { kind: 'custom', from: value.from ?? null, to: value.to ?? today } : { kind: k })} />
        ))}
      </View>
      {value.kind === 'custom' ? (
        <View style={styles.rangeRow}>
          <DateNavButton label={value.from ? videoDateText(value.from) : '시작일'} date={value.from ?? ''} today={today} min="2015-01-01" marked={() => false} onPick={(d) => onChange({ ...value, from: d })} />
          <Text style={{ color: c.muted }}>~</Text>
          <DateNavButton label={value.to ? videoDateText(value.to) : '종료일'} date={value.to ?? ''} today={today} min="2015-01-01" marked={() => false} onPick={(d) => onChange({ ...value, to: d })} />
        </View>
      ) : null}
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {"찍은 날 기준(모르면 붙은 기록 날짜) · 시작일 · 종료일 포함. 날짜 모름 영상은 '전체 기간'과 '날짜 모름만'에서 보여요."}
      </Text>
    </View>
  );
}

/**
 * 상세 조건 — 고치는 동안은 시트 안에서만 바뀐다(목록은 그대로). [적용]에만 목록에 옮기고, [취소] · 끌어 닫기는 버린다. [초기화]는 시트 안 값만 처음으로.
 */
export function FilterSheet({
  items,
  filter,
  order,
  today,
  onApply,
  onClose,
}: {
  items: readonly MyVideoItem[];
  filter: VideoFilter;
  order: VideoOrder;
  today: string;
  onApply: (f: VideoFilter, o: VideoOrder) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const [f, setF] = useState(filter);
  const [o, setO] = useState(order);
  const types = useMemo(() => recordTypes(items), [items]);
  const count = useMemo(() => filterVideos(items, f, today).length, [items, f, today]);
  return (
    <SheetFrame
      title="찾기 조건"
      onCancel={onClose}
      right={
        <Pressable accessibilityRole="button" onPress={() => { setF({ ...EMPTY_VIDEO_FILTER, text: f.text }); setO('new'); }} hitSlop={8}>
          <Text style={[TYPE.body, { color: c.link }]}>초기화</Text>
        </Pressable>
      }
      footer={
        <Press accessibilityRole="button" onPress={() => onApply(f, o)} style={[styles.apply, { backgroundColor: c.action }]}>
          <Text style={[TYPE.button, { color: '#fff' }]}>영상 {count}개 보기</Text>
        </Press>
      }
    >
      <Section title="종목">
        <Segmented options={SPORTS} value={f.sport ?? 'all'} onChange={(v) => setF({ ...f, sport: v === 'all' ? null : v })} label="종목" />
      </Section>
      <Section title="기간">
        <PeriodPicker value={f.period} onChange={(period) => setF({ ...f, period })} today={today} />
      </Section>
      <Section title="즐겨찾기">
        <View style={styles.chipWrap}>
          <Chip on={f.favoriteOnly} label="즐겨찾기만" onPress={() => setF({ ...f, favoriteOnly: !f.favoriteOnly })} />
        </View>
      </Section>
      <Section title="붙은 기록">
        <Segmented options={LINKED} value={f.linked} onChange={(linked) => setF({ ...f, linked })} label="기록 연결" />
        {types.length ? (
          <View style={styles.chipWrap}>
            {types.map((t) => (
              <Chip
                key={t.type}
                on={f.types.includes(t.type)}
                label={`${t.type} ${t.count}`}
                onPress={() => setF({ ...f, types: f.types.includes(t.type) ? f.types.filter((x) => x !== t.type) : [...f.types, t.type] })}
              />
            ))}
          </View>
        ) : (
          <Text style={[TYPE.sub, { color: c.muted }]}>기록에 붙은 영상이 아직 없어요.</Text>
        )}
        <Text style={[TYPE.sub, { color: c.muted }]}>영상이 기록 여럿에 붙었으면 그중 하나라도 맞으면 보여요.</Text>
      </Section>
      <Section title="정렬">
        <Segmented options={ORDERS} value={o} onChange={setO} label="정렬" />
      </Section>
    </SheetFrame>
  );
}

/** 기간만 빠르게 — 목록 위 '기간' 칩 */
export function PeriodSheet({ value, today, onApply, onClose }: { value: VideoFilter['period']; today: string; onApply: (p: VideoFilter['period']) => void; onClose: () => void }) {
  const c = usePalette();
  const [p, setP] = useState(value);
  return (
    <SheetFrame
      title="기간"
      onCancel={onClose}
      footer={
        <Press accessibilityRole="button" onPress={() => onApply(p)} style={[styles.apply, { backgroundColor: c.action }]}>
          <Text style={[TYPE.button, { color: '#fff' }]}>적용</Text>
        </Press>
      }
    >
      <PeriodPicker value={p} onChange={setP} today={today} />
    </SheetFrame>
  );
}

/**
 * 월로 이동 — 조건은 그대로 두고 목록에서 그 달로 굴린다(거르기가 아님). 그 달 영상이 지금 조건에 하나도 안 맞으면 까닭과 함께
 * '조건 지우고 이동'을 준다.
 */
export function MonthSheet({
  months,
  unknown,
  onJump,
  onClose,
}: {
  months: { ym: string; total: number; shown: number }[];
  unknown: { total: number; shown: number };
  onJump: (ym: string | null, clear: boolean) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const [blocked, setBlocked] = useState<{ ym: string | null; total: number } | null>(null);
  const row = (key: string, label: string, total: number, shown: number, ym: string | null) => (
    <Press
      key={key}
      accessibilityRole="button"
      accessibilityLabel={`${label}, 영상 ${total}개 중 지금 조건에 맞는 ${shown}개`}
      onPress={() => (shown > 0 ? onJump(ym, false) : setBlocked({ ym, total }))}
      style={[styles.monthRow, { backgroundColor: c.card }]}
    >
      <Text style={[TYPE.body, { flex: 1, color: shown > 0 ? c.ink : c.muted }]}>{label}</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>{shown === total ? `${total}개` : `${shown} / ${total}개`}</Text>
    </Press>
  );
  return (
    <SheetFrame title="월로 이동" onCancel={onClose}>
      <Text style={[TYPE.sub, { color: c.muted }]}>{"지금 찾기 조건은 그대로 두고 그 달로 굴려요. 숫자는 '조건에 맞는 수 / 그 달 전체'예요."}</Text>
      {blocked ? (
        <View style={[styles.blocked, { backgroundColor: withAlpha(c.warn, 0.12) }]}>
          <Text style={[TYPE.body, { color: c.ink }]}>
            {blocked.ym ? `${Number(blocked.ym.slice(5))}월` : '날짜 모름'} 영상 {blocked.total}개는 지금 조건에 맞지 않아요.
          </Text>
          <Press accessibilityRole="button" onPress={() => onJump(blocked.ym, true)} style={[styles.apply, { backgroundColor: c.action }]}>
            <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>조건 지우고 이동</Text>
          </Press>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        {months.map((m, i) => {
          const year = m.ym.slice(0, 4);
          const head =
            i === 0 || months[i - 1].ym.slice(0, 4) !== year ? (
              <Text key={`y${year}`} style={[TYPE.sub, { color: c.muted, fontWeight: '700', marginTop: 8 }]}>
                {year}년
              </Text>
            ) : null;
          return [head, row(m.ym, `${Number(m.ym.slice(5))}월`, m.total, m.shown, m.ym)];
        })}
        {unknown.total ? row('unknown', '촬영 날짜 모름', unknown.total, unknown.shown, null) : null}
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  star: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  starAt: { position: 'absolute', top: 4, right: 4 },
  thumb: { borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  flag: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, height: 20, borderRadius: 10, justifyContent: 'center' },
  durText: { color: '#fff', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cap: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 6 },
  meta: { fontSize: 12, lineHeight: 18 },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16 },
  listThumb: { width: 84, height: 112, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  listStar: { position: 'absolute', right: 8, top: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 18 },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, minHeight: 52 },
  sheetFoot: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  apply: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 24, paddingHorizontal: 16 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
  blocked: { gap: 10, padding: 12, borderRadius: 12 },
});

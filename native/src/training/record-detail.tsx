import { useRef, useState, type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { type Href, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { loadAppTrainingRecord } from '@/app/actions/app-training-parts';
import {
  validRecordDate,
  type RecordExercise,
  type WorkoutRecord,
} from '@/lib/workout/record-model';
import { monthCells, shiftMonth } from '~/records/model';
import { formatWeight } from '@/lib/units';
import { useWeightUnit } from '~/lib/weight-unit';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Bar, useLoad } from '~/community/parts';
import { Sheet } from '~/workout/sheets';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Pulse } from '~/shell/motion';
import { leave } from '~/mechanics/parts';
import { pushOpen } from '~/shell/release';
import { HistoryPanel } from './history';
import {
  ExerciseRecordCard,
  RecordButton,
  RecordLink,
  RecordNotice,
  rs,
} from './record-ui';
import { RecordEditors } from './record-editors';

type Loaded = Awaited<ReturnType<typeof loadAppTrainingRecord>>;
const dateLabel = (key: string) => {
  if (!validRecordDate(key)) return '날짜 확인';
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
};
const nameOf = (kind: WorkoutRecord['kind']) =>
  kind === 'armcare' ? '암케어 기록' : kind === 'drill' ? '메커니즘 기록' : '운동 기록';
export function TrainingRecordScreen({
  date,
  kind,
}: {
  date: string;
  kind: WorkoutRecord['kind'];
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const load = useLoad<Loaded>('app-training-parts.loadAppTrainingRecord', date, kind);
  const [refreshing, setRefreshing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState<'note' | 'checks' | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(date.slice(0, 7));
  const scroll = useRef<ScrollViewInstance>(null);
  const record = load.data?.record;
  const current = record?.date === date && record.kind === kind ? record : null;
  const reload = async () => {
    setRefreshing(true);
    try {
      await load.reload();
    } finally {
      setRefreshing(false);
    }
  };
  const pick = (key: string) => {
    setCalendar(false);
    setEdit(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ date: key });
  };
  const back = () => (router.canGoBack() ? router.back() : leave('/records'));
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        title={nameOf(kind)}
        back="뒤로"
        onBack={back}
        right={
          <Press
            accessibilityRole="button"
            accessibilityLabel="기록 메뉴"
            onPress={() => setMenu(true)}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="ellipsis" size={24} color={c.link} />
          </Press>
        }
        c={c}
      />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { padding: 18, paddingBottom: inset.bottom + 35 },
          READABLE,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />
        }
      >
        <Press
          disabled={!validRecordDate(date)}
          onPress={() => {
            setMonth(date.slice(0, 7));
            setCalendar(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="기록 날짜 선택"
          style={{
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            minHeight: 44,
            marginBottom: 12,
          }}
        >
          <Text style={[rs.small, { color: c.muted }]}>{dateLabel(date)}</Text>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </Press>
        {!current ? (
          load.error ? (
            <Empty icon="circle-alert" title="기록을 불러오지 못했어요." c={c}>
              <RecordButton label="다시 불러오기" onPress={() => void reload()} c={c} />
            </Empty>
          ) : load.data?.record === null ? (
            <Empty icon="calendar-days" title="날짜를 확인해 주세요." c={c} />
          ) : (
            <View accessibilityLabel="운동 기록을 불러오는 중">
              <Pulse
                style={{
                  height: 205,
                  borderRadius: 26,
                  backgroundColor: c.chip,
                  marginBottom: 25,
                }}
              />
              {[1, 2, 3, 4].map((i) => (
                <Pulse
                  key={i}
                  style={{
                    height: 82,
                    borderRadius: 23,
                    backgroundColor: c.chip,
                    marginBottom: 10,
                  }}
                />
              ))}
            </View>
          )
        ) : (
          <>
            {load.error ? (
              <RecordNotice c={c} retry={() => void reload()}>
                새 내용을 불러오지 못했어요. 이전에 확인한 기록을 보여드려요.
              </RecordNotice>
            ) : null}
            <RecordBody
              key={`${current.kind}:${current.date}`}
              record={current}
              c={c}
              reload={reload}
              edit={edit}
              onEdit={setEdit}
              onCalendar={() => {
                setMonth(date.slice(0, 7));
                setCalendar(true);
              }}
            />
          </>
        )}
      </ScrollView>
      <Sheet fit open={menu} onClose={() => setMenu(false)} title="기록 메뉴" c={c}>
        {kind === 'training' ? (
          <>
            <RecordLink
              label="강도 · 메모 수정"
              onPress={() => {
                setMenu(false);
                setEdit('note');
              }}
              disabled={!current?.editable || !current.noteKnown}
              c={c}
            />
            <RecordLink
              label="완료 표시 수정"
              onPress={() => {
                setMenu(false);
                setEdit('checks');
              }}
              disabled={
                !current?.editable ||
                !current.setsKnown ||
                current.session?.status === 'ACTIVE'
              }
              c={c}
            />
            {current && !current.editable ? (
              <Text style={[rs.small, { color: c.muted }]}>
                7일 이내 기록만 수정할 수 있어요.
              </Text>
            ) : null}
          </>
        ) : null}
        <RecordLink
          label="다시 불러오기"
          onPress={() => {
            setMenu(false);
            void reload();
          }}
          c={c}
        />
      </Sheet>
      <Sheet
        fit
        open={calendar}
        onClose={() => setCalendar(false)}
        title="날짜 선택"
        c={c}
      >
        <View style={rs.split}>
          <RecordLink
            label="이전 달"
            icon="chevron-left"
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            c={c}
          />
          <Text style={[rs.body, { color: c.ink, fontWeight: '700' }]}>
            {month.slice(0, 4)}년 {Number(month.slice(5))}월
          </Text>
          <RecordLink
            label="다음 달"
            icon="chevron-right"
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            c={c}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {'월화수목금토일'.split('').map((w) => (
            <Text
              key={w}
              style={[
                rs.small,
                {
                  width: '14.2857%',
                  textAlign: 'center',
                  color: c.muted,
                  paddingVertical: 8,
                },
              ]}
            >
              {w}
            </Text>
          ))}
          {validRecordDate(`${month}-01`)
            ? monthCells(month).map((d, i) =>
                d ? (
                  <Press
                    key={d}
                    accessibilityRole="button"
                    accessibilityLabel={dateLabel(d)}
                    accessibilityState={{ selected: d === date }}
                    onPress={() => pick(d)}
                    style={{
                      width: '14.2857%',
                      minHeight: 45,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: d === date ? c.action : 'transparent',
                    }}
                  >
                    <Text style={[rs.body, { color: d === date ? c.onAction : c.ink }]}>
                      {Number(d.slice(-2))}
                    </Text>
                  </Press>
                ) : (
                  <View key={i} style={{ width: '14.2857%' }} />
                )
              )
            : null}
        </View>
        {current ? (
          <RecordLink label="오늘" onPress={() => pick(current.today)} c={c} />
        ) : null}
      </Sheet>
    </View>
  );
}
function Empty({
  icon,
  title,
  children,
  c,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  c: Palette;
}) {
  return (
    <View style={rs.empty}>
      <View
        style={[
          rs.object,
          { backgroundColor: c.sky + '20', width: 76, height: 76, borderRadius: 26 },
        ]}
      >
        <Icon name={icon} size={34} color={c.link} />
      </View>
      <Text style={[rs.section, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      {children ? (
        <View style={{ alignSelf: 'stretch', marginTop: 12 }}>{children}</View>
      ) : null}
    </View>
  );
}
function RecordBody({
  record: r,
  c,
  reload,
  edit,
  onEdit,
  onCalendar,
}: {
  record: WorkoutRecord;
  c: Palette;
  reload: () => Promise<unknown>;
  edit: 'note' | 'checks' | null;
  onEdit: (v: 'note' | 'checks' | null) => void;
  onCalendar: () => void;
}) {
  const unit = useWeightUnit();
  const [open, setOpen] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [totals, setTotals] = useState(false);
  const [history, setHistory] = useState<RecordExercise | null>(null);
  const done = r.exercises.filter((e) => e.done);
  const missed = r.exercises.filter((e) => !e.done);
  const hasRaw = Boolean(r.setCount);
  const hasSummary = done.some(
    (e) =>
      e.setsDone != null ||
      e.repsDone != null ||
      e.holdSecondsDone != null ||
      e.weightKg != null
  );
  const empty = done.length === 0;
  const active = r.session?.status === 'ACTIVE';
  const endedEmpty = empty && r.session && !active;
  return (
    <>
      {empty && !r.setsKnown ? (
        <Empty icon="circle-alert" title="세트 기록 확인이 필요해요." c={c} />
      ) : empty && !active ? (
        <Empty
          icon="clipboard-list"
          title={
            endedEmpty
              ? '기록한 세트가 없어요.'
              : r.note
                ? '수행한 운동이 없어요.'
                : `이날 남긴 ${r.kind === 'training' ? '운동' : r.title} 기록이 없어요.`
          }
          c={c}
        >
          {endedEmpty ? (
            <Text style={[rs.small, { color: c.muted, textAlign: 'center' }]}>
              운동은 종료됐어요.
            </Text>
          ) : (
            <RecordButton label="다른 날짜 보기" onPress={onCalendar} c={c} />
          )}
        </Empty>
      ) : (
        <View style={[rs.hero, { backgroundColor: c.sky + '1c' }]}>
          <View style={rs.heroTop}>
            <View style={{ flex: 1, gap: 5 }}>
              {r.programLabel ? (
                <Text style={[rs.small, { color: c.muted }]}>{r.programLabel}</Text>
              ) : null}
              <Text style={[rs.title, { color: c.ink }]}>{r.title}</Text>
            </View>
            <View style={[rs.object, { backgroundColor: c.card, boxShadow: c.float }]}>
              <Icon
                name={
                  r.kind === 'drill'
                    ? 'focus'
                    : r.kind === 'armcare'
                      ? 'shield-plus'
                      : 'dumbbell'
                }
                size={31}
                color={c.link}
              />
            </View>
          </View>
          <View style={rs.stats}>
            {r.minutes != null && hasRaw ? (
              <Metric n={r.minutes} unit="분" label="본운동 시간" c={c} />
            ) : null}
            {hasRaw ? (
              <Metric n={r.setCount!} unit="세트" label="기록한 세트" c={c} />
            ) : null}
            <Metric
              n={done.length}
              unit="개"
              label={
                hasRaw ? '수행 운동' : r.kind === 'drill' ? '완료 드릴' : '완료 표시'
              }
              c={c}
            />
          </View>
          <View style={rs.status}>
            <Icon name={active ? 'pause' : 'circle-check'} size={16} color={c.link} />
            <Text style={[rs.small, { color: c.link, flex: 1 }]}>
              {active
                ? '진행 중 · 저장된 기록 기준'
                : r.session?.status === 'ABANDONED'
                  ? '종료된 운동의 기록'
                  : hasRaw
                    ? '운동 종료'
                    : hasSummary
                      ? '세트별 기록 없이 요약으로 남긴 날'
                      : '수치 없이 완료 표시한 기록'}
            </Text>
          </View>
        </View>
      )}
      {!r.setsKnown ? (
        <View style={{ marginTop: 12 }}>
          <RecordNotice c={c} retry={() => void reload()}>
            세트를 불러오지 못했어요. 확인된 요약을 보여드려요.
          </RecordNotice>
        </View>
      ) : null}
      {active && r.date === r.today ? (
        <View style={{ marginTop: 14 }}>
          <RecordButton
            label="운동 이어하기"
            onPress={() => pushOpen('/workout' as Href)}
            c={c}
          />
        </View>
      ) : null}
      {done.length ? (
        <>
          <View style={rs.sectionHead}>
            <Text style={[rs.section, { color: c.ink }]}>
              {r.kind === 'drill' ? '수행한 드릴' : '수행한 운동'}
            </Text>
            <Text style={[rs.small, { color: c.muted }]}>{done.length}개</Text>
          </View>
          {done.map((e, i) => (
            <ExerciseRecordCard
              key={e.id}
              exercise={e}
              index={i}
              open={open.includes(e.id)}
              onOpen={() => {
                void Haptics.selectionAsync();
                setOpen((prev) =>
                  prev.includes(e.id)
                    ? prev.filter((id) => id !== e.id)
                    : [...prev, e.id]
                );
              }}
              onHistory={() => setHistory(e)}
              c={c}
              unit={unit}
            />
          ))}
        </>
      ) : null}
      {missed.length ? (
        <View>
          <RecordLink
            label={`기록 없는 운동 ${missed.length}개 ${more ? '접기' : '보기'}`}
            onPress={() => setMore((v) => !v)}
            c={c}
          />
          {more
            ? missed.map((e) => (
                <View key={e.id} style={[rs.line, { borderColor: c.line }]}>
                  <Text style={[rs.body, { color: c.muted }]}>{e.title}</Text>
                  {e.planned ? (
                    <Text style={[rs.small, { color: c.muted }]}>계획 {e.planned}</Text>
                  ) : null}
                </View>
              ))
            : null}
        </View>
      ) : null}
      {r.kind === 'training' ? (
        <RecordEditors
          key={r.date}
          record={r}
          reload={reload}
          open={edit}
          onOpenNote={() => onEdit('note')}
          onClose={() => onEdit(null)}
          c={c}
        />
      ) : null}
      {hasRaw ? (
        <View style={{ marginTop: 10 }}>
          <RecordLink
            label={`추가 수치 ${totals ? '접기' : '보기'}`}
            onPress={() => setTotals((v) => !v)}
            c={c}
          />
          {totals ? (
            r.volumeKg ? (
              <View style={[rs.card, { backgroundColor: c.card }]}>
                <View style={rs.split}>
                  <Text style={[rs.small, { color: c.muted }]}>기록된 중량 볼륨</Text>
                  <Text style={[rs.body, { color: c.ink, fontWeight: '700' }]}>
                    {formatWeight(r.volumeKg, unit)}
                  </Text>
                </View>
                <Text style={[rs.tiny, { color: c.muted, marginTop: 10 }]}>
                  세트별 중량 × 횟수의 합계예요. 한 손 중량을 임의로 두 배 하지 않아요.
                </Text>
              </View>
            ) : (
              <Text style={[rs.small, { color: c.muted }]}>
                중량 기록이 없어 볼륨은 표시하지 않아요.
              </Text>
            )
          ) : null}
        </View>
      ) : null}
      <Sheet
        fit
        open={history != null}
        onClose={() => setHistory(null)}
        title={history?.title ?? '지난 기록'}
        description={`${dateLabel(r.date)} 이전 기록`}
        c={c}
      >
        {history ? (
          <HistoryPanel
            key={history.id}
            exerciseId={history.id}
            beforeDate={r.date}
            unit={unit}
            c={c}
            recentFirst
            hideNote
          />
        ) : null}
      </Sheet>
    </>
  );
}
function Metric({
  n,
  unit,
  label,
  c,
}: {
  n: number;
  unit: string;
  label: string;
  c: Palette;
}) {
  return (
    <View style={rs.stat}>
      <Text style={[rs.num, { color: c.ink }]}>
        {n}
        <Text style={[rs.small, { fontWeight: '600' }]}> {unit}</Text>
      </Text>
      <Text style={[rs.tiny, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

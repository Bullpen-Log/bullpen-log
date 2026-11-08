import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { readLabPractice, type LabJourney, type LabPractice } from '@/lib/lab-journey';
import { rpc } from '~/lib/rpc';
import { cacheEpoch, tryLoadJson, trySaveJson } from '~/lib/store';
import { TYPE, usePalette } from '~/lib/ui';
import { loadMe } from '~/pitch/api';
import { Press } from '~/shell/press';
import { DateNavButton } from '~/shell/mini-calendar';
import { todayKey } from '~/videos/text';

const requestId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

/** A practice note linked to one analysis, not an automatic workout prescription or load entry. */
export function LabPracticeCard({
  id,
  suggestedGoal,
}: {
  id: string;
  suggestedGoal: string;
}) {
  const c = usePalette();
  const [data, setData] = useState<LabJourney | null>(null);
  const [goal, setGoal] = useState(suggestedGoal);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey);
  const [key, setKey] = useState<string | null>(null);
  const [pending, setPending] = useState<LabPractice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const active = useRef(true);
  const lock = useRef(false);
  const epoch = useRef(cacheEpoch());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = () => active.current && epoch.current === cacheEpoch();
  const load = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const me = await loadMe();
      if (!current()) return;
      const draftKey = `sinker-lab-practice:${me.userId}:${id}`;
      const [next, saved] = await Promise.all([
        rpc<LabJourney>('pitch-lab.loadLabJourney', id),
        tryLoadJson(draftKey),
      ]);
      if (!current()) return;
      if (!saved.ok)
        throw Error('이 기기의 미확인 기록을 읽지 못했어요. 다시 확인해 주세요.');
      const draft = readLabPractice(saved.value);
      if (saved.value != null && !draft)
        throw Error(
          '이 기기의 미확인 기록을 확인할 수 없어요. 고객센터에 문의해 주세요.'
        );
      setKey(draftKey);
      setData(next);
      setPending(draft);
      if (draft) {
        setDate(draft.date);
        setGoal(draft.goal);
        setNote(draft.note);
      }
    } catch (e) {
      if (current())
        setMessage(e instanceof Error ? e.message : '연습 기록을 불러오지 못했어요.');
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const save = async () => {
    if (lock.current || !key || !data || !current()) return;
    const input =
      pending ?? readLabPractice({ id: requestId(), date, goal, note, savedAt: '' });
    if (!input) {
      setMessage('연습 목표와 날짜를 확인해 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (!(await trySaveJson(key, input)))
        throw Error('기기에 기록을 보관하지 못했어요. 저장 공간을 확인해 주세요.');
      if (!current()) return;
      setPending(input);
      const r = await rpc<{ ok: true } | { error: string }>(
        'pitch-lab.recordLabPractice',
        id,
        input
      );
      if (!current()) return;
      if ('error' in r) {
        if ((await trySaveJson(key, null)) && current()) setPending(null);
        throw Error(r.error);
      }
      const next = await rpc<LabJourney>('pitch-lab.loadLabJourney', id);
      if (!current()) return;
      if (!(await trySaveJson(key, null)))
        throw Error(
          '저장은 됐지만 기기의 대기 기록을 정리하지 못했어요. 다시 확인해 주세요.'
        );
      if (!current()) return;
      setPending(null);
      setNote('');
      setData(next);
      setMessage('연습 기록을 남겼어요. 다음 촬영에서 이 분석과 연결해 볼 수 있어요.');
    } catch (e) {
      if (current())
        setMessage(
          `${e instanceof Error ? e.message : '저장을 확인하지 못했어요.'} 입력 내용은 유지돼요.`
        );
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const link = (label: string, href: Href) => (
    <Press
      key={label}
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={[TYPE.body, { color: c.link }]}>{label} ›</Text>
    </Press>
  );
  const practiceRows = (rows: LabPractice[]) =>
    rows.map((p) => (
      <View
        key={p.id}
        style={{
          gap: 4,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: c.line,
        }}
      >
        <Text style={[TYPE.sub, { color: c.muted }]}>{p.date}</Text>
        <Text style={[TYPE.body, { color: c.ink }]}>{p.goal}</Text>
        {p.note ? <Text style={[TYPE.sub, { color: c.muted }]}>{p.note}</Text> : null}
      </View>
    ));
  return (
    <View style={{ backgroundColor: c.card, padding: 16, borderRadius: 18, gap: 12 }}>
      <Text style={[TYPE.card, { color: c.ink }]}>연습과 다시 촬영</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        이 분석을 보고 무엇을 연습했는지 남겨요. 운동 완료·투구수·훈련 계획은 바뀌지
        않아요.
      </Text>
      <Press
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void load()}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>
          {busy ? '확인 중…' : data ? '연습 기록 새로 확인' : '연습 기록 열기'}
        </Text>
      </Press>
      {data ? (
        <>
          {Object.entries(data.sourcePaths).map(([view, path]) =>
            link(`${view === 'side' ? '옆' : '뒤'} 원본과 영상 메모`, {
              pathname: '/my-videos/view',
              params: { path },
            } as Href)
          )}
          {data.previous ? (
            <View style={{ gap: 6 }}>
              {link('연습 기준이 된 이전 분석', `/lab/${data.previous.id}` as Href)}
              <Text style={[TYPE.sub, { color: c.muted }]}>
                이전 분석에 남긴 연습 {data.previous.practices.length}건
              </Text>
              {practiceRows(data.previous.practices.slice(0, 3))}
            </View>
          ) : null}
          <Text style={[TYPE.body, { color: c.ink }]}>연습한 날</Text>
          {!pending && !busy ? (
            <DateNavButton
              date={date}
              today={todayKey()}
              min="2000-01-01"
              marked={() => false}
              onPick={setDate}
            />
          ) : (
            <Text style={[TYPE.body, { color: c.ink }]}>{date}</Text>
          )}
          <TextInput
            accessibilityLabel="이번 연습 목표"
            placeholder="이번에 신경 쓴 동작 한 가지"
            placeholderTextColor={c.muted}
            value={goal}
            onChangeText={setGoal}
            maxLength={120}
            editable={!pending && !busy}
            multiline
            style={[
              TYPE.body,
              { color: c.ink, backgroundColor: c.page, borderRadius: 12, padding: 12 },
            ]}
          />
          <TextInput
            accessibilityLabel="연습 후 느낌"
            placeholder="연습한 내용과 달라진 느낌 · 선택"
            placeholderTextColor={c.muted}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            editable={!pending && !busy}
            multiline
            style={[
              TYPE.body,
              { color: c.ink, backgroundColor: c.page, borderRadius: 12, padding: 12 },
            ]}
          />
          {pending ? (
            <Text style={[TYPE.sub, { color: c.muted }]}>
              저장 여부를 확인할 기록이 있어요. 같은 내용으로 확인하며 중복 기록은
              만들지 않아요.
            </Text>
          ) : null}
          <Press
            accessibilityRole="button"
            disabled={busy || !goal.trim()}
            onPress={() => void save()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>
              {busy
                ? '확인 중…'
                : pending
                  ? '이 기록 저장 여부 다시 확인'
                  : '연습 기록 남기기'}
            </Text>
          </Press>
          <Text style={[TYPE.body, { color: c.ink }]}>
            이 분석 이후 연습 {data.practices.length}건
          </Text>
          {practiceRows(expanded ? data.practices : data.practices.slice(0, 3))}
          {data.practices.length > 3 ? (
            <Press
              accessibilityRole="button"
              onPress={() => setExpanded(!expanded)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[TYPE.sub, { color: c.link }]}>
                {expanded ? '접기' : '연습 기록 모두 보기'}
              </Text>
            </Press>
          ) : null}
          {link('연습 후 다시 촬영하기', {
            pathname: '/lab/new',
            params: { previousReportId: id },
          } as Href)}
          <Text style={[TYPE.sub, { color: c.muted }]}>
            같은 촬영 조건에서 새 영상을 골라 주세요. 분석은 최종 확인 후 요청돼요.
          </Text>
          {data.retakes.map((r) =>
            link(`${r.createdAt.slice(0, 10)} 다시 촬영한 분석`, `/lab/${r.id}` as Href)
          )}
        </>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[TYPE.sub, { color: c.ink }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

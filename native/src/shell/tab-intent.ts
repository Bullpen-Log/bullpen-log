import { useEffect, useRef } from 'react';
import { recordsIntent, type RecordsIntent } from '~/records/intent';

/**
 * 다른 탭의 날짜를 열어 달라는 부탁 — 웹은 주소(?date=)로 넘기지만 앱 탭은 판이 늘 붙어 있어 주소가 없다.
 * 홈 그날 칸의 '영양 탭에서 자세히'(그날 영양) · 투구 영상 달력(그날 칸을 연 채로)이 쓴다.
 * 부탁은 받는 탭이 아직 안 붙었으면 남겨 두었다가 붙을 때 꺼낸다.
 *
 * 기록 탭은 날짜만이 아니라 묶음 · 기록 하나 · '최근'까지 받는다(PITCH-RECORDS-MINIMAL01 R2) — openRecordsAt · useRecordsIntent.
 * 부탁마다 차례 번호가 붙어, 같은 부탁을 두 번 받지 않는다(이미 붙은 판 · 붙기 전 남긴 부탁 모두 한 번).
 */
type Tab = 'nutrition' | 'pitch' | 'records';
type DateTab = Exclude<Tab, 'records'>;
const pending = new Map<DateTab, string>();
const listeners = new Map<DateTab, Set<(date: string) => void>>();

export function openTabAt(tab: Tab, date: string) {
  /* 기록 탭은 날짜만 받아도 같은 약속으로(그날 · 전체) */
  if (tab === 'records') return openRecordsAt(recordsIntent({ date, category: 'all' }));
  const ls = listeners.get(tab);
  if (ls?.size) ls.forEach((l) => l(date));
  else pending.set(tab, date);
}

export function useTabIntent(tab: DateTab, cb: (date: string) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const l = (d: string) => ref.current(d);
    const set = listeners.get(tab) ?? new Set();
    set.add(l);
    listeners.set(tab, set);
    const left = pending.get(tab);
    if (left) {
      pending.delete(tab);
      l(left);
    }
    return () => {
      set.delete(l);
    };
  }, [tab]);
}

/* ---------------- 기록 탭 ---------------- */
let seq = 0;
let recordsPending: { seq: number; intent: RecordsIntent } | null = null;
const recordsListeners = new Set<(intent: RecordsIntent, seq: number) => void>();

/** 기록 탭에 부탁을 남긴다 — 판이 붙어 있으면 바로, 아니면 붙을 때. 마지막 부탁 하나만 남는다(앞의 것은 덮는다) */
export function openRecordsAt(intent: RecordsIntent) {
  const n = ++seq;
  if (recordsListeners.size) {
    recordsPending = null;
    recordsListeners.forEach((l) => l(intent, n));
  } else recordsPending = { seq: n, intent };
}

/**
 * 기록 탭 부탁 받기(훅 밖 — 시험이 그대로 부른다, scripts/native-records-intent-selftest.mts). 붙는 순간 남은 부탁을 한 번 꺼내 주고,
 * 같은 차례 번호는 두 번 주지 않는다. 떼는 함수를 돌려준다.
 */
export function subscribeRecordsIntent(cb: (intent: RecordsIntent) => void): () => void {
  let last = 0;
  const l = (i: RecordsIntent, n: number) => {
    if (n <= last) return;
    last = n;
    cb(i);
  };
  recordsListeners.add(l);
  const left = recordsPending;
  if (left) {
    recordsPending = null;
    l(left.intent, left.seq);
  }
  return () => {
    recordsListeners.delete(l);
  };
}

export function useRecordsIntent(cb: (intent: RecordsIntent) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => subscribeRecordsIntent((i) => ref.current(i)), []);
}

/** 로그아웃 · 계정이 바뀔 때 — 앞사람이 남긴 부탁이 다음 사람 화면을 옮기지 않게 */
export function clearTabIntents() {
  pending.clear();
  recordsPending = null;
}

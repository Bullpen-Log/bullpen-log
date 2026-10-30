import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { TrainingToday } from '@/lib/report/training-today-data';
import type { VariantKey } from '@/lib/program/program';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { leave } from '~/mechanics/parts';
import { outboxOwner } from '~/workout/outbox';

/**
 * 프로그램 상세 · 시작 준비 · 오늘 운동 준비(2026-10-30 확정 시안 01 · 02~04 · 05)가 같이 읽는 '오늘' — 트레이닝 운동 화면과 같은 곳
 * (app-training.loadAppTrainingToday → lib/report/training-today-data.ts). 판정 · 막힘 · 운동 줄은 다 서버 것이고, 화면은 고르기만 한다.
 * 받아 둔 값은 로그인 세대(cacheEpoch)가 같을 때만 먼저 보인다 — 다른 계정의 프로그램이 비치지 않게.
 */
type LoadResult = ({ ok: true } & TrainingToday) | { ok: false; to: string };

let memory: { epoch: number; data: TrainingToday } | null = null;

export function useTrainingToday() {
  const [data, setData] = useState<TrainingToday | null>(() => (memory?.epoch === cacheEpoch() ? memory.data : null));
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback((): Promise<TrainingToday | null> => {
    const e = cacheEpoch();
    return rpc<LoadResult>('app-training.loadAppTrainingToday').then(
      (r) => {
        if (e !== cacheEpoch()) return null;
        if (!r.ok) {
          leave(r.to);
          return null;
        }
        memory = { epoch: e, data: r };
        setData(r);
        setFailed(null);
        return r;
      },
      (err: unknown) => {
        if (err instanceof RpcError && err.code === 'redirect') {
          leave(err.to ?? '/login');
          return null;
        }
        setFailed(err instanceof RpcError && err.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 불러오지 못했어요.');
        return null;
      }
    );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, failed, reload: load };
}

/* ─────────────────────────── 시작 준비 초안 ─────────────────────────── */

/**
 * 시작 준비(02) · 운동 구성 확인(03) · 최종 확인(04)이 같이 고치는 초안 — 계정 · 프로그램마다 하나, 폰에 둔다. 앞뒤로 오가거나 나갔다 와도
 * 그대로, 다른 계정으로 바꾸면 그 계정 것만 읽는다. 등록이 끝나면 지운다. 생년월일은 폰에만 두고 로그 · 분석으로 보내지 않는다.
 */
export type PinPick = { id: string | null; title: string | null };

export type StartDraft = {
  perWeek: 2 | 3;
  birth: string;
  level: string | null;
  owned: string[];
  /** 고른 운동(칸 → 운동) — 구성 확인에서 받은 것과 사람이 바꾼 것 */
  pins: Partial<Record<VariantKey, PinPick>> | null;
  /** pins 를 받을 때의 조건(장비 · 경력 · 생년월일 · 주당 횟수) — 바뀌면 다시 받는다 */
  pinsFor: string | null;
  /** 사람이 이 조건의 구성을 확인했는가(최종 확인으로 넘어갈 때 true) */
  confirmed: boolean;
  /** 보낸 등록 요청 번호 — 답을 못 받았으면 같은 번호로 결과를 묻고 다시 보낸다 */
  requestId: string | null;
  /** 등록을 보냈는데 결과를 모른다 — 다시 와도 새로 등록하기 전에 결과부터 */
  pending: boolean;
};

const keyOf = (programId: string) => `bullpen-program-start:${outboxOwner() ?? 'anon'}:${programId}`;

export async function loadStartDraft(programId: string): Promise<StartDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(programId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StartDraft>;
    return {
      perWeek: v.perWeek === 2 ? 2 : 3,
      birth: typeof v.birth === 'string' ? v.birth : '',
      level: typeof v.level === 'string' ? v.level : null,
      owned: Array.isArray(v.owned) ? v.owned.filter((x): x is string => typeof x === 'string') : [],
      pins: v.pins && typeof v.pins === 'object' ? v.pins : null,
      pinsFor: typeof v.pinsFor === 'string' ? v.pinsFor : null,
      confirmed: v.confirmed === true,
      requestId: typeof v.requestId === 'string' ? v.requestId : null,
      pending: v.pending === true,
    };
  } catch {
    return null;
  }
}

export function saveStartDraft(programId: string, d: StartDraft) {
  void AsyncStorage.setItem(keyOf(programId), JSON.stringify(d)).catch(() => undefined);
}

export function clearStartDraft(programId: string) {
  void AsyncStorage.removeItem(keyOf(programId)).catch(() => undefined);
}

/** 등록 요청 번호 — 같은 요청을 다시 보내도 서버가 한 번만 등록한다 */
export function newRequestId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `ps-${Date.now().toString(36)}-${rand()}${rand()}`;
}

/** 구성을 받을 조건 — 이것이 바뀌면 고른 운동을 다시 확인한다 */
export function conditionsKey(d: Pick<StartDraft, 'owned' | 'level' | 'birth' | 'perWeek'>): string {
  return JSON.stringify([[...d.owned].sort(), d.level ?? '', d.birth, d.perWeek]);
}

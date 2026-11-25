'use client';

import { useEffect, useRef, useState } from 'react';
import { matchesSearch } from '@/lib/korean';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import type { ArmcareSwapOptions, ArmcareSwapRequest, ArmcareSwapTab } from './swap';

type Load = (request: ArmcareSwapRequest) => Promise<ArmcareSwapOptions | { error: string }>;
type Save = (request: ArmcareSwapRequest & { toId: string }) => Promise<{ item: PlayerItem } | { error: string }>;

export function useArmcareSwap(request: ArmcareSwapRequest, load: Load, save: Save, onDone: (item: PlayerItem) => void) {
  const [options, setOptions] = useState<ArmcareSwapOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [tab, setTab] = useState<ArmcareSwapTab>('similar');
  const [query, setQuery] = useState('');
  const changing = useRef(false);

  useEffect(() => {
    let live = true;
    void load(request).then(
      (result) => {
        if (!live) return;
        if ('error' in result) setLoadError(result.error);
        else setOptions(result);
      },
      () => {
        if (live) setLoadError('운동 목록을 불러오지 못했어요.');
      }
    );
    return () => { live = false; };
  }, [request, load, tries]);

  const retry = () => {
    setLoadError(null);
    setTries((count) => count + 1);
  };

  const choose = async (toId: string) => {
    if (changing.current) return;
    changing.current = true;
    setBusyId(toId);
    setError(null);
    try {
      const result = await save({ ...request, toId });
      if ('error' in result) setError(result.error);
      else onDone(result.item);
    } catch {
      setError('변경 결과를 확인하지 못했어요. 같은 운동을 다시 눌러 확인해 주세요.');
    } finally {
      changing.current = false;
      setBusyId(null);
    }
  };

  const picks = options?.picks ?? [];
  const searchText = query.trim();
  const rows = tab === 'similar'
    ? (options?.similar ?? []).flatMap(({ id, reason }) => {
        const exercise = picks.find((pick) => pick.id === id);
        return exercise ? [{ ...exercise, detail: reason }] : [];
      })
    : picks
        .filter((pick) => matchesSearch([pick.title, pick.area, pick.equipment].join(' '), searchText))
        .map((pick) => ({ ...pick, detail: [pick.area, pick.equipment].filter(Boolean).join(' · ') }));

  return { tab, setTab, query, setQuery, options, loadError, retry, error, busyId, changing, choose, rows };
}

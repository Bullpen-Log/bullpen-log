'use client';

import { useEffect, useState } from 'react';
import { loadHomeworkLibrary } from '@/app/actions/app-lesson';
import { Input } from '@/components/ui';
import { HOMEWORK_ITEMS_MAX } from '@/lib/org/homework';

/**
 * 웹 /manage 의 라이브러리 운동 · 드릴 고르기(숙제 내기 · 훈련 메뉴 · 수행일지가 같이 쓴다) — 앱 native/src/org/picker.tsx 와 같은 일.
 * 자료는 app-lesson.loadHomeworkLibrary(코치만).
 */
export type LibItem = { id: string; name: string; category: string };
export type Lib = { exercises: LibItem[]; drills: LibItem[] };
export type Pick = { id: string; kind: 'exercise' | 'drill'; name: string; sets: string; reps: string };

export function useLibrary(orgId: string): Lib | null {
  const [lib, setLib] = useState<Lib | null>(null);
  useEffect(() => {
    let alive = true;
    void loadHomeworkLibrary(orgId).then((r) => alive && r.ok && setLib({ exercises: r.exercises, drills: r.drills }));
    return () => {
      alive = false;
    };
  }, [orgId]);
  return lib;
}

/** 보낼 때 — 숙제 · 메뉴 칸 모양(lib/org/homework.ts cleanHomeworkItems) */
export const pickItems = (picks: readonly Pick[]) =>
  picks.map((p) => ({
    [p.kind === 'exercise' ? 'exerciseId' : 'guideId']: p.id,
    sets: p.sets ? Number(p.sets) : undefined,
    reps: p.reps ? Number(p.reps) : undefined,
  }));

/** 고른 것 — 세트 · 횟수(선택) */
export function PickedRows({ picks, setPicks }: { picks: Pick[]; setPicks: (f: (ps: Pick[]) => Pick[]) => void }) {
  const patch = (id: string, v: Partial<Pick>) => setPicks((ps) => ps.map((p) => (p.id === id ? { ...p, ...v } : p)));
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">
        고른 것 {picks.length}/{HOMEWORK_ITEMS_MAX} · 세트 · 횟수는 선택
      </p>
      {picks.length === 0 ? (
        <p className="text-xs text-muted">아래에서 운동이나 드릴을 골라요.</p>
      ) : (
        picks.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-ink">{p.name}</span>
            <Input className="w-16 px-2 py-1.5" inputMode="numeric" placeholder="세트" value={p.sets} onChange={(e) => patch(p.id, { sets: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            <Input className="w-16 px-2 py-1.5" inputMode="numeric" placeholder="회" value={p.reps} onChange={(e) => patch(p.id, { reps: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            <button type="button" aria-label={`${p.name} 빼기`} className="text-danger" onClick={() => setPicks((ps) => ps.filter((x) => x.id !== p.id))}>
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** 찾기 목록 — 누르면 고르고 다시 누르면 뺀다. exerciseOnly 면 운동만(수행일지) */
export function LibraryList({
  lib,
  picked,
  onToggle,
  exerciseOnly,
}: {
  lib: Lib | null;
  picked: (id: string) => boolean;
  onToggle: (it: LibItem, kind: 'exercise' | 'drill') => void;
  exerciseOnly?: boolean;
}) {
  const [chosen, setKind] = useState<'exercise' | 'drill'>('exercise');
  const [q, setQ] = useState('');
  const kind = exerciseOnly ? 'exercise' : chosen;
  const word = q.trim();
  const list = lib ? (kind === 'exercise' ? lib.exercises : lib.drills) : [];
  const shown = list.filter((x) => !word || x.name.includes(word) || x.category.includes(word)).slice(0, 40);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {exerciseOnly
          ? null
          : (['exercise', 'drill'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${k === kind ? 'bg-sky text-white' : 'bg-ink/6 text-ink'}`}
              >
                {k === 'exercise' ? '운동' : '드릴'}
              </button>
            ))}
        <Input className="flex-1 py-1.5" placeholder="이름 · 분류로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!lib ? (
        <p className="text-xs text-muted">라이브러리를 불러오는 중…</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {shown.map((x) => (
            <li key={x.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={picked(x.id)} onChange={() => onToggle(x, kind)} />
                <span className="flex-1 text-ink">{x.name}</span>
                <span className="text-xs text-muted">{x.category}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-3 py-2 text-xs text-muted">맞는 것이 없어요.</li> : null}
        </ul>
      )}
    </div>
  );
}

/** 고르기 토글 — 최대 개수까지 */
export function togglePick(ps: Pick[], it: LibItem, kind: 'exercise' | 'drill', max = HOMEWORK_ITEMS_MAX): Pick[] {
  return ps.some((p) => p.id === it.id) ? ps.filter((p) => p.id !== it.id) : ps.length >= max ? ps : [...ps, { id: it.id, kind, name: it.name, sets: '', reps: '' }];
}

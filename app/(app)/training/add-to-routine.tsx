'use client';

import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { Modal } from '@/components/modal';
import { addToMyArmcareRoutine } from '@/app/actions/armcare';
import { MY_ROUTINE_MAX, MY_ROUTINE_MAX_ITEMS } from '@/lib/armcare/my-routines';

/**
 * 부위별 보강(운동 목록 · 3D 근육 지도)에서 운동을 내 루틴에 담는 단추.
 *
 * 운동을 고르는 곳은 운동을 설명하는 곳과 같아야 한다 — "이 근육을 키우는 운동이구나"
 * 하고 읽은 그 자리에서 담는다. 루틴을 만드는 화면(routine/[id])에도 고르는 목록이
 * 있지만, 거기서는 설명 없이 이름만 훑게 된다.
 *
 * 루틴 목록은 칸을 그릴 때 서버가 한 번 넘겨 준다(Provider). 담으면 이 화면 안에서
 * 바로 ✓ 로 바꾸고, 서버도 화면을 다시 그려 보낸다.
 */

export type RoutineChoice = { id: string; name: string; exerciseIds: string[] };

const RoutinesContext = createContext<RoutineChoice[] | null>(null);

export function MyRoutinesProvider({
  routines,
  children,
}: {
  routines: RoutineChoice[];
  children: ReactNode;
}) {
  return (
    <RoutinesContext.Provider value={routines}>{children}</RoutinesContext.Provider>
  );
}

export function AddToRoutine({
  exerciseId,
  title,
}: {
  exerciseId: string;
  title: string;
}) {
  const routines = useContext(RoutinesContext);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  /* 이 창에서 담은 것 — 서버가 다시 그려 보내기 전에도 ✓ 가 보이게 */
  const [addedTo, setAddedTo] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  /* 암케어 칸 밖(Provider 없음)에서는 그리지 않는다 */
  if (!routines) return null;

  const contains = (r: RoutineChoice) =>
    r.exerciseIds.includes(exerciseId) || addedTo.includes(r.id);

  const add = (r: RoutineChoice) => {
    setMessage(undefined);
    startTransition(async () => {
      const res = await addToMyArmcareRoutine(r.id, exerciseId);
      if ('error' in res) {
        setMessage(res.error);
        return;
      }
      setAddedTo((prev) => [...prev, r.id]);
      setMessage(
        res.added ? `'${r.name}'에 담았습니다.` : `'${r.name}'에 이미 있습니다.`
      );
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
          setMessage(undefined);
          setOpen(true);
        }}
        aria-label={`${title} 내 루틴에 담기`}
        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-sky hover:text-sky"
      >
        <Plus aria-hidden className="h-3 w-3" />
        담기
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        origin={origin}
        title="내 루틴에 담기"
        description={title}
      >
        <div className="space-y-3">
          {routines.length === 0 ? (
            <p className="text-sm leading-relaxed break-keep text-muted">
              아직 만든 루틴이 없습니다. 이 운동으로 새 루틴을 시작해 보세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {routines.map((r) => {
                const inside = contains(r);
                const full = !inside && r.exerciseIds.length >= MY_ROUTINE_MAX_ITEMS;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => add(r)}
                      disabled={pending || inside || full}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-default ${
                        inside
                          ? 'border-sky bg-sky-tint text-sky-strong'
                          : 'border-line hover:border-sky'
                      }`}
                    >
                      <span className="min-w-0 font-semibold break-keep">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {inside ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-sky-strong">
                            <Check aria-hidden className="h-3.5 w-3.5" /> 담김
                          </span>
                        ) : full ? (
                          `${MY_ROUTINE_MAX_ITEMS}개 꽉 참`
                        ) : (
                          `운동 ${r.exerciseIds.length}개`
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {message && <p className="text-sm break-keep text-sky-strong">{message}</p>}

          {routines.length < MY_ROUTINE_MAX && (
            <Link
              href={`/training/routine/new?add=${exerciseId}`}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              <Plus aria-hidden className="h-4 w-4" />이 운동으로 새 루틴 만들기
            </Link>
          )}
        </div>
      </Modal>
    </>
  );
}

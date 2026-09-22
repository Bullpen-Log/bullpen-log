'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import {
  addWarmupItem,
  moveWarmupItem,
  removeWarmupItem,
  updateWarmupRoutine,
} from '@/app/actions/warmup';
import { Button, Card, EmptyState, Field, FormError, Input } from '@/components/ui';

/**
 * 고정 워밍업 루틴 화면.
 *
 * 루틴 넷은 늘 네 장으로 보인다. 비어 있어도 감추지 않는다 — 무엇을 채워야
 * 하는지가 이 화면의 요점이고, 빈 칸이 그 자체로 할 일 목록이다.
 */

export type RoutineItem = {
  exerciseId: string;
  title: string;
  prescription: string | null;
  thumbUrl: string | null;
};

export type RoutineCard = {
  id: string;
  /** LOWER · UPPER_PUSH · UPPER_PULL · COMMON */
  kind: string;
  name: string;
  description: string;
  items: RoutineItem[];
};

export type PickableExercise = {
  id: string;
  title: string;
  prescription: string | null;
  thumbUrl: string | null;
};

/** 어느 날에 이 루틴이 뜨는지 — 사람 말로 */
const WHEN: Record<string, string> = {
  COMMON: '어느 날이든',
  LOWER: '하체 운동을 하는 날',
  UPPER_PUSH: '미는 운동을 하는 날',
  UPPER_PULL: '당기는 운동을 하는 날',
};

function Thumb({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden
      className="h-10 w-16 shrink-0 rounded-md bg-surface-2 object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10px] text-muted"
    >
      {title.slice(0, 2)}
    </span>
  );
}

/** 이름과 한 줄 설명을 고치는 칸 */
function NameForm({ routine, onDone }: { routine: RoutineCard; onDone: () => void }) {
  const [state, action] = useActionState(updateWarmupRoutine, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={routine.id} />
      <Field label="이름">
        <Input name="name" defaultValue={routine.name} required />
      </Field>
      <Field label="한 줄 설명" hint="카드에 작게 적힙니다. 비워도 됩니다.">
        <Input name="description" defaultValue={routine.description} />
      </Field>
      <FormError>{state?.error}</FormError>
      <div className="flex items-center gap-2">
        <Button type="submit">저장</Button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          닫기
        </button>
      </div>
    </form>
  );
}

/** 루틴에 담을 운동을 고르는 칸 */
function Picker({
  routine,
  pickable,
  onDone,
}: {
  routine: RoutineCard;
  pickable: PickableExercise[];
  onDone: () => void;
}) {
  const already = new Set(routine.items.map((i) => i.exerciseId));
  const rest = pickable.filter((ex) => !already.has(ex.id));

  if (pickable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center">
        <p className="text-sm text-muted">아직 워밍업 운동이 하나도 없습니다.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          <Link
            href="/library/training"
            className="text-sky underline-offset-2 hover:underline"
          >
            운동 영상
          </Link>
          에서 카테고리를 <strong className="text-ink">워밍업</strong>으로 골라 올리시면
          여기에 나옵니다.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 text-xs text-muted transition-colors hover:text-ink"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line-strong p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">담을 운동 고르기</p>
        <button
          type="button"
          onClick={onDone}
          aria-label="닫기"
          className="rounded-lg p-1 text-muted transition-colors hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {rest.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted">
          있는 워밍업 운동을 모두 담았습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rest.map((ex) => (
            <li key={ex.id}>
              <form action={addWarmupItem} className="flex items-center gap-2.5">
                <input type="hidden" name="routineId" value={routine.id} />
                <input type="hidden" name="exerciseId" value={ex.id} />
                <Thumb url={ex.thumbUrl} title={ex.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{ex.title}</span>
                  {ex.prescription && (
                    <span className="block truncate text-[11px] text-muted">
                      {ex.prescription}
                    </span>
                  )}
                </span>
                <button
                  type="submit"
                  aria-label={`${ex.title} 담기`}
                  className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
                >
                  <Plus className="mr-1 inline h-3 w-3" />
                  담기
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutineBlock({
  routine,
  pickable,
  isAdmin,
}: {
  routine: RoutineCard;
  pickable: PickableExercise[];
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      {editing ? (
        <NameForm routine={routine} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">{routine.name}</h2>
              <span className="rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                {WHEN[routine.kind] ?? routine.kind}
              </span>
            </div>
            {routine.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {routine.description}
              </p>
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`${routine.name} 이름 고치기`}
              className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-sky"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {routine.items.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
          아직 담긴 운동이 없습니다. 이 루틴은 운동을 담기 전까지 화면에 안 나옵니다.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {routine.items.map((item, i) => (
            <li
              key={item.exerciseId}
              className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2"
            >
              <span className="w-4 shrink-0 text-center text-[11px] text-muted">
                {i + 1}
              </span>
              <Thumb url={item.thumbUrl} title={item.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{item.title}</span>
                {item.prescription && (
                  <span className="block truncate text-[11px] text-muted">
                    {item.prescription}
                  </span>
                )}
              </span>

              {isAdmin && (
                <span className="flex shrink-0 items-center gap-0.5">
                  {[
                    { dir: 'up', Icon: ChevronUp, off: i === 0, label: '위로' },
                    {
                      dir: 'down',
                      Icon: ChevronDown,
                      off: i === routine.items.length - 1,
                      label: '아래로',
                    },
                  ].map(({ dir, Icon, off, label }) => (
                    <form key={dir} action={moveWarmupItem}>
                      <input type="hidden" name="routineId" value={routine.id} />
                      <input type="hidden" name="exerciseId" value={item.exerciseId} />
                      <input type="hidden" name="direction" value={dir} />
                      <button
                        type="submit"
                        disabled={off}
                        aria-label={`${item.title} ${label}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:text-sky disabled:opacity-30"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ))}
                  <form action={removeWarmupItem}>
                    <input type="hidden" name="routineId" value={routine.id} />
                    <input type="hidden" name="exerciseId" value={item.exerciseId} />
                    <button
                      type="submit"
                      aria-label={`${item.title} 빼기`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-warn"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {isAdmin &&
        (picking ? (
          <Picker
            routine={routine}
            pickable={pickable}
            onDone={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="w-full rounded-xl border border-dashed border-line-strong py-2.5 text-xs font-semibold text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            운동 담기
          </button>
        ))}
    </Card>
  );
}

export function WarmupClient({
  routines,
  pickable,
  isAdmin,
}: {
  routines: RoutineCard[];
  pickable: PickableExercise[];
  isAdmin: boolean;
}) {
  if (routines.length === 0) {
    return (
      <EmptyState
        title="워밍업 루틴이 없습니다"
        description="루틴은 설치할 때 함께 만들어집니다. 이 화면이 비어 있으면 관리자에게 알려주세요."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-soft/50 bg-sky-tint px-5 py-4">
        <p className="text-sm font-bold text-sky-strong">워밍업은 고정입니다</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink/80">
          날마다 새로 뽑지 않습니다. 운동을 시작하면 본운동에 들어가기 전에
          <strong className="text-ink"> 오늘 목적에 맞는 루틴 하나</strong>와
          <strong className="text-ink"> 전신 루틴</strong>이 뜹니다. 한 것은 체크만
          하고,{' '}
          <strong className="text-ink">운동 시간과 운동량에는 안 들어갑니다.</strong>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          회복하는 날에는 워밍업이 아예 나오지 않습니다.
        </p>
      </div>

      {routines.map((r) => (
        <RoutineBlock key={r.id} routine={r} pickable={pickable} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

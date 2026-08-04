'use client';

import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

export function AdminPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-sky-soft/40 bg-sky/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-6 py-5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky text-white">
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        </span>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-sky">
          Admin
        </span>
      </button>

      {open && <div className="border-t border-sky-soft/25 px-6 py-6">{children}</div>}
    </div>
  );
}

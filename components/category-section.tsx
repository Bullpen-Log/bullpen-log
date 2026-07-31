'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

/**
 * 카테고리 하나를 감싸는 접이식 섹션.
 * 기본은 닫힌 상태이고, 헤더를 눌러야 안쪽 영상 목록이 열린다.
 * 관리자에게만 "영상 추가" 버튼과 등록 폼이 보인다.
 */
export function CategorySection({
  name,
  desc,
  count,
  isAdmin,
  form,
  children,
}: {
  name: string;
  desc: string;
  count: number;
  isAdmin: boolean;
  form: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const panelId = `panel-${encodeURIComponent(name)}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-surface-2 sm:p-6"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-bold text-cream">{name}</span>
              <span className="text-xs text-muted">{count}개</span>
            </span>
            <span className="mt-1 block text-sm text-muted">{desc}</span>
          </span>

          <ChevronDown
            className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${
              open ? 'rotate-180 text-gold' : ''
            }`}
          />
        </button>
      </h2>

      {open && (
        <div id={panelId} className="border-t border-line p-5 sm:p-6">
          {isAdmin && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setFormOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gold-dim/60 bg-gold/[0.06] px-3 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/15"
              >
                {formOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {formOpen ? '닫기' : '영상 추가'}
              </button>

              {formOpen && (
                <div className="mt-4 rounded-2xl border border-gold-dim/40 bg-gold/[0.04] p-5 sm:p-6">
                  {form}
                </div>
              )}
            </div>
          )}

          {children}
        </div>
      )}
    </section>
  );
}

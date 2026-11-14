'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from '@/components/icon';
import { Button, Input } from '@/components/ui';
import { ANALYSIS_STATUS_TEXT, INVITATION_STATUS_TEXT, PUBLICATION_STATUS_TEXT, SUBMISSION_STATUS_TEXT } from '@/lib/intake/admin-labels';
import type { IntakeAdminPerson, IntakeListFilters } from '@/lib/intake/admin';

const BASE = '/admin/intake';
const SELECT = 'min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink';

type Key = 'status' | 'analysis' | 'publication' | 'invitation' | 'assignee';

/** 거름 조건 → 주소. 쪽 번호는 조건이 바뀌면 지운다 */
function hrefOf(f: IntakeListFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const k of ['status', 'analysis', 'publication', 'invitation', 'assignee'] as const) {
    const v = f[k];
    if (v) p.set(k, v);
  }
  if (f.unread) p.set('unread', '1');
  const s = p.toString();
  return s ? `${BASE}?${s}` : BASE;
}

function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Record<string, string>;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[13px] leading-5 text-muted">{label}</span>
      <select
        className={SELECT}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">전체</option>
        {Object.entries(options).map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 찾기 · 거르기 — 값은 주소에 둔다(새로고침 · 공유해도 같은 목록). 서버가 모르는 값은 버린다 */
export function IntakeFilters({ filters, admins, me }: { filters: IntakeListFilters; admins: IntakeAdminPerson[]; me: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(filters.q ?? '');

  const go = (next: IntakeListFilters) => start(() => router.replace(hrefOf({ ...next, page: 1 }), { scroll: false }));
  const set = (key: Key, value: string | null) => go({ ...filters, q: q.trim() || null, [key]: value });
  const search = (e: FormEvent) => {
    e.preventDefault();
    go({ ...filters, q: q.trim() || null });
  };

  const assignees: Record<string, string> = { me: '나', none: '담당 없음' };
  for (const a of admins) if (a.id !== me) assignees[a.id] = a.name;
  const filtered = filters.q || filters.status || filters.analysis || filters.publication || filters.invitation || filters.assignee || filters.unread;

  return (
    <div className="stack-block" aria-busy={pending}>
      <form role="search" onSubmit={search} className="flex gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 · 접수 번호 · 보낸 분 · 초대 메모"
          aria-label="접수 찾기"
          maxLength={60}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" size="sm" aria-label="찾기">
          <Search aria-hidden className="h-4 w-4" />
          찾기
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Pick label="검증" value={filters.status} options={SUBMISSION_STATUS_TEXT} onChange={(v) => set('status', v)} />
        <Pick label="분석" value={filters.analysis} options={ANALYSIS_STATUS_TEXT} onChange={(v) => set('analysis', v)} />
        <Pick label="공개" value={filters.publication} options={PUBLICATION_STATUS_TEXT} onChange={(v) => set('publication', v)} />
        <Pick label="담당" value={filters.assignee} options={assignees} onChange={(v) => set('assignee', v)} />
        <Pick label="초대" value={filters.invitation} options={INVITATION_STATUS_TEXT} onChange={(v) => set('invitation', v)} />
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-ink">
          <input type="checkbox" checked={filters.unread} onChange={(e) => go({ ...filters, q: q.trim() || null, unread: e.target.checked })} className="h-4 w-4 accent-(--color-sky)" />
          안 읽은 것만
        </label>
        {filtered && (
          <Link href={BASE} data-nav="none" scroll={false} onClick={() => setQ('')} className="inline-flex min-h-10 items-center text-muted underline-offset-2 hover:text-ink hover:underline">
            거름 지우기
          </Link>
        )}
      </div>
    </div>
  );
}

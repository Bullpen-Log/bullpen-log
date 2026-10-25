'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadInbox, resolveComment, type InboxItem } from '@/app/actions/app-lesson';
import { Card } from '@/components/ui';
import { toast } from '@/components/toast';
import { COMMENT_KIND_LABEL } from '@/lib/org/comments';

/**
 * 웹 /manage 홈의 '받은 것'(2단계) — 회원이 일지 · 숙제에 남긴 질문 · 정정 요청 · 숙제 영상 가운데 안 푼 것. 앱 코치 오늘 탭과 같다(app-lesson.loadInbox).
 * 누르면 회원 카드, 답 없이 처리했으면 '풀었어요'. 하나도 없으면 안 그린다.
 */
export function InboxCard({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadInbox(orgId).then((r) => alive && r.ok && setItems(r.items));
    return () => {
      alive = false;
    };
  }, [orgId, version]);
  if (!items || items.length === 0) return null;
  const resolve = async (id: string) => {
    const r = await resolveComment(orgId, id);
    if (!r.ok) return toast(r.error ?? '처리하지 못했어요.');
    setVersion((v) => v + 1);
  };
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-ink">받은 것 {items.length}</h2>
      <Card className="divide-y divide-line p-0">
        {items.map((m) => (
          <div key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <Link href={`/manage/players/${m.memberId}`} className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${m.kind === 'fix' ? 'text-warn' : 'text-sky-strong'}`}>
                {m.nickname} · {COMMENT_KIND_LABEL[m.kind]} · {m.where}
              </p>
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-ink">{m.body}</p>
            </Link>
            <button type="button" className="shrink-0 text-xs font-semibold text-muted" onClick={() => void resolve(m.id)}>
              풀었어요
            </button>
          </div>
        ))}
      </Card>
    </section>
  );
}

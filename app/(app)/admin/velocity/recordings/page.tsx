import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { requirePermission } from '@/lib/dal';
import { loadVelocityRecordings } from '@/lib/velocity-recording-load';
import { BackLink, EmptyState, PageHeading } from '@/components/ui';
import { RecordingList } from './recording-list';

/** 녹화 칸 — 세션 녹화(측정하는 동안 통째로) · 엔진 개발용 녹화(측정 없이 따로 찍은 원본) */
export type RecordingKind = 'session' | 'dev';
export const recordingsHref = (kind: RecordingKind) =>
  `/admin/velocity/recordings?kind=${kind}`;

const KINDS: {
  key: RecordingKind;
  label: string;
  description: string;
  empty: string;
}[] = [
  {
    key: 'session',
    label: '세션 녹화',
    description:
      '측정하는 동안 카메라 영상을 통째로 올린 것이에요. 측정된 공과 따로, 놓친 공까지 다시 볼 수 있어요. 녹화를 열면 조각마다 영상이 나와요.',
    empty: "측정 화면의 관리자 칩 '세션 녹화 켬'으로 재면 여기에 쌓여요.",
  },
  {
    key: 'dev',
    label: '엔진 개발용 녹화',
    description:
      '측정이 안 돼도 찍어 둔 원본 영상이에요. 녹화를 열어 공마다 범위를 잡고 스피드건 값을 적은 뒤 지금 모델로 다시 재요.',
    empty:
      "측정 화면 왼쪽 관리자 단추 → 관리자 설정 → '엔진 개발용 녹화'를 켜면 시작 단추가 녹화 단추가 돼요.",
  },
];

/**
 * 녹화 목록(관리자) — 세션 녹화와 엔진 개발용 녹화를 칸으로 가른다(2026-10-18 사용자: "세션 녹화는 측정된 것과는 별개로 볼 수 있게").
 * 하나를 누르면 편집기(./[id])에서 조각 영상을 보고, 공마다 범위를 잡고 스피드건 값을 적는다. 주소 ?kind=session|dev(없으면 세션 녹화).
 */
export default async function VelocityRecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  await requirePermission('recording');
  const { kind: raw } = await searchParams;
  const kind: RecordingKind = raw === 'dev' ? 'dev' : 'session';
  const all = await loadVelocityRecordings();
  const rows = all.filter((r) => (kind === 'session' ? r.session : !r.session));
  const here = KINDS.find((k) => k.key === kind)!;
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/admin/velocity">구속 측정 관리자</BackLink>
        <PageHeading title={here.label} description={here.description} />
      </div>
      <nav aria-label="녹화 종류" className="flex gap-2">
        {KINDS.map((k) => {
          const n = all.filter((r) =>
            k.key === 'session' ? r.session : !r.session
          ).length;
          const on = k.key === kind;
          return (
            <Link
              key={k.key}
              href={recordingsHref(k.key)}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold tabular-nums transition-colors ${
                on ? 'bg-sky text-white' : 'bg-ink/6 text-ink hover:text-sky'
              }`}
            >
              {k.label} {n}
            </Link>
          );
        })}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title="아직 녹화가 없어요"
          description={here.empty}
        />
      ) : (
        <RecordingList rows={rows} />
      )}
    </div>
  );
}

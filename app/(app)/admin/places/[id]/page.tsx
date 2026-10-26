import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadCandidate } from '@/lib/market/candidate-load';
import { CandidateDetail } from './candidate-detail';

export const metadata: Metadata = { title: '수집 후보' };

/** 수집 후보 하나(2026-10-26, 대표관리자만 — loadCandidate 가 requireAdmin) */
export default async function AdminPlacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ coords?: string }> }) {
  const { id } = await params;
  const { coords } = await searchParams;
  const got = await loadCandidate(decodeURIComponent(id));
  if (!got) notFound();
  return <CandidateDetail {...got} coords={coords} />;
}

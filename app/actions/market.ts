'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { deleteVideos, isOwnedBy } from '@/lib/storage';
import { withInput, type FormValues } from '@/lib/form-values';
import { REPORT_DETAIL_MAX, isReportReason } from '@/lib/community';
import {
  BODY_MAX,
  MAX_IMAGES,
  TITLE_MAX,
  isCategory,
  isCondition,
  isRegion,
  isStatus,
  parsePrice,
  parseSpecs,
} from '@/lib/market/specs';

/**
 * 덕아웃 장터 쓰기(2026-10-20) — 올리기 · 고치기 · 상태 · 지우기 · 찜 · 신고. 모두 requireUser. 보기는 lib/market/load.ts(로그인 없이).
 * 사진은 브라우저가 저장소로 바로 올린 경로(app/api/market/upload-url)만 받는다 — 내 폴더 안인지(isOwnedBy) 여기서 본다.
 */

export type MarketState = { error?: string; values?: FormValues } | undefined;

function readListing(formData: FormData, userId: string) {
  const category = String(formData.get('category') ?? '');
  if (!isCategory(category)) return { error: '품목을 골라 주세요.' };
  const title = String(formData.get('title') ?? '').trim();
  if (title.length < 2)
    return { error: '제목을 2자 이상 적어 주세요.', field: 'title' };
  if (title.length > TITLE_MAX) return { error: `제목은 ${TITLE_MAX}자까지예요.` };
  const price = parsePrice(String(formData.get('price') ?? ''));
  if (price == null) return { error: '가격을 숫자로 적어 주세요. 나눔은 0.' };
  const condition = String(formData.get('condition') ?? '');
  if (!isCondition(condition)) return { error: '상태를 골라 주세요.' };
  const region = String(formData.get('region') ?? '');
  if (!isRegion(region)) return { error: '지역을 골라 주세요.' };
  const body = String(formData.get('body') ?? '').trim();
  if (body.length > BODY_MAX) return { error: `설명은 ${BODY_MAX}자까지예요.` };
  const specs = parseSpecs(category, (n) => formData.get(n));
  if ('error' in specs) return { error: specs.error };
  const images = formData
    .getAll('images')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
  if (images.some((p) => !isOwnedBy(p, userId)))
    return { error: '사진 경로가 올바르지 않아요. 다시 올려 주세요.' };
  return {
    data: {
      category,
      title,
      price,
      condition,
      region,
      body,
      specs: specs.specs,
      images,
    },
  };
}

export async function createListing(
  _prev: MarketState,
  formData: FormData
): Promise<MarketState> {
  const user = await requireUser();
  const read = readListing(formData, user.id);
  if ('error' in read) return withInput({ error: read.error }, formData);
  if (read.data.images.length === 0)
    return withInput({ error: '사진을 한 장 이상 올려 주세요.' }, formData);
  const created = await prisma.listing.create({
    data: { ...read.data, userId: user.id },
    select: { id: true },
  });
  revalidatePath('/', 'layout');
  redirect(`/market/${created.id}`);
}

export async function updateListing(
  _prev: MarketState,
  formData: FormData
): Promise<MarketState> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const found = await prisma.listing.findUnique({
    where: { id },
    select: { userId: true, images: true },
  });
  if (!found || found.userId !== user.id) return { error: '내 물건이 아니에요.' };
  const read = readListing(formData, user.id);
  if ('error' in read) return withInput({ error: read.error }, formData);
  if (read.data.images.length === 0)
    return withInput({ error: '사진을 한 장 이상 올려 주세요.' }, formData);
  await prisma.listing.update({ where: { id }, data: read.data });
  /* 뺀 사진은 저장소에서도 지운다 */
  const removed = found.images.filter((p) => !read.data.images.includes(p));
  if (removed.length) await deleteVideos(removed).catch(() => undefined);
  revalidatePath('/', 'layout');
  redirect(`/market/${id}`);
}

/** 판매 중 · 예약 중 · 거래 완료 */
export async function setListingStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!isStatus(status)) return;
  const found = await prisma.listing.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!found || found.userId !== user.id) return;
  await prisma.listing.update({ where: { id }, data: { status } });
  revalidatePath('/', 'layout');
}

export async function deleteListing(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const found = await prisma.listing.findUnique({
    where: { id },
    select: { userId: true, images: true },
  });
  if (!found || (found.userId !== user.id && user.role !== 'ADMIN')) return;
  await prisma.listing.delete({ where: { id } });
  if (found.images.length) await deleteVideos(found.images).catch(() => undefined);
  revalidatePath('/', 'layout');
  redirect('/me');
}

/** 찜 — 있으면 빼고 없으면 더한다. 돌려주는 값은 지금 상태 */
export async function toggleFavorite(
  formData: FormData
): Promise<{ favorite: boolean } | undefined> {
  const user = await requireUser();
  const listingId = String(formData.get('id') ?? '');
  const found = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, hiddenAt: true },
  });
  if (!found || found.hiddenAt) return;
  const key = { listingId_userId: { listingId, userId: user.id } };
  const had = await prisma.listingFavorite.findUnique({
    where: key,
    select: { listingId: true },
  });
  if (had) await prisma.listingFavorite.delete({ where: key });
  else await prisma.listingFavorite.create({ data: { listingId, userId: user.id } });
  revalidatePath(`/market/${listingId}`);
  revalidatePath('/me');
  return { favorite: !had };
}

export type ReportState =
  { error?: string; done?: boolean; values?: FormValues } | undefined;

/** 물건 신고 — 글 · 댓글 신고와 같은 표(CommunityReport.listingId), 관리자 소통 관리에서 본다 */
export async function reportListing(
  _prev: ReportState,
  formData: FormData
): Promise<ReportState> {
  const user = await requireUser();
  const listingId = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const detail = String(formData.get('detail') ?? '').trim();
  if (!isReportReason(reason)) return { error: '신고 이유를 골라 주세요.' };
  if (detail.length > REPORT_DETAIL_MAX)
    return { error: `신고 내용은 ${REPORT_DETAIL_MAX}자까지예요.` };
  const found = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { userId: true },
  });
  if (!found) return { error: '물건을 찾지 못했어요.' };
  if (found.userId === user.id) return { error: '내 물건은 신고할 수 없어요.' };
  try {
    await prisma.communityReport.create({
      data: { reporterId: user.id, listingId, reason, detail: detail || null },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
      throw e;
  }
  revalidatePath('/admin/community');
  return { done: true };
}

/** 관리자 — 신고된 물건 가리기 · 되살리기(지우지 않는다) */
export async function setListingHidden(formData: FormData) {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return;
  const id = String(formData.get('id') ?? '');
  const hiddenAt = formData.get('hidden') === '1' ? appNow() : null;
  const found = await prisma.listing.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) return;
  await prisma.listing.update({ where: { id }, data: { hiddenAt } });
  revalidatePath('/', 'layout');
  revalidatePath('/admin/community');
}

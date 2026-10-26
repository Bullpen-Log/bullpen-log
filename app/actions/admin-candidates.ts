'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { geocode } from '@/lib/geocode';
import {
  BUSINESS_STATUS,
  COLLECTION_STATUS,
  CONSENT_STATUS,
  CONTACT_STATUS,
  canApprove,
  isStatus,
  readCoords,
} from '@/lib/market/candidates';

/**
 * 덕아웃 수집 후보 관리자 동작(2026-10-26, 대표관리자만) — 업체 확인 정보 · 연락 · 동의 · 승인 · 좌표. 동작마다 requireAdmin.
 * 앱 rpc 허용 목록(app/api/rpc/registry.ts)에는 넣지 않는다. 수집 칸(원본 · 지도 대조 · 공개 안내)은 여기서 안 고친다 — 다시 가져오기만.
 */
const done = (id: string) => revalidatePath(`/manage/places/${encodeURIComponent(id)}`);

/** 업체 확인 정보 · 연락 · 동의 상태 · 전화 · 동의 범위 · 메모 저장. 승인 조건이 깨지면 승인을 거둔다. 연락 · 확인 날짜는 상태를 바꿀 때만 찍는다(자동으로 '연락함'을 만들지 않는다) */
export async function saveCandidateCheck(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const now = await prisma.facilityCandidate.findUnique({ where: { id }, select: { collectionStatus: true, businessStatus: true, contactStatus: true, consentStatus: true, approvedAt: true } });
  if (!now) return;
  const pick = (name: string, map: Record<string, string>, fallback: string) => {
    const v = formData.get(name);
    return isStatus(map, v) ? v : fallback;
  };
  const tri = (name: string) => {
    const v = formData.get(name);
    return v === 'yes' ? true : v === 'no' ? false : null;
  };
  const collectionStatus = pick('collectionStatus', COLLECTION_STATUS, now.collectionStatus);
  const contactStatus = pick('contactStatus', CONTACT_STATUS, now.contactStatus);
  const consentStatus = pick('consentStatus', CONSENT_STATUS, now.consentStatus);
  const at = new Date();
  await prisma.facilityCandidate.update({
    where: { id },
    data: {
      collectionStatus,
      businessStatus: pick('businessStatus', BUSINESS_STATUS, now.businessStatus),
      contactStatus,
      consentStatus,
      offersLessons: tri('offersLessons'),
      offersRental: tri('offersRental'),
      offersHardball: tri('offersHardball'),
      phone: String(formData.get('phone') ?? '').trim().slice(0, 40) || null,
      consentScope: String(formData.get('consentScope') ?? '').trim().slice(0, 1000) || null,
      adminNote: String(formData.get('adminNote') ?? '').trim().slice(0, 4000) || null,
      ...(collectionStatus !== now.collectionStatus ? { verifiedAt: collectionStatus === 'VERIFIED' ? at : null } : {}),
      ...(contactStatus !== now.contactStatus && contactStatus !== 'NOT_CONTACTED' ? { lastContactedAt: at } : {}),
      ...(now.approvedAt && !canApprove({ consentStatus, collectionStatus }) ? { approvedAt: null, approvedById: null } : {}),
    },
  });
  done(id);
}

/** 관리자 승인 · 거두기 — 승인은 동의 · 정보 확인 뒤에만(서버가 다시 본다). 공개로 옮기는 길은 아직 없다 */
export async function setCandidateApproval(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const on = formData.get('approve') === 'on';
  const c = await prisma.facilityCandidate.findUnique({ where: { id }, select: { consentStatus: true, collectionStatus: true, mergedIntoId: true } });
  /* 통합된 이전 기록은 승인하지 않는다 — 대표 기록에서 */
  if (!c || (on && (!canApprove(c) || c.mergedIntoId))) return;
  await prisma.facilityCandidate.update({
    where: { id },
    data: on ? { approvedAt: new Date(), approvedById: admin.id } : { approvedAt: null, approvedById: null },
  });
  done(id);
}

/** 좌표 — 손으로 넣거나(mode=manual) 주소로 찾기(mode=geocode, 카카오 열쇠 필요). 결과는 상세 화면 주소(?coords=)로 알린다 */
export async function setCandidateCoords(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const c = await prisma.facilityCandidate.findUnique({ where: { id }, select: { name: true, roadAddress: true, address: true } });
  if (!c) return;
  const back = (r: string) => redirect(`/manage/places/${encodeURIComponent(id)}?coords=${r}`);
  let at: { lat: number; lng: number } | null;
  const source = formData.get('mode') === 'geocode' ? 'KAKAO_GEOCODE' : 'MANUAL';
  if (source === 'KAKAO_GEOCODE') {
    if (!process.env.KAKAO_REST_API_KEY) back('nokey');
    at = await geocode(c.roadAddress ?? c.address, c.name);
    if (!at) back('notfound');
  } else {
    at = readCoords(formData.get('lat'), formData.get('lng'));
    if (!at) back('bad');
  }
  await prisma.facilityCandidate.update({ where: { id }, data: { lat: at!.lat, lng: at!.lng, coordsEdited: true, coordsSource: source, coordsSetAt: new Date() } });
  done(id);
  back('ok');
}

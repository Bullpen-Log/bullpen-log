import { headers } from 'next/headers';
import { requirePermission } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { loadAppSwingList } from '@/app/actions/swing-lab';
import { Dev3dClient } from './dev3d-client';

/**
 * 3D 개발 관리자 — 3D 스윙 분석(타자) 모델을 만들 영상을 모으는 곳(2026-10-21 금윤호: "모델링은 우리가 찍어서 줄 수 있도록 3D 개발 관리자를 만들어서
 * 모델링을 위한 영상을 넣을 수 있는 타자 버전 시스템을"). 대표관리자만(lib/permissions.ts 'dev3d' — 준관리자에게 열려면 그 표에 한 줄).
 * 타자 샘플(정면 · 포수 뒤 짝 + 촬영 정보) · 마커 샘플(③ · ④ 카메라까지). 저장은 영상 버킷 {관리자}/swing-lab/{번호}/ — 관리자끼리 같이 본다.
 * 새 아이폰 앱(판 11~)은 앱 화면(native/src/app/swing/samples.tsx)으로.
 */
export default async function Dev3dPage() {
  await requirePermission('dev3d');
  if (expoLevel((await headers()).get('user-agent')) >= 11) return <OpenNative path="/swing/samples" cover={false} />;
  const list = await loadAppSwingList();
  if (!list.ok) return null;
  return <Dev3dClient samples={list.samples} defaultHeightCm={list.heightCm} defaultHand={list.hand} />;
}

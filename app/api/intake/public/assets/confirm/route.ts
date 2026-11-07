import { intakePublicApi } from '@/app/api/intake/public/_api';

/* 응답 뒤 검증(after)이 파일을 처음부터 끝까지 읽는다 — 1GiB 까지 스트리밍. 못 끝내면 임대가 풀려 크론이 이어 받는다 */
export const maxDuration = 300;

export const POST = intakePublicApi.confirm;

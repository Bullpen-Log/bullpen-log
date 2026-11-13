import { intakePublicApi } from '@/app/api/intake/public/_api';

/* 응답 뒤 검증(after, runVerifySoon)이 파일을 처음부터 끝까지 읽는다 — 1GiB 까지 스트리밍. 남은 시간 안에 못 끝낼 파일은 시작하지 않고, 마감에 닿으면 시도 횟수를 안 쓰고 크론에 넘긴다 */
export const maxDuration = 300;

export const POST = intakePublicApi.finalize;

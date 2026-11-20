import { createHash } from 'node:crypto';
import { canonicalJson, type OpKind } from '@/lib/review-evidence/model';

/**
 * EX-REF04 — 기록 번호 · 내용 지문(서버 · 명령 도구 · 시험). 브라우저 화면에서는 부르지 않는다(node:crypto).
 * - 내용 지문(payloadHash): 정해진 순서의 JSON 의 sha256. 같은 내용이면 어느 컴퓨터에서 보내도 같다.
 * - 기록 번호(opId): 종류 + 보낸 계정 + 요청 번호의 sha256 — 저장 이름이 된다. 같은 요청을 다시 보내면 같은 이름이라
 *   저장소의 '없을 때만 만들기'가 두 번째를 막고, 다시 읽어 같은 내용인지 본다(같으면 그대로 성공, 다르면 충돌).
 * - 요청 번호를 따로 주지 않으면 내용 지문에서 만든다(같은 내용 = 같은 요청).
 */

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export const payloadHashOf = (payload: unknown) => sha256Hex(canonicalJson(payload));

export const defaultRequestKey = (kind: OpKind, payload: unknown) => `rk-${kind}-${payloadHashOf(payload).slice(0, 48)}`;

export const opIdOf = (kind: OpKind, actorUserId: string, requestKey: string) => sha256Hex(`review-evidence/v1/op|${kind}|${actorUserId}|${requestKey}`);

/** 화면 주소에 쓰는 짧은 번호(출처 · 쓰임) */
export const tokenOf = (prefix: 'src' | 'use', key: string) => `${prefix}_${sha256Hex(`review-evidence/v1/${prefix}|${key}`).slice(0, 24)}`;

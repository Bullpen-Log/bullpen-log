import 'server-only';
import { headers } from 'next/headers';

/**
 * 비밀번호를 맞춰 보는 동작(로그인 · 비밀번호 바꾸기 · 탈퇴)의 횟수 제한.
 *
 * 같은 열쇠(이메일 또는 회원 번호)와 같은 IP 로 15분 안에 10번 틀리면 그동안 막는다.
 * 2026-10-16 보안 검토 — 제한이 없어 비밀번호 무차별 대입이 가능했다.
 *
 * ponytail: 서버 메모리 Map 이라 인스턴스마다 따로 센다(Vercel 은 인스턴스가 여럿).
 * 느슨하지만 한 인스턴스 안의 반복은 막는다. 더 세게 막으려면 DB 표나 Upstash 로.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const fails = new Map<string, number[]>();

async function ipOf() {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim() || 'ip?';
}

function prune(k: string, now: number) {
  const list = (fails.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(k, list);
  else fails.delete(k);
  return list;
}

/** 지금 막혀 있으면 남은 분, 아니면 0. */
export async function blockedMinutes(key: string) {
  const now = Date.now();
  const list = prune(`${key}|${await ipOf()}`, now);
  if (list.length < MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((list[0] + WINDOW_MS - now) / 60_000));
}

export async function noteFail(key: string) {
  const now = Date.now();
  const k = `${key}|${await ipOf()}`;
  fails.set(k, [...prune(k, now), now]);
  if (fails.size > 10_000) fails.clear();
}

export async function clearFails(key: string) {
  fails.delete(`${key}|${await ipOf()}`);
}

export const BLOCKED_TEXT = (min: number) => `여러 번 틀려서 잠시 막았어요. ${min}분 뒤에 다시 해 주세요.`;

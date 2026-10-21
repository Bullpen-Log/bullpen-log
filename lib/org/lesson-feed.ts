import { prisma } from '@/lib/prisma';
import { readExercises, type LessonExercise } from '@/lib/org/lesson-work';

/**
 * 선수 쪽 레슨 줄(2026-10-21 개편 3단계 3-4, docs/designs/sinker-dugout.md 결정 3) — 코치가 쓴 레슨 노트를 선수가 본다.
 * 덕아웃 홈(로그인) · 내 것 · PC 의 내 싱커 대시보드가 읽는다. 앱의 기록 달력 · 트레이닝 탭에 얹는 것은 김민 몫(B-3).
 */
export type LessonFeedItem = {
  id: string;
  date: string;
  orgId: string;
  orgName: string;
  coach: string;
  body: string;
  homework: string | null;
  exercises: LessonExercise[];
  pitchCount: number | null;
  intensity: number | null;
};

export async function loadLessonFeed(
  userId: string,
  limit = 5
): Promise<LessonFeedItem[]> {
  const notes = await prisma.lessonNote.findMany({
    where: { member: { userId } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      date: true,
      body: true,
      homework: true,
      exercises: true,
      pitchCount: true,
      intensity: true,
      authorId: true,
      member: { select: { org: { select: { id: true, name: true } } } },
    },
  });
  if (notes.length === 0) return [];
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(notes.map((n) => n.authorId))] } },
    select: { id: true, nickname: true },
  });
  const name = new Map(authors.map((a) => [a.id, a.nickname]));
  return notes.map((n) => ({
    id: n.id,
    date: n.date.toISOString().slice(0, 10),
    orgId: n.member.org.id,
    orgName: n.member.org.name,
    coach: name.get(n.authorId) ?? '코치',
    body: n.body,
    homework: n.homework,
    exercises: readExercises(n.exercises),
    pitchCount: n.pitchCount,
    intensity: n.intensity,
  }));
}

/** 레슨 기록이 하나라도 있나 — 덕아웃 회원이 싱커를 쓰기 시작했는지 볼 때 */
export async function hasLessonRecord(userId: string): Promise<boolean> {
  return (await prisma.lessonNote.count({ where: { member: { userId } } })) > 0;
}

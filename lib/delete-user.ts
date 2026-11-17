import { purgeWorkoutV2 } from '@/lib/workout/v2/gate';
import 'server-only';
import { prisma } from '@/lib/prisma';
import { deleteUserFiles, deleteVideos } from '@/lib/storage';
import { loadStructured } from '@/lib/workout/load/server';

/**
 * 회원 한 명을 통째로 지운다 — 본인 탈퇴(app/actions/auth.ts deleteAccount)와 관리자의 회원 지우기(app/actions/admin.ts deleteUser)가 같이 쓴다.
 * 예전엔 둘이 따로 지워 조금씩 달랐다(관리자 쪽은 투구 영상 경로를 안 챙김). 2026-10-16 통합 검토.
 *
 * 차례: 파일 먼저, DB 나중. DB 를 먼저 지웠다가 파일 지우기가 실패하면 주인 없는 영상이 남고 다시 찾을 길이 없다. 반대로 파일만 지워지고
 * DB 가 실패하면 회원은 남아 다시 지우면 된다(개인 정보 쪽이 안전).
 *
 * DB 는 User 를 지우면 관계가 있는 표가 함께 지워진다(relationMode prisma — Prisma 가 찾아 지운다). User 관계가 없는 표는 따로 본다:
 *   VelocityRecording(조각 · 표시 딸림) — 지운다. 파일이 그 관리자 폴더라 위에서 같이 지워져 줄만 남는다.
 *   PushDevice · Notification · LoginTicket(2026-10-21 알림 · 코드 로그인) — 지운다. 기기 토큰과 알림함은 그 사람 것뿐이다.
 *   VelocityCalibRun · ShootCheck — 남긴다. 다른 관리자들이 같이 보는 팀 자료(보정 기록 · 촬영 진행)라, 사람이 빠져도 기록은 쓸모 있다.
 *   WorkoutLoadRecovery(EX-LOAD01 — 보류 마이그레이션의 표, 옛 앱이 보낸 원래 요청) — 그 사람이 주인(ownerId)인 줄만 지운다. 코치로서 남의 기록을
 *     대신 적어 actorId 로만 남은 줄은 그 선수의 것이라 남긴다. 표는 스키마 스위치(WORKOUT_LOAD_SCHEMA)가 켜졌을 때만 있으니 그때만 묻는다.
 */
export async function deleteUserCompletely(userId: string) {
  /* 투구 영상은 그 사람 폴더 밖(옛 경로)에 있을 수 있어 기록에서 챙긴다 — 회원을 지우면 경로를 알 길이 없어진다 */
  const logs = await prisma.pitchLog.findMany({
    where: { userId },
    select: { videoPaths: true },
  });
  const paths = logs.flatMap((l) => l.videoPaths);
  if (paths.length > 0) await deleteVideos(paths);
  /* 그 밖의 파일(프로필 사진 · 구속 클립 · 녹화 조각 · 3D 샘플 · 저장 안 한 올린 파일)까지 — 폴더를 통째로 */
  await deleteUserFiles(userId);

  /* EX-RX01 R2A — v2 운동 줄(목표 판 · 영수증 · 표식 · 복구함 · v2 판과 그 세트)을 그 사람의 purge 문맥으로 먼저 지운다.
     관계가 없는 표라 회원 지우기가 따라 지우지 않고, 울타리가 문맥 없는 지우기를 막는다. 칸이 없으면(적용 전) 아무것도 안 한다 */
  await purgeWorkoutV2(userId);

  /* 공 표시(VelocityBallLabel)는 'pitch:<id>' · 'cut:<id>' 글로만 가리켜 관계가 없다 — 그 사람의 공 · 조각 것을 찾아 지운다(남으면 고아, 2026-10-17) */
  const [pitchRows, cutRows] = await Promise.all([
    prisma.velocityPitch.findMany({ where: { userId }, select: { id: true } }),
    prisma.velocityRecordingCut.findMany({
      where: { recording: { userId } },
      select: { id: true },
    }),
  ]);
  const labelTargets = [
    ...pitchRows.map((p) => `pitch:${p.id}`),
    ...cutRows.map((c) => `cut:${c.id}`),
  ];
  await prisma.$transaction([
    ...(labelTargets.length
      ? [
          prisma.velocityBallLabel.deleteMany({
            where: { target: { in: labelTargets } },
          }),
        ]
      : []),
    prisma.velocityRecording.deleteMany({ where: { userId } }),
    prisma.pushDevice.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.loginTicket.deleteMany({ where: { userId } }),
    /* EX-LOAD01 R1-04 — 회원 줄을 지우기 바로 앞, 같은 거래에서(스위치가 꺼져 있으면 아무 문장도 없다) */
    ...loadRecoveryCleanup(prisma, userId, loadStructured()),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

/**
 * EX-LOAD01 R1-04 — 회원 지우기 거래에 넣을 원래 요청 복구 기록 지우기. 스위치가 꺼져 있으면 빈 배열이다 — 그 표 이름이 든 SQL 을 보내지 않는다
 * (표가 없는 DB 에서 거래 전체가 깨지지 않게). 주인(ownerId)의 줄만 — 대신 적은 사람(actorId)으로만 남은 남의 줄은 그대로 둔다.
 * 시험: scripts/load-r1-admin-selftest.mts(격리 PGlite, 실제 deleteUserCompletely 거래).
 */
export function loadRecoveryCleanup(
  db: Pick<typeof prisma, '$executeRaw'>,
  userId: string,
  structured: boolean
): ReturnType<typeof prisma.$executeRaw>[] {
  if (!structured) return [];
  return [db.$executeRaw`DELETE FROM "WorkoutLoadRecovery" WHERE "ownerId" = ${userId}`];
}

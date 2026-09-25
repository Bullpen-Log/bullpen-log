import { toDateKey } from '@/lib/pitch-stats';

/**
 * 종료를 누르지 않고 떠난 운동 판을 가려내는 규칙.
 *
 * 판은 [운동 종료]를 눌러야 닫히고, 닫힐 때에야 그날 세트가 운동 기록
 * (UserExerciseLog)으로 접힌다. 운동 부하·캘린더·로테이션·'지난번' 줄이 전부 그
 * 표를 읽는다. 그런데 종료를 안 누르고 앱을 닫는 일은 흔하다 — 그러면 판은 영원히
 * '진행 중'으로 남고, 그날 한 세트는 어디에도 안 들어갔다. 다음 날 트레이닝
 * 화면은 오늘 판만 찾아서 [운동 시작]만 띄우니 돌아갈 길도 없었다.
 *
 * 그래서 이런 판을 찾아 대신 닫는다(lib/workout/close-stale.ts). 여기는 무엇을
 * 떠난 판으로 볼지와, 닫을 때 끝 시각을 언제로 잡을지만 정한다 — DB 를 모르는
 * 계산이라 자가 시험(scripts/training-selftest.mts)에서 그대로 부른다.
 *
 * ■ 날짜만 보지 않는다
 *
 * 23:30 에 시작해 00:40 까지 하는 판은 날짜가 어제여도 아직 운동 중이다. 세트가
 * 판의 날짜를 따라 하루로 묶이게 만든 것도 그래서다. 날짜가 지났고, 게다가
 * 3시간 넘게 아무 일이 없었을 때만 떠난 것으로 본다. 쉬는 시간이 3시간을 넘는
 * 운동은 없다.
 */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export type SessionTimes = {
  /** 판의 날짜(서울 기준 날짜를 UTC 자정으로 담은 DATE) */
  date: Date;
  /** 판을 연 시각(워밍업 포함) */
  startedAt: Date;
  /** 본운동에 들어간 시각. 다시 연 판이면 다시 연 시각 */
  mainStartedAt: Date | null;
};

/** 오늘(서울 기준) 0시를 DATE 칸과 같은 모양(UTC 자정)으로 */
export function dayStart(now: Date): Date {
  return new Date(`${toDateKey(now)}T00:00:00.000Z`);
}

/**
 * 판에서 마지막으로 무언가를 한 시각.
 *
 * 마지막 세트, 본운동 시작, 판을 연 시각 가운데 가장 늦은 것이다. 다시 연 판은
 * 앞 구간의 세트보다 다시 연 시각(mainStartedAt)이 늦다 — 다시 열어 두기만 하고
 * 떠났다면 그때가 마지막이다.
 */
export function lastActivity(s: SessionTimes, lastSetAt: Date | null): Date {
  const times = [s.startedAt, s.mainStartedAt, lastSetAt].filter(
    (t): t is Date => t != null
  );
  return new Date(Math.max(...times.map((t) => t.getTime())));
}

/** 떠난 판인가 — 날짜가 지났고, 마지막으로 무언가 한 뒤 3시간이 넘게 지났다 */
export function isAbandoned(s: SessionTimes, lastSetAt: Date | null, now: Date): boolean {
  if (s.date.getTime() >= dayStart(now).getTime()) return false;
  return now.getTime() - lastActivity(s, lastSetAt).getTime() >= STALE_AFTER_MS;
}

/**
 * 판을 닫을 때의 끝 시각과, 이번 구간의 운동 시간(초).
 *
 * 보통은 지금이 끝이다. 다만 마지막으로 무언가 한 뒤 3시간이 넘었으면 그 마지막
 * 시각을 끝으로 친다 — 떠난 판을 다음 날 대신 닫을 때도, 저녁에 돌아와서야
 * 아침 판의 [종료]를 누를 때도, 그사이 흐른 시간은 운동한 시간이 아니다. 예전에는
 * 지금까지를 세어 하루치(수만 초)가 운동 시간에 더해질 수 있었다.
 *
 * 운동 시간은 본운동 시작부터 센다(워밍업은 빼기로 했다). 본운동에 못 들어갔으면
 * 판을 연 시각부터다 — 마치기와 같은 규칙이다.
 */
export function sessionEnd(
  s: SessionTimes,
  lastSetAt: Date | null,
  now: Date
): { endedAt: Date; segmentSeconds: number } {
  const last = lastActivity(s, lastSetAt);
  const endedAt =
    now.getTime() - last.getTime() >= STALE_AFTER_MS ? last : now;
  const from = s.mainStartedAt ?? s.startedAt;
  const segmentSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - from.getTime()) / 1000)
  );
  return { endedAt, segmentSeconds };
}

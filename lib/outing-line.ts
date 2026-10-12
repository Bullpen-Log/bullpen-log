import { exactOutingDay, nextOutingDays } from '@/lib/checkin';
import type { Outing } from '@/lib/engine/outing';
import { REST_SESSION_TYPE, type SessionTypeName } from '@/lib/session-type';

/**
 * 화면의 등판 두 줄 — 트레이닝 일정 카드 위 '다음 등판까지 N일' 한 줄(components/outing-line.tsx)과 체크인 창의 '어제 등판 · 몇 구'
 * 줄(components/checkin-form.tsx)이 쓰는 글 · 판단(트레이닝 추천 2판 P4 커밋 H, 2026-10-12).
 *
 * 왜 두는가. 다음 등판은 체크인 답 · 달력 · 같은 요일 짐작에서 오는데(lib/engine/outing.ts), 짐작한 날은 일정을 가볍게 만들면서도
 * 화면에서는 어디에도 안 보였다 — 등판이 없는 주에 보조 날이 나와도 왜인지, 어떻게 고치는지 알 길이 없었다. 그리고 어제 '오늘 등판'이라
 * 답하고 투구 기록을 안 남기면 날 종류가 부하를 몰라 조이는 쪽(R3', 보조 날)으로만 읽는다 — 다음 날 아침 체크인에서 몇 구였는지만
 * 물으면 그 기록이 생겨 부하 기준(D3)으로 읽힌다.
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수 · 난수 없음. 화면(서버 · 클라이언트 부품)과 자체 시험이 그대로 부른다.
 * 등판 답을 날로 읽는 규칙은 lib/checkin.ts 한 곳 그대로 쓴다(여기서 글자를 견주지 않는다).
 */

/** '다음 등판까지' 한 줄 — 글과 짐작한 출처 */
export type OutingLineText = {
  /** '오늘 등판' · '내일 등판' · '다음 등판까지 3일' · '다음 등판까지 1~2일' · '다음 등판까지 4일 이상' */
  main: string;
  /**
   * 짐작한 출처면 그 표시 — 달력 일정으로 '달력으로 추정', 최근 4주 같은 요일 경기로 '요일로 추정'. 체크인 답(오늘 · 어제)이면 null.
   * 짐작이면 화면이 옆에 '바꾸기'(체크인 열기)를 붙인다 — 짐작이 틀렸으면 던지는 일정을 적으면 답이 이긴다(outing.ts 차례).
   */
  guess: '달력으로 추정' | '요일로 추정' | null;
};

/**
 * 다음 등판 한 줄. 다음 등판을 모르면(답 없음 · '없음' · '오늘 불펜'만 · 짐작도 안 섬) null — 줄을 안 그린다.
 *
 * 범위 글은 오늘 상태 한 장의 이유 줄(lib/engine/day-state.ts windowText)과 같은 날을 말한다: 0~0 오늘 · 1~1 내일 · 같은 두 끝 N일 ·
 * 끝이 없으면 N일 이상 · 그 밖 N~M일. 짐작한 날은 하루로 못 박히지 않지만(outing.nextDay null) 짐작 자체는 한 날이라 범위가 한 날이다.
 */
export function outingLineOf(
  outing: Pick<Outing, 'daysUntilNext' | 'nextSource'>
): OutingLineText | null {
  const w = outing.daysUntilNext;
  if (w == null) return null;
  const main =
    w.max === 0
      ? '오늘 등판'
      : w.min === 1 && w.max === 1
        ? '내일 등판'
        : w.max == null
          ? `다음 등판까지 ${w.min}일 이상`
          : w.min === w.max
            ? `다음 등판까지 ${w.min}일`
            : `다음 등판까지 ${w.min}~${w.max}일`;
  const guess =
    outing.nextSource === 'calendar'
      ? '달력으로 추정'
      : outing.nextSource === 'estimate'
        ? '요일로 추정'
        : null;
  return { main, guess };
}

/**
 * 어제 등판 줄을 물을까 — 어제 체크인의 던지는 일정이 '그날 등판'(어제 기준 꼭 0일 뒤)인데 어제 투구 기록이 하나도 없을 때만.
 *
 * '그날 등판'은 lib/engine/outing.ts 의 기록 없는 등판(claimedYesterdayNoLog)과 같은 규칙으로 본다 — 글자를 견주지 않고 lib/checkin.ts
 * nextOutingDays · exactOutingDay 로. 기록은 쉰 날 줄까지 센다(그날을 이미 적었으면 묻지 않는다) — 엔진도 같다(facts.patterns.loggedYesterday,
 * 2판 P4 검토 전에는 엔진만 던진 날로 세어, 휴식 줄을 남긴 사람에게 묻지는 않으면서 '기록이 없어요'라고 했다).
 */
export function asksYesterdayPitches(
  yesterdayPlan: string | null | undefined,
  loggedYesterday: boolean
): boolean {
  return !loggedYesterday && exactOutingDay(nextOutingDays(yesterdayPlan)) === 0;
}

/** 어제 등판 줄로 남기는 기록의 종류 — 답이 '오늘 등판'(경기)이었다 */
export const YESTERDAY_OUTING_SESSION: SessionTypeName = '경기';

/**
 * '안 던졌어요'를 고르면 남기는 기록의 종류 — 쉰 날(lib/session-type.ts REST_SESSION_TYPE). 투구 기록 API 가 투구수 · 체감 강도를 0 · 비움으로
 * 못박는다. 이 줄이 있으면 엔진은 어제 답이 풀린 것으로 본다(facts.patterns.loggedYesterday — 2판 P4 검토).
 */
export const YESTERDAY_REST_SESSION: SessionTypeName = REST_SESSION_TYPE;

/** 투구 기록 API(app/api/pitch-log POST)에 보낼 몸 — 입력 폼과 같은 칸. 쉰 날은 투구수 0 · 체감 강도 null */
export type YesterdayOutingBody = {
  date: string;
  sessionType: SessionTypeName;
  pitchCount: number;
  effortPct: number | null;
  videoPaths: string[];
};

/**
 * 체크인 창의 어제 등판 칸(투구수 · 체감 강도 · 날짜 · '안 던졌어요')을 기록 몸으로. 투구수를 비웠고 '안 던졌어요'도 안 골랐으면 null(안 남긴다 —
 * 그러면 엔진은 계속 '기록 없는 등판'으로 본다). '안 던졌어요'만 골랐으면 어제 쉰 날 한 줄(2판 P4 검토 — 예전에는 '안 던졌으면 비워 두세요'
 * 였는데, 비우면 기록 없는 등판이 다음 날까지 남아 사실과 다른 말을 했다). 투구수를 적었으면 투구수가 이긴다(화면은 둘을 같이 못 고른다).
 *
 * 여기서는 빈칸 · 꼴만 본다. 범위(500구 · 체감 강도 5~100%)와 2분 안 같은 값 다시 안 만들기는 투구 기록 API 가 그대로 본다 — 같은 규칙을
 * 두 곳에 두면 한쪽만 고쳐진다.
 */
export function readYesterdayOuting(fields: {
  date: unknown;
  pitches: unknown;
  effort: unknown;
  /** '안 던졌어요' 칸 — 고르면 '1'. 옛 호출(칸 없음)은 안 고른 것 */
  noThrow?: unknown;
}): YesterdayOutingBody | { error: string } | null {
  const raw = typeof fields.pitches === 'string' ? fields.pitches.trim() : '';
  const noThrow = fields.noThrow === '1';
  if (raw === '' && !noThrow) return null;
  const date =
    typeof fields.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.date)
      ? fields.date
      : null;
  if (date == null)
    return {
      error: '어제 날짜를 몰라 기록하지 못했어요. 새로고침한 뒤 다시 해 주세요.',
    };
  if (raw === '')
    return {
      date,
      sessionType: YESTERDAY_REST_SESSION,
      pitchCount: 0,
      effortPct: null,
      videoPaths: [],
    };
  const pitchCount = Number(raw);
  if (!Number.isInteger(pitchCount) || pitchCount < 1)
    return {
      error:
        "어제 던진 공은 1구부터 적어 주세요. 안 던졌으면 '안 던졌어요'를 눌러 주세요.",
    };
  const effortRaw = typeof fields.effort === 'string' ? fields.effort.trim() : '';
  const effortPct = effortRaw === '' ? Number.NaN : Number(effortRaw);
  if (!Number.isFinite(effortPct)) return { error: '어제 체감 강도를 골라 주세요.' };
  return {
    date,
    sessionType: YESTERDAY_OUTING_SESSION,
    pitchCount,
    effortPct,
    videoPaths: [],
  };
}

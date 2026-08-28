/**
 * 리포트를 언제 만들 수 있는가.
 *
 * 예전에는 하루에 한 번이었다. 그런데 하루 사이에 달라지는 것이 거의 없어서,
 * 어제 리포트와 오늘 리포트가 거의 같은 말을 했다. 같은 말을 다시 읽게 하면
 * 읽는 습관이 사라진다(만들 때마다 AI 비용도 든다).
 *
 * 그래서 날짜가 아니라 기록 수로 센다. 투구 기록이 다섯 번 더 쌓이면 그때
 * 새로 만든다 — 그쯤이면 부하도 패턴도 실제로 달라져 있다.
 */

/** 리포트를 새로 만들려면 필요한 새 투구 기록 수 */
export const REPORT_EVERY_PITCH_LOGS = 5;

export type ReportReadiness = {
  /** 지금 만들 수 있는가 */
  ready: boolean;
  /** 마지막 리포트 이후 쌓인 투구 기록 수 */
  newRecords: number;
  /** 몇 개 더 있어야 하는가 */
  remaining: number;
  /** 화면에 그대로 쓰는 한 줄 */
  message: string;
};

export function reportReadiness(
  newRecords: number,
  hasReport: boolean
): ReportReadiness {
  const remaining = Math.max(0, REPORT_EVERY_PITCH_LOGS - newRecords);
  const ready = remaining === 0;

  return {
    ready,
    newRecords,
    remaining,
    message: ready
      ? hasReport
        ? `투구 기록이 ${newRecords}번 쌓였습니다. 새로 만들 수 있습니다.`
        : `투구 기록이 ${newRecords}번 쌓였습니다. 첫 리포트를 만들 수 있습니다.`
      : hasReport
        ? `리포트를 만든 뒤 투구 기록이 ${newRecords}번 쌓였습니다. ${remaining}번 더 기록하면 새로 만들 수 있습니다.`
        : `투구 기록 ${REPORT_EVERY_PITCH_LOGS}번이 모이면 첫 리포트를 만들 수 있습니다. ${remaining}번 남았습니다.`,
  };
}

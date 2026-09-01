/**
 * 리포트를 언제 만들 수 있는가 — 하루에 한 번.
 *
 * 한동안은 날짜가 아니라 투구 기록 수로 셌다(세 번 쌓이면 한 번). 하루 사이에
 * 달라지는 것이 거의 없어 어제와 오늘이 같은 말을 하는 것이 싫어서였다.
 *
 * 그런데 리포트가 하는 말이 바뀌었다. 예전에는 '요즘 어떻게 던지고 있는가'를
 * 돌아보는 글이라 며칠에 한 번이면 충분했지만, 지금은 오늘과 내일 몇 구까지
 * 던져도 되는지를 낸다. 그것은 날마다 달라진다 — 어제 60구를 던졌으면 오늘은
 * 쉬어야 하고, 오늘 쉬었으면 내일은 던질 수 있다. 사흘 전 숫자를 오늘 보고
 * 있으면 안 보느니만 못하다.
 *
 * 그래서 날짜로 되돌린다. 대신 하루 한 번으로 잠근다 — 부를 때마다 AI 비용이
 * 실제로 나가고, 같은 날 두 번 만들어도 근거가 되는 기록이 그대로다.
 *
 * 다만 통증으로 멈춘 리포트는 하루를 쓰지 않는다. 멈춘 리포트에는 AI를 아예
 * 부르지 않아 비용이 들지 않고, 멈춤 안내가 "통증이 가라앉았다면 오늘 체크인을
 * 다시 저장해주세요"라고 말한다 — 다시 만들 수 없으면 그 안내가 거짓말이 된다.
 * 아침에 아팠다가 저녁에 나은 사람이 하루를 통째로 잃을 이유가 없다.
 */

export type ReportReadiness = {
  /** 지금 만들 수 있는가 */
  ready: boolean;
  /** 오늘 몫을 이미 만들었는가 (멈춘 리포트도 만든 것으로 센다) */
  madeToday: boolean;
  /** 화면에 그대로 쓰는 한 줄 */
  message: string;
};

/** 마지막 리포트. 하나도 없으면 null */
export type LastReport = {
  /** 기준일 (YYYY-MM-DD) */
  asOf: string;
  /** 통증으로 계획을 내지 않은 리포트인가 */
  halted: boolean;
};

/**
 * @param todayKey 오늘 (YYYY-MM-DD)
 */
export function reportReadiness(
  todayKey: string,
  last: LastReport | null
): ReportReadiness {
  const madeToday = last?.asOf === todayKey;
  /* 멈춘 리포트는 하루를 쓰지 않는다 — AI를 안 불러 비용도 안 든다 */
  const spent = madeToday && !last!.halted;

  return {
    ready: !spent,
    madeToday,
    message: spent
      ? '오늘 리포트를 이미 만들었습니다. 내일 다시 만들 수 있습니다.'
      : madeToday
        ? '통증으로 계획을 멈춘 리포트입니다. 상태가 달라졌으면 오늘 체크인을 다시 저장하고 새로 만들 수 있습니다.'
        : last
          ? '오늘 리포트를 만들 수 있습니다.'
          : '첫 리포트를 만들 수 있습니다.',
  };
}

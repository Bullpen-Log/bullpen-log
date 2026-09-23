/**
 * 투구 기록 한 건 — 화면으로 내려보내는 모양.
 *
 * 원래는 달력 화면(pitch-log-client.tsx)이 이 타입을 같이 들고 있었다. 그런데
 * 달력이 홈으로 옮겨 가면서, 그 파일을 지우면 이것을 쓰던 네 곳이 같이 무너졌다.
 * 화면이 아니라 자료의 모양이므로 화면과 떼어 둔다.
 *
 * date 가 Date 가 아니라 문자열인 이유: 서버에서 클라이언트로 Date 객체를
 * 그대로 넘길 수 없다. 넘기는 쪽에서 toISOString() 으로 바꾼다.
 */
export type Log = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
};

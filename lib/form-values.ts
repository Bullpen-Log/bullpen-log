/**
 * 폼이 오류로 되돌아왔을 때 입력한 값을 지키기 위한 도구.
 *
 * React 19는 <form action={...}> 의 액션이 끝나면 폼을 스스로 비운다.
 * 성공이든 실패든 마찬가지라서, 서버가 "빠진 칸이 있다"고 돌려주면
 * 멀쩡히 채워둔 칸까지 전부 지워진다. 칸 하나 빠뜨렸다고 처음부터
 * 다시 입력해야 하는 문제가 여기서 나온다.
 *
 * 비우는 방식이 각 칸을 defaultValue 로 되돌리는 것이므로, 서버가 받은
 * 값을 오류와 함께 돌려주고 그것을 defaultValue 로 물려주면 입력한 내용이
 * 그대로 남는다. React 가 비우는 것을 막는 게 아니라, 비운 자리에 원래
 * 값이 들어가 있게 하는 방식이다.
 */

/** 여러 개 고르는 칸(체크박스 묶음)은 값이 여러 개라 배열이 된다. */
export type FormValues = Record<string, string | string[]>;

/** 오류를 돌려줄 수 있는 액션 상태의 공통 모양 */
export type InputState = { error?: string; values?: FormValues };

/**
 * 돌려보내지 않는 칸.
 *
 * 비밀번호는 서버가 다시 흘려보내지 않는다. 화면까지 내려가면 응답 안에
 * 평문으로 남게 되고, 어차피 브라우저도 비밀번호 칸은 다시 채워주지 않는
 * 것이 보통이다. 그래서 비밀번호만 다시 입력하게 둔다.
 */
const NEVER_KEEP = ['password', 'passwordConfirm', 'newPassword'];

/** 제출한 값을 다시 돌려보낼 수 있는 형태로 옮겨 담는다. */
export function keepInput(formData: FormData): FormValues {
  const values: FormValues = {};

  for (const [name, value] of formData.entries()) {
    // 파일은 돌려보낼 수 없다. 영상은 이미 올라가 있고 경로만 오간다.
    if (typeof value !== 'string') continue;
    if (NEVER_KEEP.includes(name)) continue;

    const seen = values[name];
    if (seen === undefined) values[name] = value;
    else if (Array.isArray(seen)) seen.push(value);
    else values[name] = [seen, value];
  }

  return values;
}

/**
 * 액션이 오류를 돌려줄 때 입력값을 함께 실어 보낸다.
 *
 * 성공했을 때는 붙이지 않는다. 그때는 폼이 비워지는 것이 맞기 때문이다.
 */
export function withInput<S extends InputState>(
  state: S | undefined,
  formData: FormData
) {
  if (!state?.error) return state;
  return { ...state, values: keepInput(formData) };
}

/**
 * 한 칸에 다시 채워 넣을 값.
 *
 * 돌려받은 값이 없으면 undefined 를 주어, 폼이 원래 쓰던 기본값
 * (수정 화면의 기존 값 등)을 그대로 쓰게 한다.
 */
export function kept(values: FormValues | undefined, name: string) {
  const value = values?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/** 여러 개를 고르는 칸에 다시 체크해둘 값들. */
export function keptAll(values: FormValues | undefined, name: string) {
  const value = values?.[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

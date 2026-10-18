import AsyncStorage from '@react-native-async-storage/async-storage';

/** 기기에 두는 작은 값(JSON) — 못 읽거나 못 쓰면 조용히(다음에 다시 묻는다) */
export async function loadJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장소가 가득 참 등 — 이번만 쓴다 */
  }
}

/**
 * 받아 둔 서버 값을 폰에 — 앱을 껐다 켜도 화면이 빈칸 없이 먼저 그려진다(검토 D10 '받아 둔 값 먼저'). 열쇠는 모두 'bullpen-cache:' 로 시작하고,
 * 로그아웃하면(껍데기가 로그인 화면을 보면) 다 지운다 — 같은 폰에 다른 사람이 로그인했을 때 앞사람 기록이 비치지 않게.
 */
const CACHE = 'bullpen-cache:';
/**
 * 로그인 세대 — 로그아웃(cacheClear)마다 올린다. 로그아웃 전에 떠난 서버 읽기가 늦게 돌아와 앞사람 값을 메모리 · 폰에 다시 넣지 않게,
 * 읽기를 시작할 때 세대를 쥐고 돌아왔을 때 같은지 본다(cacheEpoch).
 */
let epoch = 0;
export const cacheEpoch = () => epoch;
export const cacheGet = (key: string) => loadJson(CACHE + key);
export const cacheSet = (key: string, value: unknown) => saveJson(CACHE + key, value);
export async function cacheClear(): Promise<void> {
  epoch++;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* 다음에 다시 */
  }
}

/**
 * 웹 화면(localStorage)에 있는 값을 앱 저장소로 옮긴다. 두 갈래:
 * - JSON 값(구속 측정 설정 등) — 옛 앱 값을 처음 한 번만(앱에서 고친 것을 안 덮는다)
 * - 글자 값(raw — 무게 단위 'kg' · 'lb' 처럼 따옴표 없이 둔 것) — 웹 설정 창이 고치는 곳이라 늘 웹 값을 따른다
 * 한 열쇠가 깨져도 나머지는 옮긴다.
 */
export async function adoptWebValues(items: Record<string, string | null>, raw: readonly string[] = []): Promise<void> {
  for (const [key, value] of Object.entries(items)) {
    if (value == null) continue;
    try {
      if (raw.includes(key)) {
        if ((await AsyncStorage.getItem(key)) !== value) await AsyncStorage.setItem(key, value);
        continue;
      }
      if ((await AsyncStorage.getItem(key)) != null) continue;
      JSON.parse(value);
      await AsyncStorage.setItem(key, value);
    } catch {
      /* 깨진 값은 건너뛴다 */
    }
  }
}

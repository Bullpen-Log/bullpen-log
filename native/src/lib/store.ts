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
export const cacheGet = (key: string) => loadJson(CACHE + key);
export const cacheSet = (key: string, value: unknown) => saveJson(CACHE + key, value);
export async function cacheClear(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* 다음에 다시 */
  }
}

/** 옛 앱(웹 화면 localStorage)에 있던 값을 처음 한 번 옮긴다 — 웹이 JSON 글자로 둔 것을 그대로(이미 있으면 안 덮는다) */
export async function adoptWebValues(items: Record<string, string | null>): Promise<void> {
  try {
    for (const [key, raw] of Object.entries(items)) {
      if (raw == null || (await AsyncStorage.getItem(key)) != null) continue;
      JSON.parse(raw);
      await AsyncStorage.setItem(key, raw);
    }
  } catch {
    /* 깨진 값은 건너뛴다 */
  }
}

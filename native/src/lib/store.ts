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

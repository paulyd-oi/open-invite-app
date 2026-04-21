import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog } from "./devLog";

const KEY_REF = "oi_ref";
const KEY_REF_EVENT_ID = "oi_ref_event_id";

export async function setShareRef(slug: string, eventId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_REF, slug);
    await AsyncStorage.setItem(KEY_REF_EVENT_ID, eventId);
    if (__DEV__) devLog("[ShareAttribution] stored", { slug, eventId });
  } catch {
    // best-effort
  }
}

export async function getShareRef(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_REF);
  } catch {
    return null;
  }
}

export async function getShareRefEventId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_REF_EVENT_ID);
  } catch {
    return null;
  }
}

export async function clearShareRef(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEY_REF, KEY_REF_EVENT_ID]);
    if (__DEV__) devLog("[ShareAttribution] cleared");
  } catch {
    // best-effort
  }
}

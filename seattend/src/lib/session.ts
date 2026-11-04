import * as SecureStore from 'expo-secure-store';
import type { SessionUser } from './api';

const TOKEN_KEY = 'samridhi_attendance_token';
const USER_KEY = 'samridhi_attendance_user';

export async function saveSession(token: string, user: SessionUser) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getSession(): Promise<{ token: string; user: SessionUser } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const rawUser = await SecureStore.getItemAsync(USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) as SessionUser };
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

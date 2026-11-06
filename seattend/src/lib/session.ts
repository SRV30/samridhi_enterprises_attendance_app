import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SessionUser } from './api';

const TOKEN_KEY = 'samridhi_attendance_token';
const USER_KEY = 'samridhi_attendance_user';

function webStorageAvailable() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export async function saveSession(token: string, user: SessionUser) {
  if (Platform.OS === 'web') {
    if (!webStorageAvailable()) throw new Error('Browser storage is unavailable. Please enable site storage and try again.');
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getSession(): Promise<{ token: string; user: SessionUser } | null> {
  let token: string | null;
  let rawUser: string | null;
  if (Platform.OS === 'web') {
    if (!webStorageAvailable()) return null;
    token = window.localStorage.getItem(TOKEN_KEY);
    rawUser = window.localStorage.getItem(USER_KEY);
  } else {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
    rawUser = await SecureStore.getItemAsync(USER_KEY);
  }
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) as SessionUser };
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    if (!webStorageAvailable()) return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

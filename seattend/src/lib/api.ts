const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

export type SessionUser = {
  id: string;
  name: string;
  employeeId: string;
  role: 'admin' | 'manager' | 'employee';
};

export type Shop = {
  _id: string;
  name: string;
  shopCode: string;
  address?: string;
  area?: string;
};

export type Visit = {
  _id: string;
  checkedInAt: string;
  distanceMeters: number;
  shop: Shop;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (!API_URL) throw new Error('API address is not configured. Set EXPO_PUBLIC_API_URL in seattend/.env.');
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the attendance server. Check your phone network and API address.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body as T;
}

export const api = {
  login: (employeeId: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ employeeId, password }),
    }),
  me: (token: string) => request<SessionUser>('/auth/me', {}, token),
  shops: (token: string) => request<{ shops: Shop[] }>('/shops', {}, token),
  today: (token: string) =>
    request<{ date: string; attendance: string; visitCount: number; visits: Visit[] }>('/visits/today', {}, token),
  checkIn: (token: string, shopId: string, coords: { latitude: number; longitude: number; accuracyMeters: number }) =>
    request<{ message: string; alreadyVisited: boolean; visit: Visit }>('/visits/check-in', {
      method: 'POST',
      body: JSON.stringify({ shopId, ...coords }),
    }, token),
};

export function apiConfigured() {
  return Boolean(API_URL);
}

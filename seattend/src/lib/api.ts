const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

export type SessionUser = {
  id: string;
  name: string;
  employeeId: string;
  email?: string | null;
  phone?: string;
  role: 'admin' | 'employee';
};

export type Shop = {
  _id: string;
  name: string;
  shopCode: string;
  address?: string;
  area?: string;
  active?: boolean;
  location?: { latitude: number; longitude: number };
};

export type Visit = {
  _id: string;
  checkedInAt: string;
  distanceMeters: number;
  shop: Shop;
  employee?: { _id: string; name: string; employeeId: string };
};

export type ManagedUser = {
  _id: string;
  id?: string;
  name: string;
  employeeId: string;
  email?: string | null;
  phone?: string;
  role: 'admin' | 'employee';
  active: boolean;
};

export type UserDetails = ManagedUser & { totalVisits: number; presentDays: number; recentVisits: Visit[]; recentVisitsLimit: number; };

export type TeamEmployee = ManagedUser & {
  attendance: string;
  visitCount: number;
  visits: Visit[];
};
export type AttendanceReportVisit = {
  id: string;
  shopName: string;
  shopCode: string;
  checkedInAt: string;
  distanceMeters: number;
};

export type AttendanceReportDay = {
  date: string;
  visitCount: number;
  visits: AttendanceReportVisit[];
};

export type AttendanceReportEmployee = {
  id: string;
  name: string;
  employeeId: string;
  active: boolean;
  presentDays: number;
  visitCount: number;
  attendance: AttendanceReportDay[];
};

export type AttendanceReport = {
  from: string;
  to: string;
  timeZone: string;
  generatedAt: string;
  totals: {
    employeeCount: number;
    employeesWithAttendance: number;
    presentDays: number;
    visitCount: number;
  };
  employees: AttendanceReportEmployee[];
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
  login: (identifier: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  me: (token: string) => request<SessionUser>('/auth/me', {}, token),
  shops: (token: string, includeInactive = false) => request<{ shops: Shop[] }>(includeInactive ? '/shops?includeInactive=true' : '/shops', {}, token),
  today: (token: string) =>
    request<{ date: string; attendance: string; visitCount: number; visits: Visit[] }>('/visits/today', {}, token),
  checkIn: (token: string, shopId: string, coords: { latitude: number; longitude: number; accuracyMeters: number }) =>
    request<{ message: string; alreadyVisited: boolean; visit: Visit }>('/visits/check-in', {
      method: 'POST',
      body: JSON.stringify({ shopId, ...coords }),
    }, token),
  users: (token: string) => request<{ users: ManagedUser[] }>('/users', {}, token),
  createUser: (token: string, data: { name: string; email: string; phone?: string; password: string; role: 'admin' | 'employee' }) =>
    request<{ user: ManagedUser }>('/users', { method: 'POST', body: JSON.stringify(data) }, token),
  updateUser: (token: string, id: string, data: { active: boolean }) =>
    request<{ user: ManagedUser }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  userDetails: (token: string, id: string) => request<{ profile: UserDetails }>(`/users/${id}/profile`, {}, token),
  createShop: (token: string, data: { name: string; shopCode: string; address?: string; area?: string; latitude: number; longitude: number }) =>
    request<{ shop: Shop }>('/shops', { method: 'POST', body: JSON.stringify(data) }, token),
  updateShop: (token: string, id: string, data: { name?: string; shopCode?: string; address?: string; area?: string; latitude?: number; longitude?: number; active?: boolean }) =>
    request<{ shop: Shop }>(`/shops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  teamToday: (token: string) =>
    request<{ date: string; employees: TeamEmployee[] }>('/visits/team/today', {}, token),

  attendanceReport: (token: string, from: string, to: string, employeeId?: string) => {
    const query = new URLSearchParams({ from, to });
    if (employeeId) query.set('employeeId', employeeId);
    return request<AttendanceReport>(`/reports/attendance?${query.toString()}`, {}, token);
  },
  attendanceReportCsv: async (token: string, from: string, to: string, employeeId?: string) => {
    if (!API_URL) throw new Error('API address is not configured. Set EXPO_PUBLIC_API_URL in seattend/.env.');
    const query = new URLSearchParams({ from, to });
    if (employeeId) query.set('employeeId', employeeId);
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/reports/attendance.csv?${query.toString()}`, {
        headers: { Accept: 'text/csv', Authorization: `Bearer ${token}` }
      });
    } catch {
      throw new Error('Cannot reach the attendance server. Check your phone network and API address.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || `Export failed (${response.status})`);
    }
    return response.text();
  },
};

export function apiConfigured() {
  return Boolean(API_URL);
}

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
  address?: string;
  pinCode?: string;
  district?: string;
  state?: string;
  mobileNumber?: string;
  shopCode?: string;
  area?: string;
  active?: boolean;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
  createdBy?: { _id?: string; name?: string; email?: string; role?: 'admin' | 'employee' } | null;
  verifiedBy?: { name?: string; email?: string } | null;
  verifiedAt?: string | null;
  createdAt?: string;
  location?: { latitude: number; longitude: number };
};

export type AppNotification = {
  _id: string;
  title: string;
  message: string;
  type: 'SHOP_SUBMITTED' | 'SHOP_APPROVED' | 'SHOP_REJECTED';
  readAt?: string | null;
  createdAt: string;
  shop?: Shop | null;
};

export type TodayResponse = {
  date: string;
  attendance: string;
  visitCount: number;
  visits: Visit[];
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

export type UserDetails = ManagedUser & { createdAt?: string; updatedAt?: string; deletedAt?: string | null; totalVisits: number; presentDays: number; recentVisits: Visit[]; recentVisitsLimit: number; };

export type TeamEmployee = ManagedUser & {
  attendance: string;
  visitCount: number;
  visits: Visit[];
};
export type AuditLog = {
  _id: string;
  actorName: string;
  actorRole: 'admin' | 'employee' | 'system';
  action: string;
  entityType: 'account' | 'shop' | 'visit';
  entityId: string;
  entityLabel: string;
  details?: Record<string, unknown>;
  createdAt: string;
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
  shops: (token: string, status?: 'PENDING' | 'VERIFIED' | 'REJECTED') => request<{ shops: Shop[] }>(status ? `/shops?status=${status}` : '/shops', {}, token),
  notifications: (token: string) => request<{ notifications: AppNotification[]; unreadCount: number }>('/notifications', {}, token),
  markNotificationRead: (token: string, id: string) => request<{ message: string }>(`/notifications/${id}/read`, { method: 'PATCH' }, token),
  markAllNotificationsRead: (token: string) => request<{ message: string }>('/notifications/read-all', { method: 'PATCH' }, token),
  today: (token: string) =>
    request<TodayResponse>('/visits/today', {}, token),
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
  archiveUser: (token: string, id: string) => request<{ message: string }>(`/users/${id}/archive`, { method: 'POST' }, token),
  createShop: (token: string, data: { name: string; address: string; pinCode: string; district: string; state: string; mobileNumber: string; latitude: number; longitude: number }) =>
    request<{ shop: Shop; message: string }>('/shops', { method: 'POST', body: JSON.stringify(data) }, token),
  updateShop: (token: string, id: string, data: { name?: string; address?: string; pinCode?: string; district?: string; state?: string; mobileNumber?: string; latitude?: number; longitude?: number; active?: boolean; verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED'; rejectionReason?: string }) =>
    request<{ shop: Shop; message: string }>(`/shops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  deleteShop: (token: string, id: string) =>
    request<{ message: string }>(`/shops/${id}`, { method: 'DELETE' }, token),
  teamToday: (token: string) =>
    request<{ date: string; employees: TeamEmployee[] }>('/visits/team/today', {}, token),

  auditLogs: (token: string, page = 1, limit = 30) =>
    request<{ logs: AuditLog[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/audit?page=${page}&limit=${limit}`, {}, token),

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

export interface ManagerSession {
  token: string;
  username: string;
  expiresAt: number;
  source: 'env' | 'file';
}

export interface ManagerAuthStatus {
  configured: boolean;
  source: 'env' | 'file' | 'unconfigured';
}

// Keep manager Bearer token strictly in memory (never localStorage/sessionStorage)
let activeManagerSession: ManagerSession | null = null;

export function getActiveManagerSession(): ManagerSession | null {
  if (!activeManagerSession) return null;
  if (activeManagerSession.expiresAt <= Date.now()) {
    activeManagerSession = null;
    return null;
  }
  return activeManagerSession;
}

export function getManagerSessionToken(): string | undefined {
  return getActiveManagerSession()?.token;
}

export function setActiveManagerSession(session: ManagerSession | null): void {
  activeManagerSession = session;
}

export function clearActiveManagerSession(): void {
  activeManagerSession = null;
}

export async function fetchManagerAuthStatus(): Promise<ManagerAuthStatus> {
  const res = await fetch('/api/manager/auth-status');
  if (!res.ok) {
    throw new Error('Không thể kiểm tra trạng thái đăng nhập Quản lý.');
  }
  return (await res.json()) as ManagerAuthStatus;
}

export async function setupManagerCredentials(
  username: string,
  password: string,
): Promise<ManagerSession> {
  const res = await fetch('/api/manager/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as Partial<ManagerSession> & { error?: string };
  if (!res.ok || !data.token || !data.username || !data.expiresAt) {
    throw new Error(data.error || 'Không thể thiết lập tài khoản Quản lý.');
  }
  const session: ManagerSession = {
    token: data.token,
    username: data.username,
    expiresAt: data.expiresAt,
    source: data.source === 'env' ? 'env' : 'file',
  };
  setActiveManagerSession(session);
  return session;
}

export async function loginManagerWithPassword(
  username: string,
  password: string,
): Promise<ManagerSession> {
  const res = await fetch('/api/manager/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as Partial<ManagerSession> & { error?: string };
  if (!res.ok || !data.token || !data.username || !data.expiresAt) {
    throw new Error(data.error || 'Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  const session: ManagerSession = {
    token: data.token,
    username: data.username,
    expiresAt: data.expiresAt,
    source: data.source === 'env' ? 'env' : 'file',
  };
  setActiveManagerSession(session);
  return session;
}

export async function changeManagerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<ManagerSession> {
  const token = getManagerSessionToken();
  if (!token) {
    throw new Error('Phiên đăng nhập Quản lý đã hết hạn.');
  }
  const res = await fetch('/api/manager/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = (await res.json()) as Partial<ManagerSession> & { error?: string };
  if (!res.ok || !data.token || !data.username || !data.expiresAt) {
    throw new Error(data.error || 'Không thể đổi mật khẩu Quản lý.');
  }
  const session: ManagerSession = {
    token: data.token,
    username: data.username,
    expiresAt: data.expiresAt,
    source: data.source === 'env' ? 'env' : 'file',
  };
  setActiveManagerSession(session);
  return session;
}

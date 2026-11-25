import type { ManagerAccount } from '../types/leave';

const ACCOUNT_DOMAIN = '@accounts.leave-management.invalid';

/**
 * Tên hiển thị của quản lý đang đăng nhập.
 * Ưu tiên tên trong `/managers/{uid}` (tên người thật), sau đó `displayName`
 * của tài khoản Google; không dùng username/email.
 */
export function managerNameForUid(
  managers: ManagerAccount[],
  uid: string | null | undefined,
  fallback?: string | null,
): string {
  if (uid) {
    const found = managers.find((m) => m.id === uid);
    if (found?.name?.trim()) return found.name.trim();
  }
  const cleanFallback = (fallback || '').trim();
  return cleanFallback || 'Quản lý';
}

/**
 * Chuyển giá trị `processedBy` đã lưu (có thể là username hoặc email nội bộ
 * của bản cũ) sang tên người duyệt. Nếu không khớp, giữ nguyên giá trị gốc.
 */
export function resolveManagerName(
  label: string | undefined | null,
  managers: ManagerAccount[],
): string {
  const clean = (label || '').trim();
  if (!clean) return 'Quản lý';

  const lower = clean.toLowerCase();
  const found = managers.find((m) => {
    const name = m.name.trim().toLowerCase();
    const username = m.username.trim().toLowerCase();
    if (!username) return name === lower;
    return (
      name === lower ||
      username === lower ||
      `${username}${ACCOUNT_DOMAIN}` === lower
    );
  });

  return found?.name?.trim() || clean;
}
